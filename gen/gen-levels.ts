import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { Rng, hashString } from "../core/rng";
import { buildGrid, clipPolyUnit } from "../core/grid";
import { salience, interference, difficultyD, S_MIN, downsampleLuma } from "../core/salience";
import type { LumaMatrix, Manifest, ManifestEntry, LevelData, GridSpec } from "../core/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LEVELS_OUT = path.resolve(ROOT, "levels");
const ASSETS_DIR = path.resolve(ROOT, "assets");

const lumaCache = new Map<string, LumaMatrix>();

async function getLuma(file: string): Promise<LumaMatrix> {
  if (lumaCache.has(file)) return lumaCache.get(file)!;
  const buf = await sharp(path.resolve(ROOT, file)).raw().toBuffer();
  const data = new Float32Array(1080 * 1080);
  for (let i = 0; i < 1080 * 1080; i++) data[i] = (0.299 * buf[i * 3] + 0.587 * buf[i * 3 + 1] + 0.114 * buf[i * 3 + 2]) / 255;
  const lm: LumaMatrix = { w: 1080, h: 1080, data };
  const ds = downsampleLuma(lm, 540);
  lumaCache.set(file, ds);
  return ds;
}

const CURVE = [
  { targetD: 1.6, shape: "square", param: 3, tier: "strong", angles: [180], nT: 1, autoSnap: true, showCount: false, time: [20, 40, 80] },
  { targetD: 2.0, shape: "square", param: 3, tier: "strong", angles: [180], nT: 1, autoSnap: true, showCount: false, time: [16, 32, 65] },
  { targetD: 2.4, shape: "square", param: 3, tier: "strong", angles: [180], nT: 1, autoSnap: true, showCount: false, time: [14, 28, 55] },
  { targetD: 2.8, shape: "square", param: 4, tier: "strong", angles: [180], nT: 1, autoSnap: true, showCount: false, time: [12, 24, 48] },
  { targetD: 3.2, shape: "square", param: 4, tier: "strong", angles: [180, 90], nT: 1, autoSnap: true, showCount: false, time: [12, 24, 48] },
  { targetD: 3.6, shape: "square", param: 4, tier: "strong", angles: [90, 180, 270], nT: 1, autoSnap: true, showCount: false, time: [10, 20, 40] },
  { targetD: 4.0, shape: "square", param: 4, tier: "strong", angles: [90, 180, 270], nT: 1, autoSnap: true, showCount: false, time: [10, 20, 40] },
  { targetD: 4.3, shape: "square", param: 4, tier: "mid", angles: [90, 180, 270], nT: 1, autoSnap: true, showCount: false, time: [9, 18, 36] },
  { targetD: 4.6, shape: "square", param: 5, tier: "mid", angles: [90, 180, 270], nT: 1, autoSnap: true, showCount: false, time: [9, 18, 36] },
  { targetD: 4.9, shape: "square", param: 5, tier: "mid", angles: [90, 180, 270], nT: 1, autoSnap: true, showCount: false, time: [8, 16, 32] },
  { targetD: 5.0, shape: "square", param: 5, tier: "mid", angles: [90, 180, 270], nT: 1, autoSnap: true, showCount: false, time: [8, 16, 32] },
  { targetD: 5.2, shape: "square", param: 5, tier: "mid", angles: [90, 180, 270], nT: 1, autoSnap: true, showCount: false, time: [8, 16, 32] },
  { targetD: 5.4, shape: "square", param: 5, tier: "mid", angles: [30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330], nT: 1, autoSnap: true, showCount: false, time: [7, 14, 28] },
  { targetD: 5.6, shape: "square", param: 5, tier: "mid", angles: [30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330], nT: 1, autoSnap: true, showCount: false, time: [7, 14, 28] },
  { targetD: 5.8, shape: "square", param: 5, tier: "mid", angles: [30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330], nT: 1, autoSnap: true, showCount: false, time: [7, 14, 28] },
  { targetD: 6.0, shape: "square", param: 6, tier: "mid", angles: [30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330], nT: 1, autoSnap: true, showCount: false, time: [6, 12, 24] },
  { targetD: 6.2, shape: "square", param: 6, tier: "mid", angles: [30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330], nT: 1, autoSnap: true, showCount: false, time: [6, 12, 24] },
  { targetD: 6.4, shape: "square", param: 6, tier: "mid", angles: [30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330], nT: 1, autoSnap: true, showCount: false, time: [6, 12, 24] },
  { targetD: 6.6, shape: "square", param: 6, tier: "mid", angles: [30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330], nT: 1, autoSnap: true, showCount: false, time: [5, 10, 20] },
  { targetD: 4.6, shape: "hex", param: 3, tier: "strong", angles: [180, 90, 270], nT: 1, autoSnap: true, showCount: false, time: [12, 24, 48] },
  { targetD: 5.2, shape: "hex", param: 3, tier: "mid", angles: [180, 90, 270], nT: 1, autoSnap: true, showCount: false, time: [10, 20, 40] },
  { targetD: 5.6, shape: "hex", param: 4, tier: "mid", angles: [90, 180, 270], nT: 1, autoSnap: true, showCount: false, time: [9, 18, 36] },
  { targetD: 6.0, shape: "hex", param: 4, tier: "mid", angles: [30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330], nT: 1, autoSnap: true, showCount: false, time: [8, 16, 32] },
  { targetD: 6.3, shape: "hex", param: 4, tier: "mid", angles: [30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330], nT: 1, autoSnap: true, showCount: false, time: [8, 16, 32] },
  { targetD: 6.5, shape: "hex", param: 4, tier: "mid", angles: [30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330], nT: 1, autoSnap: true, showCount: false, time: [7, 14, 28] },
  { targetD: 4.8, shape: "tri", param: 3, tier: "strong", angles: [180, 90, 270], nT: 1, autoSnap: true, showCount: false, time: [12, 24, 48] },
  { targetD: 5.4, shape: "tri", param: 3, tier: "mid", angles: [90, 180, 270], nT: 1, autoSnap: true, showCount: false, time: [10, 20, 40] },
  { targetD: 5.8, shape: "tri", param: 4, tier: "mid", angles: [90, 180, 270], nT: 1, autoSnap: true, showCount: false, time: [9, 18, 36] },
  { targetD: 6.1, shape: "tri", param: 4, tier: "mid", angles: [30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330], nT: 1, autoSnap: true, showCount: false, time: [8, 16, 32] },
  { targetD: 6.4, shape: "tri", param: 4, tier: "mid", angles: [30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330], nT: 1, autoSnap: true, showCount: false, time: [8, 16, 32] },
  { targetD: 5.0, shape: "square", param: 4, tier: "mid", angles: [90, 180, 270], nT: 2, autoSnap: false, showCount: true, time: [14, 28, 55] },
  { targetD: 5.6, shape: "square", param: 5, tier: "mid", angles: [90, 180, 270], nT: 2, autoSnap: false, showCount: true, time: [12, 24, 48] },
  { targetD: 6.0, shape: "hex", param: 4, tier: "mid", angles: [90, 180, 270], nT: 2, autoSnap: false, showCount: true, time: [12, 24, 48] },
  { targetD: 6.6, shape: "hex", param: 4, tier: "mid", angles: [30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330], nT: 3, autoSnap: false, showCount: true, time: [10, 20, 40] },
  { targetD: 5.4, shape: "square", param: 4, tier: "mid", angles: [90, 180, 270], nT: 2, autoSnap: false, showCount: true, time: [14, 28, 55] },
  { targetD: 6.2, shape: "square", param: 5, tier: "mid", angles: [30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330], nT: 3, autoSnap: false, showCount: true, time: [10, 20, 40] },
  { targetD: 6.0, shape: "tri", param: 4, tier: "mid", angles: [90, 180, 270], nT: 2, autoSnap: false, showCount: true, time: [12, 24, 48] },
  { targetD: 5.2, shape: "voronoi", param: 12, tier: "mid", angles: [180, 90, 270], nT: 2, autoSnap: false, showCount: true, time: [14, 28, 55] },
  { targetD: 5.8, shape: "voronoi", param: 16, tier: "mid", angles: [90, 180, 270], nT: 2, autoSnap: false, showCount: true, time: [12, 24, 48] },
  { targetD: 6.2, shape: "voronoi", param: 20, tier: "mid", angles: [30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330], nT: 2, autoSnap: false, showCount: true, time: [10, 20, 40] },
  { targetD: 6.5, shape: "voronoi", param: 20, tier: "mid", angles: [30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330], nT: 3, autoSnap: false, showCount: true, time: [10, 20, 40] },
  { targetD: 6.8, shape: "voronoi", param: 24, tier: "mid", angles: [30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330], nT: 3, autoSnap: false, showCount: true, time: [8, 16, 32] },
  { targetD: 7.0, shape: "voronoi", param: 28, tier: "weak", angles: [30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330], nT: 3, autoSnap: false, showCount: true, time: [8, 16, 32] },
  { targetD: 6.2, shape: "square", param: 5, tier: "mid", angles: [8, 14, 166, 173, 187, 194, 346, 352], nT: 2, autoSnap: false, showCount: true, time: [12, 24, 48] },
  { targetD: 6.8, shape: "hex", param: 4, tier: "weak", angles: [8, 14, 30, 45, 90, 180, 270, 345, 350], nT: 3, autoSnap: false, showCount: true, time: [10, 20, 40] },
  { targetD: 7.5, shape: "voronoi", param: 28, tier: "weak", angles: [8, 14, 166, 173, 187, 352], nT: 3, autoSnap: false, showCount: true, time: [8, 16, 32] },
  { targetD: 6.6, shape: "square", param: 4, tier: "mid", angles: [90, 180, 270], nT: 2, autoSnap: false, showCount: true, time: [14, 28, 55] },
  { targetD: 7.4, shape: "hex", param: 5, tier: "weak", angles: [30, 45, 90, 180, 270, 315, 340], nT: 3, autoSnap: false, showCount: true, time: [8, 16, 32] },
  { targetD: 7.5, shape: "voronoi", param: 30, tier: "weak", angles: [8, 14, 166, 173, 187, 194, 346, 352], nT: 3, autoSnap: false, showCount: true, time: [6, 12, 24] },
  { targetD: 8.0, shape: "voronoi", param: 30, tier: "weak", angles: [8, 14, 166, 173, 187, 194, 346, 352], nT: 3, autoSnap: false, showCount: true, time: [6, 12, 24] },
];

