import sharp from "sharp";
import { readdirSync, mkdirSync } from "fs";
import { join, extname } from "path";

const INPUT_DIR = "public/images/adventures";
const OUTPUT_DIR = "public/images/adventures-watermarked";
const WATERMARK_TEXT = "OFFROAD ADVENTURES";
const OPACITY = 0.25;

mkdirSync(OUTPUT_DIR, { recursive: true });

const files = readdirSync(INPUT_DIR).filter(
  (f) => [".jpg", ".jpeg", ".png"].includes(extname(f).toLowerCase())
);

console.log(`Watermarking ${files.length} images...`);

for (const file of files) {
  const input = join(INPUT_DIR, file);
  const output = join(OUTPUT_DIR, file);

  try {
    const metadata = await sharp(input).metadata();
    const width = metadata.width || 1600;
    const height = metadata.height || 1200;

    // Scale font size relative to image width
    const fontSize = Math.round(width * 0.04);
    const lineHeight = Math.round(fontSize * 1.6);

    // Create a repeating diagonal watermark pattern using SVG
    const svgWatermark = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="watermark" x="0" y="0" width="${width * 0.45}" height="${lineHeight * 4}" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
            <text x="10" y="${lineHeight}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="white" opacity="${OPACITY}" letter-spacing="4">${WATERMARK_TEXT}</text>
            <text x="${width * 0.22}" y="${lineHeight * 3}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="white" opacity="${OPACITY}" letter-spacing="4">${WATERMARK_TEXT}</text>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#watermark)" />
      </svg>`;

    await sharp(input)
      .composite([{
        input: Buffer.from(svgWatermark),
        gravity: "center",
      }])
      .jpeg({ quality: 85 })
      .toFile(output);

    console.log(`  ✓ ${file}`);
  } catch (e) {
    console.log(`  ✗ ${file} - ${e.message}`);
  }
}

console.log("\nDone! Watermarked images saved to", OUTPUT_DIR);
