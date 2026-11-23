/**
 * import-google-photos.mjs
 *
 * Pick photos in Google Photos and download them as masters into
 * photos/<Trip Name>/, ready for `npm run photos`.
 *
 * Usage:  npm run import-photos -- "<Trip Name>" [--max N] [--no-browser]
 *
 * Uses the Google Photos Picker API (docs-notes/picker-api.md at the repo
 * root): the user picks items in Google Photos, and the script only ever sees
 * what was picked. Since March 2025 this is the only API that can read photos
 * an app did not upload itself.
 *
 * One-time setup: create an OAuth client of type "Desktop app" in Google
 * Cloud, enable the "Google Photos Picker API", and save the client JSON as
 * .google-photos/client_secret.json (gitignored). See the README.
 *
 * What gets written to the trip folder:
 *   - each picked photo, as JPEG, PNG or WebP (the formats build-photos
 *     reads). Google strips location data from downloads.
 *   - google-photos.json, which records which Google Photos items were
 *     already imported so a second run never duplicates them.
 * Videos are skipped: the site's videos come from YouTube.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const PHOTOS_DIR = path.join(ROOT, "photos");
const DEFAULT_CONFIG_DIR = path.join(ROOT, ".google-photos");

export const SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";

const DEFAULT_ENDPOINTS = {
  authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  pickerBase: "https://photospicker.googleapis.com/v1",
};

export const MANIFEST_FILE = "google-photos.json";

// mediaItems.list caps pageSize at 100.
const PAGE_SIZE = 100;
// The Picker API caps a session at 2000 items.
const MAX_ITEMS = 2000;
// Base URLs live for 60 minutes; list again before they get close.
const BASE_URL_LIFETIME_MS = 50 * 60 * 1000;
// Image base URL dimensions must be within [1, 16383].
const MAX_DIMENSION = 16383;
const DOWNLOAD_CONCURRENCY = 3;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
// Fallbacks when a session response has no pollingConfig.
const DEFAULT_POLL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

// Exactly the formats build-photos.mjs accepts as masters.
const SUPPORTED_TYPES = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

/** Picker durations look like "3.5s". Returns milliseconds, or null. */
export function parseDuration(value) {
  const match = /^(\d+(?:\.\d+)?)s$/.exec(String(value ?? "").trim());
  return match ? Math.round(Number(match[1]) * 1000) : null;
}

export function parseArgs(argv) {
  const options = { trip: null, max: 0, browser: true, help: false };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--no-browser") options.browser = false;
    else if (arg === "--max" || arg.startsWith("--max=")) {
      const raw = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : argv[(i += 1)];
      const max = Number(raw);
      if (!Number.isInteger(max) || max < 1 || max > MAX_ITEMS) {
        throw new Error(`--max must be a whole number from 1 to ${MAX_ITEMS}`);
      }
      options.max = max;
    } else if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
    else rest.push(arg);
  }
  if (rest.length > 1) {
    throw new Error(`Expected one trip name, got ${rest.length}. Quote names with spaces.`);
  }
  options.trip = rest[0] ?? null;
  return options;
}

/** The trip name becomes a folder under photos/, so keep it to one level. */
export function validateTripName(name) {
  const trimmed = (name ?? "").trim();
  if (!trimmed) throw new Error("Give the trip folder name, e.g. \"October 2026\".");
  if (trimmed === "." || trimmed === ".." || /[/\\]/.test(trimmed) || /[\0-\x1f]/.test(trimmed)) {
    throw new Error(`"${name}" can't be used as a folder name under photos/.`);
  }
  return trimmed;
}

/**
 * True for names like 20210605_113354_HDR: build-photos dates these from the
 * name and shows no caption for them. Must match titleFromFilename there.
 */
export function isTimestampName(base) {
  return /^\d{8}[_-]?\d*(_HDR)?(-PANO)?(-\d+)?$/i.test(base);
}

