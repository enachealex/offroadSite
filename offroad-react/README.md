# Offroad Adventures

A static photo and video site built with React 19 and Vite, deployed to GitHub
Pages at [offroad.thejumpvault.com](https://offroad.thejumpvault.com).

There is no backend. Trip photos are processed ahead of time into responsive
image sets, and the gallery reads a generated data module.

## Getting started

```bash
npm install
npm run dev
```

| Script            | What it does                                           |
| ----------------- | ------------------------------------------------------ |
| `npm run dev`     | Vite dev server with HMR                                |
| `npm run build`   | Production build into `dist/`                           |
| `npm run preview` | Serve the production build locally                      |
| `npm run lint`    | ESLint over the whole project                           |
| `npm test`        | Unit and integration tests (`tests/`)                   |
| `npm run photos`  | Rebuild image derivatives and `src/data/adventures.js`  |
| `npm run videos`  | Pull new uploads from YouTube (needs `YOUTUBE_API_KEY`) |

## How photos work

Two directories, with different jobs:

- **`photos/`** — the masters. Full-resolution originals plus per-trip
  metadata. **Never deployed**; Vite only copies `public/`.
- **`public/images/adventures/`** — generated derivatives. Committed, and
  served to visitors. Do not edit by hand.

`npm run photos` walks `photos/`, renders each master into a ladder of widths,
and regenerates `src/data/adventures.js`.

### Adding a trip

1. Create `photos/<Trip Name>/` and drop the photos in. Filenames of the form
   `YYYYMMDD_HHMMSS.jpg` are parsed for capture dates automatically.
2. Optionally add `trip.json`:

   ```json
   {
     "name": "September 2021 Weekend",
     "description": "A full weekend of offroading.",
     "date": "2021-09-17"
   }
   ```

   Without `date`, the trip is dated by its earliest photo. Trips are listed
   chronologically.

3. Optionally add `photos.json` to caption individual shots:

   ```json
   {
     "20210918_125117.jpg": { "title": "Ridge View", "featured": true },
     "20210919_115245.jpg": { "title": "Fallen Rocks", "description": "..." }
   }
   ```

   `featured: true` marks the home page hero. Exactly one photo should have it.
   `date` (`"2021-09-17"`) sets the capture date when the filename doesn't
   carry one. Imported photos get it filled in automatically.

4. Run `npm run photos`, then commit both `photos/` and the regenerated
   `public/images/adventures/` and `src/data/adventures.js`.

A folder whose name starts with `_` is skipped, which is how masters are kept
in the repo without publishing them (see `photos/_unpublished/`).

### Importing from Google Photos

```bash
npm run import-photos -- "October 2023 Trip"
```

This opens Google Photos in your browser. Pick the trip's photos there (a
shared album works well: open it and select all), press **Done**, and they
download into `photos/October 2023 Trip/`. A new name creates a new trip;
an existing name adds to it. Then follow steps 2–4 above: add titles, run
`npm run photos`, and commit.

- **Re-running is safe.** Photos are remembered by their Google Photos ID
  (`googlePhotosId` in `photos.json`), so picking the whole album again
  only downloads the new ones.
- **Dates** come from each photo's EXIF, so photos sort correctly even with
  names like `IMG_1234.jpg`. Untitled photos show as "Photo N".
- **iPhone HEIC** photos are converted to JPEG.
- **Videos are skipped.** Upload them to YouTube, and the Videos page picks
  them up (see below).
- **No location data.** Google strips GPS from downloads.

Google stopped letting apps read albums directly in 2025, so this uses the
Google Photos Picker. You choose the photos, and nothing is guessed. It runs
on your own computer, because it needs your browser to sign in.

#### One-time setup

Use the same Google Cloud project as the YouTube key:

1. **APIs & Services → Library**: enable **Google Photos Picker API**.
2. **APIs & Services → OAuth consent screen** (Google Auth Platform):
   - User type **External**, publishing status **Testing**.
   - Under **Audience → Test users**, add the Google account that owns the
     photos.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   choose application type **Desktop app**. Download the JSON and save it as
   `offroad-react/.google-oauth-client.json`.

The first run asks you to sign in. Google shows "Google hasn't verified this
app", because it's your own unpublished app: choose **Continue**. The sign-in
is saved in `offroad-react/.google-photos-token.json`.

