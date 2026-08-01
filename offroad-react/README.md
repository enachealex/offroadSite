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
| `npm run photos`  | Rebuild image derivatives and `src/data/adventures.js`  |

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

4. Run `npm run photos`, then commit both `photos/` and the regenerated
   `public/images/adventures/` and `src/data/adventures.js`.

A folder whose name starts with `_` is skipped, which is how masters are kept
in the repo without publishing them (see `photos/_unpublished/`).

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

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the app
and publishes `dist/` to GitHub Pages. `CNAME` at the repo root sets the custom
domain.

The workflow checks out the repository without the `photos/` masters — the
build only needs the committed derivatives, so there is no reason to pull a
few hundred megabytes of originals on every deploy.

## Routing

The app uses `HashRouter`, so deep links look like `/#/adventures`.
`public/404.html` catches path-style URLs and rewrites them to the hash form,
which keeps older shared links working on GitHub Pages.
