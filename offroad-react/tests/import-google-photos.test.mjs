import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import {
  MANIFEST_FILE,
  SCOPE,
  Auth,
  Picker,
  chooseFilename,
  describeApiError,
  isTimestampName,
  importPhotos,
  loadClient,
  parseArgs,
  parseDuration,
  stampFromTime,
  validateTripName,
} from "../scripts/import-google-photos.mjs";

const quiet = () => {};
const noSleep = async () => {};

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gp-import-"));
}

function writeClient(dir, json = { installed: { client_id: "cid", client_secret: "secret" } }) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "client_secret_123.apps.googleusercontent.com.json"), JSON.stringify(json));
}

function photo(id, filename, { mimeType = "image/jpeg", createTime = "2021-09-17T17:15:21Z", width = 4000, height = 3000 } = {}) {
  return {
    id,
    createTime,
    type: "PHOTO",
    mediaFile: { baseUrl: null, mimeType, filename, mediaFileMetadata: { width, height } },
  };
}

/**
 * A local stand-in for Google's OAuth, Picker API and media servers.
 * `pages` is the list of mediaItems pages the session returns.
 */
async function withGoogle({ pages, refreshFails = false, pollsBeforeDone = 1 }, fn) {
  const state = {
    requests: [],
    challenge: null,
    signIns: 0,
    refreshes: 0,
    createBody: null,
    deleted: [],
    polls: 0,
    downloads: [],
  };
  const validTokens = new Set();
  let tokenCounter = 0;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    state.requests.push({ method: req.method, url, auth: req.headers.authorization });

    const json = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const issue = (extra = {}) => {
      tokenCounter += 1;
      const token = `at-${tokenCounter}`;
      validTokens.add(token);
      return { access_token: token, expires_in: 3599, scope: SCOPE, token_type: "Bearer", ...extra };
    };

    if (url.pathname === "/token") {
      const form = new URLSearchParams(raw);
      if (form.get("grant_type") === "authorization_code") {
        const expected = crypto
          .createHash("sha256")
          .update(form.get("code_verifier") ?? "")
          .digest("base64url");
        if (form.get("code") !== "good-code" || expected !== state.challenge) {
          return json(400, { error: "invalid_grant" });
        }
        state.signIns += 1;
        return json(200, issue({ refresh_token: "rt-1" }));
      }
      state.refreshes += 1;
      if (refreshFails) return json(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
      return json(200, issue());
    }

    const bearer = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    if (!validTokens.has(bearer)) return json(401, { error: { code: 401, status: "UNAUTHENTICATED" } });

    if (url.pathname.startsWith("/media/")) {
      const [name, params] = decodeURIComponent(url.pathname.slice("/media/".length)).split("=");
      state.downloads.push(`${name}=${params}`);
      if (name.endsWith(".HEIC") && params === "d") {
        res.writeHead(200, { "Content-Type": "image/heic" });
        return res.end("heic-bytes");
      }
      res.writeHead(200, { "Content-Type": "image/jpeg" });
      return res.end(`jpeg:${name}:${params}`);
    }

    if (req.method === "POST" && url.pathname === "/v1/sessions") {
      state.createBody = JSON.parse(raw || "{}");
      return json(200, {
        id: "s1",
        pickerUri: "https://photos.google.com/picker/s1",
        pollingConfig: { pollInterval: "2s", timeoutIn: "600s" },
        expireTime: "2030-01-01T00:00:00Z",
        mediaItemsSet: false,
      });
    }
    if (req.method === "GET" && url.pathname === "/v1/sessions/s1") {
      state.polls += 1;
      const done = state.polls >= pollsBeforeDone;
      return json(200, {
        id: "s1",
        pickerUri: "https://photos.google.com/picker/s1",
        ...(done ? {} : { pollingConfig: { pollInterval: "2s", timeoutIn: "500s" } }),
        mediaItemsSet: done,
      });
    }
    if (req.method === "DELETE" && url.pathname === "/v1/sessions/s1") {
      state.deleted.push("s1");
      return json(200, {});
    }
    if (req.method === "GET" && url.pathname === "/v1/mediaItems") {
      const index = Number(url.searchParams.get("pageToken") ?? 0);
      const page = pages[index].map((item) => ({
        ...item,
        mediaFile: { ...item.mediaFile, baseUrl: `${base}/media/${encodeURIComponent(item.mediaFile.filename)}` },
      }));
      return json(200, {
        mediaItems: page,
        ...(index + 1 < pages.length ? { nextPageToken: String(index + 1) } : {}),
      });
    }
    json(404, { error: { status: "NOT_FOUND", message: `no route ${req.method} ${url.pathname}` } });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const endpoints = { authUrl: `${base}/auth`, tokenUrl: `${base}/token`, pickerBase: `${base}/v1` };

  const opened = [];
  /** Plays the user: approves sign-in, and "picks" by just being opened. */
  const openUrl = async (link) => {
    opened.push(link);
    if (!link.startsWith(endpoints.authUrl)) return;
    const params = new URL(link).searchParams;
    state.challenge = params.get("code_challenge");
    state.authParams = params;
    const callback = new URL(params.get("redirect_uri"));
    callback.searchParams.set("code", "good-code");
    callback.searchParams.set("state", params.get("state"));
    const response = await fetch(callback);
    await response.text();
  };

  try {
    await fn({ endpoints, openUrl, opened, state });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("parseDuration reads the Picker API's duration strings", () => {
  assert.equal(parseDuration("3.5s"), 3500);
  assert.equal(parseDuration("0s"), 0);
  assert.equal(parseDuration("1800s"), 1_800_000);
  assert.equal(parseDuration(undefined), null);
  assert.equal(parseDuration("5m"), null);
});

test("parseArgs takes one trip name and validates --max", () => {
  assert.deepEqual(parseArgs(["October 2026", "--max", "20", "--no-browser"]), {
    trip: "October 2026",
    max: 20,
    browser: false,
    help: false,
  });
  assert.equal(parseArgs(["--max=5", "Trip"]).max, 5);
  assert.throws(() => parseArgs(["Trip", "--max", "2001"]), /--max/);
  assert.throws(() => parseArgs(["October", "2026"]), /Quote names/);
  assert.throws(() => parseArgs(["Trip", "--force"]), /Unknown option/);
});

test("validateTripName keeps the folder inside photos/", () => {
  assert.equal(validateTripName("  May 2026 "), "May 2026");
  assert.equal(validateTripName("_unpublished"), "_unpublished");
  for (const bad of ["", "..", "a/b", "a\\b", "."]) {
    assert.throws(() => validateTripName(bad));
  }
});

test("chooseFilename names photos by capture time", () => {
  const taken = new Set(["20210917_171521.jpg"]);
  assert.equal(isTimestampName("20210605_113354_HDR"), true);
  assert.equal(isTimestampName("20210606_163840_HDR-PANO"), true);
  assert.equal(isTimestampName("20210917_171521-2"), true);
  assert.equal(isTimestampName("PXL_20240501_101010123"), false);
  assert.equal(isTimestampName("IMG_1234"), false);
  assert.equal(stampFromTime("2021-09-17T23:15:21Z", "America/Denver"), "20210917_171521");

  assert.equal(
    chooseFilename(photo("a", "20210917_171521.jpg"), ".jpg", taken, "UTC"),
    "20210917_171521-2.jpg",
  );
  assert.equal(
    chooseFilename(photo("b", "IMG_1234.HEIC", { createTime: "2021-09-18T10:15:00Z" }), ".jpg", new Set(), "UTC"),
    "20210918_101500.jpg",
  );
  assert.equal(
    chooseFilename(photo("e", "PXL_20240501_101010123.jpg", { createTime: "2024-05-01T10:10:10Z" }), ".jpg", new Set(), "UTC"),
    "20240501_101010.jpg",
  );
  // Case-insensitive file systems would treat these as the same file.
  assert.equal(
    chooseFilename(photo("c", "20210917_171521.JPG"), ".jpg", new Set(["20210917_171521.JPG"]), "UTC"),
    "20210917_171521-2.jpg",
  );
  assert.equal(
    chooseFilename(photo("d", "../../etc/x:y.jpg", { createTime: null }), ".jpg", new Set(), "UTC"),
    "x_y.jpg",
  );
});

test("loadClient explains a missing or wrong-type client", () => {
  const dir = tempDir();
  assert.throws(() => loadClient(dir), /Desktop app/);
  writeClient(dir, { web: { client_id: "x", client_secret: "y" } });
  assert.throws(() => loadClient(dir), /Web application/);
  const dir2 = tempDir();
  writeClient(dir2);
  assert.deepEqual(loadClient(dir2), { clientId: "cid", clientSecret: "secret" });
});

test("describeApiError turns Google's error into a fix", () => {
  const message = describeApiError("create session", 403, {
    error: {
      status: "PERMISSION_DENIED",
      message: "Photos Picker API has not been used",
      details: [{ reason: "SERVICE_DISABLED" }],
    },
  });
  assert.match(message, /HTTP 403 \(PERMISSION_DENIED, SERVICE_DISABLED\)/);
  assert.match(message, /Fix: The Google Photos Picker API is not enabled/);
  assert.match(
    describeApiError("create session", 400, { error: { status: "FAILED_PRECONDITION" } }),
    /no active Google Photos library/,
  );
});

test("imports picked photos, skips videos, and cleans up the session", async () => {
  const pages = [
    [
      photo("id-1", "20210917_171521.jpg"),
      photo("id-2", "IMG_1234.HEIC", { mimeType: "image/heif", createTime: "2021-09-18T10:15:00Z", width: 4032, height: 3024 }),
      { id: "id-3", type: "VIDEO", createTime: "2021-09-18T11:00:00Z", mediaFile: { mimeType: "video/mp4", filename: "VID.mp4" } },
    ],
    [photo("id-4", "20210917_171521.jpg", { createTime: "2021-09-17T17:15:21Z" })],
  ];

  await withGoogle({ pages, pollsBeforeDone: 2 }, async ({ endpoints, openUrl, opened, state }) => {
    const photosDir = tempDir();
    const configDir = path.join(tempDir(), ".google-photos");
    writeClient(configDir);
    const sleeps = [];

    const summary = await importPhotos({
      trip: "September 2021 Weekend",
      max: 5,
      photosDir,
      configDir,
      endpoints,
      openUrl,
      log: quiet,
      sleep: async (ms) => sleeps.push(ms),
      timeZone: "UTC",
    });

    // Sign-in: PKCE, offline access, only the picker scope.
    assert.equal(state.signIns, 1);
    assert.equal(state.authParams.get("scope"), SCOPE);
    assert.equal(state.authParams.get("code_challenge_method"), "S256");
    assert.equal(state.authParams.get("access_type"), "offline");
    assert.match(state.authParams.get("redirect_uri"), /^http:\/\/127\.0\.0\.1:\d+$/);
    const tokenFile = path.join(configDir, "token.json");
    assert.equal(JSON.parse(fs.readFileSync(tokenFile, "utf-8")).refresh_token, "rt-1");
    if (process.platform !== "win32") assert.equal(fs.statSync(tokenFile).mode & 0o777, 0o600);

    // Session: maxItemCount as an int64 string, picker opened with /autoclose,
    // polled at the recommended interval.
    assert.deepEqual(state.createBody, { pickingConfig: { maxItemCount: "5" } });
    assert.equal(opened.at(-1), "https://photos.google.com/picker/s1/autoclose");
    assert.deepEqual(sleeps, [2000, 2000]);
    const listCalls = state.requests.filter((r) => r.url.pathname === "/v1/mediaItems");
    assert.equal(listCalls.length, 2);
    assert.equal(listCalls[0].url.searchParams.get("pageSize"), "100");
    assert.equal(listCalls[0].url.searchParams.get("sessionId"), "s1");

    // Downloads carry the bearer token; HEIC falls back to a full-size JPEG.
    for (const request of state.requests.filter((r) => r.url.pathname.startsWith("/media/"))) {
      assert.match(request.auth, /^Bearer at-/);
    }
    assert.ok(state.downloads.includes("IMG_1234.HEIC=d"));
    assert.ok(state.downloads.includes("IMG_1234.HEIC=w4032-h3024"));

    const tripDir = path.join(photosDir, "September 2021 Weekend");
    assert.deepEqual(summary.imported.slice().sort(), [
      "20210917_171521-2.jpg",
      "20210917_171521.jpg",
      "20210918_101500.jpg",
    ]);
    assert.equal(summary.videos, 1);
    assert.deepEqual(summary.skipped, []);
    assert.equal(
      fs.readFileSync(path.join(tripDir, "20210918_101500.jpg"), "utf-8"),
      "jpeg:IMG_1234.HEIC:w4032-h3024",
    );
    assert.deepEqual(
      fs.readdirSync(tripDir).sort(),
      ["20210917_171521-2.jpg", "20210917_171521.jpg", "20210918_101500.jpg", MANIFEST_FILE].sort(),
    );

    const manifest = JSON.parse(fs.readFileSync(path.join(tripDir, MANIFEST_FILE), "utf-8"));
    assert.deepEqual(Object.keys(manifest).sort(), ["id-1", "id-2", "id-4"]);
    assert.equal(manifest["id-2"].originalFilename, "IMG_1234.HEIC");
    assert.deepEqual(state.deleted, ["s1"]);

    // Second run with the same picks: saved sign-in, nothing downloaded twice.
    state.polls = 0;
    const downloadsBefore = state.downloads.length;
    const again = await importPhotos({
      trip: "September 2021 Weekend",
      photosDir,
      configDir,
      endpoints,
      openUrl,
      log: quiet,
      sleep: noSleep,
      timeZone: "UTC",
    });
    assert.equal(state.signIns, 1);
    assert.deepEqual(state.createBody, {});
    assert.equal(again.imported.length, 0);
    assert.equal(again.alreadyImported, 3);
    assert.equal(state.downloads.length, downloadsBefore);
    assert.deepEqual(state.deleted, ["s1", "s1"]);
  });
});

test("an expired refresh token leads to a fresh sign-in", async () => {
  await withGoogle({ pages: [[]], refreshFails: true }, async ({ endpoints, openUrl, state }) => {
    const configDir = tempDir();
    writeClient(configDir);
    fs.writeFileSync(
      path.join(configDir, "token.json"),
      JSON.stringify({ access_token: "stale", refresh_token: "old", expires_at: 0, scope: SCOPE }),
    );
    const logs = [];
    const auth = new Auth({ client: loadClient(configDir), configDir, endpoints, openUrl, log: (m) => logs.push(m) });
    const token = await auth.accessToken();
    assert.equal(state.refreshes, 1);
    assert.equal(state.signIns, 1);
    assert.match(token, /^at-/);
    assert.ok(logs.some((line) => /7-day/.test(line)));
  });
});

test("a 401 mid-run refreshes the token and retries", async () => {
  await withGoogle({ pages: [[]] }, async ({ endpoints, openUrl, state }) => {
    const configDir = tempDir();
    writeClient(configDir);
    // A token the server doesn't know, but not yet expired by the clock.
    fs.writeFileSync(
      path.join(configDir, "token.json"),
      JSON.stringify({ access_token: "revoked", refresh_token: "rt", expires_at: Date.now() + 3_600_000, scope: SCOPE }),
    );
    const auth = new Auth({ client: loadClient(configDir), configDir, endpoints, openUrl, log: quiet });
    const picker = new Picker({ auth, pickerBase: endpoints.pickerBase, sleep: noSleep });
    const session = await picker.createSession(0);
    assert.equal(session.id, "s1");
    assert.equal(state.refreshes, 1);
    assert.equal(state.signIns, 0);
  });
});

test("waitForPicks gives up when the session times out", async () => {
  const picker = new Picker({ auth: null, pickerBase: "", sleep: noSleep });
  picker.getSession = async () => ({ id: "s", mediaItemsSet: false, pollingConfig: { pollInterval: "1s", timeoutIn: "0s" } });
  const done = await picker.waitForPicks(
    { id: "s", mediaItemsSet: false, pollingConfig: { pollInterval: "1s", timeoutIn: "5s" } },
    { log: quiet },
  );
  assert.equal(done, false);
});
