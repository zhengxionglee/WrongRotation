import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SIZE = 1080, SS = 1;
const W = SIZE, H = SIZE;
const OUT = path.resolve(ROOT, 'assets');
const QUALITY = 86;

const TIER_PLAN = { strong: 40, mid: 35, weak: 25 };
const PATTERN_NAMES = [
  'stripes','chevron','landscape','city','glyph','barcode','arrowfield','flag',
  'checker','plaid','brick','wave','dot','spiral','tile','confetti','sunburst',
  'fbm','marble','bubble','speckle','stone','mandala','gradnoise'
];
const TIER_FOR_PATTERN = {
  stripes:'strong',chevron:'strong',landscape:'strong',city:'strong',glyph:'strong',
  barcode:'strong',arrowfield:'strong',flag:'strong',
  checker:'mid',plaid:'mid',brick:'mid',wave:'mid',dot:'mid',spiral:'mid',tile:'mid',confetti:'mid',sunburst:'mid',
  fbm:'weak',marble:'weak',bubble:'weak',speckle:'weak',stone:'weak',mandala:'weak',gradnoise:'weak'
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rr = (r, a, b) => a + (b - a) * r();
const ri = (r, a, b) => Math.floor(rr(r, a, b + 1));
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

function hashString(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
function hashN(n, s) {
  let h = (Math.imul(n | 0, 374761393) + Math.imul(s | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h * 6) % 2 - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 1 / 6) { r = c; g = x; b = 0; }
  else if (h < 2 / 6) { r = x; g = c; b = 0; }
  else if (h < 3 / 6) { r = 0; g = c; b = x; }
  else if (h < 4 / 6) { r = 0; g = x; b = c; }
  else if (h < 5 / 6) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return [(r + m) * 255 | 0, (g + m) * 255 | 0, (b + m) * 255 | 0];
}

function makePalette(rng) {
  const h = rng() * 360;
  const spread = pick(rng, [20, 40, 60, 120]);
  const sat = rr(rng, 0.3, 0.7);
  const lightMode = rng() < 0.55;
  const cols = [];
  for (let i = 0; i < 4; i++) {
    const hh = h + rr(rng, -spread, spread);
    const ss = sat * rr(rng, 0.7, 1.3);
    const ll = lightMode ? rr(rng, 0.35, 0.7) : rr(rng, 0.45, 0.8);
    cols.push(hsl2rgb(hh, Math.min(0.85, ss), ll));
  }
  const bg = lightMode ? hsl2rgb(h + rr(rng, -10, 10), sat * 0.35, rr(rng, 0.88, 0.95))
    : hsl2rgb(h + rr(rng, -10, 10), sat * 0.5, rr(rng, 0.10, 0.22));
  return { bg, cols, light: lightMode };
}

function makeNoise(rng) {
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  function val(ix, iy) { return perm[(perm[ix & 255] + (iy & 255)) & 255] / 255; }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = val(xi, yi), b = val(xi + 1, yi), c = val(xi, yi + 1), d = val(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, oct = 4, lac = 2, gain = 0.5) {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); n += a; a *= gain; f *= lac; }
    return s / n;
  }
  return { vnoise, fbm };
}

function mixC(c1, c2, t) {
  return [(c1[0] + (c2[0] - c1[0]) * t) | 0, (c1[1] + (c2[1] - c1[1]) * t) | 0, (c1[2] + (c2[2] - c1[2]) * t) | 0];
}
function mulC(c, m) {
  return [Math.min(255, c[0] * m) | 0, Math.min(255, c[1] * m) | 0, Math.min(255, c[2] * m) | 0];
}

function newBuf(bg) {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H * 4; i += 4) { d[i] = bg[0]; d[i + 1] = bg[1]; d[i + 2] = bg[2]; d[i + 3] = 255; }
  return d;
}
function setP(d, x, y, c) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
}
function fillRect(d, x0, y0, w, h, c) {
  const x1 = Math.min(W, x0 + w), y1 = Math.min(H, y0 + h);
  for (let y = Math.max(0, y0); y < y1; y++) for (let x = Math.max(0, x0); x < x1; x++) setP(d, x, y, c);
}
function disc(d, cx, cy, r, c) {
  const x0 = Math.max(0, Math.ceil(cx - r)), x1 = Math.min(W - 1, Math.floor(cx + r));
  const y0 = Math.max(0, Math.ceil(cy - r)), y1 = Math.min(H - 1, Math.floor(cy + r));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy <= r * r) { const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
  }
}
function line(d, x0, y0, x1, y1, w, c) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  for (let i = 0; i <= n; i++) { const t = i / n; disc(d, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w / 2, c); }
}

function addTex(d, noise, s, amt) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4; const m = 1 + (noise.fbm(x * s, y * s) - 0.5) * amt;
    d[i] = Math.min(255, d[i] * m); d[i + 1] = Math.min(255, d[i + 1] * m); d[i + 2] = Math.min(255, d[i + 2] * m);
  }
}

// ---- PATTERNS ----
const P = {};

P.stripes = function (rng, noise, pal) {
  const th = pick(rng, [0, Math.PI / 2, Math.PI / 4 + rr(rng, -0.4, 0.4)]);
  const period = ri(rng, 40, 120);
  const wobA = rr(rng, 0, period * 0.4), wobF = rr(rng, 0.002, 0.005);
  const cos = Math.cos(th), sin = Math.sin(th);
  const jS = ri(rng, 1, 9999);
  const col = (s) => {
    const r = hashN(s, jS);
    if (r < 0.3) return pal.bg;
    return mulC(pal.cols[Math.floor(hashN(s, jS + 5) * pal.cols.length) % pal.cols.length], 1 + (hashN(s, jS + 11) - 0.5) * 0.3);
  };
  const d = newBuf(pal.bg);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = -x * sin + y * cos;
    const u = x * cos + y * sin + wobA * Math.sin(v * wobF);
    const s = Math.floor(u / period);
    const c = col(s);
    const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  }
  addTex(d, noise, 0.02, 0.06);
  return d;
};

P.chevron = function (rng, noise, pal) {
  const h = ri(rng, 80, 140), a = ri(rng, 60, 100), amp = ri(rng, 30, 60);
  const jS = ri(rng, 1, 9999);
  const d = newBuf(pal.bg);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const tri = ((x % (2 * a)) + 2 * a) % (2 * a);
    const zig = tri < a ? tri : 2 * a - tri;
    const yy = y + amp * zig / a;
    const s = Math.floor(yy / h);
    const idx = Math.floor(hashN(s, jS) * pal.cols.length) % pal.cols.length;
    const c = pal.cols[idx];
    const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  }
  addTex(d, noise, 0.02, 0.05);
  return d;
};

P.landscape = function (rng, noise, pal) {
  const d = newBuf(pal.cols[0]);
  const skyTop = pal.light ? mulC(pal.cols[0], 1.3) : pal.cols[0];
  const skyBot = pal.light ? pal.cols[1] : mulC(pal.cols[1], 0.7);
  const nLayer = ri(rng, 3, 5);
  const layers = [];
  for (let i = 0; i < nLayer; i++) {
    const baseY = H * (0.3 + 0.65 * i / nLayer + rr(rng, -0.05, 0.05));
    const amp = ri(rng, 20, 80);
    const f = rr(rng, 0.002, 0.006);
    const col = pal.cols[(i + 1) % pal.cols.length];
    const edge = new Float32Array(W);
    for (let x = 0; x < W; x++) edge[x] = baseY + (noise.fbm(x * f, 0, 4) - 0.5) * 2 * amp;
    layers.push({ edge, col });
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = y / H;
    let c = mixC(skyTop, skyBot, t);
    for (let i = 0; i < nLayer; i++) {
      if (y > layers[i].edge[x]) {
        c = layers[i].col;
        if (y - layers[i].edge[x] < 3) c = mulC(c, 1.15);
      }
    }
    const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  }
  return d;
};

P.city = function (rng, noise, pal) {
  const d = newBuf(pal.cols[0]);
  const skyTop = mulC(pal.cols[0], 0.7), skyBot = pal.cols[1];
  const bCol = pal.cols[2], winCol = pal.cols[3];
  const buildings = [];
  let x = 0;
  while (x < W) {
    const w = ri(rng, 50, 130);
    const h = ri(rng, 200, 450);
    buildings.push({ x, w, h });
    x += w + ri(rng, 2, 14);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c = mixC(skyTop, skyBot, y / H);
    for (const b of buildings) {
      if (x >= b.x && x < b.x + b.w && y > H - b.h) {
        c = bCol;
        const fx = x - b.x, fy = y - (H - b.h);
        if (fx > 6 && fx < b.w - 6 && fy > 6 && fy < b.h - 6 && (fx - 6) % 14 < 8 && (fy - 6) % 18 < 10) {
          if (hashN(b.x + fx, Math.floor(fy / 18)) > 0.3) c = mixC(winCol, pal.bg, 0.3);
        }
      }
    }
    const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  }
  return d;
};