/** "2021-09-17T23:15:21Z" -> "20210917_161521" in the given (default local) time zone. */
export function stampFromTime(iso, timeZone) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}${parts.month}${parts.day}_${parts.hour}${parts.minute}${parts.second}`;
}

/**
 * Filename for a picked item, with the extension of the bytes actually
 * received. Named by capture time (20210917_171521.jpg) like the existing
 * masters, so the gallery dates it and doesn't turn a camera name such as
 * IMG_1234 into a caption. Names already in that form are kept as they are.
 * Never reuses a name in `taken`.
 */
export function chooseFilename(item, ext, taken, timeZone) {
  const original = item.mediaFile?.filename ?? "";
  let base = path
    .basename(original, path.extname(original))
    .replace(/[\0-\x1f<>:"/\\|?*]/g, "_")
    .replace(/^[.\s]+|[.\s]+$/g, "");

  if (!isTimestampName(base)) {
    const stamp = item.createTime ? stampFromTime(item.createTime, timeZone) : null;
    if (stamp) base = stamp;
  }
  if (!base) base = `google-photo-${String(item.id ?? "").slice(0, 12)}`;

  const lowerTaken = new Set([...taken].map((name) => name.toLowerCase()));
  let name = `${base}${ext}`;
  for (let n = 2; lowerTaken.has(name.toLowerCase()); n += 1) name = `${base}-${n}${ext}`;
  return name;
}

export function isVideo(item) {
  if (item.type === "VIDEO") return true;
  if (item.type === "PHOTO") return false;
  return String(item.mediaFile?.mimeType ?? "").startsWith("video/");
}

function mediaType(contentType) {
  return String(contentType ?? "").split(";")[0].trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// OAuth: Desktop app client, loopback redirect, PKCE
// ---------------------------------------------------------------------------

/** Read the client JSON Google Cloud hands out for an OAuth client. */
export function loadClient(configDir) {
  const candidates = fs.existsSync(configDir)
    ? fs.readdirSync(configDir).filter((file) => /^client_secret.*\.json$/.test(file)).sort()
    : [];
  if (candidates.length === 0) {
    const relative = path.relative(ROOT, configDir);
    const shown = relative && !relative.startsWith("..") ? relative : configDir;
    throw new Error(
      `No OAuth client found. Create an OAuth client of type "Desktop app" in Google Cloud ` +
        `(APIs & Services → Credentials), download its JSON and save it as ` +
        `${path.join(shown, "client_secret.json")}. See the README.`,
    );
  }
  if (candidates.length > 1) {
    throw new Error(
      `Several client files in ${configDir}: ${candidates.join(", ")}. Keep only one.`,
    );
  }

  const file = path.join(configDir, candidates[0]);
  let json;
  try {
    json = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    throw new Error(`${file} is not valid JSON.`);
  }
  if (json.web && !json.installed) {
    throw new Error(
      `${candidates[0]} is a "Web application" client. This script signs in through a local ` +
        `loopback address, which needs a client of type "Desktop app" — create one and replace the file.`,
    );
  }
  const client = json.installed ?? json;
  if (!client.client_id || !client.client_secret) {
    throw new Error(`${candidates[0]} has no client_id/client_secret.`);
  }
  return { clientId: client.client_id, clientSecret: client.client_secret };
}

function base64url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function postForm(url, params) {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(params),
    });
  } catch (error) {
    throw new Error(`Could not reach Google's sign-in server: ${error.message}`);
  }
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

function tokensFromResponse(body, previous, now) {
  return {
    access_token: body.access_token,
    // Refresh responses don't repeat the refresh token; keep the one we have.
    refresh_token: body.refresh_token ?? previous?.refresh_token,
    expires_at: now() + Number(body.expires_in ?? 3600) * 1000,
    scope: body.scope ?? previous?.scope ?? "",
  };
}

function assertScope(tokens) {
  if (tokens.scope && !tokens.scope.split(" ").includes(SCOPE)) {
    throw new Error(
      "Google Photos access wasn't granted. Run again and leave the Google Photos box ticked on the consent screen.",
    );
  }
}

/**
 * Interactive sign-in: start a loopback listener, open the consent page, and
 * swap the returned code for tokens.
 */
