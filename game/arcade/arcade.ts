import { Rng } from "../../core/rng";
import { buildGrid } from "../../core/grid";
import { salience, S_MIN, downsampleLuma } from "../../core/salience";
import { arcadeParams, pickShape, gridSpecForShape } from "../../core/difficulty";
import type { Grid, LumaMatrix } from "../../core/types";
import type { ManifestEntry } from "../../core/types";
import { PuzzleRenderer, PuzzleState } from "../shared/renderer";
import { loadImage, getLuma, preload } from "../shared/images";
import { sfx } from "../shared/audio";
import * as tween from "../shared/tween";
import * as save from "../shared/save";

interface ArcadeLevel {
  image: HTMLImageElement;
  luma: LumaMatrix;
  grid: Grid;
  cellId: number;
  rotation: number;
  params: ReturnType<typeof arcadeParams>;
  entry: ManifestEntry;
}

export class ArcadeSession {
  get renderer() { return this._renderer; }
  get grid() { return this.currentLevel?.grid ?? null; }
  get rotations() { return this.currentLevel ? new Map([[this.currentLevel.cellId, this.currentLevel.rotation]]) : new Map(); }
  public _renderer = new PuzzleRenderer();
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private combo = 0;
  private score = 0;
  private timeLeft = 8;
  private running = false;
  private currentLevel: ArcadeLevel | null = null;
  private nextLevel: ArcadeLevel | null = null;
  private hudEl: HTMLElement;
  private uiEl: HTMLElement;
  private modalEl: HTMLElement;
  private onExit: () => void;
  private flashTimer = 0;
  private flashType: "correct" | "wrong" | "none" = "none";
  private advancing = false;
  private manifest: ManifestEntry[];
  private recentImages: number[] = [];
  private lastUpdate = 0;

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, manifest: ManifestEntry[], onExit: () => void) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.manifest = manifest;
    this.onExit = onExit;
    this.hudEl = document.getElementById("hud")!;
    this.uiEl = document.getElementById("ui")!;
    this.modalEl = document.getElementById("modal")!;
    this._renderer.layout(canvas.width, canvas.height, 80);
  }

  async start() {
    this.combo = 0;
    this.score = 0;
    this.timeLeft = 8;
    this.running = true;
    this.recentImages = [];
    this.currentLevel = await this.buildLevel(0);
    this._renderer.layout(this.canvas.width, this.canvas.height, 80);
    this.buildNext();
    this.renderHUD();
    this.lastUpdate = performance.now();
    requestAnimationFrame(this.loop.bind(this));
  }

  private async buildLevel(combo: number): Promise<ArcadeLevel> {
    const params = arcadeParams(combo, save.isChaosUnlocked());
    const shape = pickShape(save.getUnlockedShapes(), save.isChaosUnlocked(), () => Math.random() * 12);
    const gridSpec = gridSpecForShape(shape, params.gridN, combo * 37 + 100);
    const grid = buildGrid(gridSpec as any);
    const tierPool = this.manifest.filter(e => e.tier === params.tier || (params.tier === "mid" && (e.tier === "strong" || e.tier === "mid")));
    const pool = tierPool.filter(e => !this.recentImages.includes(e.id));
    const entry = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : this.manifest[Math.floor(Math.random() * this.manifest.length)];
    this.recentImages.push(entry.id);
    if (this.recentImages.length > 6) this.recentImages.shift();
    const image = await loadImage(entry.file);
    const luma = await getLuma(entry.file);
    const angle = params.angles[Math.floor(Math.random() * params.angles.length)];
    const cells = grid.cells.slice().sort(() => Math.random() - 0.5);
    let cellId = cells[0].id;
    let bestS = 0;
    for (const cell of cells) {
      const s = salience(luma, cell, angle).S;
      if (s > bestS) { bestS = s; cellId = cell.id; }
    }
    return { image, luma, grid, cellId, rotation: angle, params, entry };
  }

  private async buildNext() {
    this.nextLevel = await this.buildLevel(this.combo + 1);
    preload(this.nextLevel.entry.file);
  }

  private loop(time: number) {
    if (!this.running) return;
    const dt = Math.min(time - this.lastUpdate, 50);
    this.lastUpdate = time;
    if (this.advancing) {
      this.renderHUD();
      this.render();
      requestAnimationFrame(this.loop.bind(this));
      return;
    }
    this.timeLeft -= dt / 1000;
    if (this.timeLeft <= 0) { this.timeLeft = 0; this.gameOver(); return; }
    if (this.timeLeft < 3 && Math.floor(this.timeLeft * 2) !== Math.floor((this.timeLeft + dt / 1000) * 2)) sfx.tick();
    if (this.flashTimer > 0) this.flashTimer -= dt;
    else this.flashType = "none";
    tween.update(dt);
    this.renderHUD();
    this.render();
    requestAnimationFrame(this.loop.bind(this));
  }

  private render() {
    if (!this.currentLevel) return;
    const state: PuzzleState = {
      image: this.currentLevel.image,
      grid: this.currentLevel.grid,
      rotations: new Map([[this.currentLevel.cellId, this.currentLevel.rotation]]),
      rotatable: false,
      highlights: new Set(),
    };
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.flashType === "wrong") {
      this.ctx.fillStyle = "rgba(200,50,50,0.15)";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this._renderer.render(this.ctx, state);
  }

  private renderHUD() {
    const pct = this.currentLevel ? Math.max(0, this.timeLeft / this.currentLevel.params.timeLimit) * 100 : 100;
    this.hudEl.innerHTML = `
      <div class="hud-top">
        <div style="width:44px"></div>
        <div class="hud-combo">${this.combo > 0 ? `x${this.combo}` : ""}</div>
        <div class="hud-score">${this.score}</div>
      </div>
      <div style="padding:0 16px;width:100%">
        <div class="hud-timer">
          <div class="hud-timer-bar ${pct < 30 ? "danger" : ""}" style="width:${pct}%"></div>
        </div>
      </div>`;
  }

  onTap(cellId: number) {
    if (this.advancing || !this.currentLevel || !this.running) return;
    if (cellId === this.currentLevel.cellId) {
      sfx.correct(this.combo);
      this.combo++;
      this.score += 100 + this.combo * 25;
      this.timeLeft = Math.min(this.timeLeft + 2.5, 20);
      this.flashType = "correct";
      this.flashTimer = 200;
      this.advancing = true;
      setTimeout(() => this.advance(), 220);
    } else {
      sfx.wrong();
      this.timeLeft -= 1.5;
      this.combo = 0;
      this.flashType = "wrong";
      this.flashTimer = 300;
    }
  }

  private advance() {
    this.advancing = false;
    if (this.nextLevel) {
      this.currentLevel = this.nextLevel;
      this.nextLevel = null;
      this.buildNext();
    }
    if (this.currentLevel) {
      this.timeLeft = this.currentLevel.params.timeLimit;
    }
  }

  private gameOver() {
    this.running = false;
    sfx.lose();
    save.setArcadeResult(this.score, this.combo);
    const best = save.getArcadeBest();
    this.hudEl.innerHTML = "";
    this.modalEl.innerHTML = `
      <div class="overlay">
        <div class="overlay-panel">
          <div class="label">Game Over</div>
          <div class="big">${this.score}</div>
          <div class="label">Combo x${this.combo}</div>
          <div class="row">
            <div><div class="label">Best Score</div><div class="big" style="font-size:24px">${best.bestScore}</div></div>
            <div><div class="label">Best Combo</div><div class="big" style="font-size:24px">x${best.bestCombo}</div></div>
          </div>
          <button class="btn btn-primary" id="restart-btn">Play Again</button>
          <span class="hint-link" id="exit-btn">Home</span>
        </div>
      </div>`;
    document.getElementById("restart-btn")!.onclick = () => { this.modalEl.innerHTML = ""; this.start(); };
    document.getElementById("exit-btn")!.onclick = () => { this.modalEl.innerHTML = ""; this.hudEl.innerHTML = ""; this.onExit(); };
  }

  resize() {
    this._renderer.layout(this.canvas.width, this.canvas.height, 80);
  }
}