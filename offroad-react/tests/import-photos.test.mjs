import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";
import sharp from "sharp";
import {
  captureDate,
  importTrip,
  parseDurationMs,
  refreshAccessToken,
  safeStem,
  uniqueFilename,
} from "../scripts/import-photos.mjs";

const TOKEN = "test-access-token";

const jpeg = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#884422" } })
  .jpeg()
  .toBuffer();
const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#224488" } })
  .png()
  .toBuffer();

/**
 * Stand-in for photospicker.googleapis.com, the photo download host and the
 * OAuth token endpoint. Each test sets `google.items` and friends.
 */
const google = {
  reset() {
    this.items = [];
    this.pollsUntilSet = 2;
    this.polls = 0;
    this.timeoutIn = "60s";
    this.deleted = [];
    this.downloads = [];
    this.failList = false;
    this.failDownload = new Set();
    this.tokenResponse = { status: 200, body: { access_token: "fresh-token" } };
  },
};

let server;
let base;

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

before(async () => {
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, base);

    if (url.pathname === "/token") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      google.lastTokenRequest = new URLSearchParams(raw);
      return send(res, google.tokenResponse.status, google.tokenResponse.body);
    }

    // Everything else, downloads included, needs the bearer token.
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      return send(res, 401, { error: { message: "Request is missing required authentication credential." } });
    }

    if (url.pathname === "/v1/sessions" && req.method === "POST") {
      google.polls = 0;
      return send(res, 200, {
        id: "s1",
        pickerUri: `${base}/pick/s1`,
        pollingConfig: { pollInterval: "0.01s", timeoutIn: google.timeoutIn },
        mediaItemsSet: false,
      });
    }
    if (url.pathname === "/v1/sessions/s1" && req.method === "GET") {
      google.polls += 1;
      const done = google.polls >= google.pollsUntilSet;
      return send(res, 200, {
        id: "s1",
        mediaItemsSet: done,
        pollingConfig: done ? {} : { pollInterval: "0.01s", timeoutIn: google.timeoutIn },
      });
    }
    if (url.pathname === "/v1/sessions/s1" && req.method === "DELETE") {
      google.deleted.push("s1");
      return send(res, 200, {});
    }
    if (url.pathname === "/v1/mediaItems") {
      if (google.failList) return send(res, 500, { error: { message: "backend error" } });
      assert.equal(url.searchParams.get("sessionId"), "s1");
      // Google can return an empty page that still has a next page.
      if (!url.searchParams.get("pageToken")) return send(res, 200, { mediaItems: [], nextPageToken: "p2" });
      return send(res, 200, { mediaItems: google.items });
    }

    const media = url.pathname.match(/^\/media\/([^=]+)=(.+)$/);
    if (media) {
      const [, name, params] = media;
      google.downloads.push(`${name}=${params}`);
      if (google.failDownload.has(name)) return send(res, 404, { error: { message: "gone" } });
      res.writeHead(200);
      // "heic" stands in for a format the pipeline can't read: the original is
      // junk to sharp, the sized rendition is a normal image.
      if (name.startsWith("heic")) return res.end(params === "d" ? Buffer.from("ftypheic not decodable") : png);
      return res.end(name.startsWith("png") ? png : jpeg);
    }

    send(res, 404, { error: { message: `unexpected ${req.method} ${url.pathname}` } });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const photo = (id, name, extra = {}) => ({
  id,
  type: "PHOTO",
  createTime: "2023-06-12T12:00:00Z",
  mediaFile: {
    baseUrl: `${base}/media/${name}`,
    mimeType: "image/jpeg",
    filename: extra.filename ?? `${name}.jpg`,
    mediaFileMetadata: { width: 40, height: 30 },
  },
});

let photosDir;
let opened;
let logs;

function run(trip = "Test Trip", options = {}) {
  return importTrip(trip, {
    accessToken: TOKEN,
    apiBase: `${base}/v1`,
    photosDir,
    openUrl: (url) => opened.push(url),
    log: (line) => logs.push(line),
    ...options,
  });
}