export async function signIn(client, { endpoints, openUrl, log, now = Date.now, timeoutMs = LOGIN_TIMEOUT_MS }) {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  const state = base64url(crypto.randomBytes(16));

  let settle;
  const result = new Promise((resolve, reject) => {
    settle = { resolve, reject };
  });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    if (!code && !error) {
      res.writeHead(404).end();
      return;
    }
    const finish = (status, message) => {
      res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><title>Offroad photo import</title><p>${message}</p>`);
    };
    if (url.searchParams.get("state") !== state) {
      finish(400, "This sign-in link doesn't match the one the importer started. Go back to the terminal.");
      return;
    }
    if (error) {
      finish(200, "Sign-in was cancelled. You can close this tab.");
      settle.reject(new Error(`Sign-in was cancelled (${error}).`));
      return;
    }
    finish(200, "Signed in. You can close this tab and go back to the terminal.");
    settle.resolve(code);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const redirectUri = `http://127.0.0.1:${server.address().port}`;
  const timer = setTimeout(
    () => settle.reject(new Error("Timed out waiting for Google sign-in.")),
    timeoutMs,
  );

  try {
    const authUrl = new URL(endpoints.authUrl);
    authUrl.search = new URLSearchParams({
      client_id: client.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPE,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
      access_type: "offline",
      prompt: "consent",
    }).toString();

    log("Sign in to Google in your browser. If it doesn't open, visit:");
    log(`  ${authUrl.href}`);
    await openUrl(authUrl.href);

    const code = await result;
    const { ok, status, body } = await postForm(endpoints.tokenUrl, {
      code,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    });
    if (!ok) {
      throw new Error(
        `Google rejected the sign-in (HTTP ${status}${body.error ? `, ${body.error}` : ""}` +
          `${body.error_description ? ` — ${body.error_description}` : ""}).`,
      );
    }
    const tokens = tokensFromResponse(body, null, now);
    assertScope(tokens);
    return tokens;
  } finally {
    clearTimeout(timer);
    server.close();
    server.closeAllConnections?.();
  }
}

/**
 * Hands out access tokens: cached, refreshed, or from a fresh sign-in.
 * Tokens are stored in <configDir>/token.json with owner-only permissions.
 */
export class Auth {
  constructor({ client, configDir, endpoints, openUrl, log, now = Date.now }) {
    Object.assign(this, { client, endpoints, openUrl, log, now });
    this.tokenFile = path.join(configDir, "token.json");
    this.tokens = null;
    this.pending = null;
  }

  readStored() {
    try {
      return JSON.parse(fs.readFileSync(this.tokenFile, "utf-8"));
    } catch {
      return null;
    }
  }

  save(tokens) {
    fs.mkdirSync(path.dirname(this.tokenFile), { recursive: true });
    fs.writeFileSync(this.tokenFile, `${JSON.stringify(tokens, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(this.tokenFile, 0o600);
    this.tokens = tokens;
  }

  async refresh(tokens) {
    const { ok, body } = await postForm(this.endpoints.tokenUrl, {
      client_id: this.client.clientId,
      client_secret: this.client.clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    });
    if (ok) return tokensFromResponse(body, tokens, this.now);
    if (body.error === "invalid_grant") {
      // Revoked, unused for six months, or — the usual cause for a personal
      // project — a consent screen in "Testing" status, whose refresh tokens
      // last only 7 days.
      this.log(
        "Saved Google sign-in has expired or was revoked (apps in \"Testing\" status get 7-day sign-ins). Signing in again.",
      );
      return null;
    }
    throw new Error(
      `Couldn't refresh the Google sign-in (${body.error ?? "unknown error"}` +
        `${body.error_description ? ` — ${body.error_description}` : ""}).`,
    );
  }

  /** A valid access token. `force` skips the cached one (after a 401). */
  async accessToken({ force = false } = {}) {
    // Concurrent downloads share one refresh instead of racing.
    if (this.pending) return this.pending;
    this.pending = this.#obtain(force).finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  async #obtain(force) {
    let tokens = this.tokens ?? this.readStored();
    if (tokens && !force && tokens.access_token && tokens.expires_at - 60_000 > this.now()) {
      this.tokens = tokens;
      return tokens.access_token;
    }
    if (tokens?.refresh_token) {
      const refreshed = await this.refresh(tokens);
      if (refreshed) {
        assertScope(refreshed);
        this.save(refreshed);
        return refreshed.access_token;
      }
    }
    tokens = await signIn(this.client, {
      endpoints: this.endpoints,
      openUrl: this.openUrl,
      log: this.log,
      now: this.now,
    });
    this.save(tokens);
    return tokens.access_token;
  }
}

// ---------------------------------------------------------------------------
// Picker API
// ---------------------------------------------------------------------------

const ERROR_HINTS = {
  SERVICE_DISABLED:
    "The Google Photos Picker API is not enabled in the OAuth client's Google Cloud project — enable it under APIs & Services → Library.",
  ACCESS_TOKEN_SCOPE_INSUFFICIENT:
    "The saved sign-in lacks Google Photos access. Delete .google-photos/token.json and run again.",
};

/** Turn a Google API error body into one readable message. */
export function describeApiError(what, status, body) {
  const error = body?.error ?? {};
  const reasons = (error.details ?? []).map((detail) => detail?.reason).filter(Boolean);
  const label = [error.status, ...reasons].filter(Boolean).join(", ");
  let hint = reasons.map((reason) => ERROR_HINTS[reason]).find(Boolean);
  if (!hint && what === "create session" && error.status === "FAILED_PRECONDITION") {
    hint = "This Google account has no active Google Photos library.";
  }
  if (!hint && error.status === "RESOURCE_EXHAUSTED") {
    hint = "Too many open picking sessions for this account. Wait a while and try again.";
  }
  return (
    `Google Photos ${what} failed: HTTP ${status}${label ? ` (${label})` : ""}` +
    `${error.message ? ` — ${error.message}` : ""}${hint ? `\nFix: ${hint}` : ""}`
  );
}

/**
 * GET/POST/DELETE with the access token. Retries network errors, 429 and 5xx,
 * and retries once with a fresh token after a 401.
 */
async function authorizedFetch(auth, url, init, { sleep, retryDelayMs }) {
  let forceToken = false;
  for (let attempt = 1; ; attempt += 1) {
    const token = await auth.accessToken({ force: forceToken });
    let response;
    try {
      response = await fetch(url, {
        ...init,
        headers: { ...init?.headers, Authorization: `Bearer ${token}` },
      });
    } catch (error) {
      if (attempt < MAX_ATTEMPTS) {
        await sleep(retryDelayMs * 2 ** (attempt - 1));
        continue;
      }
      throw new Error(`Network error talking to Google Photos: ${error.message}`);
    }
    if (response.status === 401 && !forceToken) {
      await response.body?.cancel();
      forceToken = true;
      attempt -= 1;
      continue;
    }
    if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS) {
      await response.body?.cancel();
      await sleep(retryDelayMs * 2 ** (attempt - 1));
      continue;
    }
    return response;
  }
}

