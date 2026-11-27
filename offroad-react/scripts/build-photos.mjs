/**
 * build-photos.mjs
 *
 * Single source of truth for the photo pipeline.
 *
 * Reads masters from  photos/<Trip Folder>/*.jpg   (never deployed)
 * Writes derivatives to public/images/adventures/<trip-slug>/  (deployed)
 * Regenerates          src/data/adventures.js
 *
 * Usage:  npm run photos          (incremental — skips up-to-date derivatives)
 *         npm run photos -- --force
 *
 * Folders starting with "_" are ignored, so masters can be kept in the repo
 * without publishing them.
 *
 * Per-trip metadata (both optional):
 *   trip.json    { "name": "...", "description": "...", "date": "2021-06-05" }
 *   photos.json  { "<file>.jpg": { "title": "...", "description": "..." } }
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE_DIR = path.join(ROOT, "photos");
const OUTPUT_DIR = path.join(ROOT, "public", "images", "adventures");
const DATA_FILE = path.join(ROOT, "src", "data", "adventures.js");

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

// Ladder of rendered widths. Each is skipped when it would upscale the master,
// so a 1920px source simply stops at 1920.
const WIDTHS = [320, 640, 960, 1440, 1920, 2560];

// AVIF carries the responsive load — every browser we care about takes this
// path. JPEG is the last-resort fallback and only needs a few rungs, so it is
// not worth storing the full ladder twice.
const JPEG_WIDTHS = new Set([640, 960, 1920]);

// Tuned against the most detail-heavy photo in the set (dense forest, which is
// the worst case for these codecs). At q48 a 1920px AVIF lands around 160 KB —
// visually indistinguishable from the master at display size.
const AVIF = { quality: 48, effort: 4 };
const JPEG = { quality: 78, mozjpeg: true, chromaSubsampling: "4:2:0" };

// Width of the inline base64 preview embedded in the data file.
const LQIP_WIDTH = 24;

const force = process.argv.includes("--force");

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function readJson(file, label) {
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    console.warn(`  ! invalid ${label}, ignoring`);
    return {};
  }
}

/** Parse a capture date out of filenames like 20210917_171521.jpg */
function dateFromFilename(filename) {
  const m = filename.match(/(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, year, month, day] = m;
  const monthIdx = Number.parseInt(month, 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return null;
  return {
    label: `${MONTHS[monthIdx]} ${Number.parseInt(day, 10)}, ${year}`,
    sort: `${year}-${month}-${day}`,
  };
}

/** Fall back to a readable title when photos.json has no entry. */
function titleFromFilename(filename) {
  const base = path.basename(filename, path.extname(filename));
  if (/^\d{8}[_-]?\d*(_HDR)?(-PANO)?$/i.test(base)) return null;
  return base.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** A derivative is stale when it is missing or older than its master. */
function isStale(outFile, sourceMtimeMs) {
  if (force || !fs.existsSync(outFile)) return true;
  return fs.statSync(outFile).mtimeMs < sourceMtimeMs;
}

async function renderVariants(sourceFile, outDir, baseName) {
  const sourceMtimeMs = fs.statSync(sourceFile).mtimeMs;
  const meta = await sharp(sourceFile, { failOn: "none" }).metadata();

  // .rotate() applies EXIF orientation, which swaps the reported axes for
  // portrait shots. Use the post-rotation dimensions.
  const rotated = meta.orientation >= 5 && meta.orientation <= 8;
  const sourceWidth = rotated ? meta.height : meta.width;
  const sourceHeight = rotated ? meta.width : meta.height;

  const widths = WIDTHS.filter((w) => w <= sourceWidth);
  if (widths.length === 0) widths.push(sourceWidth);

  const plan = [];
  for (const width of widths) {
    const formats = [["avif", AVIF]];
    if (JPEG_WIDTHS.has(width) || widths.length === 1) formats.push(["jpeg", JPEG]);
    for (const [format, options] of formats) {
      const ext = format === "jpeg" ? "jpg" : format;
      const fileName = `${baseName}-${width}.${ext}`;
      plan.push({ width, format, options, fileName, outFile: path.join(outDir, fileName) });
    }
  }

  const srcset = { avif: [], jpeg: [] };
  for (const { width, format, fileName } of plan) {
    srcset[format].push({
      url: fileName,
      width,
      height: Math.round((sourceHeight / sourceWidth) * width),
    });
  }

  const pending = plan.filter((item) => isStale(item.outFile, sourceMtimeMs));

  // Decoding a 64 MP master once per output file is the dominant cost, so
  // decode a single time into raw pixels at the largest width we need and
  // downscale every variant from that.
  let intermediate = null;
  if (pending.length > 0) {
    const maxWidth = Math.max(...pending.map((item) => item.width));
    const { data, info } = await sharp(sourceFile, { failOn: "none" })
      .rotate()
      .resize({ width: maxWidth, withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true });
    intermediate = { data, raw: { width: info.width, height: info.height, channels: info.channels } };
  }

  const fromIntermediate = () => sharp(intermediate.data, { raw: intermediate.raw });

  for (const { width, format, options, outFile } of pending) {
    const buf = await fromIntermediate()
      .resize({ width, withoutEnlargement: true })
      .toFormat(format, options)
      .toBuffer();
    fs.writeFileSync(outFile, buf);
  }

  const lqipSource = intermediate
    ? fromIntermediate()
    : sharp(sourceFile, { failOn: "none" }).rotate();
  const lqipBuf = await lqipSource
    .resize({ width: LQIP_WIDTH })
    .webp({ quality: 40, alphaQuality: 0 })
    .toBuffer();

  return {
    width: sourceWidth,
    height: sourceHeight,
    srcset,
    lqip: `data:image/webp;base64,${lqipBuf.toString("base64")}`,
    rendered: pending.length,
  };
}

/** Remove derivatives whose master no longer exists. */
function pruneOrphans(outDir, expectedFiles) {
  if (!fs.existsSync(outDir)) return 0;
  let removed = 0;
  for (const file of fs.readdirSync(outDir)) {
    if (!expectedFiles.has(file)) {
      fs.unlinkSync(path.join(outDir, file));
      removed += 1;
    }
  }
  return removed;
}

async function main() {
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`Source directory not found: ${SOURCE_DIR}`);
    process.exit(1);
  }

  const tripFolders = fs
    .readdirSync(SOURCE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => entry.name)
    .sort();

  if (tripFolders.length === 0) {
    console.error(`No trip folders in ${SOURCE_DIR}`);
    process.exit(1);
  }

  const trips = [];
  const photos = [];
  const liveTripDirs = new Set();
  let photoId = 1;
  let totalRendered = 0;

  for (const folder of tripFolders) {
    const tripDir = path.join(SOURCE_DIR, folder);
    const tripSlug = slugify(folder);
    const outDir = path.join(OUTPUT_DIR, tripSlug);
    fs.mkdirSync(outDir, { recursive: true });
    liveTripDirs.add(tripSlug);

    const tripMeta = readJson(path.join(tripDir, "trip.json"), "trip.json");
    const photoMeta = readJson(path.join(tripDir, "photos.json"), "photos.json");

    const images = fs
      .readdirSync(tripDir)
      .filter((file) => IMAGE_EXTS.has(path.extname(file).toLowerCase()))
      .sort();

    if (images.length === 0) {
      console.warn(`! no images in ${folder}, skipping`);
      continue;
    }

    console.log(`${folder} (${images.length})`);

    const tripName = tripMeta.name || folder;
    const expectedFiles = new Set();
    const tripPhotos = [];

    for (const image of images) {
      const baseName = path.basename(image, path.extname(image));
      const meta = photoMeta[image] || {};
      const captured = dateFromFilename(image);

      const variants = await renderVariants(path.join(tripDir, image), outDir, baseName);
      totalRendered += variants.rendered;

      const publicBase = `/images/adventures/${tripSlug}`;
      const toSrcset = (entries) =>
        entries.map(({ url, width }) => `${publicBase}/${url} ${width}w`).join(", ");

      for (const entries of Object.values(variants.srcset)) {
        for (const { url } of entries) expectedFiles.add(url);
      }

      // Largest JPEG rung doubles as the <img src> for browsers that ignore
      // srcset entirely.
      const jpegFallback = variants.srcset.jpeg.at(-1);

      tripPhotos.push({
        id: photoId++,
        // Set "featured": true on one photo in photos.json to make it the
        // home page hero; Home falls back to the newest photo if none is set.
        ...(meta.featured ? { featured: true } : {}),
        title: meta.title || titleFromFilename(image) || `Photo ${photoId - 1}`,
        date: captured?.label || "Unknown",
        sortDate: captured?.sort || "",
        location: meta.location || tripName,
        description: meta.description || "",
        image: `${publicBase}/${jpegFallback.url}`,
        width: variants.width,
        height: variants.height,
        lqip: variants.lqip,
        srcset: {
          avif: toSrcset(variants.srcset.avif),
          jpeg: toSrcset(variants.srcset.jpeg),
        },
        trip: tripSlug,
      });
    }

    const pruned = pruneOrphans(outDir, expectedFiles);
    if (pruned > 0) console.log(`  pruned ${pruned} orphaned file(s)`);

    // Trips order by their earliest capture so the sidebar reads
    // chronologically rather than alphabetically by folder name.
    const captureDates = tripPhotos.map((p) => p.sortDate).filter(Boolean).sort();

    trips.push({
      id: tripSlug,
      name: tripName,
      description: tripMeta.description || `Photos from ${folder}.`,
      date: tripMeta.date || captureDates[0] || "",
      photoCount: tripPhotos.length,
    });

    photos.push(...tripPhotos);
  }

  // Drop derivative folders for trips that no longer exist.
  if (fs.existsSync(OUTPUT_DIR)) {
    for (const entry of fs.readdirSync(OUTPUT_DIR, { withFileTypes: true })) {
      if (entry.isDirectory() && !liveTripDirs.has(entry.name)) {
        fs.rmSync(path.join(OUTPUT_DIR, entry.name), { recursive: true });
        console.log(`  removed stale trip folder ${entry.name}`);
      }
    }
  }

  trips.sort((a, b) => a.date.localeCompare(b.date));
  photos.sort((a, b) => a.sortDate.localeCompare(b.sortDate));

  const output = `// Auto-generated by scripts/build-photos.mjs — do not edit manually.
// Run \`npm run photos\` after changing anything under photos/.
const adventures = ${JSON.stringify(photos, null, 2)};

export const trips = ${JSON.stringify(trips, null, 2)};

export default adventures;
`;

  fs.writeFileSync(DATA_FILE, output, "utf-8");

  const bytes = fs
    .readdirSync(OUTPUT_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((e) =>
      fs
        .readdirSync(path.join(OUTPUT_DIR, e.name))
        .map((f) => fs.statSync(path.join(OUTPUT_DIR, e.name, f)).size),
    )
    .reduce((sum, size) => sum + size, 0);

  console.log(
    `\n${trips.length} trips, ${photos.length} photos, ${totalRendered} file(s) rendered`,
  );
  console.log(`published ${(bytes / 1024 / 1024).toFixed(1)} MB to ${path.relative(ROOT, OUTPUT_DIR)}`);
}

main();
