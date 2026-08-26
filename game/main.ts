import { sfx } from "./shared/audio";
import * as save from "./shared/save";
import { setScreen, setHud, showModal, hideModal, toast, canvasSize } from "./shared/ui";
import { ArcadeSession } from "./arcade/arcade";
import { CampaignSession } from "./campaign/campaign";
import { RelaxationSession } from "./relaxation/relaxation";

save.load();
const canvas = document.getElementById("cv") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
let dpr = Math.min(window.devicePixelRatio || 1, 2);
let size = canvasSize(canvas, dpr);

type Session = { resize(): void; onTap?(cellId: number): void; onRotate?(cellId: number, r: number, p: "move" | "end"): void; renderer?: { hitTest(state: any, x: number, y: number): number } };
let currentSession: Session | null = null;

function getCanvasPos(e: MouseEvent | PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left) * dpr, y: (e.clientY - rect.top) * dpr };
}

let dragState: { cellId: number; startX: number; startY: number; startAngle: number; startRot: number; moved: boolean } | null = null;

function onPointerDown(e: PointerEvent) {
  sfx.init();
  canvas.setPointerCapture(e.pointerId);
  const p = getCanvasPos(e);
  if (!currentSession) return;
  const s = currentSession as any;
  if (s.renderer && s.grid) {
    const cellId = s.renderer.hitTest({ grid: s.grid, rotations: s.rotations }, p.x, p.y);
    if (cellId >= 0) {
      dragState = { cellId, startX: p.x, startY: p.y, startAngle: 0, startRot: 0, moved: false };
    }
  }
}

function onPointerMove(e: PointerEvent) {
  if (!dragState) return;
  const p = getCanvasPos(e);
  const dx = p.x - dragState.startX;
  const dy = p.y - dragState.startY;
  if (Math.hypot(dx, dy) > 8) {
    if (!dragState.moved) {
      dragState.moved = true;
      const s = currentSession as any;
      const cell = s.grid?.cells.find((c: any) => c.id === dragState!.cellId);
      if (cell) {
        const cx = cell.cx * (s.renderer as any).board.size;
        const cy = cell.cy * (s.renderer as any).board.size;
        const bx = (s.renderer as any).board.x;
        const by = (s.renderer as any).board.y;
        dragState.startAngle = Math.atan2(dragState.startY - by - cy, dragState.startX - bx - cx);
        dragState.startRot = s.rotations?.get(dragState.cellId) ?? 0;
      }
    }
    if (dragState.moved) {
      const s = currentSession as any;
      const cell = s.grid?.cells.find((c: any) => c.id === dragState!.cellId);
      if (cell) {
        const cx = cell.cx * (s.renderer as any).board.size;
        const cy = cell.cy * (s.renderer as any).board.size;
        const bx = (s.renderer as any).board.x;
        const by = (s.renderer as any).board.y;
        const curAngle = Math.atan2(p.y - by - cy, p.x - bx - cx);
        const delta = (curAngle - dragState.startAngle) * 180 / Math.PI;
        const rot = ((dragState.startRot + delta) % 360 + 360) % 360;
        s.onRotate?.(dragState.cellId, rot, "move");
      }
    }
  }
}

function onPointerUp(e: PointerEvent) {
  if (!dragState) return;
  const s = currentSession as any;
  if (dragState.moved) {
    const cell = s.grid?.cells.find((c: any) => c.id === dragState!.cellId);
    if (cell) {
      const cx = cell.cx * (s.renderer as any).board.size;
      const cy = cell.cy * (s.renderer as any).board.size;
      const bx = (s.renderer as any).board.x;
      const by = (s.renderer as any).board.y;
      const p = getCanvasPos(e);
      const curAngle = Math.atan2(p.y - by - cy, p.x - bx - cx);
      const delta = (curAngle - dragState.startAngle) * 180 / Math.PI;
      const rot = ((dragState.startRot + delta) % 360 + 360) % 360;
      s.onRotate?.(dragState.cellId, rot, "end");
    }
  } else {
    s.onTap?.(dragState.cellId);
  }
  dragState = null;
}

canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", onPointerUp);

function onResize() {
  size = canvasSize(canvas, dpr);
  currentSession?.resize();
}

