import { buildGrid } from "../../core/grid";
import type { LevelData, Grid } from "../../core/types";
import { PuzzleRenderer, PuzzleState } from "../shared/renderer";
import { loadImage } from "../shared/images";
import { sfx } from "../shared/audio";
import * as tween from "../shared/tween";
import * as save from "../shared/save";
import { setScreen, showModal, hideModal, toast } from "../shared/ui";
import levels from "../../levels/levels.json";

export class CampaignSession {
  get renderer() { return this._renderer; }
  get grid() { return this.grid_; }
  get rotations() { return this.rotations_; }
  public _renderer = new PuzzleRenderer();
  public grid_: Grid | null = null;
  public rotations_ = new Map<number, number>();
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private levelId = 1;
  private levelData: LevelData | null = null;
  private touched = new Set<number>();
  private image: HTMLImageElement | null = null;
  private running = false;
  private elapsed = 0;
  private clicks = 0;
  private hintsUsed = 0;
  private highlightTarget = -1;
  private highlightTimer = 0;
  private onExit: () => void;
  private lastUpdate = 0;
  private animating = false;

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, levelId: number, onExit: () => void) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.levelId = levelId;
    this.onExit = onExit;
    this._renderer.layout(canvas.width, canvas.height, 60);
    document.getElementById("hud")!.addEventListener("pointerdown", (e) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest) return;
      if (t.closest("#back-btn")) { this.running = false; this.onExit(); }
      if (t.closest("#reset-btn")) this.reset();
      if (t.closest("#hint-btn")) this.useHint();
    });
  }

  async start() {
    const lvl = (levels as LevelData[]).find(l => l.id === this.levelId);
    if (!lvl) { toast("关卡不存在"); return; }
    this.levelData = lvl;
    this.grid_ = buildGrid(lvl.grid as any);
    this.image = await loadImage(lvl.image);
    this._renderer.invalidate();
    this._renderer.layout(this.canvas.width, this.canvas.height, 60);
    this.rotations_ = new Map(lvl.targets.map(t => [t.cellId, t.rotation]));
    this.touched = new Set();
    this.elapsed = 0;
    this.clicks = 0;
    this.hintsUsed = 0;
    this.running = true;
    this.lastUpdate = performance.now();
    this.renderHUD();
    requestAnimationFrame(this.loop.bind(this));
  }

  private loop(time: number) {
    if (!this.running) return;
    const dt = time - this.lastUpdate;
    this.lastUpdate = time;
    this.elapsed += dt;
    this.highlightTimer -= dt;
    if (this.highlightTimer <= 0) this.highlightTarget = -1;
    if (!this.animating) {
      tween.update(dt);
      this.renderHUD();
      this.render();
    }
    requestAnimationFrame(this.loop.bind(this));
  }

  private render() {
    if (!this.image || !this.grid || !this.levelData) return;
    const state: PuzzleState = {
      image: this.image, grid: this.grid,
      rotations: this.rotations,
      rotatable: true,
      highlights: this.highlightTarget >= 0 ? new Set([this.highlightTarget]) : new Set(),
    };
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this._renderer.render(this.ctx, state);
  }

  private renderHUD() {
    if (!this.levelData) return;
    const nT = this.levelData.targets.length;
    const fixed = this.levelData.targets.filter(t => {
      const r = this.rotations.get(t.cellId) ?? 0;
      return Math.abs(((r % 360) + 360) % 360) < 5;
    }).length;
    const count = this.levelData.mode.showTargetCount ? `已修复 ${fixed}/${nT}` : "";
    const hintLabel = "提示";
    const canHint = true;
    document.getElementById("hud")!.innerHTML = `
      <div class="hud-top" style="background:rgba(0,0,0,0.25);padding:clamp(6px,2vh,14px) clamp(10px,3vw,18px);padding-top:calc(env(safe-area-inset-top,0px) + clamp(6px,2vh,14px))">
        <button class="btn btn-sm" id="back-btn" style="padding:8px 14px;font-size:14px;font-weight:600;border-radius:10px">退出</button>
        <div class="hud-combo" style="font-size:clamp(16px,4vw,22px);font-weight:700;color:#ffd94d">${count || `第${this.levelId}关`}</div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-sm" id="reset-btn" style="padding:10px 18px;font-size:15px;font-weight:700">重置</button>
          ${hintLabel ? `<button class="btn btn-sm" id="hint-btn" style="padding:10px 18px;font-size:15px;font-weight:700" ${canHint ? "" : "disabled"}>提示</button>` : ''}
        </div>
      </div>`;
  }

  private reset() {
    if (!this.levelData || this.animating) return;
    this.rotations_ = new Map(this.levelData.targets.map(t => [t.cellId, t.rotation]));
    this.touched = new Set();
    this.highlightTarget = -1;
    this._renderer.invalidate();
    sfx.tap();
    this.render();
  }

  onTap(cellId: number) {
    if (!this.levelData || this.animating) return;
    this.clicks++;
    sfx.tap();
  }

  onRotate(cellId: number, rotation: number, phase: "move" | "end") {
    if (!this.levelData) return;
    if (phase === "move") {
      this.rotations.set(cellId, rotation);
    } else {
      this.clicks++;
      const snapped = Math.round(rotation / 15) * 15;
      const norm = ((snapped % 360) + 360) % 360;
      this.rotations.set(cellId, norm);
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

  private useHint() {
    if (!this.levelData) return;
    const unfixed = this.levelData.targets.filter(t => {
      const r = this.rotations.get(t.cellId) ?? 0;
      return Math.abs(((r % 360) + 360) % 360) >= 5;
    });
    if (unfixed.length === 0) return;
    this.hintsUsed++;
    this.highlightTarget = unfixed[0].cellId;
    this.highlightTimer = 1200;
  }

  private checkWin() {
    if (!this.levelData) return;
    const allFixed = this.levelData.targets.every(t => {
      const r = this.rotations.get(t.cellId) ?? 0;
      return Math.abs(((r % 360) + 360) % 360) < 5;
    });
    if (!allFixed) return;
    this.running = false;
    sfx.win();
    const t = this.levelData.targets.length;
    const starsC = this.clicks <= t ? 3 : this.clicks <= t * 3 ? 2 : this.clicks <= t * 6 ? 1 : 1;
    const starsT = this.elapsed <= this.levelData.star.time[0] ? 3 : this.elapsed <= this.levelData.star.time[1] ? 2 : 1;
    const stars = Math.min(starsC, starsT);
    save.setCampaignLevelStars(this.levelId, this.clicks, this.elapsed, stars);
    const next = this.levelId < 50 && this.levelId !== 3;
    const nextLabel = this.levelId === 3 ? "返回主页" : "下一关";
    const nextHandler = this.levelId === 3
      ? () => { hideModal(); this.onExit(); }
      : () => { hideModal(); this.levelId++; this.start(); };
    showModal(`
      <div class="overlay">
        <div class="overlay-panel">
          <div class="label">${'*'.repeat(stars)}${'*'.repeat(3-stars)}</div>
          <div class="label">${Math.round(this.elapsed/1000)}秒 | ${this.clicks}次点击</div>
          ${next ? `<button class="btn btn-primary" id="next-btn">${nextLabel}</button>` : ''}
          <button class="btn" id="retry-btn">重试</button>
          <span class="hint-link" id="exit-btn">选关</span>
        </div>
      </div>`);
    document.getElementById("next-btn")?.addEventListener("click", nextHandler);
    document.getElementById("retry-btn")?.addEventListener("click", () => { hideModal(); this.start(); });
    document.getElementById("exit-btn")?.addEventListener("click", () => { hideModal(); this.onExit(); });
  }

  resize() {
    this._renderer.layout(this.canvas.width, this.canvas.height, 60);
  }
}