P.glyph = function (rng, noise, pal) {
  const d = newBuf(pal.bg);
  const cellS = ri(rng, 80, 120);
  const cols = Math.ceil(W / cellS) + 1, rows = Math.ceil(H / cellS) + 1;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const cx = c * cellS + cellS / 2, cy = r * cellS + cellS / 2;
    const id = r * 31 + c;
    const col = pal.cols[Math.floor(hashN(id, 7) * pal.cols.length) % pal.cols.length];
    const type = Math.floor(hashN(id, 13) * 6);
    const s = cellS * 0.35;
    if (type === 0) { // L
      line(d, cx - s, cy + s, cx - s, cy - s, cellS * 0.15, col);
      line(d, cx - s, cy + s, cx + s, cy + s, cellS * 0.15, col);
    } else if (type === 1) { // T
      line(d, cx - s, cy - s, cx + s, cy - s, cellS * 0.15, col);
      line(d, cx, cy - s, cx, cy + s, cellS * 0.15, col);
    } else if (type === 2) { // Z
      line(d, cx - s, cy - s, cx + s, cy - s, cellS * 0.12, col);
      line(d, cx - s, cy + s, cx + s, cy + s, cellS * 0.12, col);
      line(d, cx - s, cy + s, cx + s, cy - s, cellS * 0.12, col);
    } else if (type === 3) { // +
      line(d, cx - s, cy, cx + s, cy, cellS * 0.15, col);
      line(d, cx, cy - s, cx, cy + s, cellS * 0.15, col);
    } else if (type === 4) { // >
      line(d, cx - s, cy - s, cx + s, cy, cellS * 0.15, col);
      line(d, cx - s, cy + s, cx + s, cy, cellS * 0.15, col);
    } else { // |
      line(d, cx, cy - s, cx, cy + s, cellS * 0.18, col);
    }
  }
  return d;
};

P.barcode = function (rng, noise, pal) {
  const d = newBuf(pal.bg);
  let x = 0;
  while (x < W) {
    const w = ri(rng, 6, 50);
    const col = pick(rng, pal.cols);
    fillRect(d, x, 0, w, H, col);
    x += w + ri(rng, 4, 20);
  }
  addTex(d, noise, 0.04, 0.04);
  return d;
};

P.arrowfield = function (rng, noise, pal) {
  const d = newBuf(pal.bg);
  const n = 6;
  const s = W / n;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const cx = (c + 0.5) * s, cy = (r + 0.5) * s;
    const col = pal.cols[(r + c) % pal.cols.length];
    const len = s * 0.35, w = s * 0.12;
    const hw = w / 2, hlen = len * 0.8;
    line(d, cx - hlen, cy, cx + hlen, cy, w, col);
    line(d, cx + hlen, cy, cx + hlen - len * 0.35, cy - hw, w * 0.8, col);
    line(d, cx + hlen, cy, cx + hlen - len * 0.35, cy + hw, w * 0.8, col);
  }
  return d;
};

P.flag = function (rng, noise, pal) {
  const d = newBuf(pal.cols[0]);
  const n = ri(rng, 3, 5);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = (x + y * 0.7) / (W * 0.6);
    const band = Math.floor(v * n) % pal.cols.length;
    const c = pal.cols[band];
    const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  }
  const cx = ri(rng, 300, 700), cy = ri(rng, 300, 700), r = ri(rng, 60, 180);
  disc(d, cx, cy, r, pal.cols[pal.cols.length - 1]);
  return d;
};

// --- MID ---
P.checker = function (rng, noise, pal) {
  const bs = ri(rng, 60, 140);
  const d = newBuf(pal.bg);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const r = Math.floor(y / bs), c = Math.floor(x / bs);
    const idx = (r + c) % pal.cols.length;
    const col = mulC(pal.cols[idx], 1 + (hashN(r * 31 + c, 3) - 0.5) * 0.2);
    const i = (y * W + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2];
  }
  addTex(d, noise, 0.03, 0.04);
  return d;
};

P.plaid = function (rng, noise, pal) {
  const d = newBuf(pal.bg);
  const p1 = ri(rng, 40, 90), p2 = ri(rng, 40, 90);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c = pal.bg;
    const on1 = Math.floor(x / p1) % 2 === 0, on2 = Math.floor(y / p2) % 2 === 0;
    if (on1) c = mixC(c, pal.cols[0], 0.5);
    if (on2) c = mixC(c, pal.cols[pal.cols.length - 1], 0.35);
    const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  }
  return d;
};

P.brick = function (rng, noise, pal) {
  const bh = ri(rng, 30, 50), bw = bh * ri(rng, 2, 3), mw = ri(rng, 3, 6);
  const d = newBuf(pal.bg);
  const mortar = mixC(pal.bg, [80, 80, 80], 0.5);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const row = Math.floor(y / bh);
    const off = (row % 2) * bw / 2;
    const col = Math.floor((x + off) / bw);
    const fy = y - row * bh, fx = (x + off) - col * bw;
    let c = mortar;
    if (fy >= mw && fy <= bh - mw && fx >= mw && fx <= bw - mw) {
      const id = row * 31 + col;
      c = mulC(pal.cols[Math.floor(hashN(id, 5) * pal.cols.length) % pal.cols.length], 1 + (hashN(id, 11) - 0.5) * 0.25);
    }
    const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  }
  addTex(d, noise, 0.025, 0.04);
  return d;
};

P.wave = function (rng, noise, pal) {
  const d = newBuf(pal.bg);
  const nW = ri(rng, 4, 8);
  const amp = ri(rng, 40, 120), f = rr(rng, 0.002, 0.006);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const yy = y + amp * Math.sin(x * f + y * 0.0005);
    const band = ((Math.floor(yy / (H / nW)) % pal.cols.length) + pal.cols.length) % pal.cols.length;
    const c = pal.cols[band];
    const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  }
  return d;
};

P.dot = function (rng, noise, pal) {
  const d = newBuf(pal.bg);
  const spacing = ri(rng, 100, 180);
  const rad = spacing * rr(rng, 0.25, 0.4);
  const n = Math.ceil(W / spacing) + 1;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const cx = c * spacing + (r % 2) * spacing * 0.5 + rr(rng, -8, 8);
    const cy = r * spacing * 0.87 + rr(rng, -8, 8);
    const col = pal.cols[(r + c) % pal.cols.length];
    disc(d, cx, cy, rad * rr(rng, 0.7, 1.1), mulC(col, 1 + (rng() - 0.5) * 0.2));
  }
  return d;
};

P.spiral = function (rng, noise, pal) {
  const d = newBuf(pal.bg);
  const cx = W / 2, cy = H / 2;
  const nArms = ri(rng, 3, 6);
  const turns = rr(rng, 4, 7);
  const thick = ri(rng, 12, 24);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x - cx, dy = y - cy;
    const r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    if (r < 5) continue;
    const t = (a / (2 * Math.PI) + r / (W * 0.35 * turns / nArms)) * nArms;
    const band = ((Math.floor(t) % pal.cols.length) + pal.cols.length) % pal.cols.length;
    const c = pal.cols[band];
    const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  }
  return d;
};

P.tile = function (rng, noise, pal) {
  const d = newBuf(pal.bg);
  const nSeeds = ri(rng, 50, 90);
  const seeds = [];
  for (let i = 0; i < nSeeds; i++) {
    seeds.push({ x: rr(rng, 0, W), y: rr(rng, 0, H), col: pal.cols[Math.floor(rng() * pal.cols.length)] });
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let minD = Infinity, minD2 = Infinity, minCol = pal.bg;
    for (const s of seeds) {
      const d = (x - s.x) * (x - s.x) + (y - s.y) * (y - s.y);
      if (d < minD) { minD2 = minD; minD = d; minCol = s.col; }
      else if (d < minD2) minD2 = d;
    }
    const gapW = 6;
    let c = minCol;
    if (Math.sqrt(minD2) - Math.sqrt(minD) < gapW) c = mixC(minCol, pal.bg, 0.6);
    const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  }
  return d;
};

P.confetti = function (rng, noise, pal) {
  const d = newBuf(pal.bg);
  const n = ri(rng, 300, 600);
  for (let i = 0; i < n; i++) {
    const cx = rr(rng, 0, W), cy = rr(rng, 0, H);
    const len = ri(rng, 20, 60), w = ri(rng, 6, 14);
    const col = pal.cols[Math.floor(rng() * pal.cols.length)];
    const a = rng() * 2 * Math.PI;
    const dx = Math.cos(a) * len / 2, dy = Math.sin(a) * len / 2;
    line(d, cx - dx, cy - dy, cx + dx, cy + dy, w, col);
  }
  return d;
};

P.sunburst = function (rng, noise, pal) {
  const d = newBuf(pal.cols[0]);
  const cx = W / 2, cy = H / 2;
  const nRays = ri(rng, 5, 11);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = Math.atan2(y - cy, x - cx);
    const r = Math.hypot(x - cx, y - cy);
    const idx = Math.floor((a / (2 * Math.PI) + 0.5) * nRays) % pal.cols.length;
    const blend = Math.min(1, r / (W * 0.5));
    const c = mixC(pal.cols[idx], pal.cols[(idx + 1) % pal.cols.length], blend);
    const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  }
  return d;
};