function goHome() {
  currentSession = null;
  const passed = save.campaignPassed();
  const unlocked = save.campaignUnlocked();
  const arcade = save.getArcadeBest();
  const daily = save.getDailyState();
  const imgData = (window as any).__IMAGE_DATA__;
  const bgUrl = (imgData && imgData["assets/img/mosaic_025.webp"]) || "assets/img/mosaic_025.webp";
  const bgStyle = `background-image:linear-gradient(rgba(15,17,21,.88),rgba(15,17,21,.88)),url('${bgUrl}');background-size:cover;background-position:center;`;

  if (passed < 3) {
    setScreen(`
      <div class="screen" style="${bgStyle}">
        <div class="title">转错了</div>
        <button class="btn btn-primary" id="start-campaign-btn">开始闯关</button>
        <div class="label">完成前3关解锁所有模式</div>
        <button class="btn" id="rules-btn2" style="font-size:15px;padding:10px 20px;width:auto">玩法说明</button>
      </div>`);
    document.getElementById("start-campaign-btn")!.onclick = () => startCampaign(1);
    document.getElementById("rules-btn2")?.addEventListener("click", () => showRules());
    return;
  }

  const arcadeBtn = passed >= 3 ? `<button class="btn btn-primary btn-hero" id="arcade-btn">街机模式</button>` : `<button class="btn btn-lock btn-hero" id="arcade-btn">街机 (未解锁)</button>`;
  const dailyBtn = passed >= 3 ? `<button class="btn" id="daily-btn">挑战模式</button>` : `<button class="btn btn-lock">挑战模式 (未解锁)</button>`;
  const relaxBtn = `<button class="btn" id="relax-btn">休闲模式</button>`;
  const curTime = save.getArcadeTime();
  const timeBtns = [5, 8, 12, 20].map(t => `<button class="time-btn ${curTime === t ? "active" : ""}" data-t="${t}">${t}秒</button>`).join("");
  const curVar = save.getArcadeMinVar();
  const varOpts: { v: number; l: string }[] = [{ v: 0, l: "关" }, { v: 0.05, l: "5%" }, { v: 0.15, l: "15%" }, { v: 0.3, l: "30%" }, { v: 0.5, l: "50%" }];
  const varBtns = varOpts.map(o => `<button class="var-btn ${curVar === o.v ? "active" : ""}" data-v="${o.v}">${o.l}</button>`).join("");

  setScreen(`
    <div class="screen" style="${bgStyle}">
      <div class="title">转错了</div>
      ${arcadeBtn}
      <button class="btn" id="campaign-btn">闯关 (${passed}/50)</button>
      ${dailyBtn}
      ${relaxBtn}
      <button class="btn" id="rules-btn">玩法说明</button>
      <div class="row">
        <span class="badge">街机最高: ${arcade.bestScore}分</span>
        <span class="badge">连击: x${arcade.bestCombo}</span>
      </div>
      <div class="row" style="align-items:center;gap:8px">
        <span class="label" style="font-size:14px;color:#8b93a5">时间</span>
        ${timeBtns}
      </div>
      <div class="label" style="font-size:12px;color:#5a6270;margin-top:-4px;margin-bottom:6px;text-align:center">每关基础时间 (影响时限和奖励)</div>
      <div class="row" style="align-items:center;gap:8px">
        <span class="label" style="font-size:14px;color:#8b93a5">最小方差</span>
        ${varBtns}
      </div>
      <div class="label" style="font-size:12px;color:#5a6270;margin-top:-4px;margin-bottom:6px;text-align:center">最小单元格方差比 (越高越容易识别)</div>
      ${passed < 20 ? '<div class="hint-link">通关第20关解锁六边形</div>' : ""}
    </div>`);

  document.getElementById("campaign-btn")!.onclick = () => showCampaignSelect();
  document.getElementById("arcade-btn")?.addEventListener("click", () => startArcade());
  document.getElementById("daily-btn")?.addEventListener("click", () => startChallenge());
  document.getElementById("relax-btn")?.addEventListener("click", () => startRelaxation());
  document.getElementById("rules-btn")?.addEventListener("click", () => showRules());
  document.querySelectorAll(".time-btn").forEach(el => {
    el.addEventListener("click", () => {
      save.setArcadeTime(parseInt((el as HTMLElement).dataset.t || "8"));
      goHome();
    });
  });
  document.querySelectorAll(".var-btn").forEach(el => {
    el.addEventListener("click", () => {
      save.setArcadeMinVar(parseFloat((el as HTMLElement).dataset.v || "0.15"));
      goHome();
    });
  });
}

