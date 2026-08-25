import { buildGrid } from "../../core/grid";
import { salience, S_MIN, downsampleLuma } from "../../core/salience";
import type { LumaMatrix, LevelData } from "../../core/types";
import type { Manifest } from "../../core/types";
import { PuzzleRenderer, PuzzleState } from "../shared/renderer";
import { loadImage, getLuma, preload } from "../shared/images";
import { sfx } from "../shared/audio";
import * as tween from "../shared/tween";
import * as effects from "../shared/effects";
import * as save from "../shared/save";
import { showModal, hideModal, setScreen, setHud, formatTime, toast, confirmAction } from "../shared/ui";
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
  private highlightTarget = -1;
  private highlightTimer = 0;
  private manifest = (manifest as Manifest).images;

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, onExit: () => void) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.onExit = onExit;
    this._renderer.layout(canvas.width, canvas.height, 60);
    document.getElementById("hud")!.addEventListener("pointerdown", (e) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest) return;
      if (t.closest("#cancel-btn")) this.confirmExit();
      if (t.closest("#hint-btn")) this.useHint();
    });
  }

  async start() {
    const MICRO = [8, 14, 166, 173, 187, 194, 346, 352];
    const EXTRA = [5, 10, 170, 175, 185, 190, 350, 355];
    const params: { shape: string; n: number; tier: string; angles: number[] }[] = [
      { shape: "square", n: 6, tier: "weak", angles: MICRO },
      { shape: "hex", n: 5, tier: "weak", angles: MICRO },
      { shape: "tri", n: 5, tier: "weak", angles: MICRO },
      { shape: "voronoi", n: 24, tier: "weak", angles: MICRO },
      { shape: "square", n: 6, tier: "weak", angles: EXTRA },
      { shape: "voronoi", n: 28, tier: "weak", angles: MICRO },
      { shape: "hex", n: 5, tier: "weak", angles: EXTRA },
      { shape: "voronoi", n: 30, tier: "weak", angles: MICRO },
      { shape: "tri", n: 5, tier: "weak", angles: EXTRA },
      { shape: "voronoi", n: 30, tier: "weak", angles: [...MICRO, ...EXTRA] },
    ];
    const preloadTasks = params.map(async (p) => {
      const pool = this.manifest.filter(e => e.tier === p.tier || (p.tier === "mid" && (e.tier === "strong" || e.tier === "mid")));
      const entry = pool[Math.floor(Math.random() * pool.length)];
      const img = await loadImage(entry.file);
      const luma = await getLuma(entry.file);
      return { entry, img, luma };
    });
    const preloaded = await Promise.all(preloadTasks);
    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      const { entry, luma } = preloaded[i];
      const grid = buildGrid({ type: p.shape as any, seed: Math.random() * 100000 | 0, param: p.n });
      const cells = grid.cells.slice().sort(() => Math.random() - 0.5);
      const scored: { cellId: number; rotation: number; s: number }[] = [];
      for (const cell of cells.slice(0, 12)) {
        for (const angle of p.angles) {
          const s = salience(luma, cell, angle).S;
          if (Math.abs(angle - 180) < 1 && s < 0.1) continue;
          scored.push({ cellId: cell.id, rotation: angle, s });
        }
      }
      scored.sort((a, b) => b.s - a.s);
      const targets: { cellId: number; rotation: number }[] = [];
      const usedIds = new Set<number>();
      for (const c of scored) {
        if (usedIds.has(c.cellId)) continue;
        targets.push({ cellId: c.cellId, rotation: c.rotation });
        usedIds.add(c.cellId);
        if (targets.length >= 2) break;
      }
      while (targets.length < 2) {
        const cell = cells[targets.length];
        targets.push({ cellId: cell.id, rotation: p.angles[0] });
      }
      this.levels.push({
        id: i + 1, difficulty: 3, image: entry.file,
        grid: { type: p.shape as any, seed: 0, param: p.n },
        targets,
        mode: { autoSnap: true, showTargetCount: false },
        limits: { timeLimit: null, hints: 0 },
        star: { clicks: [1, 3, 6], time: [5, 15, 30] },
        meta: { S: scored[0]?.s ?? 0, C: 0, V_image: entry.V_image }
      });
    }
    this.currentIdx = 0;
    this.totalTimeMs = 0;
    this.running = true;
    effects.clearAll();
    this.lastUpdate = performance.now();
    this.loadLevel(0);
    requestAnimationFrame(this.loop.bind(this));
  }

  private async loadLevel(idx: number) {
    const lvl = this.levels[idx];
    this.image = await loadImage(lvl.image);
    this.grid_ = buildGrid(lvl.grid as any);
    this.rotations = new Map(lvl.targets.map(t => [t.cellId, t.rotation]));
    this.highlightTarget = -1;
    this.highlightTimer = 0;
    this._renderer.invalidate();
    this._renderer.layout(this.canvas.width, this.canvas.height, 60);
    this.renderHUD();
  }

  private loop(time: number) {
    if (!this.running) return;
    const dt = time - this.lastUpdate;
    this.lastUpdate = time;
    this.totalTimeMs += dt;
    this.highlightTimer -= dt;
    if (this.highlightTimer <= 0) this.highlightTarget = -1;
    effects.update(dt);
    this.renderHUD();
    this.render();
    requestAnimationFrame(this.loop.bind(this));
  }

  private render() {
    if (!this.image || !this.grid) return;
    const state: PuzzleState = {
      image: this.image, grid: this.grid, rotations: this.rotations,
      rotatable: false, boldGrid: true,
      highlights: this.highlightTarget >= 0 ? new Set([this.highlightTarget]) : new Set(),
    };
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this._renderer.render(this.ctx, state);
    effects.render(this.ctx);
  }

  private renderHUD() {
    const lvl = this.levels[this.currentIdx];
    const g = this.grid_;
    const gridLabel = g ? (g.type === "square" ? `${g.param}×${g.param}` : `${g.cells.length}`) : "";
    const fixed = lvl ? lvl.targets.filter(t => {
      const r = this.rotations.get(t.cellId) ?? 0;
      return Math.abs(((r % 360) + 360) % 360) < 5;
    }).length : 0;
    const nT = lvl ? lvl.targets.length : 2;
    document.getElementById("hud")!.innerHTML = `
      <div class="hud-top" style="background:rgba(0,0,0,0.25);padding:clamp(6px,2vh,14px) clamp(10px,3vw,18px);padding-top:calc(env(safe-area-inset-top,0px) + clamp(6px,2vh,14px))">
        <button class="btn btn-sm" id="cancel-btn" style="padding:10px 18px;font-size:15px;font-weight:700">退出</button>
        <div style="flex:1;text-align:center">
          <div style="font-size:clamp(16px,4vw,22px);font-weight:700;color:#ffd94d">${this.currentIdx + 1}/10 · 已修复 ${fixed}/${nT}</div>
          <div style="font-size:clamp(12px,2.5vw,15px);color:#8b93a5">${gridLabel} · ${formatTime(this.totalTimeMs)}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-sm" id="hint-btn" style="padding:10px 18px;font-size:15px;font-weight:700">提示</button>
        </div>
      </div>`;
  }

  private useHint() {
    const lvl = this.levels[this.currentIdx];
    if (!lvl || this.highlightTarget >= 0) return;
    const unfixed = lvl.targets.filter(t => {
      const r = this.rotations.get(t.cellId) ?? 0;
      return Math.abs(((r % 360) + 360) % 360) >= 5;
    });
    if (unfixed.length === 0) return;
    this.highlightTarget = unfixed[0].cellId;
    this.highlightTimer = 1500;
    sfx.tap();
  }

  private confirmExit() {
    if (!this.running) return;
    this.running = false; // pause while dialog is open
    confirmAction(
      "退出挑战？",
      "退出后本次挑战进度不会保存。",
      "退出",
      () => this.onExit(),
      () => {
        this.running = true;
        this.lastUpdate = performance.now();
        requestAnimationFrame(this.loop.bind(this));
      }
    );
  }

  onTap(cellId: number) {
    const lvl = this.levels[this.currentIdx];
    if (!lvl) return;
    const target = lvl.targets.find(t => t.cellId === cellId);
    if (target) {
      const r = this.rotations.get(cellId) ?? 0;
      if (Math.abs(((r % 360) + 360) % 360) < 5) return;
      sfx.correct(this.currentIdx);
      this.rotations.set(cellId, 0);
      const cell = this.grid_?.cells.find(c => c.id === cellId);
      if (cell) {
        const b = this._renderer.board;
        effects.firework(b.x + cell.cx * b.size, b.y + cell.cy * b.size);
      }
      const allFixed = lvl.targets.every(t => {
        const rr = this.rotations.get(t.cellId) ?? 0;
        return Math.abs(((rr % 360) + 360) % 360) < 5;
      });
      if (allFixed) {
        setTimeout(() => {
          this.currentIdx++;
          if (this.currentIdx >= this.levels.length) {
            this.finish();
          } else {
            this.loadLevel(this.currentIdx);
          }
        }, 400);
      }
    } else {
      sfx.wrong();
      this.totalTimeMs += 5000;
    }
  }

  private finish() {
    this.running = false;
    sfx.win();
    effects.celebration(this.canvas.width, this.canvas.height);
    save.setDailyResult("challenge", this.totalTimeMs);
    const state = save.getDailyState();
    showModal(`
      <div class="overlay">
        <div class="overlay-panel">
          <div class="label">挑战</div>
          <div class="big">${formatTime(this.totalTimeMs)}</div>
          <button class="btn btn-primary" id="share-btn">保存成绩卡</button>
          <button class="btn" id="retry-btn">重试</button>
          <span class="hint-link" id="exit-btn">主页</span>
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
    ctx.fillText("转错了", 360, 180);
    ctx.fillStyle = "#e9ecf2";
    ctx.font = "28px system-ui";
    ctx.fillText("挑战", 360, 240);
    ctx.fillStyle = "#ffd94d";
    ctx.font = "bold 72px system-ui";
    ctx.fillText(formatTime(this.totalTimeMs), 360, 480);
    ctx.fillStyle = "#e9ecf2";
    ctx.font = "20px system-ui";
    ctx.fillText("你能超越这个时间吗？", 360, 640);
    const link = document.createElement("a");
    link.download = `转错了-挑战.png`;
    link.href = c.toDataURL("image/png");
    link.click();
    toast("成绩卡已保存！");
  }

  resize() { this._renderer.layout(this.canvas.width, this.canvas.height, 60); }
}