// --- WEAK ---
P.fbm = function (rng, noise, pal) {
  const d = newBuf(pal.bg);
  const s = rr(rng, 0.003, 0.006);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = noise.fbm(x * s, y * s, 5);
    const c = t < 0.33 ? pal.cols[0] : t < 0.66 ? mixC(pal.cols[0], pal.cols[1], (t - 0.33) * 3) : pal.cols[1];
    const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  }
  return d;
};

P.marble = function (rng, noise, pal) {
  const d = newBuf(pal.bg);
  const s = rr(rng, 0.004, 0.008);
  const f = rr(rng, 0.02, 0.05);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = noise.fbm(x * s, y * s, 5);
    const t = Math.sin(x * f + v * 5) * 0.5 + 0.5;
    const c = mixC(pal.cols[0], pal.cols[1], t);
    const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  }
  return d;
};

P.bubble = function (rng, noise, pal) {
  const d = newBuf(pal.bg);
  const n = ri(rng, 40, 100);
  for (let i = 0; i < n; i++) {
    const cx = rr(rng, 0, W), cy = rr(rng, 0, H);
    const r = ri(rng, 30, 150);
    const col = pal.cols[Math.floor(rng() * pal.cols.length)];
    disc(d, cx, cy, r, mulC(col, 0.7));
    disc(d, cx - r * 0.25, cy - r * 0.25, r * 0.18, mulC(col, 1.3));
  }
  return d;
};

P.speckle = function (rng, noise, pal) {
  const d = newBuf(pal.bg);
  const s = rr(rng, 0.01, 0.03);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (noise.fbm(x * s, y * s, 3) > 0.6) {
      const i = (y * W + x) * 4;
      const col = pal.cols[Math.floor(noise.fbm(x * s * 2, y * s * 2, 2) * pal.cols.length) % pal.cols.length];
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2];
    }
  }
  return d;
};

P.stone = function (rng, noise, pal) {
  const d = newBuf(pal.bg);
  const n = ri(rng, 120, 200);
  for (let i = 0; i < n; i++) {
    const cx = rr(rng, 0, W), cy = rr(rng, 0, H);
    const rx = ri(rng, 20, 80), ry = ri(rng, 20, 80);
    const col = mulC(pal.cols[Math.floor(rng() * pal.cols.length)], 1 + (rng() - 0.5) * 0.2);
    const x0 = Math.max(0, Math.ceil(cx - rx)), x1 = Math.min(W - 1, Math.floor(cx + rx));
    const y0 = Math.max(0, Math.ceil(cy - ry)), y1 = Math.min(H - 1, Math.floor(cy + ry));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1.05) {
        const shade = 1 + (dx * 0.5 + dy * 0.3) * 0.3;
        const i = (y * W + x) * 4; const c = mulC(col, shade);
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
      }
    }
  }
  return d;
};

P.mandala = function (rng, noise, pal) {
  const d = newBuf(pal.bg);
  const n = ri(rng, 3, 5);
  const s = W / n;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const cx = (c + 0.5) * s, cy = (r + 0.5) * s;
    const col = pal.cols[(r + c) % pal.cols.length];
    for (let y = Math.max(0, cy - s / 2); y < Math.min(H, cy + s / 2); y++) for (let x = Math.max(0, cx - s / 2); x < Math.min(W, cx + s / 2); x++) {
      const dx = x - cx, dy = y - cy, d2 = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const k = 4;
      const petal = Math.cos(k * a) * 0.5 + 0.5;
      if (d2 < s * 0.15) { const i = (y * W + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; }
      else if (d2 < s * 0.35 && petal > 0.5) {
        const i = (y * W + x) * 4; const c2 = mulC(col, 0.7); d[i] = c2[0]; d[i + 1] = c2[1]; d[i + 2] = c2[2];
      }
    }
  }
  return d;
};

P.weave = function (rng, noise, pal) {
  const d = newBuf(mixC(pal.bg, pal.cols[0], 0.18));
  const gap = ri(rng, 22, 36), w = ri(rng, 6, 11);
  const c1 = mulC(pal.cols[0], 0.9), c2 = mulC(pal.cols[1], 0.9);
  for (let i = -H; i < W; i += gap) fillRect(d, i, 0, w, H, c1);
  for (let j = -W; j < H; j += gap) fillRect(d, 0, j, W, w, c2);
  addTex(d, noise, 0.04, 0.08);
  return d;
};

// ---- helpers for new patterns ----
function fillPoly(d, pts, c) {
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
  const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(H - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, yy1] = pts[i], [x2, yy2] = pts[(i + 1) % pts.length];
      if ((yy1 <= y && yy2 > y) || (yy2 <= y && yy1 > y)) {
        xs.push(x1 + (y - yy1) / (yy2 - yy1) * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const a = Math.max(0, Math.ceil(xs[i])), b = Math.min(W - 1, Math.floor(xs[i + 1]));
      for (let x = a; x <= b; x++) setP(d, x, y, c);
    }
  }
}

const FONT = {
  A:["01110","10001","10001","11111","10001","10001","10001"],
  B:["11110","10001","10001","11110","10001","10001","11110"],
  C:["01110","10001","10000","10000","10000","10001","01110"],
  D:["11110","10001","10001","10001","10001","10001","11110"],
  E:["11111","10000","10000","11110","10000","10000","11111"],
  F:["11111","10000","10000","11110","10000","10000","10000"],
  G:["01110","10001","10000","10111","10001","10001","01111"],
  H:["10001","10001","10001","11111","10001","10001","10001"],
  J:["00111","00010","00010","00010","00010","10010","01100"],
  K:["10001","10010","10100","11000","10100","10010","10001"],
  L:["10000","10000","10000","10000","10000","10000","11111"],
  M:["10001","11011","10101","10101","10001","10001","10001"],
  N:["10001","11001","10101","10011","10001","10001","10001"],
  P:["11110","10001","10001","11110","10000","10000","10000"],
  R:["11110","10001","10001","11110","10100","10010","10001"],
  S:["01111","10000","10000","01110","00001","00001","11110"],
  T:["11111","00100","00100","00100","00100","00100","00100"],
  U:["10001","10001","10001","10001","10001","10001","01110"],
  V:["10001","10001","10001","10001","10001","01010","00100"],
  W:["10001","10001","10101","10101","10101","11011","10001"],
  X:["10001","10001","01010","00100","01010","10001","10001"],
  Y:["10001","10001","01010","00100","00100","00100","00100"],
  Z:["11111","00001","00010","00100","01000","10000","11111"],
  "0":["01110","10001","10011","10101","11001","10001","01110"],
  "1":["00100","01100","00100","00100","00100","00100","01110"],
  "2":["01110","10001","00001","00110","01000","10000","11111"],
  "3":["11111","00010","00100","00110","00001","10001","01110"],
  "4":["00010","00110","01010","10010","11111","00010","00010"],
  "5":["11111","10000","11110","00001","00001","10001","01110"],
  "6":["00110","01000","10000","11110","10001","10001","01110"],
  "7":["11111","00001","00010","00100","01000","01000","01000"],
  "8":["01110","10001","10001","01110","10001","10001","01110"],
  "9":["01110","10001","10001","01111","00001","00010","01100"]
};

function drawGlyph(d, gx, gy, s, c, rows) {
  const pw = Math.max(1, Math.round(s / 7));
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let ci = 0; ci < row.length; ci++) {
      if (row[ci] === '1') fillRect(d, Math.round(gx + ci * pw), Math.round(gy + r * pw), pw, pw, c);
    }
  }
}

// ---- NEW PATTERNS ----
P.letters = function (rng, noise, pal) {
  const d = newBuf(pal.bg);
  const n = ri(rng, 6, 8);
  const s = W / n;
  const KEYS = Object.keys(FONT).filter(k => !('0' <= k && k <= '9'));
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const h = r * 31 + c;
    const key = KEYS[Math.floor(hashN(h, 17) * KEYS.length) % KEYS.length];
    const col = pal.cols[Math.floor(hashN(h, 7) * pal.cols.length) % pal.cols.length];
    drawGlyph(d, c * s + s * 0.14, r * s + s * 0.14, s * 0.72, col, FONT[key]);
  }
  addTex(d, noise, 0.02, 0.04);
  return d;
};

P.numbers = function (rng, noise, pal) {
  const d = newBuf(pal.bg);
  const n = ri(rng, 6, 8);
  const s = W / n;
  const KEYS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const h = r * 31 + c;
    const key = KEYS[Math.floor(hashN(h, 17) * KEYS.length) % KEYS.length];
    const col = pal.cols[Math.floor(hashN(h, 7) * pal.cols.length) % pal.cols.length];
    drawGlyph(d, c * s + s * 0.14, r * s + s * 0.14, s * 0.72, col, FONT[key]);
  }
  addTex(d, noise, 0.02, 0.04);
  return d;
};

