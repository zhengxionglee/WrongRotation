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

/** Confirmation dialog. Game should be paused before calling; onCancel is where to resume. */
export function confirmAction(title: string, message: string, confirmLabel: string, onConfirm: () => void, onCancel?: () => void): void {
  showModal(`
    <div class="overlay" style="background:rgba(8,10,14,0.95);backdrop-filter:blur(20px) brightness(.55);">
      <div class="overlay-panel" style="max-width:340px">
        <div class="label" style="font-size:22px;font-weight:700;color:#ffd94d;margin-bottom:4px">${title}</div>
        <div class="label" style="margin-bottom:8px;line-height:1.6;color:#c8cdd6;font-size:15px">${message}</div>
        <button class="btn btn-primary" id="confirm-yes-btn" style="width:100%">${confirmLabel}</button>
        <button class="btn" id="confirm-no-btn" style="width:100%">取消</button>
      </div>
    </div>`);
  document.getElementById("confirm-yes-btn")!.onclick = () => { hideModal(); onConfirm(); };
  document.getElementById("confirm-no-btn")!.onclick = () => { hideModal(); onCancel?.(); };
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