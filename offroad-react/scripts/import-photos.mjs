/**
 * import-photos.mjs
 *
 * Pull photos for a trip out of Google Photos and into photos/<Trip>/, ready
 * for `npm run photos`.
 *
 * Usage:  npm run import-photos -- "September 2021 Weekend"
 *
 * Google no longer lets apps read a library or shared album directly, so this
 * uses the Google Photos Picker: it opens Google Photos in your browser, you
 * choose the trip's photos, and they are downloaded here. Choosing is the
 * filter — nothing is guessed.
 *
 * - Photos already imported (matched by their Google Photos ID) are skipped,
 *   so re-running for the same trip only adds what's new.
 * - Videos are skipped: GitHub Pages can't host them well. Upload trip videos
 *   to YouTube instead and the Videos page picks them up.
 * - Google strips location data from downloads, so no GPS ends up in the repo.
 *
 * Runs on your own computer (it needs your browser to sign in). One-time
 * setup is in the README under "Importing from Google Photos".
 */

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const PHOTOS_DIR = path.join(ROOT, "photos");
const CLIENT_FILE = path.join(ROOT, ".google-oauth-client.json");
const TOKEN_FILE = path.join(ROOT, ".google-photos-token.json");

const SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";
const DEFAULTS = {
  apiBase: "https://photospicker.googleapis.com/v1",
  authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
};

// Formats the photo pipeline can read. Anything else (HEIC from iPhones,
// mostly) is fetched again as a JPEG rendition at full size.
const PIPELINE_FORMATS = new Set(["jpeg", "png", "webp"]);
const DOWNLOAD_CONCURRENCY = 4;
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Google's protobuf durations look like "3.5s". */
export function parseDurationMs(value, fallbackMs) {
  const seconds = Number.parseFloat(String(value ?? "").replace(/s$/, ""));
  return Number.isFinite(seconds) ? seconds * 1000 : fallbackMs;
}

/**
 * Capture date for a photo, as YYYY-MM-DD in the photographer's local time.
 * EXIF DateTimeOriginal is already local; Google's createTime is UTC, so an
 * evening photo in Washington would otherwise land on the next day.
 */
export function captureDate(exif, createTime) {
  const match = exif?.toString("latin1").match(/(\d{4}):(\d{2}):(\d{2}) \d{2}:\d{2}:\d{2}/);
  if (match && match[1] !== "0000") return `${match[1]}-${match[2]}-${match[3]}`;
  if (!createTime) return undefined;
  const local = new Date(createTime);
  if (Number.isNaN(local.getTime())) return undefined;
  const pad = (n) => String(n).padStart(2, "0");
  return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
}

/**
 * Filename stem safe for the site: srcset splits on whitespace, so spaces and
 * anything outside a plain URL-safe set become dashes.
 */
export function safeStem(filename) {
  const stem = path
    .basename(filename, path.extname(filename))
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|-+$/g, "");
  return stem || "photo";
}

/**
 * Pick a filename that doesn't clobber a photo already in the trip. Stems are
 * compared without extension or case, because the photo pipeline names its
 * output by stem — IMG_1.jpg and img_1.png would overwrite each other's files.
 */
