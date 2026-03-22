/**
 * generate-photo-templates.mjs
 *
 * Creates a photos.json template in each trip folder that doesn't have one,
 * or merges missing entries into an existing photos.json.
 *
 * Usage:  npm run generate-templates
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ADVENTURES_DIR = path.join(ROOT, "public", "images", "adventures");
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const tripFolders = fs
  .readdirSync(ADVENTURES_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .sort((a, b) => a.name.localeCompare(b.name));

for (const folder of tripFolders) {
  const tripDir = path.join(ADVENTURES_DIR, folder.name);
  const metaFile = path.join(tripDir, "photos.json");

  // Load existing photos.json if any
  let existing = {};
  if (fs.existsSync(metaFile)) {
    try {
      existing = JSON.parse(fs.readFileSync(metaFile, "utf-8"));
    } catch {
      // ignore
    }
  }

  const images = fs
    .readdirSync(tripDir)
    .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
    .sort();

  let added = 0;
  for (const img of images) {
    if (!existing[img]) {
      existing[img] = { title: "" };
      added++;
    }
  }

  if (added > 0) {
    fs.writeFileSync(metaFile, JSON.stringify(existing, null, 2) + "\n", "utf-8");
    console.log(`📝 ${folder.name}: added ${added} entries to photos.json`);
  } else {
    console.log(`✅ ${folder.name}: photos.json is up to date`);
  }
}

console.log("\nDone! Open each photos.json and fill in the titles.");
