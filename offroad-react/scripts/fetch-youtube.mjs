/**
 * fetch-youtube.mjs
 *
 * Pulls recent uploads from the channels listed in youtube/channels.json
 * through the YouTube Data API and writes src/data/youtube-videos.json.
 *
 * Usage:  YOUTUBE_API_KEY=... npm run videos
 *
 * The snapshot is only rewritten after every channel has been fetched
 * successfully, so a failed or partial run never empties the Videos page —
 * the last good snapshot stays in place. With no key or no channels
 * configured, the script exits cleanly without touching anything.
 *
 * Under GitHub Actions it reports `changed=true|false` through GITHUB_OUTPUT so
 * the workflow can skip deploys when nothing new was published.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const CONFIG_FILE = path.join(ROOT, "youtube", "channels.json");
const OUTPUT_FILE = path.join(ROOT, "src", "data", "youtube-videos.json");

const DEFAULT_API_BASE = "https://www.googleapis.com/youtube/v3";

// Off-road trip videos run long, so anything at or under a minute is almost
// always a Short. Channels can lower this to 0 to keep everything.
const DEFAULT_MIN_DURATION_SECONDS = 60;
const DEFAULT_MAX_VIDEOS_PER_CHANNEL = 50;

// The API caps both playlistItems and videos lookups at 50 per request.
const PAGE_SIZE = 50;

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

const inActions = Boolean(process.env.GITHUB_ACTIONS);

function notice(message) {
  console.log(inActions ? `::notice::${message}` : message);
}

function warn(message) {
  console.log(inActions ? `::warning::${message}` : `Warning: ${message}`);
}

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** "PT1H2M3S" -> 3723. Returns null for anything that isn't an ISO 8601 duration. */
export function parseIsoDuration(iso) {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso ?? "");
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match.map((part) => Number(part ?? 0));
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

/** 422 -> "7:02", 3723 -> "1:02:03" — the same format YouTube shows. */
export function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

/**
 * Turn a YouTube description into a one-line subtitle: the first line with
 * real words in it, minus links, hashtags and chapter timestamps.
 */
export function summarize(description, maxLength = 100) {
  const line = (description ?? "")
    .split(/\r?\n/)
    .map((text) =>
      text
        .replace(/https?:\/\/\S+/g, "")
        .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .find((text) => /\p{L}{3}/u.test(text) && !/^\d{1,2}:\d{2}/.test(text));

  if (!line) return "";
  if (line.length <= maxLength) return line;

  const cut = line.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const trimmed = lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${trimmed.replace(/[\s,.;:–—-]+$/, "")}…`;
}

function matchesKeywords(title, { include = [], exclude = [] }) {
  const haystack = title.toLowerCase();
  if (include.length > 0 && !include.some((word) => haystack.includes(word.toLowerCase()))) {
    return false;
  }
  return !exclude.some((word) => haystack.includes(word.toLowerCase()));
}

/**
 * Map a videos.list item to the snapshot shape, or explain why it was left out.
 */
export function normalizeVideo(item, rules) {
  const { snippet = {}, contentDetails = {}, status = {} } = item;

  if (status.privacyStatus !== "public") return { skipped: "not public" };
  // The site plays everything in an embedded player, so a video the owner
  // has blocked from embedding would only ever show an error.
  if (status.embeddable === false) return { skipped: "embedding disabled" };
  if (snippet.liveBroadcastContent && snippet.liveBroadcastContent !== "none") {
    return { skipped: "live or upcoming" };
  }

  const seconds = parseIsoDuration(contentDetails.duration);
  if (seconds === null) return { skipped: "no duration" };
  if (seconds <= rules.minDurationSeconds) return { skipped: "too short" };
  if (!matchesKeywords(snippet.title ?? "", rules)) return { skipped: "filtered by keyword" };

  return {
    video: {
      youtubeId: item.id,
      title: snippet.title ?? "",
      subtitle: summarize(snippet.description),
      duration: formatDuration(seconds),
      publishedAt: snippet.publishedAt ?? "",
      channelTitle: snippet.channelTitle ?? "",
    },
  };
}

function describeChannel(channel) {
  return channel.label ?? channel.handle ?? channel.channelId ?? channel.playlistId;
}

function validateChannel(channel, index) {
  const sources = ["handle", "channelId", "playlistId"].filter((field) => channel[field]);
  if (sources.length !== 1) {
    throw new Error(
      `youtube/channels.json: channel #${index + 1} needs exactly one of "handle", "channelId" or "playlistId"`,
    );
  }
}

async function callApi(endpoint, params, key, opts) {
  const url = new URL(`${opts.apiBase}/${endpoint}`);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(name, value);
  }
  url.searchParams.set("key", key);

  // The key travels in the query string, so keep it out of every message.
  const redact = (text) => String(text).split(key).join("***");

  for (let attempt = 1; ; attempt += 1) {
    let response;
    try {
      response = await fetch(url, { headers: { Accept: "application/json" } });
    } catch (error) {
      if (attempt < MAX_ATTEMPTS) {
        await sleep(opts.retryDelayMs * 2 ** (attempt - 1));
        continue;
      }
      throw new Error(`${endpoint}: network error — ${redact(error.message)}`);
    }

    if (response.ok) return response.json();

    const body = await response.json().catch(() => ({}));
    const reason = body?.error?.errors?.[0]?.reason;
    const message = body?.error?.message ?? response.statusText;
    const retryable = response.status === 429 || response.status >= 500;

    if (retryable && attempt < MAX_ATTEMPTS) {
      await sleep(opts.retryDelayMs * 2 ** (attempt - 1));
      continue;
    }
    throw new Error(
      `${endpoint}: HTTP ${response.status}${reason ? ` (${reason})` : ""} — ${redact(message)}`,
    );
  }
}