beforeEach(() => {
  google.reset();
  photosDir = fs.mkdtempSync(path.join(os.tmpdir(), "import-photos-"));
  opened = [];
  logs = [];
});

describe("importTrip", () => {
  test("downloads picked photos, records them, and skips videos", async () => {
    google.items = [
      photo("g-jpeg", "jpeg-a", { filename: "PXL 20230612 trail view.jpg" }),
      photo("g-heic", "heic-b", { filename: "IMG_0042.HEIC" }),
      { ...photo("g-video", "video-c"), type: "VIDEO" },
    ];

    const result = await run();

    assert.deepEqual(result.imported.sort(), ["IMG_0042.jpg", "PXL-20230612-trail-view.jpg"]);
    assert.equal(result.skippedVideos, 1);
    assert.equal(result.failed, 0);
    assert.equal(result.isNewTrip, true);

    // Picker opened in auto-close mode and the session cleaned up afterwards.
    assert.deepEqual(opened, [`${base}/pick/s1/autoclose`]);
    assert.deepEqual(google.deleted, ["s1"]);

    const tripDir = path.join(photosDir, "Test Trip");
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tripDir, "trip.json"), "utf-8")), {
      name: "Test Trip",
      description: "",
    });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tripDir, "photos.json"), "utf-8")), {
      "IMG_0042.jpg": { title: "", date: "2023-06-12", googlePhotosId: "g-heic" },
      "PXL-20230612-trail-view.jpg": { title: "", date: "2023-06-12", googlePhotosId: "g-jpeg" },
    });

    // The undecodable original was swapped for a full-size rendition, saved as JPEG.
    assert.ok(google.downloads.includes("heic-b=w40-h30"));
    const converted = await sharp(path.join(tripDir, "IMG_0042.jpg")).metadata();
    assert.equal(converted.format, "jpeg");
    assert.ok(!google.downloads.some((d) => d.startsWith("video-c")), "videos are never downloaded");
  });

  test("keeps PNGs as PNGs", async () => {
    google.items = [photo("g-png", "png-a", { filename: "screenshot.png" })];
    const result = await run();
    assert.deepEqual(result.imported, ["screenshot.png"]);
  });

  test("re-running skips photos that were already imported", async () => {
    google.items = [photo("g-1", "jpeg-1"), photo("g-2", "jpeg-2")];
    await run();

    google.reset();
    google.items = [photo("g-1", "jpeg-1"), photo("g-2", "jpeg-2"), photo("g-3", "jpeg-3")];
    const result = await run();

    assert.deepEqual(result.imported, ["jpeg-3.jpg"]);
    assert.equal(result.skippedExisting, 2);
    assert.equal(result.isNewTrip, false);
    assert.deepEqual(google.downloads, ["jpeg-3=d"]);
    const meta = JSON.parse(fs.readFileSync(path.join(photosDir, "Test Trip", "photos.json"), "utf-8"));
    assert.deepEqual(Object.keys(meta), ["jpeg-1.jpg", "jpeg-2.jpg", "jpeg-3.jpg"]);
  });

  test("never overwrites a different photo with the same name", async () => {
    const tripDir = path.join(photosDir, "Existing");
    fs.mkdirSync(tripDir);
    fs.writeFileSync(path.join(tripDir, "img_0001.PNG"), "keep me");
    fs.writeFileSync(path.join(tripDir, "photos.json"), JSON.stringify({ "img_0001.PNG": { title: "Kept" } }));

    google.items = [photo("g-new", "jpeg-x", { filename: "IMG_0001.jpg" })];
    const result = await run("Existing");

    assert.deepEqual(result.imported, ["IMG_0001-2.jpg"]);
    assert.equal(fs.readFileSync(path.join(tripDir, "img_0001.PNG"), "utf-8"), "keep me");
    const meta = JSON.parse(fs.readFileSync(path.join(tripDir, "photos.json"), "utf-8"));
    assert.equal(meta["img_0001.PNG"].title, "Kept");
    assert.equal(fs.existsSync(path.join(tripDir, "trip.json")), false, "existing trips keep their trip.json");
  });

  test("a failed download is reported and the rest still import", async () => {
    google.items = [photo("g-ok", "jpeg-ok"), photo("g-bad", "jpeg-bad")];
    google.failDownload.add("jpeg-bad");
    const result = await run();
    assert.deepEqual(result.imported, ["jpeg-ok.jpg"]);
    assert.equal(result.failed, 1);
    assert.ok(logs.some((line) => line.includes("jpeg-bad.jpg") && line.includes("HTTP 404")));
  });

  test("deletes the session even when listing fails", async () => {
    google.failList = true;
    await assert.rejects(run(), /Listing the picked photos failed: HTTP 500/);
    assert.deepEqual(google.deleted, ["s1"]);
  });

  test("stops when the picker session expires", async () => {
    google.pollsUntilSet = Infinity;
    google.timeoutIn = "0s";
    await assert.rejects(run(), /picker session expired/);
    assert.deepEqual(google.deleted, ["s1"]);
  });

  test("a bad token surfaces Google's message", async () => {
    await assert.rejects(run("Test Trip", { accessToken: "wrong" }), /HTTP 401 — Request is missing/);
  });
});

