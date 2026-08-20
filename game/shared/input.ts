export interface InputHandlers {
  onTap?(cellId: number, x: number, y: number): void;
  onRotate?(cellId: number, rotation: number, phase: "move" | "end"): void;
  onDragStart?(cellId: number): void;
}

export function attachInput(canvas: HTMLCanvasElement, hitTest: (px: number, py: number) => number, handlers: InputHandlers): () => void {
  let active = false;
  let startX = 0, startY = 0;
  let dragCell = -1;
  let startRot = 0;
  let startAngle = 0;
  let moved = false;

  function getPos(e: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function onDown(e: PointerEvent) {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    sfx.tap();
    const p = getPos(e);
    startX = p.x; startY = p.y;
    moved = false;
    const cell = hitTest(p.x, p.y);
    if (cell >= 0) {
      active = true;
      dragCell = cell;
      handlers.onDragStart?.(cell);
      startRot = 0;
      startAngle = 0;
    }
  }

  function onMove(e: PointerEvent) {
    if (!active) return;
    e.preventDefault();
    const p = getPos(e);
    const dx = p.x - startX, dy = p.y - startY;
    if (Math.hypot(dx, dy) > 8) {
      if (!moved) {
        moved = true;
        startAngle = Math.atan2(startY - 0, startX - 0);
      }
      const curAngle = Math.atan2(p.y - 0, p.x - 0);
      const delta = (curAngle - startAngle) * 180 / Math.PI;
      handlers.onRotate?.(dragCell, (startRot + delta + 360) % 360, "move");
    }
  }

  function onUp(e: PointerEvent) {
    if (!active) return;
    active = false;
    e.preventDefault();
    canvas.releasePointerCapture(e.pointerId);
    if (!moved) {
      handlers.onTap?.(dragCell, startX, startY);
    } else {
      handlers.onRotate?.(dragCell, 0, "end");
    }
    dragCell = -1;
  }

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  return () => {
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
  };
}

import { sfx } from "./audio";