P.shapes = function (rng, noise, pal) {
  const d = newBuf(pal.bg);
  const n = ri(rng, 6, 8);
  const s = W / n;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const cx = (c + 0.5) * s, cy = (r + 0.5) * s;
    const col = pal.cols[(r + c) % pal.cols.length];
    const h = s * 0.32, w = h * 0.4;
    const type = (r * 3 + c) % 5;
    if (type === 0) fillPoly(d, [[cx, cy - h], [cx - h, cy + h], [cx + h, cy + h]], col);
    else if (type === 1) fillPoly(d, [[cx, cy - h], [cx + h, cy], [cx, cy + h], [cx - h, cy]], col);
    else if (type === 2) {
      const pts = [];
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + k * Math.PI / 5;
        const rr = k % 2 === 0 ? h : h * 0.45;
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
      }
      fillPoly(d, pts, col);
    } else if (type === 3) {
      fillRect(d, cx - w, cy - h, w * 2, h * 2, col);
      fillRect(d, cx - h, cy - w, h * 2, w * 2, col);
    } else disc(d, cx, cy, h, col);
  }
  return d;
};

P.roads = function (rng, noise, pal) {
  const d = newBuf(pal.cols[0]);
  const roadCol = pal.bg;
  const roadW = ri(rng, 24, 46), gap = ri(rng, 180, 260);
  for (let x = -gap; x < W + gap; x += gap) fillRect(d, x, 0, roadW, H, roadCol);
  for (let y = -gap; y < H + gap; y += gap) fillRect(d, 0, y, W, roadW, roadCol);
  const dash = ri(rng, 30, 60);
  for (let x = -gap; x < W + gap; x += gap) {
    for (let y = 0; y < H; y += dash * 2) fillRect(d, x + roadW / 2 - 3, y, 6, dash, pal.cols[2]);
  }
  for (let y = -gap; y < H + gap; y += gap) {
    for (let x = 0; x < W; x += dash * 2) fillRect(d, x, y + roadW / 2 - 3, dash, 6, pal.cols[2]);
  }
  line(d, 0, rr(rng, 840, 1060), W, rr(rng, 20, 240), roadW, roadCol);
  addTex(d, noise, 0.02, 0.05);
  return d;
};

P.circuit = function (rng, noise, pal) {
  const d = newBuf(pal.bg);
  const traceCol = pal.cols[0];
  for (let i = 0; i < ri(rng, 24, 44); i++) {
    const x = rr(rng, 0, W), y = rr(rng, 0, H);
    const len = ri(rng, 80, 320), w = ri(rng, 4, 10);
    const dir = Math.floor(rng() * 3);
    if (dir === 0) line(d, x, y, x + len, y, w, traceCol);
    else if (dir === 1) line(d, x, y, x, y + len, w, traceCol);
    else line(d, x, y, x + len, y + len, w, traceCol);
  }
  for (let i = 0; i < ri(rng, 30, 60); i++) {
    disc(d, rr(rng, 20, W - 20), rr(rng, 20, H - 20), ri(rng, 6, 14), pal.cols[1]);
  }
  return d;
};

P.isoblock = function (rng, noise, pal) {
  const d = newBuf(pal.bg);
  const s = ri(rng, 90, 130), hh = s * 0.5, ex = s * 0.87;
  for (let r = 0; r < 14; r++) for (let c = 0; c < 16; c++) {
    const x = (c - r) * ex + W * 0.5;
    const y = (c + r) * hh - W * 0.18;
    const top = mulC(pal.cols[0], 1.15);
    fillPoly(d, [[x, y], [x + ex, y + hh * 0.55], [x, y + hh * 1.1], [x - ex, y + hh * 0.55]], top);
    fillPoly(d, [[x - ex, y + hh * 0.55], [x, y + hh * 1.1], [x, y + hh * 1.7], [x - ex, y + hh * 1.15]], mulC(pal.cols[1], 0.55));
    fillPoly(d, [[x + ex, y + hh * 0.55], [x, y + hh * 1.1], [x, y + hh * 1.7], [x + ex, y + hh * 1.15]], mulC(pal.cols[2], 0.75));
  }
  addTex(d, noise, 0.02, 0.05);
  return d;
};

P.map = function (rng, noise, pal) {
  const d = newBuf(pal.bg);
  const land = pal.cols[1];
  const s = rr(rng, 0.003, 0.006);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (noise.fbm(x * s, y * s, 4) > 0.5) {
      const i = (y * W + x) * 4; d[i] = land[0]; d[i + 1] = land[1]; d[i + 2] = land[2];
    }
  }
  const riverCol = mulC(pal.cols[3], 0.8);
  let rx = rr(rng, 100, W - 100);
  for (let y = 0; y < H; y += 6) {
    rx += (noise.fbm(y * 0.004, 3, 2) - 0.5) * 9;
    disc(d, rx, y, 9, riverCol);
  }
  line(d, 0, rr(rng, 200, 8800) % 880, W, rr(rng, 200, 880), 5, mulC(pal.cols[2], 0.7));
  line(d, rr(rng, 100, 980), 0, rr(rng, 100, 980), H, 5, mulC(pal.cols[2], 0.7));
  return d;
};

P.celestial = function (rng, noise, pal) {
  const d = newBuf(mulC(pal.bg, 0.6));
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    const n = noise.fbm(x * 0.004, y * 0.004, 3);
    if (n > 0.4) {
      const col = mulC(pal.cols[0], 0.3 + n * 0.3);
      setP(d, x, y, col);
    }
  }
  for (let i = 0; i < ri(rng, 600, 1000); i++) {
    disc(d, rr(rng, 0, W), rr(rng, 0, H), rr(rng, 1, 3), pick(rng, pal.cols));
  }
  for (let i = 0; i < ri(rng, 3, 6); i++) {
    const cx = rr(rng, 120, W - 120), cy = rr(rng, 120, H - 120);
    const r = ri(rng, 40, 100);
    const col = pick(rng, pal.cols);
    disc(d, cx, cy, r, col);
    if (rng() < 0.5) {
      const rr2 = r * 1.45;
      for (let a = 0; a < 360; a += 4) {
        const rad = a * Math.PI / 180;
        disc(d, cx + Math.cos(rad) * rr2, cy + Math.sin(rad) * rr2 * 0.32, ri(rng, 2, 4), pal.cols[3]);
      }
    }
    disc(d, cx - r * 0.3, cy - r * 0.3, r * 0.25, mulC(col, 1.4));
  }
  return d;
};

P.flowers = function (rng, noise, pal) {
  const d = newBuf(pal.bg);
  const n = ri(rng, 5, 7);
  const s = W / n;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const cx = (c + 0.5) * s + rr(rng, -12, 12), cy = (r + 0.5) * s + rr(rng, -12, 12);
    const col = pal.cols[(r + c) % pal.cols.length];
    const rad = s * 0.3, nPetal = ri(rng, 5, 8), petalCol = mulC(col, 0.72);
    for (let k = 0; k < nPetal; k++) {
      const a = k * 2 * Math.PI / nPetal + rr(rng, -0.15, 0.15);
      disc(d, cx + Math.cos(a) * rad * 0.62, cy + Math.sin(a) * rad * 0.62, rad * 0.5, petalCol);
    }
    disc(d, cx, cy, rad * 0.42, col);
  }
  return d;
};

P.crackle = function (rng, noise, pal) {
  const d = newBuf(mixC(pal.bg, [255, 255, 255], 0.15));
  const crack = pal.cols[0];
  const nSeeds = ri(rng, 110, 150);
  const seeds = [];
  for (let i = 0; i < nSeeds; i++) seeds.push({ x: rr(rng, 0, W), y: rr(rng, 0, H) });
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    let minD = Infinity, minD2 = Infinity;
    for (const s of seeds) {
      const dd = (x - s.x) * (x - s.x) + (y - s.y) * (y - s.y);
      if (dd < minD) { minD2 = minD; minD = dd; }
      else if (dd < minD2) minD2 = dd;
    }
    if (Math.sqrt(minD2) - Math.sqrt(minD) < 5) {
      const i = (y * W + x) * 4; d[i] = crack[0]; d[i + 1] = crack[1]; d[i + 2] = crack[2];
      d[i + 4] = crack[0]; d[i + 5] = crack[1]; d[i + 6] = crack[2];
      d[i + W * 4] = crack[0]; d[i + W * 4 + 1] = crack[1]; d[i + W * 4 + 2] = crack[2];
      d[i + W * 4 + 4] = crack[0]; d[i + W * 4 + 5] = crack[1]; d[i + W * 4 + 6] = crack[2];
    }
  }
  return d;
};

P.terrain = function (rng, noise, pal) {
  const d = newBuf(pal.cols[0]);
  const peaks = [];
  for (let i = 0; i < ri(rng, 3, 6); i++) peaks.push({ x: rr(rng, 0, W), y: rr(rng, 0, H), w: rr(rng, 0.4, 1.2) });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let h = 0;
    for (const p of peaks) {
      const dd = (x - p.x) * (x - p.x) + (y - p.y) * (y - p.y);
      h += p.w / (1 + dd * 0.00002);
    }
    h += noise.fbm(x * 0.008, y * 0.008, 3) * 0.6;
    const band = Math.floor(h * 16) % pal.cols.length;
    const c = pal.cols[(band + pal.cols.length) % pal.cols.length];
    const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  }
  return d;
};

