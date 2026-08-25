class Sfx {
  ctx: AudioContext | null = null;
  enabled = true;

  init() {
    if (this.ctx) return;
    try { this.ctx = new AudioContext(); } catch { }
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0) {
    if (!this.ctx || !this.enabled) return;
    try {
      if (this.ctx.state === "suspended") this.ctx.resume();
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(gain, this.ctx.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + delay + dur);
      osc.connect(g).connect(this.ctx.destination);
      osc.start(this.ctx.currentTime + delay);
      osc.stop(this.ctx.currentTime + delay + dur + 0.01);
    } catch { }
  }

  correct(combo: number) {
    const freq = 392 * Math.pow(2, Math.min(combo, 24) / 12);
    this.tone(freq, 0.08, "sine", 0.15);
    this.tone(freq * 1.5, 0.08, "sine", 0.08, 0.04);
  }

  wrong() {
    this.tone(130, 0.15, "sawtooth", 0.12);
    this.tone(110, 0.15, "sawtooth", 0.08, 0.12);
  }

  tick() {
    this.tone(1200, 0.03, "sine", 0.04);
  }

  win() {
    this.tone(523, 0.12, "sine", 0.12);
    this.tone(659, 0.12, "sine", 0.12, 0.1);
    this.tone(784, 0.14, "sine", 0.12, 0.2);
  }

  lose() {
    this.tone(330, 0.15, "sawtooth", 0.1);
    this.tone(247, 0.15, "sawtooth", 0.1, 0.15);
    this.tone(196, 0.2, "sawtooth", 0.1, 0.3);
  }

  tap() { this.tone(600, 0.025, "sine", 0.06); }

  skip() {
    this.tone(500, 0.06, "triangle", 0.1);
    this.tone(340, 0.08, "triangle", 0.08, 0.06);
  }

  unlock() {
    this.tone(880, 0.08, "sine", 0.1);
    this.tone(1100, 0.1, "sine", 0.1, 0.08);
  }
}

export const sfx = new Sfx();