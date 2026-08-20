interface TweenEntry {
  t: number;
  dur: number;
  from: number;
  to: number;
  onUpdate: (v: number) => void;
  onDone?: () => void;
  ease: (t: number) => number;
}

const list: TweenEntry[] = [];

export function add(dur: number, from: number, to: number, onUpdate: (v: number) => void, onDone?: () => void, ease?: (t: number) => number) {
  list.push({ t: 0, dur, from, to, onUpdate, onDone, ease: ease || easeOutCubic });
}

export function update(dt: number) {
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    e.t += dt;
    if (e.t >= e.dur) {
      e.onUpdate(e.to);
      e.onDone?.();
      list.splice(i, 1);
    } else {
      const p = e.t / e.dur;
      e.onUpdate(e.from + (e.to - e.from) * e.ease(p));
    }
  }
}

export function easeOutCubic(t: number): number { return 1 - Math.pow(1 - t, 3); }
export function easeOutBack(t: number): number {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}
export function easeInOutQuad(t: number): number { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

export function clearAll() { list.length = 0; }