P.galaxy = function (rng, noise, pal) {
  const d = newBuf(pal.bg);
  const cx = W / 2, cy = H / 2;
  const nArms = ri(rng, 2, 4);
  const c0 = mulC(pal.cols[0], 0.9), c1 = pal.cols[1];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x - cx, dy = y - cy;
    const r = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    const arm = Math.cos(nArms * a - r * 0.012);
    const dens = Math.max(0, arm) * Math.exp(-r / (W * 0.5));
    const n = noise.fbm(x * 0.009, y * 0.009, 4);
    const t = Math.min(1, dens * 0.8 + n * 0.55);
    const c = t > 0.5 ? c1 : mixC(c0, c1, t / 0.5);
    const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  }
  return d;
};

// ---- MORE PATTERNS (32 new families) ----
P.maze = function(rng, noise, pal) {
  const d = newBuf(pal.cols[0]);
  const wall = mulC(pal.bg, 0.8);
  const n = ri(rng, 18, 24);
  const cell = (W / n) | 0;
  const g = Array.from({ length: n }, () => Array(n).fill(0));
  const wl = Array.from({ length: n }, () => Array.from({ length: n }, () => [1, 1, 1, 1]));
  const st = [[0, 0]]; g[0][0] = 1;
  while (st.length > 0) {
    const [r, c] = st[st.length - 1]; const dirs = [];
    if (r > 0 && !g[r - 1][c]) dirs.push([r - 1, c, 0]);
    if (c < n - 1 && !g[r][c + 1]) dirs.push([r, c + 1, 1]);
    if (r < n - 1 && !g[r + 1][c]) dirs.push([r + 1, c, 2]);
    if (c > 0 && !g[r][c - 1]) dirs.push([r, c - 1, 3]);
    if (!dirs.length) { st.pop(); continue; }
    const [nr, nc, dd] = dirs[Math.floor(rng() * dirs.length)];
    wl[r][c][dd] = 0; wl[nr][nc][(dd + 2) % 4] = 0; g[nr][nc] = 1; st.push([nr, nc]);
  }
  const w = Math.max(3, cell * 0.1);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    fillRect(d, c * cell + 3, r * cell + 3, cell - 6, cell - 6, pal.cols[(r + c) % pal.cols.length]);
    if (wl[r][c][0]) fillRect(d, c * cell, r * cell, cell, w, wall);
    if (wl[r][c][1]) fillRect(d, c * cell + cell - w, r * cell, w, cell, wall);
    if (wl[r][c][2]) fillRect(d, c * cell, r * cell + cell - w, cell, w, wall);
    if (wl[r][c][3]) fillRect(d, c * cell, r * cell, w, cell, wall);
  }
  addTex(d, noise, 0.02, 0.04);
  return d;
};

P.pipes = function(rng, noise, pal) {
  const d = newBuf(pal.bg);
  const n = ri(rng, 40, 70);
  for (let i = 0; i < n; i++) {
    const x = rr(rng, 0, W), y = rr(rng, 0, H);
    const len = ri(rng, 60, 250), w = ri(rng, 8, 20);
    const col = pick(rng, pal.cols);
    const dir = Math.floor(rng() * 4);
    if (dir === 0) line(d, x, y, x + len, y, w, col);
    else if (dir === 1) line(d, x, y, x, y + len, w, col);
    else if (dir === 2) line(d, x, y, x + len, y + len * 0.5, w, col);
    else line(d, x, y, x + len * 0.5, y + len, w, col);
    // caps
    disc(d, x, y, w * 0.6, mulC(pal.bg, 0.7));
    disc(d, x + (dir < 2 ? len : dir === 2 ? len : len * 0.5), y + (dir === 1 ? len : dir === 2 ? len * 0.5 : len), w * 0.6, mulC(pal.bg, 0.7));
  }
  addTex(d, noise, 0.01, 0.03);
  return d;
};

P.snowflake = function(rng, noise, pal) {
  const d = newBuf(pal.bg);
  addTex(d, noise, 0.04, 0.15);
  const n = ri(rng, 18, 30);
  for (let i = 0; i < n; i++) {
    const cx = rr(rng, 0, W), cy = rr(rng, 0, H);
    const col = pick(rng, pal.cols);
    const r = ri(rng, 60, 180);
    for (let a = 0; a < 360; a += 60) {
      const rad = a * Math.PI / 180;
      const ex = cx + Math.cos(rad) * r, ey = cy + Math.sin(rad) * r;
      line(d, cx, cy, ex, ey, Math.max(3, r * 0.08), col);
      for (let k = 0.3; k < 0.9; k += 0.18) {
        const kx = cx + Math.cos(rad) * r * k, ky = cy + Math.sin(rad) * r * k;
        const branch = r * 0.18;
        line(d, kx, ky, kx + Math.cos(rad + 1.2) * branch, ky + Math.sin(rad + 1.2) * branch, Math.max(2, r * 0.05), col);
        line(d, kx, ky, kx + Math.cos(rad - 1.2) * branch, ky + Math.sin(rad - 1.2) * branch, Math.max(2, r * 0.05), col);
      }
    }
    disc(d, cx, cy, Math.max(4, r * 0.08), col);
  }
  return d;
};

P.tartan = function(rng, noise, pal) {
  const d = newBuf(pal.cols[0]);
  const gaps = [];
  let x = 0;
  while (x < W) { const w = ri(rng, 30, 90); gaps.push(w); x += w + ri(rng, 10, 30); }
  const gaps2 = [];
  let y = 0;
  while (y < H) { const w = ri(rng, 30, 90); gaps2.push(w); y += w + ri(rng, 10, 30); }
  let cx = 0;
  for (const g of gaps) {
    fillRect(d, cx, 0, g, H, pick(rng, pal.cols));
    cx += g + ri(rng, 6, 18);
  }
  let cy = 0;
  for (const g of gaps2) {
    fillRect(d, 0, cy, W, g, pick(rng, pal.cols));
    cy += g + ri(rng, 6, 18);
  }
  addTex(d, noise, 0.02, 0.05);
  return d;
};

P.zigzag = function(rng, noise, pal) {
  const d = newBuf(pal.bg);
  addTex(d, noise, 0.03, 0.1);
  const n = ri(rng, 12, 18);
  const s = W / n;
  const amp = ri(rng, 30, 60);
  for (let i = 0; i < n; i++) {
    const col = pal.cols[i % pal.cols.length];
    const w = ri(rng, 6, 14);
    for (let x = 0; x < W; x++) {
      const y = i * s + (amp * (x % (2 * s) < s ? 1 : -1) * (x % s) / s);
      fillRect(d, x, y, w, s * 1.3, col);
    }
  }
  return d;
};

P.crossword = function(rng, noise, pal) {
  const d = newBuf(pal.bg);
  const n = ri(rng, 10, 14);
  const s = W / n;
  const KEYS = Object.keys(FONT).filter(k => !('0' <= k && k <= '9'));
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if ((r + c) % 2 === 0) fillRect(d, c * s, r * s, s, s, pal.cols[0]);
    else {
      const key = KEYS[Math.floor(hashN(r * 31 + c, 17) * KEYS.length) % KEYS.length];
      drawGlyph(d, c * s + s * 0.15, r * s + s * 0.15, s * 0.7, pal.cols[1], FONT[key]);
    }
  }
  return d;
};

P.domino = function(rng, noise, pal) {
  const d = newBuf(pal.bg);
  const n = ri(rng, 6, 8);
  const s = W / n;
  const dot = (cx, cy, r, col) => { disc(d, cx, cy, r, col); };
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const cx = (c + 0.5) * s, cy = (r + 0.5) * s;
    const col = pal.cols[(r + c) % pal.cols.length];
    const hw = s * 0.4, hh = s * 0.18, dr = s * 0.06;
    fillRect(d, cx - hw, cy - hh, hw * 2, hh * 2, col);
    fillRect(d, cx - hw, cy, hw * 2, hh * 2, col);
    line(d, cx - hw, cy, cx + hw, cy, 3, mulC(pal.bg, 0.3));
    const nd = ri(rng, 1, 4);
    for (let i = 0; i < nd; i++) {
      const dx = rr(rng, -hw * 0.5, hw * 0.5), dy = rr(rng, -hh * 0.5, hh * 0.5);
      dot(cx + dx, cy - hh * 0.5 + dy, dr, pal.bg);
    }
    const nd2 = ri(rng, 1, 4);
    for (let i = 0; i < nd2; i++) {
      const dx = rr(rng, -hw * 0.5, hw * 0.5), dy = rr(rng, -hh * 0.5, hh * 0.5);
      dot(cx + dx, cy + hh * 0.5 + dy, dr, pal.bg);
    }
  }
  return d;
};

