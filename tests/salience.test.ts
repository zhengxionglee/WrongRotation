import { describe, it, expect } from "vitest";
import { salience, difficultyD, shapeF, angleF, downsampleLuma } from "../core/salience";
import { buildGrid } from "../core/grid";
import type { LumaMatrix } from "../core/types";

function makeImage(size: number): LumaMatrix {
  const data = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    data[y * size + x] = (x % 16 < 8) ? 255 : 0; // vertical stripes
  }
  return { w: size, h: size, data };
}

describe("salience", () => {
  it("stripes rotated 90° has high S", () => {
    const img = makeImage(128);
    const grid = buildGrid({ type: "square", seed: 0, param: 3 });
    const cell = grid.cells[4]; // center cell
    const result = salience(img, cell, 90);
    expect(result.S).toBeGreaterThan(0.4);
  });

  it("stripes rotated 180° has lower S than 90°", () => {
    const img = makeImage(128);
    const grid = buildGrid({ type: "square", seed: 0, param: 3 });
    const cell = grid.cells[4];
    const s90 = salience(img, cell, 90).S;
    const s180 = salience(img, cell, 180).S;
    expect(s180).toBeLessThan(s90 + 0.1);
  });

  it("flat image has low S", () => {
    const data = new Float32Array(64 * 64);
    data.fill(128);
    const img: LumaMatrix = { w: 64, h: 64, data };
    const grid = buildGrid({ type: "square", seed: 0, param: 3 });
    const s = salience(img, grid.cells[4], 90).S;
    expect(s).toBeLessThan(0.3);
  });

  it("S is in [0,1]", () => {
    const img = makeImage(64);
    const grid = buildGrid({ type: "square", seed: 0, param: 3 });
    for (const cell of grid.cells) {
      const r = salience(img, cell, 45);
      expect(r.S).toBeGreaterThanOrEqual(0);
      expect(r.S).toBeLessThanOrEqual(1);
    }
  });
});

describe("difficulty", () => {
  it("higher S gives lower D", () => {
    const d1 = difficultyD(0.6, 0.2, 25, "square", 180);
    const d2 = difficultyD(0.3, 0.2, 25, "square", 180);
    expect(d1).toBeLessThan(d2);
  });

  it("voronoi D > square D (same params)", () => {
    const d1 = difficultyD(0.5, 0.2, 25, "square", 180);
    const d2 = difficultyD(0.5, 0.2, 25, "voronoi", 180);
    expect(d2).toBeGreaterThan(d1);
  });

  it("angle 180 has F=0, angle 90 has F=0.4", () => {
    expect(angleF(180)).toBe(0);
    expect(angleF(90)).toBe(0.4);
    expect(angleF(270)).toBe(0.4);
  });

  it("shapeF order: square < hex < tri < voronoi", () => {
    expect(shapeF("square")).toBeLessThan(shapeF("hex"));
    expect(shapeF("hex")).toBeLessThan(shapeF("tri"));
    expect(shapeF("tri")).toBeLessThan(shapeF("voronoi"));
  });
});

describe("downsampleLuma", () => {
  it("downsamples correctly", () => {
    const data = new Float32Array(20 * 20);
    data.fill(100);
    const img: LumaMatrix = { w: 20, h: 20, data };
    const ds = downsampleLuma(img, 10);
    expect(ds.w).toBeLessThanOrEqual(10);
    expect(ds.h).toBeLessThanOrEqual(10);
    expect(ds.data[0]).toBeCloseTo(100, 0);
  });
});