While the app is in Testing, Google expires the sign-in after 7 days. The next
run then simply asks again.

Both files are gitignored. **Never commit them.**

### Output format

Each photo is rendered to widths of 320–2560px, capped at the master's own
width so nothing is ever upscaled:

- **AVIF** at every width — what essentially every visitor downloads.
- **JPEG** at 640/960/1920 — fallback for browsers without AVIF.

The generator also embeds a ~24px inline preview (LQIP) and the intrinsic
dimensions into `adventures.js`, so the `Picture` component can hold the
layout and cross-fade the real file in without any layout shift.

Re-running is incremental: a derivative is only re-encoded when it is missing
or older than its master. Use `npm run photos -- --force` to rebuild
everything. Derivatives whose master has been deleted or renamed are pruned
automatically.

> AVIF encoding is slow — a full rebuild of all trips takes several minutes.

### Picking `sizes`

`Picture` requires a `sizes` string describing how wide the image actually
renders. Without it the browser assumes `100vw` and downloads a far larger
file than needed, which defeats the entire pipeline. Each call site defines
its own constant near the top of the file.

## How videos work

The Videos page combines two sources:

- **Hand-written entries** in `src/data/videos.js`. These keep their own titles
  and subtitles.
- **YouTube uploads**, pulled daily from the channels in
  `youtube/channels.json` and saved to `src/data/youtube-videos.json`. Do not
  edit that file by hand — the next refresh overwrites it.

A video in both keeps its hand-written wording and takes the duration and
publish date from YouTube. Everything is sorted newest first, and the newest
video is featured on the home page.

### Adding a channel

```json
{
  "minDurationSeconds": 60,
  "maxVideosPerChannel": 50,
  "channels": [
    { "handle": "@yourchannel" },
    { "handle": "@friendschannel", "include": ["offroad", "trail"] },
    { "playlistId": "PLxxxxxxxx", "label": "Trip playlist" }
  ]
}
```

Each channel needs exactly one of `handle`, `channelId` or `playlistId`. A
playlist is the cleanest way to pull only the trip videos from a channel that
posts other things too. Optional per-channel settings:

| Field                | Effect                                                     |
| -------------------- | ---------------------------------------------------------- |
| `include`            | Keep only titles containing one of these words             |
| `exclude`            | Drop titles containing any of these words                  |
| `minDurationSeconds` | Drop anything this short or shorter — 60 filters out Shorts |
| `maxVideos`          | How many recent uploads to consider                        |
| `label`              | Name used in the workflow logs                             |

Private, unlisted, live, and embed-disabled videos are always skipped, since
the site can only play videos in an embedded player.

### Hiding or renaming a video

`youtube/overrides.json` is keyed by YouTube video ID (the part after `v=` in
the URL):

```json
{
  "dQw4w9WgXcQ": { "hidden": true },
  "a1bX5V6n46o": { "title": "Caves, Mines and Dusty Roads", "subtitle": "" }
}
```

Overrides take effect on the next deploy; they don't need a refresh.

### API key

The refresh uses the YouTube Data API, read from the `YOUTUBE_API_KEY` repository
secret (Settings → Secrets and variables → Actions). Without the key, or with no
channels configured, the refresh is skipped and the current list stays as is.
Each refresh costs a few units of the free 10,000-unit daily quota.

To run it locally: `YOUTUBE_API_KEY=... npm run videos`.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which tests, builds,
and publishes `dist/` to GitHub Pages. `CNAME` at the repo root sets the custom
domain.

The same workflow runs every day at 13:17 UTC to check for new YouTube uploads.
When there are any, it commits the updated list and deploys; when there aren't,
it stops without deploying. A failed YouTube fetch shows a warning on the run
but never blocks a deploy — the site is built from the last good list.

The workflow can also be started by hand from the Actions tab. Only `main`
deploys, so starting it on another branch is a safe way to test changes.

The workflow checks out the repository without the `photos/` masters — the
build only needs the committed derivatives, so there is no reason to pull a
few hundred megabytes of originals on every deploy.

## Routing

The app uses `HashRouter`, so deep links look like `/#/adventures`.
`public/404.html` catches path-style URLs and rewrites them to the hash form,
which keeps older shared links working on GitHub Pages.
