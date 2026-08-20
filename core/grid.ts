import { Rng } from "./rng";
import { Delaunay } from "d3-delaunay";
import type { Cell, Grid, GridSpec, GridType } from "./types";

function centroid(poly: [number, number][]): [number, number] {
  let sx = 0, sy = 0;
  for (const [x, y] of poly) { sx += x; sy += y; }
  return [sx / poly.length, sy / poly.length];
}

function polyArea(poly: [number, number][]): number {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    s += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  }
  return Math.abs(s) / 2;
}

function ensureCCW(poly: [number, number][]): [number, number][] {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    s += (poly[i][0] - poly[j][0]) * (poly[i][1] + poly[j][1]);
  }
  if (s > 0) return poly.slice().reverse();
  return poly;
}

function clipEdge(pts: [number, number][], ax: 0 | 1, val: number, keepGT: boolean): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const da = keepGT ? a[ax] - val : val - a[ax];
    const db = keepGT ? b[ax] - val : val - b[ax];
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

export function clipPolyUnit(poly: [number, number][]): [number, number][] {
  let p = poly;
  p = clipEdge(p, 0, 0, true);
  p = clipEdge(p, 0, 1, false);
  p = clipEdge(p, 1, 0, true);
  p = clipEdge(p, 1, 1, false);
  return p;
}

function pointInPoly(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function buildCell(id: number, poly: [number, number][]): Cell {
  const c = ensureCCW(poly);
  const [cx, cy] = centroid(c);
  return { id, poly: c, cx, cy };
}

function squareGrid(n: number): Grid {
  const cells: Cell[] = [];
  const s = 1 / n;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const x0 = c * s, y0 = r * s;
    cells.push(buildCell(r * n + c, [[x0, y0], [x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s]]));
  }
  return { type: "square", seed: 0, param: n, cells };
}

function hexGrid(n: number, seed: number): Grid {
  const r = 1 / (1.5 * n + 1);
  const hSp = 1.5 * r, vSp = Math.sqrt(3) * r;
  const cells: Cell[] = [];
  let id = 0;
  const cols = Math.ceil(1 / hSp) + 2;
  const rows = Math.ceil(1 / vSp) + 2;
  for (let c = -1; c <= cols; c++) for (let ro = -1; ro <= rows; ro++) {
    const cx = c * hSp + (ro % 2) * hSp * 0.5;
    const cy = ro * vSp * 0.866;
    const verts: [number, number][] = [];
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 3 * k;
      verts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    const clipped = clipPolyUnit(verts);
    if (clipped.length >= 3 && polyArea(clipped) > 1e-6) {
      cells.push(buildCell(id++, clipped));
    }
  }
  return { type: "hex", seed, param: n, cells };
}

function triGrid(n: number): Grid {
  const cells: Cell[] = [];
  const s = 1 / n;
  let id = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const x0 = c * s, y0 = r * s, x1 = x0 + s, y1 = y0 + s;
    const up = (r + c) % 2 === 0;
    if (up) {
      cells.push(buildCell(id++, [[x0, y0], [x1, y0], [(x0 + x1) / 2, y1]]));
      cells.push(buildCell(id++, [[x0, y0], [(x0 + x1) / 2, y1], [x0, y1]]));
    } else {
      cells.push(buildCell(id++, [[x0, y1], [x1, y1], [(x0 + x1) / 2, y0]]));
      cells.push(buildCell(id++, [[x1, y0], [x1, y1], [(x0 + x1) / 2, y0]]));
    }
  }
  return { type: "tri", seed: 0, param: n, cells };
}

function voronoiGrid(seed: number, target: number): Grid {
  const k = Math.max(2, Math.round(Math.sqrt(target)));
  const rng = new Rng(seed);
  const pts: [number, number][] = [];
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
    const x = (i + 0.5) / k + rng.range(-0.42, 0.42) / k;
    const y = (j + 0.5) / k + rng.range(-0.42, 0.42) / k;
    pts.push([Math.max(0.01, Math.min(0.99, x)), Math.max(0.01, Math.min(0.99, y))]);
  }
  const del = Delaunay.from(pts);
  const vor = del.voronoi([0, 0, 1, 1]);
  const cells: Cell[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = vor.cellPolygon(i) as [number, number][] | null;
    if (!p) continue;
    const ring = p.slice(0, -1);
    if (ring.length < 3) continue;
    cells.push(buildCell(i, ring));
  }
  return { type: "voronoi", seed, param: target, cells };
}

export function buildGrid(spec: GridSpec): Grid {
  switch (spec.type) {
    case "square": return squareGrid(spec.param);
    case "hex": return hexGrid(spec.param, spec.seed);
    case "tri": return triGrid(spec.param);
    case "voronoi": return voronoiGrid(spec.seed, spec.param);
  }
}

export function hitTest(grid: Grid, x: number, y: number): number {
  for (const cell of grid.cells) {
    if (pointInPoly(x, y, cell.poly)) return cell.id;
  }
  return -1;
}