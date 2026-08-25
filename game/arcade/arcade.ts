import { Rng } from "../../core/rng";
import { buildGrid } from "../../core/grid";
import { salience, S_MIN, downsampleLuma, extractCell } from "../../core/salience";
import { arcadeParams, pickShape, gridSpecForShape } from "../../core/difficulty";
import type { Grid, LumaMatrix, Cell } from "../../core/types";
import type { ManifestEntry } from "../../core/types";
import { PuzzleRenderer, PuzzleState } from "../shared/renderer";
import { loadImage, getLuma, preload } from "../shared/images";
import { sfx } from "../shared/audio";
import * as tween from "../shared/tween";
import * as save from "../shared/save";
import manifestData from "../../assets/manifest.json";

const SKIP_PENALTY = 100;

function variance(d: Float32Array, n: number): number {
  let mu = 0;
  for (let i = 0; i < n; i++) mu += d[i];
  mu /= n;
  let v = 0;
  for (let i = 0; i < n; i++) { const x = d[i] - mu; v += x * x; }
  return v / n;
}

function cellVariance(luma: LumaMatrix, cell: Cell): number {
  const { w, h, data } = extractCell(luma, cell, luma.w, luma.h);
  return variance(data, w * h);
}

interface ArcadeLevel {
  image: HTMLImageElement;
  luma: LumaMatrix;
  grid: Grid;
  cellId: number;
  rotation: number;
  baseRotation: number;
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
  private timeScale = 1;
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
  private totalLevels = 0;
  private lastUpdate = 0;

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, onExit: () => void) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.manifest = (manifestData as { images: ManifestEntry[] }).images;
    this.onExit = onExit;
    this.hudEl = document.getElementById("hud")!;
    this.uiEl = document.getElementById("ui")!;
    this.modalEl = document.getElementById("modal")!;
    this._renderer.layout(canvas.width, canvas.height, 80);
    this.hudEl.addEventListener("pointerdown", (e) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest && t.closest("#skip-btn")) this.skip();
    });
  }

  async start() {
    this.combo = 0;
    this.score = 0;
    this.totalLevels = 0;
    this.timeScale = save.getArcadeTime() / 8;
    this.timeLeft = save.getArcadeTime();
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
    const effectiveCombo = Math.max(combo, Math.floor(this.totalLevels * 0.5));
    const params = arcadeParams(effectiveCombo, save.isChaosUnlocked());
    const shape = pickShape(save.getUnlockedShapes(), save.isChaosUnlocked(), () => Math.random() * 12);
    const gridSpec = gridSpecForShape(shape, params.gridN, combo * 37 + 100);
    const grid = buildGrid(gridSpec as any);
    const tierPool = this.manifest.filter(e => e.tier === params.tier || (params.tier === "mid" && (e.tier === "strong" || e.tier === "mid")));

    let chosen: { entry: ManifestEntry; image: HTMLImageElement; luma: LumaMatrix; cellId: number; angle: number; s: number } | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const pool = tierPool.filter(e => !this.recentImages.includes(e.id));
      const entry = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : this.manifest[Math.floor(Math.random() * this.manifest.length)];
      const image = await loadImage(entry.file);
      const luma = await getLuma(entry.file);
      const work = downsampleLuma(luma, 540);
      const target = this.findTarget(work, grid, params.angles, save.getArcadeMinVar());
      if (!chosen || target.s > chosen.s) {
        chosen = { entry, image, luma, cellId: target.cellId, angle: target.angle, s: target.s };
      }
      if (target.s >= S_MIN) break;
    }

    const res = chosen!;
    this.recentImages.push(res.entry.id);
    if (this.recentImages.length > 6) this.recentImages.shift();
    const baseRotation = [0, 90, 180, 270][Math.floor(Math.random() * 4)];
    return { image: res.image, luma: res.luma, grid, cellId: res.cellId, rotation: res.angle, baseRotation, params, entry: res.entry };
  }

  private findTarget(luma: LumaMatrix, grid: Grid, angles: number[], varK: number): { cellId: number; angle: number; s: number } {
    const globalVar = variance(luma.data, luma.w * luma.h);
    const thresh = globalVar * varK;
    const shuffledCells = grid.cells.slice().sort(() => Math.random() - 0.5);
    const eligible: Cell[] = [];
    for (const cell of shuffledCells) {
      if (varK <= 0 || cellVariance(luma, cell) >= thresh) eligible.push(cell);
    }
    const samplePool = eligible.length > 0 ? eligible : shuffledCells;
    const sample = samplePool.slice(0, Math.min(samplePool.length, 16));

    const shuffledAngles = angles.slice().sort(() => Math.random() - 0.5);
    const tryAngles = shuffledAngles.slice(0, Math.min(5, shuffledAngles.length));
    let best = { cellId: grid.cells[0].id, angle: tryAngles[0] ?? 180, s: -1 };
    for (const angle of tryAngles) {
      let cellId = sample[0].id;
      let bestS = -1;
      for (const cell of sample) {
        const s = salience(luma, cell, angle).S;
        if (s > bestS && !(Math.abs(angle - 180) < 1 && s < 0.1)) { bestS = s; cellId = cell.id; }
      }
      if (bestS > best.s) best = { cellId, angle, s: bestS };
    }
    return best;
  }

  private async buildNext() {
    this.nextLevel = await this.buildLevel(this.combo + 1);
    preload(this.nextLevel.entry.file);
  }

  private loop(time: number) {
    if (!this.running) return;
    const dt = Math.min(time - this.lastUpdate, 50);
    this.lastUpdate = time;
    tween.update(dt);
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
      baseRotation: this.currentLevel.baseRotation,
      boldGrid: true,
    };
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.flashType === "wrong") {
      this.ctx.fillStyle = "rgba(200,50,50,0.15)";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this._renderer.render(this.ctx, state);
  }

  private renderHUD() {
    const pct = this.currentLevel ? Math.max(0, this.timeLeft / (this.currentLevel.params.timeLimit * this.timeScale)) * 100 : 100;
    const g = this.currentLevel?.grid;
    const gridLabel = g ? (g.type === "square" ? `${g.param}×${g.param}` : `${g.cells.length}`) : "";
    this.hudEl.innerHTML = `
      <div class="hud-top">
        <div class="hud-grid">${gridLabel} · ${this.totalLevels + 1}</div>
        <div class="hud-combo">${this.combo > 0 ? `x${this.combo}` : ""}</div>
        <div class="hud-score">${this.score}</div>
      </div>
      <div style="padding:0 16px;width:100%">
        <div class="hud-timer">
          <div class="hud-timer-bar ${pct < 30 ? "danger" : ""}" style="width:${pct}%"></div>
        </div>
      </div>
      <div style="position:absolute;bottom:calc(env(safe-area-inset-bottom,0px) + 14px);left:0;right:0;display:flex;justify-content:center;">
        <button class="btn btn-sm" id="skip-btn">跳过</button>
      </div>`;
  }

  onTap(cellId: number) {
    if (this.advancing || !this.currentLevel || !this.running) return;
    if (cellId === this.currentLevel.cellId) {
      sfx.correct(this.combo);
      this.combo++;
      this.totalLevels++;
      this.score += 100 + this.combo * 25;
      this.timeLeft = Math.min(this.timeLeft + 2.5 * this.timeScale, 20 * this.timeScale);
      this.flashType = "correct";
      this.flashTimer = 200;
      this.advancing = true;
      const startRot = this.currentLevel.rotation;
      tween.add(600, 0, 1, (t) => {
        this.currentLevel!.rotation = startRot * (1 - t);
      }, () => this.advance());
    } else {
      sfx.wrong();
      this.timeLeft -= 1.5;
      this.combo = 0;
      this.flashType = "wrong";
      this.flashTimer = 300;
    }
  }

  private skip() {
    if (!this.running || this.advancing || !this.currentLevel) return;
    this.combo = 0;
    this.score = Math.max(0, this.score - SKIP_PENALTY);
    sfx.skip();
    this.advance();
  }

  private advance() {
    this.advancing = false;
    if (this.nextLevel) {
      this.currentLevel = this.nextLevel;
      this.nextLevel = null;
      this.buildNext();
    }
    if (this.currentLevel) {
      this.timeLeft = this.currentLevel.params.timeLimit * this.timeScale;
    }
  }

  private gameOver() {
    this.running = false;
    sfx.lose();
    save.setArcadeResult(this.score, this.combo);
    this.renderAnswer();
    this.showGameOverModal();
  }

  private renderAnswer() {
    const lvl = this.currentLevel;
    if (!lvl) return;
    const state: PuzzleState = {
      image: lvl.image,
      grid: lvl.grid,
      rotations: new Map([[lvl.cellId, lvl.rotation]]),
      rotatable: false,
      highlights: new Set([lvl.cellId]),
      baseRotation: lvl.baseRotation,
      boldGrid: true,
    };
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this._renderer.render(this.ctx, state);
  }

  private showGameOverModal() {
    const best = save.getArcadeBest();
    this.hudEl.innerHTML = "";
    this.modalEl.innerHTML = `
      <div class="overlay" style="background:rgba(0,0,0,.45)">
        <div class="overlay-panel">
          <div class="label">游戏结束</div>
          <div class="big">${this.score}</div>
          <div class="label">连击 x${this.combo}</div>
          <div class="row">
            <div><div class="label">最高分</div><div class="big" style="font-size:24px">${best.bestScore}</div></div>
            <div><div class="label">最高连击</div><div class="big" style="font-size:24px">x${best.bestCombo}</div></div>
          </div>
          <button class="btn" id="show-answer-btn">显示答案</button>
          <button class="btn btn-primary" id="revive-btn">复活</button>
          <button class="btn" id="restart-btn">再来一局</button>
          <span class="hint-link" id="exit-btn">主页</span>
        </div>
      </div>`;
    document.getElementById("show-answer-btn")!.onclick = () => this.revealAnswer();
    document.getElementById("revive-btn")!.onclick = () => this.revive();
    document.getElementById("restart-btn")!.onclick = () => { this.modalEl.innerHTML = ""; this.start(); };
    document.getElementById("exit-btn")!.onclick = () => { this.modalEl.innerHTML = ""; this.hudEl.innerHTML = ""; this.onExit(); };
  }

  private revive() {
    this.score = 0;
    this.combo = 0;
    this.timeLeft = (this.currentLevel?.params.timeLimit ?? 8) * this.timeScale;
    this.running = true;
    this.modalEl.innerHTML = "";
    this.hudEl.innerHTML = "";
    this.lastUpdate = performance.now();
    requestAnimationFrame(this.loop.bind(this));
  }

  private revealAnswer() {
    this.modalEl.innerHTML = "";
    this.hudEl.innerHTML = `
      <div class="hud-top" style="justify-content:flex-end">
        <div class="hud-grid" style="text-align:left;flex:1;padding-left:12px">答案</div>
        <button class="btn btn-sm" id="back-answer-btn">返回</button>
      </div>`;
    document.getElementById("back-answer-btn")!.onclick = () => this.showGameOverModal();
  }

  resize() {
    this._renderer.layout(this.canvas.width, this.canvas.height, 80);
  }
}