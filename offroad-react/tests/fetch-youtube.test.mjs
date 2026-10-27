import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  fetchAll,
  formatDuration,
  parseIsoDuration,
  summarize,
  writeSnapshot,
} from "../scripts/fetch-youtube.mjs";

const KEY = "test-key";
const quiet = () => {};

/** Run `fn` against a local stand-in for the YouTube Data API. */
async function withApi(handler, fn) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    requests.push(url);
    const { status = 200, body } = handler(url, requests);
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const apiBase = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn({ apiBase, requests });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function video(id, { duration = "PT10M", publishedAt = "2024-01-01T00:00:00Z", ...rest } = {}) {
  return {
    id,
    snippet: {
      title: rest.title ?? `Trip ${id}`,
      description: rest.description ?? "",
      publishedAt,
      channelTitle: rest.channelTitle ?? "Trail Rig",
      liveBroadcastContent: rest.live ?? "none",
    },
    contentDetails: { duration },
    status: {
      privacyStatus: rest.privacy ?? "public",
      embeddable: rest.embeddable ?? true,
    },
  };
}

const catalog = {
  v1: video("v1", {
    duration: "PT12M30S",
    publishedAt: "2024-05-01T10:00:00Z",
    title: "Snoqualmie Pass run",
    description: "Climbing the pass in the rain.\nhttps://example.com #offroad",
  }),
  v2: video("v2", { duration: "PT45S" }),
  v3: video("v3", { privacy: "private" }),
  v4: video("v4", { embeddable: false }),
  v5: video("v5", { live: "upcoming" }),
  v6: video("v6", { duration: "PT1H2M3S", publishedAt: "2024-06-01T10:00:00Z", title: "Moses Lake dunes" }),
  v7: video("v7", { title: "Unboxing new tires" }),
  v8: video("v8", { duration: "PT9M", publishedAt: "2023-01-01T10:00:00Z", channelTitle: "Friend" }),
};

function happyPath(url) {
  switch (url.pathname) {
    case "/channels":
      return { body: { items: [{ contentDetails: { relatedPlaylists: { uploads: "UU_trail" } } }] } };
    case "/playlistItems": {
      const pages = {
        "UU_trail:": { ids: ["v1", "v2"], next: "p2" },
        "UU_trail:p2": { ids: ["v3", "v4", "v5", "v6", "v7"] },
        "PL_friend:": { ids: ["v6", "v8"] },
      };
      const page = pages[`${url.searchParams.get("playlistId")}:${url.searchParams.get("pageToken") ?? ""}`];
      return {
        body: {
          items: page.ids.map((videoId) => ({ contentDetails: { videoId } })),
          nextPageToken: page.next,
        },
      };
    }
    case "/videos":
      return { body: { items: url.searchParams.get("id").split(",").map((id) => catalog[id]) } };
    default:
      return { status: 404, body: {} };
  }
}

const config = {
  channels: [
    { handle: "@trailrig", exclude: ["unboxing"] },
    { playlistId: "PL_friend" },
  ],
};

test("parseIsoDuration handles the shapes the API returns", () => {
  assert.equal(parseIsoDuration("PT7M2S"), 422);
  assert.equal(parseIsoDuration("PT1H2M3S"), 3723);
  assert.equal(parseIsoDuration("PT45S"), 45);
  assert.equal(parseIsoDuration("PT2H"), 7200);
  assert.equal(parseIsoDuration("P1DT1S"), 86401);
  assert.equal(parseIsoDuration("P0D"), 0);
  assert.equal(parseIsoDuration("nonsense"), null);
  assert.equal(parseIsoDuration(undefined), null);
});

test("formatDuration matches YouTube's own format", () => {
  assert.equal(formatDuration(422), "7:02");
  assert.equal(formatDuration(45), "0:45");
  assert.equal(formatDuration(3723), "1:02:03");
  assert.equal(formatDuration(3600), "1:00:00");
});