describe("refreshAccessToken", () => {
  const client = { clientId: "id", clientSecret: "secret" };

  test("returns a fresh access token", async () => {
    assert.equal(await refreshAccessToken(client, "refresh", `${base}/token`), "fresh-token");
    assert.equal(google.lastTokenRequest.get("grant_type"), "refresh_token");
    assert.equal(google.lastTokenRequest.get("refresh_token"), "refresh");
  });

  test("returns null when the refresh token has expired, so sign-in can repeat", async () => {
    google.tokenResponse = { status: 400, body: { error: "invalid_grant", error_description: "Token has been expired or revoked." } };
    assert.equal(await refreshAccessToken(client, "old", `${base}/token`), null);
  });

  test("throws on other failures", async () => {
    google.tokenResponse = { status: 401, body: { error: "invalid_client", error_description: "The OAuth client was not found." } };
    await assert.rejects(refreshAccessToken(client, "r", `${base}/token`), /OAuth client was not found/);
  });
});

describe("helpers", () => {
  test("captureDate prefers EXIF, then the local date of createTime", () => {
    const exif = Buffer.from("Exif\0\0junk 2021:09:17 17:15:21\0more");
    assert.equal(captureDate(exif, "2023-01-01T12:00:00Z"), "2021-09-17");
    assert.equal(captureDate(Buffer.from("0000:00:00 00:00:00"), "2023-01-01T12:00:00Z"), "2023-01-01");
    assert.equal(captureDate(undefined, undefined), undefined);
    assert.equal(captureDate(undefined, "not a date"), undefined);
  });

  test("safeStem makes URL-safe names", () => {
    assert.equal(safeStem("PXL 20230612 trail view.jpg"), "PXL-20230612-trail-view");
    assert.equal(safeStem("Rainier (summit) #2.HEIC"), "Rainier-summit-2");
    assert.equal(safeStem("..hidden.jpg"), "hidden");
    assert.equal(safeStem("???.jpg"), "photo");
  });

  test("uniqueFilename compares stems without case or extension", () => {
    const taken = new Set(["img_1", "img_1-2"]);
    assert.equal(uniqueFilename("IMG_1", ".jpg", taken), "IMG_1-3.jpg");
    assert.equal(uniqueFilename("IMG_2", ".jpg", taken), "IMG_2.jpg");
    assert.ok(taken.has("img_1-3") && taken.has("img_2"));
  });

  test("parseDurationMs reads protobuf durations", () => {
    assert.equal(parseDurationMs("3.5s"), 3500);
    assert.equal(parseDurationMs("0s", 9), 0);
    assert.equal(parseDurationMs(undefined, 9), 9);
  });
});
