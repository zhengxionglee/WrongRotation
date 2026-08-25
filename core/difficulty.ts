import type { GridType, Tier } from "./types";

export interface ArcadeParams {
  gridN: number;
  shape: GridType;
  tier: Tier;
  angles: number[];
  timeLimit: number;
  easy: boolean;
}

const FULL_ANGLES = [15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345];
const MICRO_ANGLES = [8, 14, 166, 173, 187, 194, 346, 352];

export function arcadeParams(combo: number, chaos: boolean): ArcadeParams {
  if (combo > 0 && combo % 5 === 0) {
    return { gridN: 3, shape: "square", tier: "strong", angles: [180], timeLimit: 8, easy: true };
  }

  let gridN: number, tier: Tier, angles: number[];

  if (combo < 5) { gridN = 3; tier = "strong"; angles = [180]; }
  else if (combo < 10) { gridN = 4; tier = "strong"; angles = [90, 180, 270]; }
  else if (combo < 18) { gridN = combo % 2 === 0 ? 4 : 5; tier = "mid"; angles = FULL_ANGLES; }
  else if (combo < 28) { gridN = 5; tier = "mid"; angles = FULL_ANGLES; }
  else if (combo < 41) { gridN = combo % 2 === 0 ? 5 : 6; tier = combo < 34 ? "mid" : "weak"; angles = FULL_ANGLES; }
  else { gridN = 6; tier = "weak"; angles = [...FULL_ANGLES, ...(chaos || combo < 41 ? [] : MICRO_ANGLES)]; }

  return { gridN, shape: "square", tier, angles, timeLimit: 8, easy: false };
}

export function pickShape(unlocked: string[], chaos: boolean, rng: () => number): string {
  const pool = ["square", ...unlocked];
  if (chaos) pool.push("hex", "tri", "voronoi");
  return pool[Math.floor(rng() * pool.length)];
}

export function gridSpecForShape(shape: string, gridN: number, seed: number): { type: string; seed: number; param: number } {
  switch (shape) {
    case "square": return { type: "square", seed, param: gridN };
    case "hex": return { type: "hex", seed, param: Math.max(2, gridN - 1) };
    case "tri": return { type: "tri", seed, param: Math.max(2, gridN - 1) };
    case "voronoi": return { type: "voronoi", seed, param: Math.max(8, gridN * gridN) };
    default: return { type: "square", seed, param: gridN };
  }
}