P.diamond = function(rng, noise, pal) {
  const d = newBuf(pal.cols[0]);
  const n = ri(rng, 10, 16);
  const s = W / n;
  for (let r = 0; r < n + 2; r++) for (let c = 0; c < n + 2; c++) {
    const cx = c * s * 0.5 + r % 2 * s * 0.25, cy = r * s * 0.45;
    fillPoly(d, [[cx, cy - s * 0.3], [cx + s * 0.25, cy], [cx, cy + s * 0.3], [cx - s * 0.25, cy]], pal.cols[(r + c) % pal.cols.length]);
  }
  return d;
};

P.stainedglass = function(rng, noise, pal) {
  const d = newBuf(pal.bg);
  const n = ri(rng, 10, 14);
  const cell = W / n;
  const border = [0, 0, 0];
  const bw = Math.max(4, cell * 0.06);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const x0 = c * cell + rr(rng, -cell * 0.18, cell * 0.18);
    const x1 = (c + 1) * cell + rr(rng, -cell * 0.18, cell * 0.18);
    const y0 = r * cell + rr(rng, -cell * 0.18, cell * 0.18);
    const y1 = (r + 1) * cell + rr(rng, -cell * 0.18, cell * 0.18);
    fillPoly(d, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], pick(rng, pal.cols));
    line(d, x0, y0, x1, y0, bw, border); line(d, x1, y0, x1, y1, bw, border);
    line(d, x1, y1, x0, y1, bw, border); line(d, x0, y1, x0, y0, bw, border);
  }
  return d;
};

P.hexgrid = function(rng, noise, pal) {
  const d = newBuf(pal.bg);
  const s = ri(rng, 60, 100);
  const h = s * 0.87, w = s * 0.5;
  for (let r = 0; r < Math.ceil(H / h) + 2; r++) for (let c = 0; c < Math.ceil(W / (s + w)) + 2; c++) {
    const cx = c * (s + w) + r % 2 * (s + w) * 0.5, cy = r * h;
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 6 + k * Math.PI / 3;
      pts.push([cx + Math.cos(a) * s * 0.5, cy + Math.sin(a) * s * 0.5]);
    }
    fillPoly(d, pts, pal.cols[(r + c) % pal.cols.length]);
    line(d, pts[0][0], pts[0][1], pts[1][0], pts[1][1], 3, mulC(pal.bg, 0.3));
    line(d, pts[1][0], pts[1][1], pts[2][0], pts[2][1], 3, mulC(pal.bg, 0.3));
    line(d, pts[2][0], pts[2][1], pts[3][0], pts[3][1], 3, mulC(pal.bg, 0.3));
    line(d, pts[3][0], pts[3][1], pts[4][0], pts[4][1], 3, mulC(pal.bg, 0.3));
    line(d, pts[4][0], pts[4][1], pts[5][0], pts[5][1], 3, mulC(pal.bg, 0.3));
    line(d, pts[5][0], pts[5][1], pts[0][0], pts[0][1], 3, mulC(pal.bg, 0.3));
  }
  return d;
};

P.trigrid = function(rng, noise, pal) {
  const d = newBuf(pal.bg);
  const s = ri(rng, 60, 100);
  for (let r = 0; r < Math.ceil(H / (s * 0.87)) + 2; r++) for (let c = 0; c < Math.ceil(W / s) + 2; c++) {
    const cx = c * s + r % 2 * s * 0.5, cy = r * s * 0.87;
    const col = pal.cols[(r + c) % pal.cols.length];
    if ((r + c) % 2 === 0) {
      fillPoly(d, [[cx, cy - s * 0.5], [cx - s * 0.5, cy + s * 0.5], [cx + s * 0.5, cy + s * 0.5]], col);
    } else {
      fillPoly(d, [[cx, cy + s * 0.5], [cx - s * 0.5, cy - s * 0.5], [cx + s * 0.5, cy - s * 0.5]], col);
    }
  }
  addTex(d, noise, 0.02, 0.04);
  return d;
};

P.pentagon = function(rng, noise, pal) {
  const d = newBuf(pal.bg);
  const s = ri(rng, 70, 110);
  const h = s * 0.95;
  for (let r = 0; r < Math.ceil(H / h) + 2; r++) for (let c = 0; c < Math.ceil(W / s) + 2; c++) {
    const cx = c * s + r % 2 * s * 0.5, cy = r * h;
    const pts = [];
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + k * 2 * Math.PI / 5;
      pts.push([cx + Math.cos(a) * s * 0.45, cy + Math.sin(a) * s * 0.45]);
    }
    fillPoly(d, pts, pal.cols[(r + c) % pal.cols.length]);
  }
  return d;
};

P.cog = function(rng, noise, pal) {
  const d = newBuf(pal.bg);
  const cx = W / 2, cy = H / 2;
  const r = ri(rng, 300, 450);
  const nTeeth = ri(rng, 12, 20);
  const col = pick(rng, pal.cols);
  disc(d, cx, cy, r, col);
  disc(d, cx, cy, r * 0.6, pal.bg);
  for (let i = 0; i < nTeeth; i++) {
    const a = i * 2 * Math.PI / nTeeth;
    const tw = r * 0.22, td = r * 0.25;
    fillPoly(d, [
      [cx + Math.cos(a - 0.08) * (r - td), cy + Math.sin(a - 0.08) * (r - td)],
      [cx + Math.cos(a + 0.08) * (r - td), cy + Math.sin(a + 0.08) * (r - td)],
      [cx + Math.cos(a + 0.08) * (r + tw), cy + Math.sin(a + 0.08) * (r + tw)],
      [cx + Math.cos(a - 0.08) * (r + tw), cy + Math.sin(a - 0.08) * (r + tw)]
    ], col);
  }
  disc(d, cx, cy, r * 0.2, pick(rng, pal.cols));
  addTex(d, noise, 0.01, 0.03);
  return d;
};

P.ribbon = function(rng, noise, pal) {
  const d = newBuf(pal.bg);
  const n = ri(rng, 8, 14);
  for (let i = 0; i < n; i++) {
    const col = pick(rng, pal.cols);
    const w = ri(rng, 20, 50);
    const f = rr(rng, 0.003, 0.008);
    const amp = ri(rng, 100, 300);
    const y0 = rr(rng, 0, H);
    for (let x = 0; x < W; x += 2) {
      const y = y0 + Math.sin(x * f) * amp;
      disc(d, x, y, w * 0.5, col);
      disc(d, x, y + Math.sin(x * f * 1.3 + 1) * amp * 0.3, w * 0.5, pick(rng, pal.cols));
    }
  }
  return d;
};

P.puzzle = function(rng, noise, pal) {
  const d = newBuf(pal.bg);
  const n = ri(rng, 6, 8);
  const s = W / n;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    fillRect(d, c * s + 3, r * s + 3, s - 6, s - 6, pal.cols[(r + c) % pal.cols.length]);
  }
  const tab = s * 0.18, tw = s * 0.1;
  const border = mulC(pal.bg, 0.7);
  for (let r = 0; r <= n; r++) {
    for (let c = 0; c < n; c++) {
      const x = c * s, y = r * s;
      line(d, x, y, x + s * 0.3, y, tw, border);
      line(d, x + s * 0.7, y, x + s, y, tw, border);
      if ((r + c) % 2 === 0) fillRect(d, x + s * 0.3, y - tab, s * 0.4, tab * 2, border);
    }
  }
  for (let c = 0; c <= n; c++) {
    for (let r = 0; r < n; r++) {
      const x = c * s, y = r * s;
      line(d, x, y, x, y + s * 0.3, tw, border);
      line(d, x, y + s * 0.7, x, y + s, tw, border);
      if ((r + c) % 2 === 1) fillRect(d, x - tab, y + s * 0.3, tab * 2, s * 0.4, border);
    }
  }
  return d;
};

P.lattice = function(rng, noise, pal) {
  const d = newBuf(pal.cols[0]);
  const bw = ri(rng, 8, 16);
  const gap = ri(rng, 60, 120);
  const col = pal.bg;
  for (let i = -H; i < W + H; i += gap) {
    line(d, i, 0, i + H, H, bw, col);
    line(d, i + H, 0, i, H, bw, col);
  }
  addTex(d, noise, 0.02, 0.04);
  return d;
};

P.mosaic = function(rng, noise, pal) {
  const d = newBuf(pal.bg);
  const n = ri(rng, 30, 50);
  const s = Math.ceil(W / n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const col = pick(rng, pal.cols);
    const gradDir = Math.floor(rng() * 4);
    const cx = c * s + s / 2, cy = r * s + s / 2;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      let t;
      if (gradDir === 0) t = x / s;
      else if (gradDir === 1) t = y / s;
      else if (gradDir === 2) t = Math.hypot(x - s / 2, y - s / 2) / (s * 0.71);
      else t = (x + y) / (s * 2);
      t = Math.min(1, t * 0.7 + 0.15);
      const cg = mixC(col, pal.bg, t * 0.35);
      setP(d, c * s + x, r * s + y, cg);
    }
  }
  addTex(d, noise, 0.05, 0.08);
  return d;
};

