import { describe, it, expect } from "vitest";
import { buildGrid, clipPolyUnit } from "../core/grid";

function deepEqualCells(a: any, b: any) {
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
}

describe("buildGrid", () => {
  it("square 3x3 produces 9 cells", () => {
    const g = buildGrid({ type: "square", seed: 0, param: 3 });
    expect(g.cells.length).toBe(9);
    for (const c of g.cells) {
      expect(c.poly.length).toBe(4);
      expect(c.cx).toBeGreaterThan(0);
      expect(c.cx).toBeLessThan(1);
    }
  });

  it("square determinism: same spec same output", () => {
    const a = buildGrid({ type: "square", seed: 0, param: 4 });
    const b = buildGrid({ type: "square", seed: 0, param: 4 });
    deepEqualCells(a, b);
  });

  it("voronoi determinism: same seed same cells", () => {
    const a = buildGrid({ type: "voronoi", seed: 20481, param: 24 });
    const b = buildGrid({ type: "voronoi", seed: 20481, param: 24 });
    expect(a.cells.length).toBe(b.cells.length);
    for (let i = 0; i < a.cells.length; i++) {
      expect(a.cells[i].poly).toEqual(b.cells[i].poly);
    }
  });

  it("voronoi cells are within [0,1]", () => {
    const g = buildGrid({ type: "voronoi", seed: 12345, param: 20 });
    for (const c of g.cells) {
      for (const [x, y] of c.poly) {
        expect(x).toBeGreaterThanOrEqual(-0.001);
        expect(x).toBeLessThanOrEqual(1.001);
        expect(y).toBeGreaterThanOrEqual(-0.001);
        expect(y).toBeLessThanOrEqual(1.001);
      }
    }
  });

  it("hex grid produces cells", () => {
    const g = buildGrid({ type: "hex", seed: 42, param: 3 });
    expect(g.cells.length).toBeGreaterThan(6);
    for (const c of g.cells) {
      for (const [x, y] of c.poly) {
        expect(x).toBeGreaterThanOrEqual(-0.001);
        expect(x).toBeLessThanOrEqual(1.001);
      }
    }
  });

  it("tri grid produces 2n^2 cells", () => {
    const n = 3;
    const g = buildGrid({ type: "tri", seed: 0, param: n });
    expect(g.cells.length).toBe(2 * n * n);
  });
});

describe("clipPolyUnit", () => {
  it("square inside unit is unchanged", () => {
    const poly: [number, number][] = [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]];
    const clipped = clipPolyUnit(poly);
    expect(clipped.length).toBe(4);
  });
  it("partially outside gets clipped", () => {
    const poly: [number, number][] = [[-0.1, -0.1], [1.1, -0.1], [1.1, 1.1], [-0.1, 1.1]];
    const clipped = clipPolyUnit(poly);
    expect(clipped.length).toBeGreaterThanOrEqual(3);
    for (const [x, y] of clipped) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });
});