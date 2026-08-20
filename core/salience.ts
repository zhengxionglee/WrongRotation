import type { Cell, LumaMatrix } from "./types";

export const S_MIN = 0.05;

export function downsampleLuma(src: LumaMatrix, maxW: number): LumaMatrix {
  let { w, h, data } = src;
  while (w > maxW || h > maxW) {
    const nw = Math.floor(w / 2), nh = Math.floor(h / 2);
    const nd = new Float32Array(nw * nh);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      let s = 0;
      const sy = y * 2, sx = x * 2;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        s += data[(sy + dy) * w + (sx + dx)];
      }
      nd[y * nw + x] = s / 4;
    }
    w = nw; h = nh; data = nd;
  }
  return { w, h, data };
}

export function extractCell(img: LumaMatrix, cell: Cell, imgW: number, imgH: number) {
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const [x, y] of cell.poly) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  const x0 = Math.max(0, Math.floor(minX * imgW));
  const y0 = Math.max(0, Math.floor(minY * imgH));
  const x1 = Math.min(imgW, Math.ceil(maxX * imgW));
  const y1 = Math.min(imgH, Math.ceil(maxY * imgH));
  const w = Math.max(2, x1 - x0), h = Math.max(2, y1 - y0);
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    data[y * w + x] = img.data[(y0 + y) * img.w + (x0 + x)];
  }
  return { x0, y0, w, h, data };
}

function clamp(v: number, a: number, b: number) { return v < a ? a : v > b ? b : v; }

function rotateLuma(src: Float32Array, w: number, h: number, angleDeg: number): Float32Array {
  const out = new Float32Array(w * h);
  const rad = angleDeg * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x - cx, dy = y - cy;
    const sx = clamp(Math.round(cx + dx * cos + dy * sin), 0, w - 1);
    const sy = clamp(Math.round(cy - dx * sin + dy * cos), 0, h - 1);
    out[y * w + x] = src[sy * w + sx];
  }
  return out;
}

function borderDiff(a: Float32Array, b: Float32Array, w: number, h: number): number {
  let sum = 0, count = 0;
  const r = Math.max(1, Math.floor(Math.min(w, h) / 12));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x < r || x >= w - r || y < r || y >= h - r) {
      sum += Math.abs(a[y * w + x] - b[y * w + x]);
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

function ssimLite(a: Float32Array, b: Float32Array, w: number, h: number): number {
  if (w * h > 4096) {
    const nw = Math.floor(w / 2), nh = Math.floor(h / 2);
    const da = new Float32Array(nw * nh), db = new Float32Array(nw * nh);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      let sa = 0, sb = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        sa += a[(y * 2 + dy) * w + (x * 2 + dx)];
        sb += b[(y * 2 + dy) * w + (x * 2 + dx)];
      }
      da[y * nw + x] = sa / 4; db[y * nw + x] = sb / 4;
    }
    return ssimLite(da, db, nw, nh);
  }
  const n = w * h;
  let muA = 0, muB = 0, varA = 0, varB = 0, cov = 0;
  for (let i = 0; i < n; i++) { muA += a[i]; muB += b[i]; }
  muA /= n; muB /= n;
  for (let i = 0; i < n; i++) {
    const da = a[i] - muA, db = b[i] - muB;
    varA += da * da; varB += db * db; cov += da * db;
  }
  varA /= n; varB /= n; cov /= n;
  const c1 = 6.5025, c2 = 58.5225;
  return Math.max(0, ((2 * muA * muB + c1) * (2 * cov + c2)) / ((muA * muA + muB * muB + c1) * (varA + varB + c2)));
}

export function salience(img: LumaMatrix, cell: Cell, angleDeg: number): { S: number; edge: number; ssim: number } {
  const work = downsampleLuma(img, 540);
  const { w, h, data } = extractCell(work, cell, work.w, work.h);
  if (w < 6 || h < 6) return { S: 0, edge: 0, ssim: 1 };
  const rot = rotateLuma(data, w, h, angleDeg);
  const edge = borderDiff(data, rot, w, h);
  const ssim = ssimLite(data, rot, w, h);
  const edgeN = Math.min(1, edge * 2.2);
  const S = Math.min(1, Math.max(0, 0.5 * edgeN + 0.6 * (1 - ssim)));
  return { S, edge, ssim };
}

export function interference(img: LumaMatrix, grid: { cells: { id: number; poly: [number, number][]; cx: number; cy: number }[] }, angleDeg: number, S_target: number, rng: () => number, tau = 0.8, maxSamples = 20): number {
  const ids = grid.cells.map(c => c.id);
  const shuffled: number[] = [];
  const a = ids.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  const n = Math.min(maxSamples, a.length);
  let count = 0;
  for (let i = 0; i < n; i++) {
    const cell = grid.cells.find(c => c.id === a[i])!;
    const s = salience(img, cell, angleDeg).S;
    if (s > tau * S_target) count++;
  }
  return n > 0 ? count / n : 0;
}

export function shapeF(type: string): number {
  switch (type) {
    case "square": return 0;
    case "hex": return 0.3;
    case "tri": return 0.5;
    case "voronoi": return 0.8;
    default: return 0;
  }
}

export function angleF(angle: number): number {
  const a = ((angle % 360) + 360) % 360;
  if (a === 180) return 0;
  if (a === 90 || a === 270) return 0.4;
  const d = Math.abs(a - Math.round(a / 90) * 90);
  if (d < 15) return 1.15;
  return 1.0;
}

export function difficultyD(S: number, C: number, nCells: number, shape: string, angle: number): number {
  const Ŝ = Math.max(0.06, Math.min(1, S));
  const Ĉ = Math.min(1, Math.max(0, C));
  const raw = 0.30 / Ŝ + 0.30 * Ĉ + 0.15 * Math.log2(Math.max(2, nCells)) + 0.15 * shapeF(shape) + 0.10 * angleF(angle);
  return Math.round(raw * 1.4 * 10) / 10;
}