export function uniqueFilename(stem, ext, takenStems) {
  let candidate = stem;
  for (let n = 2; takenStems.has(candidate.toLowerCase()); n += 1) candidate = `${stem}-${n}`;
  takenStems.add(candidate.toLowerCase());
  return `${candidate}${ext}`;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

class GoogleApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function googleFetch(url, init, what) {
  const response = await fetch(url, init);
  if (response.ok) return response;
  const body = await response.json().catch(() => ({}));
  const detail = body?.error?.message ?? body?.error_description ?? body?.error ?? response.statusText;
  throw new GoogleApiError(`${what} failed: HTTP ${response.status} — ${detail}`, response.status);
}

/* ── Sign-in ────────────────────────────────────────────────────────────── */

function readClient() {
  if (process.env.GOOGLE_CLIENT_ID) {
    return { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "" };
  }
  const file = readJson(CLIENT_FILE, null);
  const config = file?.installed ?? file?.web;
  if (!config?.client_id) {
    throw new Error(
      `No OAuth client found. Download the Desktop app client JSON from Google Cloud ` +
        `and save it as ${path.relative(process.cwd(), CLIENT_FILE)} — see the README.`,
    );
  }
  if (!file.installed) {
    throw new Error(
      "That OAuth client is a Web application client. Create one with application type Desktop app instead.",
    );
  }
  return { clientId: config.client_id, clientSecret: config.client_secret ?? "" };
}

function openInBrowser(url) {
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  try {
    spawn(command, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  } catch {
    // The URL is always printed too, so a failed launch is not fatal.
  }
}

/** Desktop-app OAuth: loopback redirect with PKCE, as Google documents for CLIs. */
async function signInWithBrowser(client, opts) {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(16).toString("hex");

  let resolveCode;
  let rejectCode;
  const codePromise = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname !== "/") {
      res.writeHead(404).end();
      return;
    }
    const ok = url.searchParams.get("state") === state && url.searchParams.get("code");
    res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      ok
        ? "<p>Signed in. You can close this tab and go back to the terminal.</p>"
        : "<p>Sign-in did not complete. Go back to the terminal and try again.</p>",
    );
    if (ok) resolveCode(url.searchParams.get("code"));
    else rejectCode(new Error(`Sign-in was cancelled or failed (${url.searchParams.get("error") ?? "no code returned"}).`));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const redirectUri = `http://127.0.0.1:${server.address().port}`;

  const authUrl = new URL(opts.authUrl);
  authUrl.search = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  }).toString();

  opts.log("\nSign in to Google in the browser window that just opened.");
  opts.log(`If nothing opened, visit:\n  ${authUrl}\n`);
  openInBrowser(authUrl.toString());

  const timer = setTimeout(() => rejectCode(new Error("Timed out waiting for sign-in.")), SIGN_IN_TIMEOUT_MS);
  try {
    const code = await codePromise;
    const response = await googleFetch(
      opts.tokenUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: client.clientId,
          client_secret: client.clientSecret,
          code,
          code_verifier: verifier,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      },
      "Sign-in",
    );
    return response.json();
  } finally {
    clearTimeout(timer);
    server.close();
  }
}

/**
 * Exchange a saved refresh token for an access token. Returns null when the
 * refresh token is no longer accepted — apps in Google's "Testing" status get
 * refresh tokens that expire after 7 days — so the caller can sign in again.
 */
export async function refreshAccessToken(client, refreshToken, tokenUrl) {
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (response.ok) return (await response.json()).access_token;
  const body = await response.json().catch(() => ({}));
  if (body.error === "invalid_grant") return null;
  throw new GoogleApiError(`Token refresh failed: HTTP ${response.status} — ${body.error_description ?? body.error ?? ""}`, response.status);
}

async function getAccessToken(opts) {
  const client = readClient();
  const saved = readJson(TOKEN_FILE, null);
  if (saved?.refresh_token) {
    const accessToken = await refreshAccessToken(client, saved.refresh_token, opts.tokenUrl);
    if (accessToken) return accessToken;
    opts.log("Saved Google sign-in has expired — signing in again.");
  }
  const tokens = await signInWithBrowser(client, opts);
  if (tokens.refresh_token) {
    fs.writeFileSync(TOKEN_FILE, `${JSON.stringify({ refresh_token: tokens.refresh_token }, null, 2)}\n`, { mode: 0o600 });
  }
  return tokens.access_token;
}

/* ── Picker session ─────────────────────────────────────────────────────── */

