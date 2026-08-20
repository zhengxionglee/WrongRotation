import { sfx } from "./shared/audio";
import * as save from "./shared/save";
import { setScreen, setHud, showModal, hideModal, toast, canvasSize } from "./shared/ui";
import { ArcadeSession } from "./arcade/arcade";
import { CampaignSession } from "./campaign/campaign";

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

function onPointerDown(e: PointerEvent) {
  sfx.init();
  canvas.setPointerCapture(e.pointerId);
  const p = getCanvasPos(e);
  if (!currentSession) return;
  const s = currentSession as any;
  if (s.renderer && s.grid) {
    const cellId = s.renderer.hitTest({ grid: s.grid, rotations: s.rotations }, p.x, p.y);
    if (cellId >= 0) {
      s.onTap?.(cellId);
    }
  }
}

canvas.addEventListener("pointerdown", onPointerDown);

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

  if (passed < 3) {
    setScreen(`
      <div class="screen">
        <div class="title">Wrong Rotation</div>
        <div class="subtitle">Odd Rotation</div>
        <button class="btn btn-primary" id="start-campaign-btn">Start Campaign</button>
        <div class="label">Complete the first 3 levels to unlock all modes</div>
      </div>`);
    document.getElementById("start-campaign-btn")!.onclick = () => startCampaign(1);
    return;
  }

  const arcadeBtn = passed >= 3 ? `<button class="btn btn-primary" id="arcade-btn">Arcade Mode</button>` : `<button class="btn btn-lock" id="arcade-btn">Arcade (Locked)</button>`;
  const dailyBtn = passed >= 3 ? `<button class="btn" id="daily-btn">Daily Challenge</button>` : `<button class="btn btn-lock">Daily (Locked)</button>`;

  setScreen(`
    <div class="screen">
      <div class="title">Wrong Rotation</div>
      <div class="subtitle">Odd Rotation</div>
      <button class="btn" id="campaign-btn">Campaign (${passed}/50)</button>
      ${arcadeBtn}
      ${dailyBtn}
      <div class="row">
        <span class="badge">Arcade Best: ${arcade.bestScore} pts</span>
        <span class="badge">Combo: x${arcade.bestCombo}</span>
      </div>
      ${passed < 20 ? '<div class="hint-link">Clear level 20 to unlock hexagons</div>' : ""}
    </div>`);

  document.getElementById("campaign-btn")!.onclick = () => showCampaignSelect();
  document.getElementById("arcade-btn")?.addEventListener("click", () => startArcade());
  document.getElementById("daily-btn")?.addEventListener("click", () => startDaily());
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
    <div class="screen" style="justify-content:flex-start;padding-top:clamp(12px,3vh,24px);">
      <div style="display:flex;align-items:center;gap:8px;width:100%;max-width:500px;padding:0 12px;">
        <button class="btn btn-icon" id="back-btn">x</button>
        <div style="font-size:20px;font-weight:600;flex:1;text-align:center;">Campaign</div>
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
  const session = new ArcadeSession(canvas, ctx, [], () => {
    hideModal();
    setHud("");
    goHome();
  });
  currentSession = session;
  session.start();
}

function startDaily() {
  sfx.init();
  const currentDate = save.todayStr();
  const dailyState = save.getDailyState();
  if (dailyState.date === currentDate && dailyState.played) {
    showModal(`
      <div class="overlay">
        <div class="overlay-panel">
          <div class="label">Today's Result</div>
          <div class="big">${(dailyState.firstTimeMs! / 1000).toFixed(1)}s</div>
          <div class="row">
            <button class="btn btn-primary" id="play-again-btn">Play Again</button>
            <span class="hint-link" id="exit-btn">Home</span>
          </div>
        </div>
      </div>`);
    document.getElementById("play-again-btn")?.addEventListener("click", () => { hideModal(); startDailyPlay(); });
    document.getElementById("exit-btn")?.addEventListener("click", () => { hideModal(); goHome(); });
  } else {
    startDailyPlay();
  }
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

window.addEventListener("resize", onResize);
goHome();