export class Picker {
  constructor({ auth, pickerBase, sleep = realSleep, retryDelayMs = RETRY_DELAY_MS }) {
    Object.assign(this, { auth, pickerBase, sleep, retryDelayMs });
  }

  async call(what, method, pathname, { query, body } = {}) {
    const url = new URL(`${this.pickerBase}${pathname}`);
    for (const [name, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(name, String(value));
    }
    const response = await authorizedFetch(
      this.auth,
      url,
      {
        method,
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      },
      this,
    );
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(describeApiError(what, response.status, json));
    return json;
  }

  createSession(maxItemCount) {
    const body = maxItemCount ? { pickingConfig: { maxItemCount: String(maxItemCount) } } : {};
    return this.call("create session", "POST", "/sessions", { body });
  }

  getSession(id) {
    return this.call("session check", "GET", `/sessions/${encodeURIComponent(id)}`);
  }

  deleteSession(id) {
    return this.call("session cleanup", "DELETE", `/sessions/${encodeURIComponent(id)}`);
  }

  async listItems(sessionId) {
    const items = [];
    let pageToken;
    do {
      const page = await this.call("list picked items", "GET", "/mediaItems", {
        query: { sessionId, pageSize: PAGE_SIZE, pageToken },
      });
      items.push(...(page.mediaItems ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return items;
  }

  /**
   * Poll until the user is done picking. Follows the pollInterval/timeoutIn
   * each response recommends. Returns false on timeout.
   */
  async waitForPicks(session, { log, now = Date.now }) {
    let current = session;
    let deadline = null;
    let announced = false;
    for (;;) {
      if (current.mediaItemsSet) return true;
      const config = current.pollingConfig ?? {};
      const interval = parseDuration(config.pollInterval) ?? DEFAULT_POLL_MS;
      const timeout = parseDuration(config.timeoutIn);
      if (timeout === 0) return false;
      if (timeout !== null) deadline = now() + timeout;
      else deadline ??= now() + DEFAULT_TIMEOUT_MS;
      if (now() >= deadline) return false;
      if (!announced) {
        log("Waiting for you to finish picking in Google Photos (press Done when finished)…");
        announced = true;
      }
      await this.sleep(Math.min(interval, Math.max(0, deadline - now())));
      current = await this.getSession(session.id);
    }
  }
}

// ---------------------------------------------------------------------------
// Downloading
// ---------------------------------------------------------------------------

/**
 * Fetch a photo's bytes in a format build-photos can read. `=d` returns the
 * full photo (Google removes location metadata). When that is a format sharp
 * can't decode here — HEIC, typically — ask Google for a full-size rendition
 * at the original dimensions instead.
 */
export async function fetchPhoto(auth, item, opts) {
  const { baseUrl, mediaFileMetadata: meta = {} } = item.mediaFile ?? {};
  if (!baseUrl) return { skipped: "no download URL" };

  const attempt = async (suffix) => {
    const response = await authorizedFetch(auth, `${baseUrl}=${suffix}`, {}, opts);
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`download failed: HTTP ${response.status}`);
    }
    return response;
  };

  let response = await attempt("d");
  let type = mediaType(response.headers.get("content-type")) || mediaType(item.mediaFile.mimeType);
  let converted = false;

  if (!SUPPORTED_TYPES[type]) {
    await response.body?.cancel();
    const width = Math.min(Number(meta.width) || MAX_DIMENSION, MAX_DIMENSION);
    const height = Math.min(Number(meta.height) || MAX_DIMENSION, MAX_DIMENSION);
    const original = type || "unknown format";
    response = await attempt(`w${width}-h${height}`);
    type = mediaType(response.headers.get("content-type"));
    if (!SUPPORTED_TYPES[type]) {
      await response.body?.cancel();
      return { skipped: `unsupported format (${original})` };
    }
    converted = original;
  }

  return { buffer: Buffer.from(await response.arrayBuffer()), ext: SUPPORTED_TYPES[type], converted };
}

function readManifest(tripDir) {
  const file = path.join(tripDir, MANIFEST_FILE);
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    throw new Error(`${file} is not valid JSON — fix or delete it before importing.`);
  }
}

function writeManifest(tripDir, manifest) {
  const sorted = Object.fromEntries(
    Object.entries(manifest).sort(([, a], [, b]) => a.file.localeCompare(b.file)),
  );
  fs.writeFileSync(path.join(tripDir, MANIFEST_FILE), `${JSON.stringify(sorted, null, 2)}\n`);
}

async function runPool(items, limit, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * The whole import: pick, list, download into photos/<trip>/, clean up.
 * Returns counts for the summary. Everything external is injectable so the
 * tests can run it against a local stand-in for Google.
 */
export async function importPhotos(options) {
  const {
    trip,
    max = 0,
    photosDir = PHOTOS_DIR,
    configDir = DEFAULT_CONFIG_DIR,
    endpoints = DEFAULT_ENDPOINTS,
    openUrl = openInBrowser,
    log = console.log,
    sleep = realSleep,
    now = Date.now,
    retryDelayMs = RETRY_DELAY_MS,
    timeZone,
    onSession = () => {},
  } = options;

  const tripName = validateTripName(trip);
  const client = loadClient(configDir);
  const auth = new Auth({ client, configDir, endpoints, openUrl, log, now });
  const picker = new Picker({ auth, pickerBase: endpoints.pickerBase, sleep, retryDelayMs });

  // Sign in before creating a session, so the picker link isn't buried under
  // the sign-in instructions.
  await auth.accessToken();

  const session = await picker.createSession(max);
  onSession(session.id, picker);
  const summary = { imported: [], alreadyImported: 0, videos: 0, skipped: [], timedOut: false };

  try {
    const pickerUrl = `${session.pickerUri.replace(/\/+$/, "")}/autoclose`;
    log("");
    log(`Pick the photos for "${tripName}" in Google Photos. If the page doesn't open, visit:`);
    log(`  ${pickerUrl}`);
    await openUrl(pickerUrl);

    if (!(await picker.waitForPicks(session, { log, now }))) {
      summary.timedOut = true;
      return summary;
    }

    let items = await picker.listItems(session.id);
    let listedAt = now();
    log(`${items.length} item(s) picked.`);

    const tripDir = path.join(photosDir, tripName);
    fs.mkdirSync(tripDir, { recursive: true });
    const manifest = readManifest(tripDir);
    const taken = new Set(fs.readdirSync(tripDir));

    const todo = [];
    for (const item of items) {
      if (manifest[item.id]) summary.alreadyImported += 1;
      else if (isVideo(item)) summary.videos += 1;
      else todo.push(item);
    }

    // Base URLs expire after 60 minutes, so a long import lists the session
    // again to get fresh ones. One relist is shared by all downloaders.
    let relisting = null;
    const freshItem = async (item) => {
      if (now() - listedAt > BASE_URL_LIFETIME_MS) {
        relisting ??= picker.listItems(session.id).then((fresh) => {
          items = fresh;
          listedAt = now();
          relisting = null;
        });
        await relisting;
      }
      return items.find((candidate) => candidate.id === item.id) ?? item;
    };

    await runPool(todo, DOWNLOAD_CONCURRENCY, async (picked) => {
      const label = picked.mediaFile?.filename || picked.id;
      try {
        const item = await freshItem(picked);
        const result = await fetchPhoto(auth, item, { sleep, retryDelayMs });
        if (result.skipped) {
          summary.skipped.push(`${label}: ${result.skipped}`);
          log(`  - ${label}: skipped, ${result.skipped}`);
          return;
        }
        const name = chooseFilename(item, result.ext, taken, timeZone);
        taken.add(name);
        // Write to a temp name first so an interrupted run never leaves a
        // truncated master that build-photos would pick up.
        const partial = path.join(tripDir, `.${name}.partial`);
        fs.writeFileSync(partial, result.buffer);
        fs.renameSync(partial, path.join(tripDir, name));

        manifest[item.id] = {
          file: name,
          originalFilename: item.mediaFile?.filename ?? null,
          createTime: item.createTime ?? null,
        };
        writeManifest(tripDir, manifest);
        summary.imported.push(name);
        log(`  + ${name}${result.converted ? ` (converted from ${result.converted})` : ""}`);
      } catch (error) {
        summary.skipped.push(`${label}: ${error.message}`);
        log(`  ! ${label}: ${error.message}`);
      }
    });

    summary.tripDir = tripDir;
    return summary;
  } finally {
    // Google recommends deleting every session once its items are downloaded.
    await picker.deleteSession(session.id).catch((error) => {
      log(`Note: couldn't delete the picking session (${error.message.split("\n")[0]}). It expires on its own.`);
    });
    onSession(null);
  }
}

/** Open a URL in the default browser. Failure is fine: the URL is printed too. */
export function openInBrowser(url) {
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
        : ["xdg-open", [url]];
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    // The URL is already on screen.
  }
}

const USAGE = `Import photos from Google Photos into photos/<Trip Name>/.

Usage:  npm run import-photos -- "<Trip Name>" [options]

Options:
  --max N        Let the picker accept at most N items (1–${MAX_ITEMS})
  --no-browser   Only print links instead of opening them
  -h, --help     Show this help

Running it again for the same trip skips photos already imported.
Afterwards, run "npm run photos" to build the gallery images.`;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.trip) {
    console.log(USAGE);
    process.exit(options.help ? 0 : 1);
  }

  const configDir = process.env.GOOGLE_PHOTOS_CONFIG_DIR
    ? path.resolve(process.env.GOOGLE_PHOTOS_CONFIG_DIR)
    : DEFAULT_CONFIG_DIR;

  // Ctrl+C while waiting on the picker: still delete the session.
  let activeSession = null;
  let cleanup = null;
  process.once("SIGINT", () => {
    console.log("\nCancelled.");
    if (!activeSession || !cleanup) process.exit(130);
    cleanup(activeSession).finally(() => process.exit(130));
  });

  const summary = await importPhotos({
    trip: options.trip,
    max: options.max,
    configDir,
    openUrl: options.browser ? openInBrowser : () => {},
    onSession: (id, picker) => {
      activeSession = id;
      cleanup = picker ? (sessionId) => picker.deleteSession(sessionId).catch(() => {}) : null;
    },
  });

  console.log("");
  if (summary.timedOut) {
    console.log("The picking session timed out before anything was picked. Nothing was imported.");
    process.exit(1);
  }
  const rel = path.relative(ROOT, summary.tripDir);
  console.log(`Imported ${summary.imported.length} photo(s) into ${rel}/.`);
  if (summary.alreadyImported) console.log(`${summary.alreadyImported} already imported earlier — skipped.`);
  if (summary.videos) console.log(`${summary.videos} video(s) skipped — the site's videos come from YouTube.`);
  if (summary.skipped.length) {
    console.log(`${summary.skipped.length} item(s) not imported:`);
    for (const line of summary.skipped) console.log(`  ${line}`);
  }
  if (summary.imported.length) {
    console.log("");
    console.log(`Next: add captions in ${rel}/photos.json if you like, then run "npm run photos".`);
  }
  if (summary.skipped.length) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });
}