function api(accessToken, opts) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  return {
    createSession: async () =>
      (await googleFetch(`${opts.apiBase}/sessions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: "{}",
      }, "Creating a picker session")).json(),
    getSession: async (id) =>
      (await googleFetch(`${opts.apiBase}/sessions/${id}`, { headers }, "Checking the picker session")).json(),
    deleteSession: (id) =>
      fetch(`${opts.apiBase}/sessions/${id}`, { method: "DELETE", headers }).catch(() => {}),
    listItems: async (sessionId) => {
      const items = [];
      let pageToken;
      do {
        const url = new URL(`${opts.apiBase}/mediaItems`);
        url.searchParams.set("sessionId", sessionId);
        url.searchParams.set("pageSize", "100");
        if (pageToken) url.searchParams.set("pageToken", pageToken);
        const page = await (await googleFetch(url, { headers }, "Listing the picked photos")).json();
        items.push(...(page.mediaItems ?? []));
        pageToken = page.nextPageToken;
      } while (pageToken);
      return items;
    },
    // Picker download links must carry the same bearer token as the API.
    download: async (baseUrl, params) =>
      Buffer.from(await (await googleFetch(`${baseUrl}=${params}`, { headers }, "Downloading a photo")).arrayBuffer()),
  };
}

async function waitForPicks(client, session, opts) {
  let current = session;
  let deadline = Date.now() + parseDurationMs(current.pollingConfig?.timeoutIn, 30 * 60 * 1000);
  while (!current.mediaItemsSet) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for photos to be chosen. Run the import again.");
    await sleep(opts.pollMs ?? parseDurationMs(current.pollingConfig?.pollInterval, 5000));
    current = await client.getSession(current.id);
    // Google sends fresh polling advice with every poll.
    if (current.pollingConfig?.timeoutIn) {
      const timeoutMs = parseDurationMs(current.pollingConfig.timeoutIn, 0);
      if (timeoutMs === 0 && !current.mediaItemsSet) throw new Error("The picker session expired. Run the import again.");
      deadline = Date.now() + timeoutMs;
    }
  }
}

/**
 * Download a picked photo in a format the photo pipeline can read. Returns the
 * bytes, the file extension to save under, and the EXIF block for dating.
 */
async function fetchPhoto(client, item) {
  const file = item.mediaFile ?? {};
  const original = await client.download(file.baseUrl, "d");
  const meta = await sharp(original).metadata().catch(() => null);
  if (meta && PIPELINE_FORMATS.has(meta.format)) {
    return { bytes: original, ext: meta.format === "jpeg" ? ".jpg" : `.${meta.format}`, exif: meta.exif };
  }

  // HEIC and other formats: ask Google for a full-size rendition instead, and
  // re-encode it as JPEG to be certain of the format.
  const width = file.mediaFileMetadata?.width ?? 16383;
  const height = file.mediaFileMetadata?.height ?? 16383;
  const rendition = await client.download(file.baseUrl, `w${width}-h${height}`);
  const bytes = await sharp(rendition).rotate().jpeg({ quality: 95, mozjpeg: true }).toBuffer();
  return { bytes, ext: ".jpg", exif: meta?.exif };
}

/**
 * Import picked photos into a trip folder. Exported with injectable
 * endpoints and token so it can be tested against a local stand-in for Google.
 */
export async function importTrip(tripName, options = {}) {
  const opts = { ...DEFAULTS, log: console.log, openUrl: openInBrowser, photosDir: PHOTOS_DIR, ...options };
  const client = api(options.accessToken ?? (await getAccessToken(opts)), opts);

  const tripDir = path.join(opts.photosDir, tripName);
  const isNewTrip = !fs.existsSync(tripDir);
  fs.mkdirSync(tripDir, { recursive: true });
  if (isNewTrip) writeJson(path.join(tripDir, "trip.json"), { name: tripName, description: "" });

  const photosFile = path.join(tripDir, "photos.json");
  const photoMeta = readJson(photosFile, {});
  const alreadyImported = new Set(
    Object.values(photoMeta).map((entry) => entry?.googlePhotosId).filter(Boolean),
  );

  const session = await client.createSession();
  // Ctrl+C skips `finally`, so clean up the session on the way out there too.
  const onInterrupt = () => client.deleteSession(session.id).finally(() => process.exit(130));
  process.once("SIGINT", onInterrupt);
  try {
    opts.log(`\nChoose the photos for "${tripName}" in the Google Photos tab, then press Done.`);
    opts.log(`If no tab opened, visit:\n  ${session.pickerUri}\n`);
    opts.openUrl(`${session.pickerUri}/autoclose`);

    await waitForPicks(client, session, opts);
    const items = await client.listItems(session.id);

    const photos = items.filter((item) => item.type !== "VIDEO");
    const videos = items.length - photos.length;
    const fresh = photos.filter((item) => !alreadyImported.has(item.id));
    opts.log(
      `${items.length} picked: ${fresh.length} new photo(s)` +
        `${photos.length - fresh.length ? `, ${photos.length - fresh.length} already imported` : ""}` +
        `${videos ? `, ${videos} video(s) skipped` : ""}.`,
    );

    const takenStems = new Set(
      fs.readdirSync(tripDir).map((file) => path.basename(file, path.extname(file)).toLowerCase()),
    );
    const imported = [];
    let next = 0;
    let failed = 0;

    // A few downloads at a time; picker links expire after 60 minutes.
    const worker = async () => {
      while (next < fresh.length) {
        const item = fresh[next++];
        const name = item.mediaFile?.filename ?? `${item.id}.jpg`;
        try {
          const photo = await fetchPhoto(client, item);
          const filename = uniqueFilename(safeStem(name), photo.ext, takenStems);
          fs.writeFileSync(path.join(tripDir, filename), photo.bytes);
          photoMeta[filename] = {
            title: "",
            date: captureDate(photo.exif, item.createTime),
            googlePhotosId: item.id,
          };
          imported.push(filename);
          opts.log(`  ✓ ${filename}`);
        } catch (error) {
          failed += 1;
          opts.log(`  ✗ ${name}: ${error.message}`);
        }
      }
    };
    await Promise.all(Array.from({ length: DOWNLOAD_CONCURRENCY }, worker));

    const sorted = Object.fromEntries(Object.keys(photoMeta).sort().map((key) => [key, photoMeta[key]]));
    writeJson(photosFile, sorted);

    return { imported, skippedExisting: photos.length - fresh.length, skippedVideos: videos, failed, isNewTrip };
  } finally {
    // Google asks apps to delete sessions once they have the bytes.
    process.off("SIGINT", onInterrupt);
    await client.deleteSession(session.id);
  }
}

async function main() {
  const tripName = process.argv.slice(2).join(" ").trim();
  if (!tripName) {
    const trips = fs.existsSync(PHOTOS_DIR)
      ? fs.readdirSync(PHOTOS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("_")).map((d) => d.name)
      : [];
    console.log('Usage: npm run import-photos -- "<trip folder name>"');
    if (trips.length) console.log(`\nExisting trips:\n${trips.map((t) => `  ${t}`).join("\n")}`);
    console.log("\nA new name creates a new trip.");
    process.exit(1);
  }

  const result = await importTrip(tripName);
  console.log(`\nImported ${result.imported.length} photo(s) into photos/${tripName}/.`);
  if (result.failed) console.log(`${result.failed} photo(s) failed — run the import again to retry them.`);
  if (result.skippedVideos) {
    console.log("Videos were skipped: upload them to YouTube (public) and the Videos page picks them up.");
  }
  if (result.imported.length) {
    console.log("\nNext:");
    console.log(`  1. Add titles in photos/${tripName}/photos.json (blank ones show as "Photo N").`);
    if (result.isNewTrip) console.log(`  2. Add a description in photos/${tripName}/trip.json.`);
    console.log(`  ${result.isNewTrip ? 3 : 2}. Run: npm run photos`);
    console.log(`  ${result.isNewTrip ? 4 : 3}. Commit photos/, public/images/adventures/ and src/data/adventures.js.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`\nError: ${error.message}`);
    process.exit(1);
  });
}