function showRules() {
  showModal(`
    <div class="overlay" style="background:rgba(0,0,0,.6);pointer-events:auto">
      <div class="overlay-panel" style="max-width:440px;max-height:80vh;overflow-y:auto;text-align:left;line-height:1.7;font-size:clamp(15px,3.5vw,18px);color:#c8cdd6">
        <div style="font-size:clamp(20px,4.5vw,24px);font-weight:700;color:#ffd94d;text-align:center;margin-bottom:12px">玩法说明</div>

        <div style="font-weight:700;color:#ffd94d;margin-top:12px">🎯 闯关模式</div>
        <div>拖拽旋转错误的单元格将其归位，全部修复即可过关。共 50 关，难度递增。</div>

        <div style="font-weight:700;color:#ffd94d;margin-top:12px">⚡ 街机模式</div>
        <div>点击正确的单元格消除错误，积累连击获取高分。时间耗尽则游戏结束。</div>
        <div style="margin-top:6px;padding-left:12px;border-left:2px solid #333">
          <div style="font-weight:600;color:#4ecdc4">道具系统</div>
          <div>• 连击护盾：点错时自动消耗，连击不中断</div>
          <div>• 连击恢复：连击断掉后手动使用，恢复至断前值</div>
          <div>• 加时道具：+15s / +30s / +60s，时间不足时使用</div>
          <div style="font-weight:600;color:#4ecdc4;margin-top:6px">连击里程碑</div>
          <div>5连击→+15s · 10→护盾 · 20→+30s · 35→恢复 · 50→+60s · 75→护盾 · 100→恢复+🏆</div>
          <div style="font-weight:600;color:#4ecdc4;margin-top:6px">关卡里程碑</div>
          <div>10关→复活+1 · 25→复活+1+护盾 · 50→复活+1+🏆 · 75+→复活+1+恢复</div>
          <div style="font-weight:600;color:#4ecdc4;margin-top:6px">复活</div>
          <div>复活保留连击数，不阻挡里程碑奖励。复活次数通过里程碑获得。</div>
        </div>

        <div style="font-weight:700;color:#ffd94d;margin-top:12px">🔥 挑战模式</div>
        <div>10 关计时挑战，每关 2 个错误单元格，找出全部即可过关。</div>

        <div style="font-weight:700;color:#ffd94d;margin-top:12px">🌿 休闲模式</div>
        <div>15 关摄影作品，拖拽旋转归位，不计时，轻松解压。</div>

        <button class="btn btn-primary" id="rules-close-btn" style="margin-top:16px;width:100%">知道了</button>
      </div>
    </div>`);
  document.getElementById("rules-close-btn")!.onclick = () => hideModal();
}

function showCampaignSelect() {
  const unlocked = save.campaignUnlocked();
  const nodes = Array.from({ length: 50 }, (_, i) => {
    const id = i + 1;
    const stars = save.getCampaignStars(id);
    const starStr = '<span class="stars">' + "★".repeat(stars) + '<span class="star-empty">' + "★".repeat(3 - stars) + "</span></span>";
    const cls = id > unlocked ? "locked" : id === unlocked ? "current" : "";
    return `<div class="level-node ${cls}" data-id="${id}">${id}${stars > 0 ? `<br>${starStr}` : ""}</div>`;
  }).join("");

  setScreen(`
    <div class="screen" style="justify-content:flex-start;padding-top:clamp(12px,3vh,24px);overflow-y:auto;overflow-x:hidden;">
      <div style="display:flex;align-items:center;gap:8px;width:100%;max-width:500px;padding:0 12px;flex-shrink:0;">
        <button class="btn btn-icon" id="back-btn">x</button>
        <div style="font-size:20px;font-weight:600;flex:1;text-align:center;">闯关</div>
        <div style="width:44px"></div>
      </div>
      <div class="level-grid">${nodes}</div>
    </div>`);

  document.getElementById("back-btn")!.onclick = goHome;
  document.querySelectorAll(".level-node:not(.locked)").forEach(el => {
    el.addEventListener("click", () => {
      const id = parseInt((el as HTMLElement).dataset.id || "1");
      startCampaign(id);
    });
  });
}

function startCampaign(level = 1) {
  setScreen("");
  setHud("");
  const session = new CampaignSession(canvas, ctx, level, () => {
    hideModal();
    setHud("");
    goHome();
  });
  currentSession = session;
  session.start();
}

function startArcade() {
  sfx.init();
  setScreen("");
  setHud("");
  const session = new ArcadeSession(canvas, ctx, () => {
    hideModal();
    setHud("");
    goHome();
  });
  currentSession = session;
  session.start();
}

function startChallenge() {
  sfx.init();
  startDailyPlay();
}

async function startDailyPlay() {
  const { DailySession } = await import("./daily/daily");
  setScreen("");
  setHud("");
  const session = new DailySession(canvas, ctx, () => {
    hideModal();
    setHud("");
    goHome();
  });
  currentSession = session;
  session.start();
}

function startRelaxation() {
  sfx.init();
  setScreen("");
  setHud("");
  const session = new RelaxationSession(canvas, ctx, () => {
    hideModal();
    setHud("");
    goHome();
  });
  currentSession = session;
  session.start();
}

window.addEventListener("resize", onResize);
goHome();