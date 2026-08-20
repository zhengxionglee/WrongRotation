export function $(sel: string): HTMLElement | null { return document.querySelector(sel); }
export function $$(sel: string): HTMLElement[] { return Array.from(document.querySelectorAll(sel)); }

export function setScreen(html: string) {
  const ui = $("#ui");
  if (ui) ui.innerHTML = html;
}

export function setHud(html: string) {
  const hud = $("#hud");
  if (hud) hud.innerHTML = html;
}

export function showModal(html: string) {
  const modal = $("#modal");
  if (modal) modal.innerHTML = html;
}

export function hideModal() {
  const modal = $("#modal");
  if (modal) modal.innerHTML = "";
}

export function toast(msg: string, ms = 2000) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), ms);
}

export function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  return `${min}:${String(sec).padStart(2, "0")}.${tenths}`;
}

export function canvasSize(canvas: HTMLCanvasElement, dpr = 1) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  return { w: canvas.width, h: canvas.height, dpr };
}