P.eye = function(rng, noise, pal) {
  const d = newBuf(pal.bg);
  addTex(d, noise, 0.05, 0.2);
  const cx = W / 2 + rr(rng, -30, 30), cy = H / 2 + rr(rng, -30, 30);
  const r = ri(rng, 320, 480);
  for (let i = 0; i < 10; i++) {
    const rr = r * (1 - i / 10);
    const col = pick(rng, pal.cols);
    for (let a = 0; a < 360; a += 3) {
      const rad = a * Math.PI / 180;
      disc(d, cx + Math.cos(rad) * rr, cy + Math.sin(rad) * rr * 0.6, 4, col);
    }
  }
  const pupilOffX = rr(rng, -r * 0.15, r * 0.15), pupilOffY = rr(rng, -r * 0.15, r * 0.15);
  disc(d, cx + pupilOffX, cy + pupilOffY, r * 0.18, pal.cols[3]);
  disc(d, cx + pupilOffX, cy + pupilOffY, r * 0.07, pick(rng, pal.cols));
  disc(d, cx + pupilOffX + r * 0.04, cy + pupilOffY - r * 0.05, r * 0.03, mulC(pal.bg, 1.5));
  return d;
};

P.feather = function(rng, noise, pal) {
  const d = newBuf(pal.bg);
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    if (noise.fbm(x * 0.008, y * 0.008, 3) > 0.45) {
      setP(d, x, y, mulC(pal.cols[0], 0.5 + noise.fbm(x * 0.004, y * 0.004, 2) * 0.4));
    }
  }
  for (let i = 0; i < ri(rng, 40, 60); i++) {
    const cx = rr(rng, 0, W), cy = rr(rng, 0, H);
    const col = pick(rng, pal.cols);
    const len = ri(rng, 60, 180);
    const a = rng() * 2 * Math.PI;
    for (let k = 0; k < 16; k++) {
      const t = k / 16;
      const px = cx + Math.cos(a) * len * t, py = cy + Math.sin(a) * len * t;
      const w = len * 0.06 * (1 - t * 0.5);
      const side = (k % 2 === 0 ? 1 : -1) * len * 0.15 * (1 - t * 0.3);
      const sx = px + Math.cos(a + 1.5) * side, sy = py + Math.sin(a + 1.5) * side;
      line(d, px, py, sx, sy, w, col);
    }
  }
  return d;
};

P.scale = function(rng, noise, pal) {
  const d = newBuf(pal.bg);
  addTex(d, noise, 0.04, 0.12);
  const n = ri(rng, 16, 22);
  const s = W / n;
  for (let r = 0; r < n + 2; r++) for (let c = 0; c < n + 2; c++) {
    const cx = c * s * 0.85 + r % 2 * s * 0.42, cy = r * s * 0.75;
    const col = pal.cols[(r + c) % pal.cols.length];
    const hs = s * 0.55;
    const dw = ri(rng, 3, 5);
    for (let a = 0; a < 180; a += 2) {
      const rad = a * Math.PI / 180;
      disc(d, cx + Math.cos(rad) * hs, cy + Math.sin(rad) * hs * 0.5, dw, col);
    }
  }
  return d;
};

P.basket = function(rng, noise, pal) {
  const d = newBuf(pal.bg);
  const s = ri(rng, 40, 70);
  const c1 = mulC(pal.cols[0], 0.85), c2 = mulC(pal.cols[1], 0.85);
  for (let r = 0; r < Math.ceil(H / s) + 2; r++) for (let c = 0; c < Math.ceil(W / s) + 2; c++) {
    const x = c * s - (r % 2) * s * 0.5, y = r * s;
    const col = (r + c) % 2 === 0 ? c1 : c2;
    fillRect(d, x, y, s * 0.9, s * 0.9, col);
    line(d, x, y, x + s * 0.6, y + s * 0.6, s * 0.08, mulC(pal.bg, 0.5));
  }
  addTex(d, noise, 0.03, 0.05);
  return d;
};

P.fan = function(rng, noise, pal) {
  const d = newBuf(pal.cols[0]);
  const cx = W / 2, cy = H * 0.85;
  const r = ri(rng, 400, 550);
  const n = ri(rng, 12, 20);
  for (let i = 0; i < n; i++) {
    const a = Math.PI * 0.55 + i * Math.PI * 0.45 / n;
    const col = pick(rng, pal.cols);
    line(d, cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r, r * 0.03, col);
  }
  for (let t = 0.2; t < 1; t += 0.15) {
    const col = pick(rng, pal.cols);
    for (let i = 0; i < n; i++) {
      const a = Math.PI * 0.55 + i * Math.PI * 0.45 / n;
      const r2 = r * t;
      disc(d, cx + Math.cos(a) * r2, cy + Math.sin(a) * r2, r * 0.015, col);
    }
  }
  return d;
};

P.organ = function(rng, noise, pal) {
  const d = newBuf(pal.bg);
  const n = ri(rng, 8, 14);
  const s = W / n;
  for (let c = 0; c < n; c++) {
    const w = s * rr(rng, 0.6, 0.95);
    const x = c * s + (s - w) / 2;
    const col = pal.cols[c % pal.cols.length];
    for (let y = 0; y < H; y++) {
      const t = y / H;
      const ww = w * (1 - t * 0.2);
      const m = 1 + (noise.fbm(x * 0.02, y * 0.02, 2) - 0.5) * 0.1;
      const c2 = mulC(col, m);
      fillRect(d, x + (w - ww) / 2, y, ww, 1, c2);
      if (y % Math.max(3, w * 0.15 | 0) === 0) {
        const lineCol = mulC(pal.bg, 0.3);
        fillRect(d, x, y, w, 1, lineCol);
      }
    }
    fillRect(d, x, 0, w, H * 0.04, mulC(pal.bg, 0.5));
  }
  return d;
};

P.skeleton = function(rng, noise, pal) {
  const d = newBuf(pal.bg);
  const n = ri(rng, 5, 8);
  for (let i = 0; i < n; i++) {
    const cx = rr(rng, 0, W), cy = rr(rng, 0, H);
    const col = pal.cols[i % pal.cols.length];
    const len = ri(rng, 150, 350);
    const dir = rng() * 2 * Math.PI;
    const mx = cx + Math.cos(dir) * len, my = cy + Math.sin(dir) * len;
    line(d, cx, cy, mx, my, len * 0.04, col);
    for (let t = 0.2; t < 0.9; t += 0.15) {
      const px = cx + (mx - cx) * t, py = cy + (my - cy) * t;
      const side = len * 0.08;
      line(d, px, py, px + Math.cos(dir + 1.2) * side, py + Math.sin(dir + 1.2) * side, len * 0.02, col);
      line(d, px, py, px + Math.cos(dir - 1.2) * side, py + Math.sin(dir - 1.2) * side, len * 0.02, col);
    }
  }
  return d;
};

P.wood = function(rng, noise, pal) {
  const d = newBuf(pal.cols[0]);
  const col = mulC(pal.cols[1], 0.4);
  const n = ri(rng, 30, 60);
  for (let i = 0; i < n; i++) {
    const y = rr(rng, 0, H);
    const w = rr(rng, 3, 15);
    const f = rr(rng, 0.005, 0.015);
    for (let x = 0; x < W; x++) {
      const yy = y + Math.sin(x * f + y * 0.5) * 6;
      fillRect(d, x, yy, 1, w, col);
    }
  }
  return d;
};

P.fingerprint = function(rng, noise, pal) {
  const d = newBuf(pal.bg);
  addTex(d, noise, 0.04, 0.15);
  const n = ri(rng, 6, 10);
  for (let f = 0; f < n; f++) {
    const cx = rr(rng, 80, W - 80), cy = rr(rng, 80, H - 80);
    const col = pick(rng, pal.cols);
    const nr = ri(rng, 12, 20);
    const spacing = ri(rng, 8, 14);
    const tilt = rr(rng, -0.4, 0.4);
    for (let i = 1; i < nr; i++) {
      const r = i * spacing + rr(rng, -2, 2);
      for (let a = 0; a < 360; a += 2) {
        const rad = a * Math.PI / 180;
        const dx = Math.cos(rad + tilt) * r, dy = Math.sin(rad + tilt) * r * 0.55;
        disc(d, cx + dx, cy + dy, 4, col);
      }
    }
  }
  return d;
};

P.sand = function(rng, noise, pal) {
  const d = newBuf(pal.bg);
  const s = rr(rng, 0.02, 0.04);
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    if (noise.fbm(x * s, y * s, 2) > 0.5) {
      setP(d, x, y, mulC(pal.cols[0], 0.5 + noise.fbm(x * 0.01, y * 0.01, 2) * 0.3));
    }
  }
  const n = ri(rng, 40, 70);
  for (let i = 0; i < n; i++) {
    const y = i * (H / n) + rr(rng, -4, 4);
    const col = pal.cols[i % pal.cols.length];
    const w = ri(rng, 10, 22);
    for (let x = 0; x < W; x++) {
      const yy = y + Math.sin(x * 0.008 + i * 2) * 5 + noise.fbm(x * 0.004, i * 0.2, 2) * 6;
      fillRect(d, x, yy, 1, w, col);
    }
  }
  return d;
};

