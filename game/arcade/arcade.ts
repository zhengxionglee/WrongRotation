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
import { showModal, hideModal } from "../shared/ui";
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
  private paused = false;
  private manifest: ManifestEntry[];
  private recentImages: number[] = [];
  private totalLevels = 0;
  private lastUpdate = 0;
  private revivesUsed = 0;
  private maxRevives = 1;
  private lastCombo = 0;
  private comboBroken = false;

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
      if (t && t.closest) {
        if (t.closest("#skip-btn")) this.skip();
        if (t.closest("#item-time-15")) this.useTimeItem("time_15");
        if (t.closest("#item-time-30")) this.useTimeItem("time_30");
        if (t.closest("#item-time-60")) this.useTimeItem("time_60");
        if (t.closest("#item-combo-restore")) this.useComboRestore();
      }
    });
  }

  async start() {
    this.combo = 0;
    this.score = 0;
    this.totalLevels = 0;
    this.revivesUsed = 0;
    this.maxRevives = save.getMaxRevives();
    this.lastCombo = 0;
    this.comboBroken = false;
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
    if (this.advancing || this.paused) {
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
    const gridLabel = g ? (g.type === "square" ? `${g.param}脳${g.param}` : `${g.cells.length}`) : "";
    const items = save.getItems();
    const invHtml = [];
    if (items.time_15 > 0) invHtml.push(`<button class="btn btn-xs" id="item-time-15" style="padding:4px 8px;font-size:12px;border-radius:8px;background:#4ecdc4;color:#000;border:none">+15s x${items.time_15}</button>`);
    if (items.time_30 > 0) invHtml.push(`<button class="btn btn-xs" id="item-time-30" style="padding:4px 8px;font-size:12px;border-radius:8px;background:#4ecdc4;color:#000;border:none">+30s x${items.time_30}</button>`);
    if (items.time_60 > 0) invHtml.push(`<button class="btn btn-xs" id="item-time-60" style="padding:4px 8px;font-size:12px;border-radius:8px;background:#4ecdc4;color:#000;border:none">+60s x${items.time_60}</button>`);
    if (this.comboBroken && items.combo_restore > 0) invHtml.push(`<button class="btn btn-xs" id="item-combo-restore" style="padding:4px 8px;font-size:12px;border-radius:8px;background:#ffd94d;color:#000;border:none">鎭㈠杩炲嚮 x${items.combo_restore}</button>`);
    this.hudEl.innerHTML = `
      <div class="hud-top">
        <div style="display:flex;flex-direction:column;align-items:flex-start;gap:4px">
          <div class="hud-grid">${gridLabel} 路 ${this.totalLevels + 1}</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            ${invHtml.join("")}
            <button class="btn btn-xs" id="skip-btn" style="padding:4px 10px;font-size:11px;border-radius:6px;background:#22262e;color:#e9ecf2;border:none">璺宠繃</button>
          </div>
        </div>
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
      this.totalLevels++;
      this.score += 100 + this.combo * 25;
      this.timeLeft = Math.min(this.timeLeft + 2.5 * this.timeScale, 20 * this.timeScale);
      this.flashType = "correct";
      this.flashTimer = 200;
      this.advancing = true;
      const startRot = this.currentLevel.rotation;
      tween.add(600, 0, 1, (t) => {
        this.currentLevel!.rotation = startRot * (1 - t);
      }, () => {
        this.checkMilestone();
        this.checkComboMilestone();
        this.advance();
      });
    } else {
      this.lastCombo = this.combo;
      this.combo = 0;
      this.comboBroken = true;
      this.timeLeft -= 1.5;
      sfx.wrong();
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

  private checkMilestone() {
    const n = this.totalLevels;
    if (n === 10) {
      this.paused = true;
      this.maxRevives++;
      save.setMaxRevives(this.maxRevives);
      save.addItem("time_15", 2);
      showModal(`
        <div class="overlay" style="background:rgba(0,0,0,.45)">
          <div class="overlay-panel">
            <div class="big" style="font-size:28px;color:#ffd94d">澶浜嗭紒</div>
            <div class="label">宸茬獊鐮?10 鍏筹紝缁х画鍔犳补锛?/div>
            <div class="label" style="color:#4ecdc4;margin-top:8px">澶嶆椿娆℃暟 +1 路 +15s 閬撳叿 x2</div>
            <button class="btn btn-primary" id="milestone-ok-btn">缁х画</button>
          </div>
        </div>`);
      document.getElementById("milestone-ok-btn")!.onclick = () => { this.paused = false; hideModal(); };
    } else if (n === 25) {
      this.paused = true;
      this.maxRevives++;
      save.setMaxRevives(this.maxRevives);
      save.addItem("combo_shield", 1);
      showModal(`
        <div class="overlay" style="background:rgba(0,0,0,.45)">
          <div class="overlay-panel">
            <div class="big" style="font-size:28px;color:#ffd94d">鐏姏鍏ㄥ紑锛?/div>
            <div class="label">宸茬獊鐮?25 鍏筹紝鐘舵€佹瀬浣筹紒</div>
            <div class="label" style="color:#4ecdc4;margin-top:8px">澶嶆椿娆℃暟 +1 路 杩炲嚮鎶ょ浘 x1</div>
            <button class="btn btn-primary" id="milestone-ok-btn">缁х画</button>
          </div>
        </div>`);
      document.getElementById("milestone-ok-btn")!.onclick = () => { this.paused = false; hideModal(); };
    } else if (n === 50) {
      this.paused = true;
      save.addBadge("arcade_50");
      this.maxRevives++;
      save.setMaxRevives(this.maxRevives);
      save.addItem("time_30", 2);
      showModal(`
        <div class="overlay" style="background:rgba(0,0,0,.45)">
          <div class="overlay-panel">
            <div class="big" style="font-size:28px;color:#ffd94d">浼犲琛楁満鎵嬶紒</div>
            <div class="label">宸茬獊鐮?50 鍏筹紝浣犳槸浼犲锛?/div>
            <div class="label" style="color:#4ecdc4;margin-top:8px">澶嶆椿娆℃暟 +1 路 +30s 閬撳叿 x2 路 馃弳</div>
            <button class="btn btn-primary" id="milestone-ok-btn">缁х画</button>
          </div>
        </div>`);
      document.getElementById("milestone-ok-btn")!.onclick = () => { this.paused = false; hideModal(); };
    } else if (n > 50 && n % 25 === 0) {
      this.paused = true;
      this.maxRevives++;
      save.setMaxRevives(this.maxRevives);
      save.addItem("combo_restore", 1);
      this.paused = true;
      showModal(`
        <div class="overlay" style="background:rgba(0,0,0,.45)">
          <div class="overlay-panel">
            <div class="big" style="font-size:28px;color:#ffd94d">鍔夸笉鍙尅锛?/div>
            <div class="label">宸茬獊鐮?${n} 鍏筹紝鏃犱汉鑳芥尅锛?/div>
            <div class="label" style="color:#4ecdc4;margin-top:8px">澶嶆椿娆℃暟 +1 路 杩炲嚮鎭㈠ x1</div>
            <button class="btn btn-primary" id="milestone-ok-btn">缁х画</button>
          </div>
        </div>`);
      document.getElementById("milestone-ok-btn")!.onclick = () => { this.paused = false; hideModal(); };
    }
  }

  private checkComboMilestone() {
    const c = this.combo;
    if (c === 5) {
      save.addItem("time_15", 1);
      this.paused = true;
      showModal(`
        <div class="overlay" style="background:rgba(0,0,0,.45)">
          <div class="overlay-panel">
            <div class="big" style="font-size:28px;color:#ffd94d">5 杩炲嚮锛?/div>
            <div class="label">鎵嬫劅鐏儹锛岃幏寰?+15s 閬撳叿 x1</div>
            <button class="btn btn-primary" id="combo-ok-btn">缁х画</button>
          </div>
        </div>`);
      document.getElementById("combo-ok-btn")!.onclick = () => { this.paused = false; hideModal(); };
    } else if (c === 10) {
      save.addItem("combo_shield", 1);
      showModal(`
        <div class="overlay" style="background:rgba(0,0,0,.45)">
          <div class="overlay-panel">
            <div class="big" style="font-size:28px;color:#ffd94d">10 杩炲嚮锛?/div>
            <div class="label">鍔垮鐮寸锛岃幏寰楄繛鍑绘姢鐩?x1</div>
            <button class="btn btn-primary" id="combo-ok-btn">缁х画</button>
          </div>
        </div>`);
      document.getElementById("combo-ok-btn")!.onclick = () => { this.paused = false; hideModal(); };
    } else if (c === 20) {
      save.addItem("time_30", 1);
      this.paused = true;
      showModal(`
        <div class="overlay" style="background:rgba(0,0,0,.45)">
          <div class="overlay-panel">
            <div class="big" style="font-size:28px;color:#ffd94d">20 杩炲嚮锛?/div>
            <div class="label">鏃犱汉鑳芥尅锛岃幏寰?+30s 閬撳叿 x1</div>
            <button class="btn btn-primary" id="combo-ok-btn">缁х画</button>
          </div>
        </div>`);
      document.getElementById("combo-ok-btn")!.onclick = () => { this.paused = false; hideModal(); };
    } else if (c === 35) {
      save.addItem("combo_restore", 1);
      this.paused = true;
      showModal(`
        <div class="overlay" style="background:rgba(0,0,0,.45)">
          <div class="overlay-panel">
            <div class="big" style="font-size:28px;color:#ffd94d">35 杩炲嚮锛?/div>
            <div class="label">鐧诲嘲閫犳瀬锛岃幏寰楄繛鍑绘仮澶?x1</div>
            <button class="btn btn-primary" id="combo-ok-btn">缁х画</button>
          </div>
        </div>`);
      document.getElementById("combo-ok-btn")!.onclick = () => { this.paused = false; hideModal(); };
    } else if (c === 50) {
      save.addItem("time_60", 1);
      this.paused = true;
      showModal(`
        <div class="overlay" style="background:rgba(0,0,0,.45)">
          <div class="overlay-panel">
            <div class="big" style="font-size:28px;color:#ffd94d">50 杩炲嚮锛?/div>
            <div class="label">杩炲嚮澶у笀锛岃幏寰?+60s 閬撳叿 x1</div>
            <button class="btn btn-primary" id="combo-ok-btn">缁х画</button>
          </div>
        </div>`);
      document.getElementById("combo-ok-btn")!.onclick = () => { this.paused = false; hideModal(); };
    } else if (c === 75) {
      save.addItem("combo_shield", 1);
      showModal(`
        <div class="overlay" style="background:rgba(0,0,0,.45)">
          <div class="overlay-panel">
            <div class="big" style="font-size:28px;color:#ffd94d">75 杩炲嚮锛?/div>
            <div class="label">杩炲嚮涔嬬锛岃幏寰楄繛鍑绘姢鐩?x1</div>
            <button class="btn btn-primary" id="combo-ok-btn">缁х画</button>
          </div>
        </div>`);
      document.getElementById("combo-ok-btn")!.onclick = () => { this.paused = false; hideModal(); };
    } else if (c === 100) {
      save.addBadge("combo_100");
      save.addItem("combo_restore", 1);
      this.paused = true;
      showModal(`
        <div class="overlay" style="background:rgba(0,0,0,.45)">
          <div class="overlay-panel">
            <div class="big" style="font-size:28px;color:#ffd94d">100 杩炲嚮锛侊紒锛?/div>
            <div class="label">浼犺绾ц繛鍑伙紝鑾峰緱杩炲嚮鎭㈠ x1 + 馃弳</div>
            <button class="btn btn-primary" id="combo-ok-btn">缁х画</button>
          </div>
        </div>`);
      document.getElementById("combo-ok-btn")!.onclick = () => { this.paused = false; hideModal(); };
    }
  }

  private useTimeItem(item: "time_15" | "time_30" | "time_60") {
    if (!this.running || this.advancing || !this.currentLevel) return;
    const addMap = { time_15: 15, time_30: 30, time_60: 60 };
    const added = addMap[item];
    if (!save.useItem(item)) return;
    this.timeLeft += added;
    sfx.correct(0);
  }

  private useComboRestore() {
    if (!this.running || this.advancing || !this.currentLevel) return;
    if (!save.useItem("combo_restore")) return;
    this.combo = this.lastCombo;
    this.comboBroken = false;
    sfx.correct(0);
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
          <div class="label">娓告垙缁撴潫</div>
          <div class="big">${this.score}</div>
          <div class="label">杩炲嚮 x${this.combo} 路 閫氳繃 ${this.totalLevels} 鍏?/div>
          <div class="row">
            <div><div class="label">鏈€楂樺垎</div><div class="big" style="font-size:24px">${best.bestScore}</div></div>
            <div><div class="label">鏈€楂樿繛鍑?/div><div class="big" style="font-size:24px">x${best.bestCombo}</div></div>
          </div>
          <button class="btn" id="show-answer-btn">鏄剧ず绛旀</button>
          ${this.revivesUsed < this.maxRevives ? '<button class="btn btn-primary" id="revive-btn">澶嶆椿 (' + (this.maxRevives - this.revivesUsed) + '/' + this.maxRevives + ')</button>' : ''}
          <button class="btn" id="restart-btn">鍐嶆潵涓€灞€</button>
          <span class="hint-link" id="exit-btn">涓婚〉</span>
        </div>
      </div>`;
    document.getElementById("show-answer-btn")!.onclick = () => this.revealAnswer();
    document.getElementById("revive-btn")!.onclick = () => this.revive();
    document.getElementById("restart-btn")!.onclick = () => { this.modalEl.innerHTML = ""; this.start(); };
    document.getElementById("exit-btn")!.onclick = () => { this.modalEl.innerHTML = ""; this.hudEl.innerHTML = ""; this.onExit(); };
  }

  private revive() {
    if (this.revivesUsed >= this.maxRevives) return;
    this.revivesUsed++;
    this.score = 0;
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
        <div class="hud-grid" style="text-align:left;flex:1;padding-left:12px">绛旀</div>
        <button class="btn btn-sm" id="back-answer-btn">杩斿洖</button>
      </div>`;
    document.getElementById("back-answer-btn")!.onclick = () => this.showGameOverModal();
  }

  resize() {
    this._renderer.layout(this.canvas.width, this.canvas.height, 80);
  }
}

