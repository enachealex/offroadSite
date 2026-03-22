import sharp from "sharp";
import { readdirSync, mkdirSync } from "fs";
import { join, extname } from "path";

const INPUT_DIR = "public/images/adventures";
const OUTPUT_DIR = "public/images/adventures-optimized";
const MAX_WIDTH = 1600;
const JPEG_QUALITY = 80;

mkdirSync(OUTPUT_DIR, { recursive: true });

const files = readdirSync(INPUT_DIR).filter(
  (f) => [".jpg", ".jpeg", ".png"].includes(extname(f).toLowerCase())
);

console.log(`Optimizing ${files.length} images...`);

for (const file of files) {
  const input = join(INPUT_DIR, file);
  const output = join(OUTPUT_DIR, file);
  
  try {
    await sharp(input)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toFile(output);
    console.log(`  ✓ ${file}`);
  } catch {
    // Retry without mozjpeg for problematic files
    try {
      await sharp(input)
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY })
        .toFile(output);
      console.log(`  ✓ ${file} (fallback)`);
    } catch (e2) {
      console.log(`  ✗ ${file} - skipped: ${e2.message}`);
    }
  }
}

console.log("\nDone! Optimized images saved to", OUTPUT_DIR);
