import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.resolve(ROOT);
fs.mkdirSync(PUBLIC, { recursive: true });

// ---- Generate icons ----
const sizes = [192, 512];
for (const size of sizes) {
  const buf = new Uint8ClampedArray(size * size * 4);
  const cx = size / 2, cy = size / 2, r = size * 0.38;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const d = Math.hypot(dx, dy);
      const i = (y * size + x) * 4;
      if (d < r) {
        // Rotated square motif
        const a = Math.atan2(dy, dx);
        const seg = Math.floor((a / Math.PI * 2 + 4) % 4);
        if (seg % 2 === 0) {
          buf[i] = 255; buf[i + 1] = 217; buf[i + 2] = 77; // gold
        } else {
          buf[i] = 15; buf[i + 1] = 17; buf[i + 2] = 21; // dark
        }
        // Inner circle
        if (d < r * 0.45) {
          buf[i] = 233; buf[i + 1] = 236; buf[i + 2] = 242; // light
        }
        // Rotation arrow indicator
        if (d > r * 0.5 && d < r * 0.7 && Math.abs(a - Math.PI / 4) < 0.35) {
          buf[i] = 255; buf[i + 1] = 217; buf[i + 2] = 77;
        }
      } else {
        buf[i] = 15; buf[i + 1] = 17; buf[i + 2] = 21; // bg
      }
      buf[i + 3] = 255;
    }
  }
  await sharp(Buffer.from(buf.buffer), { raw: { width: size, height: size, channels: 4 } })
    .png()
    .toFile(path.resolve(PUBLIC, `icon-${size}.png`));
  console.log(`Generated icon-${size}.png`);
}

// ---- Manifest ----
const manifest = {
  name: "Wrong Rotation",
  short_name: "Wrong Rotation",
  description: "Find the rotated cells and tap to fix them!",
  start_url: "./index.html",
  display: "standalone",
  orientation: "portrait",
  background_color: "#0f1115",
  theme_color: "#0f1115",
  icons: sizes.map(s => ({
    src: `icon-${s}.png`,
    sizes: `${s}x${s}`,
    type: "image/png"
  }))
};
fs.writeFileSync(path.resolve(PUBLIC, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("Generated manifest.json");

// ---- Service Worker (network-first: always serve fresh, cache as offline fallback) ----
const sw = `const CACHE = "odd-rotation-v2";
self.addEventListener("install", (e) => {
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        if (e.request.url.startsWith(self.location.origin + "/")) {
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
`;
fs.writeFileSync(path.resolve(PUBLIC, "sw.js"), sw);
console.log("Generated sw.js");

// ---- Update index.html ----
const indexPath = path.resolve(ROOT, "index.html");
let html = fs.readFileSync(indexPath, "utf-8");
// Add manifest link
if (!html.includes('rel="manifest"')) {
  html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<link rel="manifest" href="./manifest.json">\n<meta name="apple-mobile-web-app-capable" content="yes">');
}
// Add service worker registration
const swSnippet = `<script>
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  navigator.serviceWorker?.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
} else {
  navigator.serviceWorker?.register("sw.js");
}
</script>`;
if (!html.includes('serviceWorker')) {
  html = html.replace('</body>', swSnippet + '\n</body>');
}
fs.writeFileSync(indexPath, html);
console.log("Updated index.html");

// ---- Update game.html ----
const gameHtmlPath = path.resolve(ROOT, "game.html");
if (fs.existsSync(gameHtmlPath)) {
  let ghtml = fs.readFileSync(gameHtmlPath, "utf-8");
  if (!ghtml.includes('rel="manifest"')) {
    ghtml = ghtml.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<link rel="manifest" href="./manifest.json">\n<meta name="apple-mobile-web-app-capable" content="yes">');
  }
  if (!ghtml.includes('serviceWorker')) {
    ghtml = ghtml.replace('</body>', swSnippet + '\n</body>');
  }
  fs.writeFileSync(gameHtmlPath, ghtml);
  console.log("Updated game.html");
}

console.log("PWA assets ready. Rebuild with 'npm run build' to include them.");