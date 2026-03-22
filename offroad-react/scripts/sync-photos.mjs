/**
 * sync-photos.mjs
 *
 * Scans public/images/adventures/<TripFolder>/ for images and generates
 * src/data/adventures.js automatically.
 *
 * Usage:  npm run sync-photos
 *
 * Each trip folder name becomes the trip display name.
 * Optionally place a trip.json inside a trip folder to customise:
 *   { "name": "Custom Name", "description": "Custom description" }
 *
 * Photos are sorted by filename (which is typically a timestamp).
 * Compressed copies are written in-place (skips already-compressed files).
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const ADVENTURES_DIR = path.join(ROOT, "public", "images", "adventures");
const OUTPUT_FILE = path.join(ROOT, "src", "data", "adventures.js");

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const MAX_WIDTH = 1920;
const MAX_SIZE_BYTES = 600 * 1024; // compress if larger than 600 KB

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Try to parse a date from a filename like 20210917_171521.jpg */
function dateFromFilename(filename) {
  const m = filename.match(/(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthIdx = parseInt(mo, 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return null;
  return `${months[monthIdx]} ${parseInt(d, 10)}, ${y}`;
}

/** Title-case a folder name */
function formatTitle(filename) {
  const base = path.basename(filename, path.extname(filename));
  // If it's a timestamp filename, return a generic title
  if (/^\d{8}[_-]?\d*$/.test(base)) return null;
  return base.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function compressIfNeeded(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.size <= MAX_SIZE_BYTES) return; // already small enough
  try {
    const inputBuf = fs.readFileSync(filePath);
    const buf = await sharp(inputBuf, { failOn: "none" })
      .rotate() // auto-rotate from EXIF
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    fs.writeFileSync(filePath, buf);
    const saved = ((stat.size - buf.length) / stat.size * 100).toFixed(0);
    console.log(`  compressed ${path.basename(filePath)}: ${(stat.size / 1024).toFixed(0)}KB → ${(buf.length / 1024).toFixed(0)}KB (${saved}% saved)`);
  } catch (err) {
    console.log(`  ⚠ skipped compression for ${path.basename(filePath)}: ${err.message}`);
  }
}

async function main() {
  if (!fs.existsSync(ADVENTURES_DIR)) {
    console.error(`❌ Adventures directory not found: ${ADVENTURES_DIR}`);
    process.exit(1);
  }

  const tripFolders = fs
    .readdirSync(ADVENTURES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  if (tripFolders.length === 0) {
    console.log("No trip folders found in", ADVENTURES_DIR);
    process.exit(0);
  }

  const allTrips = [];
  const allPhotos = [];
  let photoId = 1;

  for (const folder of tripFolders) {
    const tripDir = path.join(ADVENTURES_DIR, folder.name);
    const tripSlug = slugify(folder.name);

    // Read optional trip.json
    let tripMeta = {};
    const metaFile = path.join(tripDir, "trip.json");
    if (fs.existsSync(metaFile)) {
      try {
        tripMeta = JSON.parse(fs.readFileSync(metaFile, "utf-8"));
      } catch {
        console.log(`  ⚠ Invalid trip.json in ${folder.name}, using defaults`);
      }
    }

    const tripName = tripMeta.name || folder.name;
    const tripDesc = tripMeta.description || `Photos from ${folder.name}.`;

    // Read optional photos.json for custom titles/descriptions
    let photoMeta = {};
    const photosMetaFile = path.join(tripDir, "photos.json");
    if (fs.existsSync(photosMetaFile)) {
      try {
        photoMeta = JSON.parse(fs.readFileSync(photosMetaFile, "utf-8"));
      } catch {
        console.log(`  ⚠ Invalid photos.json in ${folder.name}, using defaults`);
      }
    }

    // Gather images
    const images = fs
      .readdirSync(tripDir)
      .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
      .sort();

    if (images.length === 0) {
      console.log(`⚠ No images in ${folder.name}, skipping`);
      continue;
    }

    console.log(`📁 ${folder.name} (${images.length} photos)`);

    // Count unnamed photos
    const unnamed = images.filter((img) => !photoMeta[img]?.title).length;
    if (unnamed > 0) {
      console.log(`  💡 ${unnamed} photos without custom titles — add them to photos.json`);
    }

    // Compress any large images
    for (const img of images) {
      await compressIfNeeded(path.join(tripDir, img));
    }

    allTrips.push({
      id: tripSlug,
      name: tripName,
      description: tripDesc,
    });

    for (const img of images) {
      const date = dateFromFilename(img);
      const title = formatTitle(img);
      const meta = photoMeta[img] || {};
      // URL-encode the folder name for spaces in paths
      const encodedFolder = encodeURIComponent(folder.name);

      allPhotos.push({
        id: photoId++,
        title: meta.title || title || `Photo ${photoId - 1}`,
        date: date || "Unknown",
        location: meta.location || tripName,
        description: meta.description || "",
        image: `/images/adventures/${encodedFolder}/${img}`,
        trip: tripSlug,
      });
    }
  }

  // Generate adventures.js
  const photosJson = JSON.stringify(allPhotos, null, 2);
  const tripsJson = JSON.stringify(allTrips, null, 2);

  const output = `// Auto-generated by sync-photos.mjs — do not edit manually
const adventures = ${photosJson};

export const trips = ${tripsJson};

export default adventures;
`;

  fs.writeFileSync(OUTPUT_FILE, output, "utf-8");
  console.log(`\n✅ Generated ${OUTPUT_FILE}`);
  console.log(`   ${allTrips.length} trips, ${allPhotos.length} photos`);
}

main();