async function main() {
  const manifestPath = path.resolve(ASSETS_DIR, "manifest.json");
  const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const imgMap = new Map<number, ManifestEntry>();
  for (const e of manifest.images) imgMap.set(e.id, e);

  const levels: LevelData[] = [];
  const recentImages: number[] = [];

  for (let idx = 0; idx < 50; idx++) {
    const curve = CURVE[idx];
    const levelId = idx + 1;
    const seed = hashString(`odd-rotation-level-${levelId}`);
    const rng = new Rng(seed);

    const tierPool = manifest.images.filter(e => {
      const tierOk = e.tier === curve.tier || (curve.tier === "mid" && (e.tier === "strong" || e.tier === "mid"));
      return tierOk && !recentImages.includes(e.id);
    });
    const entry = tierPool.length > 0 ? rng.pick(tierPool) : rng.pick(manifest.images.filter(e => !recentImages.includes(e.id)));
    recentImages.push(entry.id);
    if (recentImages.length > 5) recentImages.shift();

    const gridSpec: GridSpec = { type: curve.shape as any, seed: seed >>> 0, param: curve.param };
    const grid = buildGrid(gridSpec);
    const luma = await getLuma(entry.file);

    const angleSet = rng.shuffle(curve.angles);
    const cellCandidates = rng.shuffle(grid.cells).slice(0, 24);

    const targets: { cellId: number; rotation: number; S: number }[] = [];
    const usedIds = new Set<number>();

    for (let t = 0; t < curve.nT; t++) {
      let bestS = 0;
      let bestCell = cellCandidates[0];
      let bestAngle = angleSet[0];
      for (const cell of cellCandidates) {
        if (usedIds.has(cell.id)) continue;
        for (const angle of angleSet) {
          const s = salience(luma, cell, angle).S;
          if (s > bestS && !(Math.abs(angle - 180) < 1 && s < 0.1)) { bestS = s; bestCell = cell; bestAngle = angle; }
        }
      }
      usedIds.add(bestCell.id);
      targets.push({ cellId: bestCell.id, rotation: bestAngle, S: Math.round(bestS * 100) / 100 });
    }

    const S_target = targets[0].S;
    const intRng = mulberry32(seed >>> 0);
    const C = interference(luma, grid, angleSet[0], S_target, intRng, 0.8, 20);
    const D = difficultyD(S_target, C, grid.cells.length, curve.shape, curve.angles[0]);
    const _D = Math.round(D * 10) / 10;

    const level: LevelData = {
      id: levelId,
      difficulty: _D > 0 ? _D : 1.5,
      image: entry.file,
      grid: gridSpec,
      targets: targets.map(t => ({ cellId: t.cellId, rotation: t.rotation })),
      mode: { autoSnap: curve.autoSnap, showTargetCount: curve.showCount },
      limits: { timeLimit: null, hints: 1 },
      star: { clicks: [curve.nT, curve.nT * 3, curve.nT * 6], time: curve.time },
      meta: { S: S_target, C: Math.round(C * 100) / 100, V_image: entry.V_image }
    };
    levels.push(level);
    console.log(`L${levelId}: D=${level.difficulty} ${curve.shape} ${curve.param} targets=${curve.nT} S=${S_target.toFixed(2)} C=${C.toFixed(2)} img=${entry.file}`);
  }

  fs.mkdirSync(LEVELS_OUT, { recursive: true });
  fs.writeFileSync(path.resolve(LEVELS_OUT, "levels.json"), JSON.stringify(levels, null, 2));
  console.log(`\nWrote ${levels.length} levels to levels/levels.json`);
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

main().catch(console.error);