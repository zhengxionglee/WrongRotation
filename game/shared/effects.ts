// Lightweight fireworks / celebration particle system.
// All coordinates are in canvas (device) pixels, matching the renderer's board space.
// Each session drives it from its own loop: effects.update(dt) + effects.render(ctx).

interface Spark {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number;
  color: string; len: number; width: number;
  gravity: number;
}

interface Ring {
  x: number; y: number; r: number; vr: number;
  life: number; maxLife: number;
  color: string; width: number;
}

const sparks: Spark[] = [];
const rings: Ring[] = [];

const PALETTE = ["#ffd94d", "#ff6b6b", "#4ecdc4", "#a29bfe", "#ff9f43", "#6bcf7f", "#f78fb3", "#74b9ff", "#ffeaa7"];

export interface BurstOpts {
  count?: number;
  speed?: number;
  size?: number;
  life?: number;
  gravity?: number;
  colors?: string[];
  ring?: boolean;
  width?: number;
}

function rand(a: number, b: number): number { return a + Math.random() * (b - a); }

/** Radial burst of spark particles at (x, y), optionally with an expanding shockwave ring. */
export function burst(x: number, y: number, opts: BurstOpts = {}): void {
  const count = opts.count ?? 28;
  const speed = opts.speed ?? 260;
  const life = opts.life ?? 900;
  const gravity = opts.gravity ?? 320;
  const colors = opts.colors ?? PALETTE;
  const len = opts.size ?? 14;
  const width = opts.width ?? 3;
  for (let i = 0; i < count; i++) {
    const ang = rand(0, Math.PI * 2);
    const sp = rand(speed * 0.35, speed * 1.15);
    sparks.push({
      x, y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      life: rand(life * 0.6, life),
      maxLife: life,
      color: colors[Math.floor(Math.random() * colors.length)],
      len: rand(len * 0.6, len * 1.4),
      width: rand(width * 0.6, width * 1.4),
      gravity: rand(gravity * 0.8, gravity * 1.2),
    });
  }
  if (opts.ring !== false) {
    rings.push({ x, y, r: 4, vr: rand(340, 420), life: 500, maxLife: 500, color: colors[Math.floor(Math.random() * colors.length)], width: 4 });
  }
}

/** Small celebration for a single cell that snaps into place. */
export function firework(x: number, y: number): void {
  burst(x, y, { count: 26, speed: 240, life: 800 });
}

/** Volley of bursts spread across the canvas, used when a whole level is cleared. */
export function celebration(w: number, h: number, count = 6): void {
  for (let i = 0; i < count; i++) {
    burst(
      rand(w * 0.18, w * 0.82),
      rand(h * 0.18, h * 0.72),
      { count: 30, speed: rand(200, 320), life: rand(700, 1000) }
    );
  }
}

export function update(dt: number): void {
  const s = dt / 1000;
  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i];
    p.life -= dt;
    if (p.life <= 0) { sparks.splice(i, 1); continue; }
    const decay = Math.pow(0.5, s);
    p.vx *= decay;
    p.vy = p.vy * decay + p.gravity * s;
    p.x += p.vx * s;
    p.y += p.vy * s;
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.life -= dt;
    if (r.life <= 0) { rings.splice(i, 1); continue; }
    r.r += r.vr * s;
  }
}

export function render(ctx: CanvasRenderingContext2D): void {
  if (sparks.length === 0 && rings.length === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (const p of sparks) {
    const a = Math.max(0, p.life / p.maxLife);
    const sp = Math.hypot(p.vx, p.vy) || 1;
    const ux = p.vx / sp, uy = p.vy / sp;
    ctx.globalAlpha = a * 0.9;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = p.width;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - ux * p.len, p.y - uy * p.len);
    ctx.stroke();
  }
  for (const r of rings) {
    const a = Math.max(0, r.life / r.maxLife);
    ctx.globalAlpha = a;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = r.width * a + 1;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

export function clearAll(): void {
  sparks.length = 0;
  rings.length = 0;
}