test("summarize picks the first real line and drops links, hashtags and chapters", () => {
  assert.equal(
    summarize("\n0:00 Intro\nhttps://youtu.be/x\n#offroad #pnw\nRidge run above the lake #tundra\nMore text"),
    "Ridge run above the lake",
  );
  assert.equal(summarize(""), "");
  assert.equal(summarize(undefined), "");

  const long = summarize("word ".repeat(60), 40);
  assert.ok(long.length <= 40, `too long: ${long.length}`);
  assert.ok(long.endsWith("…"));
});

test("fetchAll resolves channels, pages, filters and de-duplicates", async () => {
  await withApi(happyPath, async ({ apiBase, requests }) => {
    const videos = await fetchAll(config, KEY, { apiBase, log: quiet });

    assert.deepEqual(
      videos.map((v) => v.youtubeId),
      ["v6", "v1", "v8"],
      "newest first, filtered, and v6 only once despite being in both channels",
    );
    assert.deepEqual(videos[1], {
      youtubeId: "v1",
      title: "Snoqualmie Pass run",
      subtitle: "Climbing the pass in the rain.",
      duration: "12:30",
      publishedAt: "2024-05-01T10:00:00Z",
      channelTitle: "Trail Rig",
    });
    assert.equal(videos[0].duration, "1:02:03");
    assert.equal(videos[0].subtitle, "");

    assert.ok(requests.every((url) => url.searchParams.get("key") === KEY), "key sent on every call");
    const channelCalls = requests.filter((url) => url.pathname === "/channels");
    assert.equal(channelCalls.length, 1, "playlist-based channel skips the channel lookup");
    assert.equal(channelCalls[0].searchParams.get("forHandle"), "@trailrig");
  });
});

test("fetchAll caps each channel at maxVideos", async () => {
  await withApi(happyPath, async ({ apiBase, requests }) => {
    const videos = await fetchAll(
      { channels: [{ handle: "@trailrig", maxVideos: 2 }] },
      KEY,
      { apiBase, log: quiet },
    );
    assert.deepEqual(videos.map((v) => v.youtubeId), ["v1"], "v2 is a Short, so only v1 survives");
    assert.equal(
      requests.filter((url) => url.pathname === "/playlistItems").length,
      1,
      "stops paging once the cap is reached",
    );
  });
});

test("fetchAll retries transient failures", async () => {
  let failures = 1;
  await withApi(
    (url, requests) => {
      if (url.pathname === "/channels" && failures > 0) {
        failures -= 1;
        return { status: 503, body: { error: { message: "backend error" } } };
      }
      return happyPath(url, requests);
    },
    async ({ apiBase, requests }) => {
      const videos = await fetchAll(config, KEY, { apiBase, log: quiet, retryDelayMs: 1 });
      assert.equal(videos.length, 3);
      assert.equal(requests.filter((url) => url.pathname === "/channels").length, 2);
    },
  );
});

test("fetchAll fails fast on quota errors and never leaks the key", async () => {
  await withApi(
    () => ({
      status: 403,
      body: {
        error: {
          message: `Quota exceeded for key ${KEY}`,
          errors: [{ reason: "quotaExceeded" }],
        },
      },
    }),
    async ({ apiBase, requests }) => {
      await assert.rejects(
        fetchAll(config, KEY, { apiBase, log: quiet, retryDelayMs: 1 }),
        (error) => {
          assert.match(error.message, /HTTP 403 \(quotaExceeded\)/);
          assert.ok(!error.message.includes(KEY), "key must be redacted");
          return true;
        },
      );
      assert.equal(requests.length, 1, "403 is not retried");
    },
  );
});

test("fetchAll rejects ambiguous channel config", async () => {
  await assert.rejects(
    fetchAll({ channels: [{ handle: "@a", playlistId: "PL" }] }, KEY, { log: quiet }),
    /exactly one of/,
  );
});

test("writeSnapshot only rewrites the file when the list changes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-snapshot-"));
  const file = path.join(dir, "videos.json");
  try {
    const list = [{ youtubeId: "v1", title: "A" }];
    assert.equal(writeSnapshot(file, list), true);
    assert.equal(writeSnapshot(file, list), false);
    assert.equal(writeSnapshot(file, [...list, { youtubeId: "v2", title: "B" }]), true);
    assert.ok(fs.readFileSync(file, "utf-8").endsWith("\n"));
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});
