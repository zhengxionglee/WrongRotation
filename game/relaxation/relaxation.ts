import { buildGrid } from "../../core/grid";
import { salience, S_MIN, downsampleLuma } from "../../core/salience";
import type { LumaMatrix, LevelData } from "../../core/types";
import type { Manifest } from "../../core/types";
import { PuzzleRenderer, PuzzleState } from "../shared/renderer";
import { loadImage, getLuma } from "../shared/images";
import { sfx } from "../shared/audio";
import * as tween from "../shared/tween";
import * as save from "../shared/save";
import { showModal, hideModal, setScreen, setHud, formatTime, toast } from "../shared/ui";
import relaxImages from "../../assets/relax/manifest.json";

interface RelaxEntry { file: string; size: number; }

export class RelaxationSession {
  get renderer() { return this._renderer; }
  get grid() { return this.grid_; }
  get rotations() { return this.rotations_; }
  public _renderer = new PuzzleRenderer();
  public grid_: ReturnType<typeof buildGrid> | null = null;
  public rotations_ = new Map<number, number>();
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private onExit: () => void;
  private levels: LevelData[] = [];
  private currentIdx = 0;
  private image: HTMLImageElement | null = null;
  private running = false;
  private totalTimeMs = 0;
  private lastUpdate = 0;
  private hudEl: HTMLElement;
  private modalEl: HTMLElement;
  private manifest = relaxImages as RelaxEntry[];
  private clicks = 0;
  private touched = new Set<number>();
  private animating = false;

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, onExit: () => void) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.onExit = onExit;
    this.hudEl = document.getElementById("hud")!;
    this.modalEl = document.getElementById("modal")!;
    this._renderer.layout(canvas.width, canvas.height, 60);
    this.hudEl.addEventListener("pointerdown", (e) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest) return;
      if (t.closest("#cancel-btn")) { this.running = false; this.onExit(); }
      if (t.closest("#reset-btn")) this.resetLevel();
      if (t.closest("#skip-btn")) this.skipLevel();
    });
  }

  async start() {
    const pool = this.manifest.slice().sort(() => Math.random() - 0.5);
    const n = Math.min(15, pool.length);
    this.levels = [];
    for (let i = 0; i < n; i++) {
      const entry = pool[i];
      const grid = buildGrid({ type: "square", seed: Math.random() * 100000 | 0, param: 4 });
      const angle = [90, 180, 270][Math.floor(Math.random() * 3)];
      const cells = grid.cells.slice().sort(() => Math.random() - 0.5);
      const img = await loadImage(entry.file);
      const luma = await getLuma(entry.file);
      let bestCell = cells[0], bestS = 0;
      for (const cell of cells) {
        const s = salience(luma, cell, angle).S;
        if (s > bestS) { bestS = s; bestCell = cell; }
      }
      this.levels.push({
        id: i + 1, difficulty: 1, image: entry.file,
        grid: { type: "square", seed: 0, param: 4 },
        targets: [{ cellId: bestCell.id, rotation: angle }],
        mode: { autoSnap: false, showTargetCount: true },
        limits: { timeLimit: null, hints: 0 },
        star: { clicks: [1, 3, 6], time: [5, 15, 30] },
        meta: { S: bestS, C: 0, V_image: 0 }
      });
    }
    this.currentIdx = 0;
    this.totalTimeMs = 0;
    this.clicks = 0;
    this.touched = new Set();
    this.animating = false;
    this.running = true;
    this.lastUpdate = performance.now();
    this.loadLevel(0);
    requestAnimationFrame(this.loop.bind(this));
  }

  private async loadLevel(idx: number) {
    const lvl = this.levels[idx];
    this.image = await loadImage(lvl.image);
    this.grid_ = buildGrid(lvl.grid as any);
    this.rotations_ = new Map(lvl.targets.map(t => [t.cellId, t.rotation]));
    this.clicks = 0;
    this.touched = new Set();
    this.animating = false;
    this._renderer.invalidate();
    this._renderer.layout(this.canvas.width, this.canvas.height, 60);
    this.renderHUD();
  }

  private loop(time: number) {
    if (!this.running) return;
    const dt = time - this.lastUpdate;
    this.lastUpdate = time;
    this.totalTimeMs += dt;
    if (!this.animating) {
      tween.update(dt);
      this.renderHUD();
      this.render();
    }
    requestAnimationFrame(this.loop.bind(this));
  }

  private render() {
    if (!this.image || !this.grid) return;
    const state: PuzzleState = {
      image: this.image, grid: this.grid, rotations: this.rotations_,
      rotatable: true, boldGrid: true, highlights: new Set(),
    };
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this._renderer.render(this.ctx, state);
  }

  private renderHUD() {
    if (!this.levels[this.currentIdx]) return;
    const lvl = this.levels[this.currentIdx];
    const nT = lvl.targets.length;
    const fixed = lvl.targets.filter(t => {
      const r = this.rotations_.get(t.cellId) ?? 0;
      return Math.abs(((r % 360) + 360) % 360) < 5;
    }).length;
    const g = this.grid_;
    const gridLabel = g ? (g.type === "square" ? `${g.param}×${g.param}` : `${g.cells.length}`) : "";
    this.hudEl.innerHTML = `
      <div class="hud-top" style="background:rgba(0,0,0,0.25);padding:clamp(6px,2vh,14px) clamp(10px,3vw,18px);padding-top:calc(env(safe-area-inset-top,0px) + clamp(6px,2vh,14px))">
        <button class="btn btn-icon" id="cancel-btn" style="width:48px;height:48px;font-size:22px;border-radius:14px;font-weight:700">x</button>
        <div style="flex:1;text-align:center">
          <div style="font-size:clamp(16px,4vw,22px);font-weight:700;color:#ffd94d">${this.currentIdx + 1}/${this.levels.length}</div>
          <div style="font-size:clamp(12px,2.5vw,15px);color:#8b93a5">已修复 ${fixed}/${nT} · ${gridLabel}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-sm" id="skip-btn" style="padding:10px 18px;font-size:15px;font-weight:700">跳过</button>
          <button class="btn btn-sm" id="reset-btn" style="padding:10px 18px;font-size:15px;font-weight:700">重置</button>
        </div>
      </div>`;
  }

  onTap(cellId: number) {
    if (!this.levels[this.currentIdx] || this.animating) return;
    this.clicks++;
    sfx.tap();
  }

  onRotate(cellId: number, rotation: number, phase: "move" | "end") {
    if (!this.levels[this.currentIdx]) return;
    if (phase === "move") {
      this.rotations_.set(cellId, rotation);
    } else {
      this.clicks++;
      const snapped = Math.round(rotation / 15) * 15;
      const norm = ((snapped % 360) + 360) % 360;
      this.rotations_.set(cellId, norm);
      if (norm === 0) {
        this.touched.add(cellId);
        sfx.correct(this.clicks);
      } else {
        this.touched.add(cellId);
        sfx.tap();
      }
      this.checkWin();
    }
  }

  private resetLevel() {
    if (!this.levels[this.currentIdx] || this.animating) return;
    const lvl = this.levels[this.currentIdx];
    this.rotations_ = new Map(lvl.targets.map(t => [t.cellId, t.rotation]));
    this.touched = new Set();
    this._renderer.invalidate();
    sfx.tap();
    this.render();
  }

  private skipLevel() {
    if (!this.levels[this.currentIdx] || this.animating) return;
    this.currentIdx++;
    if (this.currentIdx >= this.levels.length) {
      this.finish();
    } else {
      this.loadLevel(this.currentIdx);
    }
  }

  private checkWin() {
    const lvl = this.levels[this.currentIdx];
    if (!lvl) return;
    const allFixed = lvl.targets.every(t => {
      const r = this.rotations_.get(t.cellId) ?? 0;
      return Math.abs(((r % 360) + 360) % 360) < 5;
    });
    if (!allFixed) return;
    this.animating = true;
    setTimeout(() => {
      this.animating = false;
      this.currentIdx++;
      if (this.currentIdx >= this.levels.length) {
        this.finish();
      } else {
        this.loadLevel(this.currentIdx);
      }
    }, 400);
  }

  private finish() {
    this.running = false;
    sfx.win();
    this.hudEl.innerHTML = "";
    this.modalEl.innerHTML = `
      <div class="overlay">
        <div class="overlay-panel">
          <div class="label">休闲</div>
          <div class="big">${formatTime(this.totalTimeMs)}</div>
          <button class="btn btn-primary" id="restart-btn">再来一次</button>
          <span class="hint-link" id="exit-btn">主页</span>
        </div>
      </div>`;
    document.getElementById("restart-btn")!.onclick = () => { hideModal(); this.start(); };
    document.getElementById("exit-btn")!.onclick = () => { hideModal(); this.onExit(); };
  }

  resize() { this._renderer.layout(this.canvas.width, this.canvas.height, 60); }
}