P.smoke = function(rng, noise, pal) {
  const d = newBuf(pal.bg);
  addTex(d, noise, 0.02, 0.06);
  const n = ri(rng, 40, 65);
  for (let i = 0; i < n; i++) {
    const cx = rr(rng, 0, W), cy = rr(rng, 0, H);
    const col = pick(rng, pal.cols);
    const len = ri(rng, 80, 200);
    for (let t = 0; t < 1; t += 0.01) {
      const x = cx + Math.sin(t * 25 + i * 3) * len * t * 0.35;
      const y = cy + t * len * 0.7;
      const r = len * 0.08 * (1 - t * 0.35) * (1 + Math.sin(t * 50) * 0.25);
      disc(d, x, y, r, mulC(col, 1 - t * 0.3));
    }
  }
  return d;
};

P.fur = function(rng, noise, pal) {
  const d = newBuf(pal.bg);
  const n = ri(rng, 400, 800);
  for (let i = 0; i < n; i++) {
    const x = rr(rng, 0, W), y = rr(rng, 0, H);
    const len = ri(rng, 10, 30), w = ri(rng, 2, 4);
    const a = rng() * 2 * Math.PI;
    const col = pick(rng, pal.cols);
    line(d, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, w, col);
  }
  return d;
};

P.water = function(rng, noise, pal) {
  const d = newBuf(pal.cols[0]);
  const n = ri(rng, 3, 6);
  for (let i = 0; i < n; i++) {
    const cx = rr(rng, 100, W - 100), cy = rr(rng, 100, H - 100);
    const col = pal.cols[i % pal.cols.length];
    for (let r = 16; r < 300; r += 12) {
      for (let a = 0; a < 360; a += 3) {
        const rad = a * Math.PI / 180;
        const rr2 = r + Math.sin(a * 2) * 8;
        disc(d, cx + Math.cos(rad) * rr2, cy + Math.sin(rad) * rr2, 3, mulC(col, 1 - r / 300));
      }
    }
  }
  return d;
};

P.brush = function(rng, noise, pal) {
  const d = newBuf(pal.bg);
  addTex(d, noise, 0.02, 0.05);
  const n = ri(rng, 60, 100);
  for (let i = 0; i < n; i++) {
    const x = rr(rng, 0, W), y = rr(rng, 0, H);
    const len = ri(rng, 50, 160), w = ri(rng, 10, 24);
    const a = rng() * 2 * Math.PI;
    const col = pick(rng, pal.cols);
    const steps = 15;
    for (let t = 0; t < 1; t += 1 / steps) {
      const sx = x + Math.cos(a) * len * t + (noise.fbm(t * 10, i, 2) - 0.5) * len * 0.15;
      const sy = y + Math.sin(a) * len * t + (noise.fbm(t * 10, i + 5, 2) - 0.5) * len * 0.15;
      disc(d, sx, sy, w * (0.5 + t * 0.5), col);
    }
  }
  return d;
};

P.stucco = function(rng, noise, pal) {
  const d = newBuf(pal.cols[0]);
  const s = rr(rng, 0.03, 0.06);
  for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) {
    const n = noise.fbm(x * s, y * s, 3);
    if (n > 0.55) {
      const col = mulC(pal.cols[1], 0.5 + n * 0.5);
      setP(d, x, y, col);
    }
  }
  return d;
};

// ---- FLATNESS GATE ----
function computeFlatness(buf) {
  const n = 12;
  const cellW = (W / n) | 0, cellH = (H / n) | 0;
  let flat = 0, total = 0;
  for (let cy = 0; cy < n; cy++) for (let cx = 0; cx < n; cx++) {
    let sum = 0, sum2 = 0, cnt = 0;
    for (let y = cy * cellH; y < (cy + 1) * cellH; y += 3) for (let x = cx * cellW; x < (cx + 1) * cellW; x += 3) {
      const i = (y * W + x) * 4;
      const l = (buf[i] * 0.299 + buf[i + 1] * 0.587 + buf[i + 2] * 0.114) / 255;
      sum += l; sum2 += l * l; cnt++;
    }
    const mean = sum / cnt, variance = sum2 / cnt - mean * mean;
    if (variance < 0.0005) flat++;
    total++;
  }
  return flat / total;
}

// ---- ANISOTROPY ----
function computeAnisotropy(buf) {
  const ds = 4;
  const sw = (W / ds) | 0, sh = (H / ds) | 0;
  let Gxx = 0, Gyy = 0, Gxy = 0, total = 0;
  for (let y = 1; y < sh - 1; y++) for (let x = 1; x < sw - 1; x++) {
    const l = (y * ds * W + x * ds) * 4;
    const lx = (y * ds * W + (x + 1) * ds) * 4, ly = ((y + 1) * ds * W + x * ds) * 4;
    const gx = (buf[lx] / 255) - (buf[l] / 255);
    const gy = (buf[ly] / 255) - (buf[l] / 255);
    const m2 = gx * gx + gy * gy;
    if (m2 < 0.0001) continue;
    Gxx += gx * gx; Gyy += gy * gy; Gxy += gx * gy; total += m2;
  }
  if (total < 1e-6) return 0;
  const tr = Gxx + Gyy;
  const coh = Math.sqrt((Gxx - Gyy) * (Gxx - Gyy) + 4 * Gxy * Gxy) / (tr + 1e-8);
  return Math.min(1, Math.max(0, coh));
}

// ---- MAIN ----
const FAMILIES = [
  ["stripes", "strong"], ["chevron", "strong"], ["landscape", "strong"], ["city", "strong"],
  ["glyph", "strong"], ["barcode", "strong"], ["arrowfield", "strong"], ["flag", "strong"],
  ["letters", "strong"], ["numbers", "strong"], ["shapes", "strong"], ["roads", "strong"],
  ["maze", "strong"], ["pipes", "strong"], ["snowflake", "strong"], ["tartan", "strong"],
  ["zigzag", "strong"], ["crossword", "strong"], ["domino", "strong"],
  ["stainedglass", "strong"], ["hexgrid", "strong"], ["trigrid", "strong"], ["pentagon", "strong"],
  ["checker", "mid"], ["plaid", "mid"], ["brick", "mid"], ["wave", "mid"], ["dot", "mid"],
  ["spiral", "mid"], ["tile", "mid"], ["confetti", "mid"], ["sunburst", "mid"],
  ["circuit", "mid"], ["isoblock", "mid"], ["map", "mid"], ["celestial", "mid"],
  ["cog", "mid"], ["ribbon", "mid"], ["puzzle", "mid"], ["lattice", "mid"], ["mosaic", "mid"],
  ["eye", "mid"], ["feather", "mid"], ["scale", "mid"], ["basket", "mid"],
  ["fbm", "weak"], ["marble", "weak"], ["bubble", "weak"], ["speckle", "weak"], ["stone", "weak"],
  ["mandala", "weak"], ["weave", "weak"], ["crackle", "weak"], ["terrain", "weak"], ["galaxy", "weak"],
  ["fingerprint", "weak"], ["sand", "weak"], ["smoke", "weak"],
  ["fur", "weak"], ["water", "weak"], ["brush", "weak"], ["stucco", "weak"]
];
const PER_FAMILY = 3;
const FLAT_LIMIT = 0.6;

const manifest = { version: 1, size: SIZE, images: [] };
const imgDir = path.resolve(OUT, 'img');
fs.rmSync(imgDir, { recursive: true, force: true });
fs.mkdirSync(imgDir, { recursive: true });

const t0 = Date.now();
let id = 1;
const TOTAL = FAMILIES.length * PER_FAMILY;
for (const [pat, tier] of FAMILIES) {
  for (let k = 0; k < PER_FAMILY; k++) {
    let buf = null, seed = 0, flat = 1;
    for (let attempt = 0; attempt < 10; attempt++) {
      seed = hashString(`odd-rotation-${id}-${attempt}`);
      const rng = mulberry32(seed);
      const noise = makeNoise(rng);
      const pal = makePalette(rng);
      buf = P[pat](rng, noise, pal);
      flat = computeFlatness(buf);
      if (flat <= FLAT_LIMIT) break;
    }
    const anisotropy = computeAnisotropy(buf);
    const vImage = Math.round((1 - anisotropy) * 100) / 100;
    const file = `assets/img/mosaic_${String(id).padStart(3, '0')}.webp`;
    const outPath = path.resolve(imgDir, `mosaic_${String(id).padStart(3, '0')}.webp`);
    await sharp(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength), { raw: { width: W, height: H, channels: 4 } })
      .webp({ quality: QUALITY, effort: 4 })
      .toFile(outPath);
    const stat = fs.statSync(outPath);
    manifest.images.push({ id, file, tier, pattern: pat, seed: seed >>> 0, anisotropy: Math.round(anisotropy * 1000) / 1000, V_image: vImage });
    console.log(`${id}/${TOTAL} ${pat} ${tier} flat=${(flat * 100).toFixed(0)}% V=${vImage} ${(stat.size / 1024).toFixed(1)}KB`);
    id++;
  }
}
const total = ((Date.now() - t0) / 1000).toFixed(0);
console.log(`\nDone: ${id - 1} images in ${total}s`);
fs.writeFileSync(path.resolve(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));