async function resolvePlaylistId(channel, key, opts) {
  if (channel.playlistId) return channel.playlistId;

  const data = await callApi(
    "channels",
    {
      part: "contentDetails",
      forHandle: channel.handle,
      id: channel.channelId,
    },
    key,
    opts,
  );
  const uploads = data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error(`channel not found: ${describeChannel(channel)}`);
  return uploads;
}

async function listVideoIds(playlistId, limit, key, opts) {
  const ids = [];
  let pageToken;
  do {
    const data = await callApi(
      "playlistItems",
      {
        part: "contentDetails",
        playlistId,
        maxResults: String(PAGE_SIZE),
        pageToken,
      },
      key,
      opts,
    );
    for (const item of data.items ?? []) {
      if (item.contentDetails?.videoId) ids.push(item.contentDetails.videoId);
    }
    pageToken = data.nextPageToken;
  } while (pageToken && ids.length < limit);

  return ids.slice(0, limit);
}

async function getVideoDetails(ids, key, opts) {
  const items = [];
  for (let i = 0; i < ids.length; i += PAGE_SIZE) {
    const data = await callApi(
      "videos",
      {
        part: "snippet,contentDetails,status",
        id: ids.slice(i, i + PAGE_SIZE).join(","),
      },
      key,
      opts,
    );
    items.push(...(data.items ?? []));
  }
  return items;
}

/**
 * Fetch every configured channel and return the combined, de-duplicated list,
 * newest first. Throws if any channel fails, so callers never write a partial
 * snapshot.
 */
export async function fetchAll(config, key, options = {}) {
  const opts = {
    apiBase: options.apiBase ?? process.env.YOUTUBE_API_BASE ?? DEFAULT_API_BASE,
    retryDelayMs: options.retryDelayMs ?? RETRY_DELAY_MS,
    log: options.log ?? console.log,
  };
  const channels = config.channels ?? [];
  channels.forEach(validateChannel);

  const byId = new Map();

  for (const channel of channels) {
    const rules = {
      include: channel.include ?? [],
      exclude: channel.exclude ?? [],
      minDurationSeconds:
        channel.minDurationSeconds ?? config.minDurationSeconds ?? DEFAULT_MIN_DURATION_SECONDS,
    };
    const limit =
      channel.maxVideos ?? config.maxVideosPerChannel ?? DEFAULT_MAX_VIDEOS_PER_CHANNEL;

    const playlistId = await resolvePlaylistId(channel, key, opts);
    const ids = await listVideoIds(playlistId, limit, key, opts);
    const items = await getVideoDetails(ids, key, opts);

    const skipped = {};
    let kept = 0;
    for (const item of items) {
      const result = normalizeVideo(item, rules);
      if (result.skipped) {
        skipped[result.skipped] = (skipped[result.skipped] ?? 0) + 1;
      } else if (!byId.has(result.video.youtubeId)) {
        byId.set(result.video.youtubeId, result.video);
        kept += 1;
      }
    }

    const skippedSummary = Object.entries(skipped)
      .map(([reason, count]) => `${count} ${reason}`)
      .join(", ");
    opts.log(
      `${describeChannel(channel)}: ${kept} video(s)${skippedSummary ? ` — skipped ${skippedSummary}` : ""}`,
    );
  }

  return [...byId.values()].sort(
    (a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.youtubeId.localeCompare(b.youtubeId),
  );
}

/** Write the snapshot only when it differs, so unchanged runs make no commit. */
export function writeSnapshot(file, videos) {
  const next = `${JSON.stringify(videos, null, 2)}\n`;
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";
  if (current === next) return false;
  fs.writeFileSync(file, next);
  return true;
}

function readConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return { channels: [] };
  return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
}

async function main() {
  const config = readConfig();

  if ((config.channels ?? []).length === 0) {
    notice("No channels configured in youtube/channels.json — keeping the existing video list.");
    setOutput("changed", "false");
    return;
  }

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    warn("YOUTUBE_API_KEY is not set — keeping the existing video list.");
    setOutput("changed", "false");
    return;
  }

  const videos = await fetchAll(config, key);
  const changed = writeSnapshot(OUTPUT_FILE, videos);
  console.log(
    `${videos.length} video(s) total — ${changed ? `updated ${path.relative(ROOT, OUTPUT_FILE)}` : "no changes"}`,
  );
  setOutput("changed", String(changed));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.log(inActions ? `::error::${error.message}` : `Error: ${error.message}`);
    console.log("The existing video list was left unchanged.");
    process.exit(1);
  });
}
