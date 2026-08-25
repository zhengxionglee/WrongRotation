import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const JPG_DIR = path.resolve(ROOT, "assets", "jpg");
const OUT_DIR = path.resolve(ROOT, "assets", "relax");
const SIZE = 1080;
const QUALITY = 86;

fs.mkdirSync(OUT_DIR, { recursive: true });

function scanJpgFiles(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...scanJpgFiles(full));
    } else if (entry.isFile() && (entry.name.toLowerCase().endsWith(".jpg") || entry.name.toLowerCase().endsWith(".jpeg"))) {
      result.push(full);
    }
  }
  return result.sort();
}

const files = scanJpgFiles(JPG_DIR);
const images = [];

for (let i = 0; i < files.length; i++) {
  const f = files[i];
  const outName = `photo_${String(i + 1).padStart(3, "0")}.webp`;
  const outPath = path.resolve(OUT_DIR, outName);
  await sharp(f)
    .resize(SIZE, SIZE, { fit: "cover", position: "centre" })
    .webp({ quality: QUALITY, effort: 4 })
    .toFile(outPath);
  const stat = fs.statSync(outPath);
  images.push({ file: `assets/relax/${outName}`, size: stat.size });
  console.log(`${i + 1}/${files.length} ${path.basename(f)} → ${outName} (${(stat.size / 1024).toFixed(1)}KB)`);
}

fs.writeFileSync(path.resolve(OUT_DIR, "manifest.json"), JSON.stringify(images, null, 2));
console.log(`\nDone: ${images.length} images`);