import { Rng, hashString } from "../../core/rng";
import { buildGrid } from "../../core/grid";
import { salience, S_MIN, downsampleLuma } from "../../core/salience";
import type { LumaMatrix, LevelData } from "../../core/types";
import type { Manifest } from "../../core/types";
import { PuzzleRenderer, PuzzleState } from "../shared/renderer";
import { loadImage, getLuma, preload } from "../shared/images";
import { sfx } from "../shared/audio";
import * as tween from "../shared/tween";
import * as save from "../shared/save";
import { showModal, hideModal, setScreen, setHud, formatTime, toast } from "../shared/ui";
import manifest from "../../assets/manifest.json";

export class DailySession {
  get renderer() { return this._renderer; }
  get grid() { return this.grid_; }
  public _renderer = new PuzzleRenderer();
  public grid_: ReturnType<typeof buildGrid> | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private onExit: () => void;
  private levels: LevelData[] = [];
  private currentIdx = 0;
  private image: HTMLImageElement | null = null;
  private rotations = new Map<number, number>();
  private running = false;
  private totalTimeMs = 0;
  private lastUpdate = 0;
  private dateStr = "";
  private manifest = (manifest as Manifest).images;

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, onExit: () => void) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.onExit = onExit;
    this._renderer.layout(canvas.width, canvas.height, 60);
  }

  async start() {
    this.dateStr = save.todayStr();
    const seed = hashString(this.dateStr);
    const rng = new Rng(seed);
    const params = [
      { shape: "square", n: 3, tier: "strong", angles: [180] },
      { shape: "square", n: 3, tier: "strong", angles: [180, 90] },
      { shape: "square", n: 4, tier: "strong", angles: [90, 180, 270] },
      { shape: "hex", n: 3, tier: "strong", angles: [180, 90, 270] },
      { shape: "square", n: 4, tier: "mid", angles: [90, 180, 270] },
      { shape: "hex", n: 3, tier: "mid", angles: [90, 180, 270] },
      { shape: "square", n: 5, tier: "mid", angles: [90, 180, 270] },
      { shape: "tri", n: 3, tier: "mid", angles: [90, 180, 270] },
      { shape: "square", n: 5, tier: "mid", angles: [30, 45, 90, 180, 270] },
      { shape: "square", n: 5, tier: "mid", angles: [30, 45, 90, 180, 270] },
    ];
    const pool = this.manifest.filter(e => e.tier === "strong" || e.tier === "mid");
    for (let i = 0; i < 10; i++) {
      const p = params[i];
      const entry = rng.pick(pool);
      const grid = buildGrid({ type: p.shape as any, seed: rng.next() * 100000 | 0, param: p.n });
      const angle = rng.pick(p.angles);
      const cells = rng.shuffle(grid.cells);
      const img = await loadImage(entry.file);
      const luma = await getLuma(entry.file);
      let bestCell = cells[0], bestS = 0;
      for (const cell of cells.slice(0, 12)) {
        const s = salience(luma, cell, angle).S;
        if (s > bestS) { bestS = s; bestCell = cell; }
      }
      this.levels.push({
        id: i + 1, difficulty: 3, image: entry.file,
        grid: { type: p.shape as any, seed: 0, param: p.n },
        targets: [{ cellId: bestCell.id, rotation: angle }],
        mode: { autoSnap: true, showTargetCount: false },
        limits: { timeLimit: null, hints: 0 },
        star: { clicks: [1, 3, 6], time: [5, 15, 30] },
        meta: { S: bestS, C: 0, V_image: entry.V_image }
      });
    }
    this.currentIdx = 0;
    this.totalTimeMs = 0;
    this.running = true;
    this.lastUpdate = performance.now();
    this.loadLevel(0);
    requestAnimationFrame(this.loop.bind(this));
  }

  private async loadLevel(idx: number) {
    const lvl = this.levels[idx];
    this.image = await loadImage(lvl.image);
    this.grid_ = buildGrid(lvl.grid as any);
    this.rotations = new Map(lvl.targets.map(t => [t.cellId, t.rotation]));
    this._renderer.invalidate();
    this._renderer.layout(this.canvas.width, this.canvas.height, 60);
    this.renderHUD();
  }

  private loop(time: number) {
    if (!this.running) return;
    const dt = time - this.lastUpdate;
    this.lastUpdate = time;
    this.totalTimeMs += dt;
    this.renderHUD();
    this.render();
    requestAnimationFrame(this.loop.bind(this));
  }

  private render() {
    if (!this.image || !this.grid) return;
    const state: PuzzleState = {
      image: this.image, grid: this.grid, rotations: this.rotations,
      rotatable: false, highlights: new Set(),
    };
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this._renderer.render(this.ctx, state);
  }

  private renderHUD() {
    document.getElementById("hud")!.innerHTML = `
      <div class="hud-top">
        <button class="btn btn-icon" id="cancel-btn">x</button>
        <div class="hud-combo" style="font-size:16px;color:#8b93a5">${this.currentIdx + 1}/10</div>
        <div class="hud-score">${formatTime(this.totalTimeMs)}</div>
      </div>`;
    document.getElementById("cancel-btn")!.onclick = () => { this.running = false; this.onExit(); };
  }

  onTap(cellId: number) {
    if (!this.levels[this.currentIdx]) return;
    const target = this.levels[this.currentIdx].targets.find(t => t.cellId === cellId);
    if (target) {
      sfx.correct(this.currentIdx);
      this.rotations.set(cellId, 0);
      setTimeout(() => {
        this.currentIdx++;
        if (this.currentIdx >= 10) {
          this.finish();
        } else {
          this.loadLevel(this.currentIdx);
        }
      }, 200);
    } else {
      sfx.wrong();
      this.totalTimeMs += 5000;
    }
  }

  private finish() {
    this.running = false;
    sfx.win();
    save.setDailyResult(this.dateStr, this.totalTimeMs);
    const state = save.getDailyState();
    showModal(`
      <div class="overlay">
        <div class="overlay-panel">
          <div class="label">Daily Challenge</div>
          <div class="big">${formatTime(this.totalTimeMs)}</div>
          <div class="label">${this.dateStr}</div>
          <button class="btn btn-primary" id="share-btn">Save Score Card</button>
          <button class="btn" id="retry-btn">Retry</button>
          <span class="hint-link" id="exit-btn">Home</span>
        </div>
      </div>`);
    document.getElementById("share-btn")?.addEventListener("click", () => this.shareScore());
    document.getElementById("retry-btn")?.addEventListener("click", () => { hideModal(); this.start(); });
    document.getElementById("exit-btn")?.addEventListener("click", () => { hideModal(); this.onExit(); });
  }

  private shareScore() {
    const c = document.createElement("canvas");
    c.width = 720; c.height = 1080;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#1a1e26";
    ctx.fillRect(0, 0, 720, 1080);
    ctx.fillStyle = "#ffd94d";
    ctx.font = "bold 48px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Wrong Rotation", 360, 180);
    ctx.fillStyle = "#e9ecf2";
    ctx.font = "28px system-ui";
    ctx.fillText("Daily Challenge", 360, 240);
    ctx.fillStyle = "#8b93a5";
    ctx.font = "24px system-ui";
    ctx.fillText(this.dateStr, 360, 300);
    ctx.fillStyle = "#ffd94d";
    ctx.font = "bold 72px system-ui";
    ctx.fillText(formatTime(this.totalTimeMs), 360, 480);
    ctx.fillStyle = "#e9ecf2";
    ctx.font = "20px system-ui";
    ctx.fillText("Come challenge the same puzzle tomorrow!", 360, 640);
    const link = document.createElement("a");
    link.download = `odd-rotation-daily-${this.dateStr}.png`;
    link.href = c.toDataURL("image/png");
    link.click();
    toast("Score card saved!");
  }

  resize() { this._renderer.layout(this.canvas.width, this.canvas.height, 60); }
}