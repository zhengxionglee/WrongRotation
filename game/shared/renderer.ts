import type { Grid, Cell } from "../../core/types";

export interface PuzzleState {
  image: HTMLImageElement;
  grid: Grid;
  rotations: Map<number, number>;
  rotatable: boolean;
  highlights: Set<number>;
  baseRotation?: number;
  boldGrid?: boolean;
}

export class PuzzleRenderer {
  board = { x: 0, y: 0, size: 0 };
  private cache: HTMLCanvasElement | null = null;
  private cacheKey: string | null = null;
  dpr = 1;

  layout(canvasW: number, canvasH: number, hudH: number) {
    const avail = Math.min(canvasW, canvasH - hudH) - 24;
    const size = Math.max(200, avail);
    this.board = { x: (canvasW - size) / 2, y: (canvasH - size + hudH * 0.5) / 2, size };
    this.invalidate();
  }

  invalidate() { this.cache = null; this.cacheKey = null; }

  private gridStroke(highlight: boolean, bold: boolean): { style: string; width: number } {
    if (highlight) return { style: "#ffd94d", width: 3 };
    if (bold) return { style: "rgba(0,0,0,0.55)", width: 2.5 };
    return { style: "rgba(0,0,0,0.12)", width: 1.5 };
  }

  private buildCache(state: PuzzleState) {
    const baseRot = state.baseRotation ?? 0;
    const bold = state.boldGrid ?? false;
    const imgKey = state.image.src;
    const gridKey = JSON.stringify(state.grid.cells.map(c => c.id));
    const key = `${imgKey}|${gridKey}|${baseRot}|${bold}`;
    if (this.cache && this.cacheKey === key) return;
    const s = this.board.size;
    const canvas = document.createElement("canvas");
    canvas.width = s;
    canvas.height = s;
    const ctx = canvas.getContext("2d")!;
    if (baseRot) {
      ctx.translate(s / 2, s / 2);
      ctx.rotate(baseRot * Math.PI / 180);
      ctx.translate(-s / 2, -s / 2);
    }
    ctx.drawImage(state.image, 0, 0, s, s);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const stroke = this.gridStroke(false, bold);
    ctx.strokeStyle = stroke.style;
    ctx.lineWidth = stroke.width;
    for (const cell of state.grid.cells) {
      this.cellPath(ctx, cell, s);
      ctx.stroke();
    }
    this.cache = canvas;
    this.cacheKey = key;
  }

  private cellPath(ctx: CanvasRenderingContext2D, cell: Cell, size: number) {
    ctx.beginPath();
    const [x0, y0] = cell.poly[0];
    ctx.moveTo(x0 * size, y0 * size);
    for (let i = 1; i < cell.poly.length; i++) {
      ctx.lineTo(cell.poly[i][0] * size, cell.poly[i][1] * size);
    }
    ctx.closePath();
  }

  render(ctx: CanvasRenderingContext2D, state: PuzzleState, board?: { x: number; y: number; size: number }) {
    const b = board || this.board;
    const s = b.size;
    this.buildCache(state);
    ctx.save();
    ctx.translate(b.x, b.y);
    if (this.cache) {
      ctx.drawImage(this.cache, 0, 0, s, s);
    }
    for (const [id, rot] of state.rotations) {
      if (rot === 0) continue;
      const cell = state.grid.cells.find(c => c.id === id);
      if (!cell) continue;
      this.drawCell(ctx, state.image, cell, rot, s, state.highlights.has(id), state.baseRotation ?? 0, state.boldGrid ?? false);
    }
    for (const id of state.highlights) {
      const cell = state.grid.cells.find(c => c.id === id);
      if (!cell) continue;
      ctx.strokeStyle = "#ffd94d";
      ctx.lineWidth = 3;
      this.cellPath(ctx, cell, s);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawCell(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cell: Cell, rot: number, size: number, highlight: boolean, baseRot = 0, bold = false) {
    ctx.save();
    this.cellPath(ctx, cell, size);
    ctx.clip();
    const cx = cell.cx * size, cy = cell.cy * size;
    ctx.translate(cx, cy);
    ctx.rotate(rot * Math.PI / 180);
    ctx.translate(-cx, -cy);
    ctx.translate(size / 2, size / 2);
    ctx.rotate(baseRot * Math.PI / 180);
    ctx.translate(-size / 2, -size / 2);
    ctx.drawImage(img, 0, 0, size, size);
    ctx.restore();
    const stroke = this.gridStroke(highlight, bold);
    ctx.strokeStyle = stroke.style;
    ctx.lineWidth = stroke.width;
    this.cellPath(ctx, cell, size);
    ctx.stroke();
  }

  hitTest(state: PuzzleState, px: number, py: number): number {
    const b = this.board;
    const s = b.size;
    const ux = (px - b.x) / s, uy = (py - b.y) / s;
    if (ux < 0 || ux > 1 || uy < 0 || uy > 1) return -1;
    for (const cell of state.grid.cells) {
      if (pointInPoly(ux, uy, cell.poly)) return cell.id;
    }
    return -1;
  }
}

function pointInPoly(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}