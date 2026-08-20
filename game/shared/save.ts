const KEY = "odd-rotation-v1";

interface SaveData {
  campaign: { unlocked: number; stars: Record<string, { clicks: number; time: number; stars: number }>; attempts: Record<string, number> };
  arcade: { bestScore: number; bestCombo: number };
  daily: { date: string; firstTimeMs: number | null; bestTimeMs: number | null; played: boolean };
  intro: boolean;
}

function defaults(): SaveData {
  return {
    campaign: { unlocked: 1, stars: {}, attempts: {} },
    arcade: { bestScore: 0, bestCombo: 0 },
    daily: { date: "", firstTimeMs: null, bestTimeMs: null, played: false },
    intro: false
  };
}

let data: SaveData = defaults();

export function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    data = raw ? { ...defaults(), ...JSON.parse(raw) } : defaults();
  } catch { data = defaults(); }
  return data;
}

export function save(): void {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { }
}

export function get(): SaveData { return data; }

export function campaignPassed(): number {
  return Object.keys(data.campaign.stars).filter(k => data.campaign.stars[k].stars > 0).length;
}

export function campaignUnlocked(): number {
  return data.campaign.unlocked;
}

export function setCampaignLevelStars(level: number, clicks: number, time: number, stars: number): void {
  const prev = data.campaign.stars[level];
  if (prev && stars <= prev.stars) return;
  data.campaign.stars[level] = { clicks, time, stars };
  data.campaign.unlocked = Math.max(data.campaign.unlocked, level + 1);
  if (data.campaign.unlocked > 50) data.campaign.unlocked = 50;
  save();
}

export function getCampaignStars(level: number): number {
  return data.campaign.stars[level]?.stars ?? 0;
}

export function getCampaignAttempts(level: number): number {
  return data.campaign.attempts[level] ?? 0;
}

export function addCampaignAttempt(level: number): void {
  data.campaign.attempts[level] = (data.campaign.attempts[level] ?? 0) + 1;
  save();
}

export function setArcadeResult(score: number, combo: number): void {
  if (score > data.arcade.bestScore) data.arcade.bestScore = score;
  if (combo > data.arcade.bestCombo) data.arcade.bestCombo = combo;
  save();
}

export function getArcadeBest(): { bestScore: number; bestCombo: number } {
  return data.arcade;
}

export function getDailyState(): { date: string; firstTimeMs: number | null; bestTimeMs: number | null; played: boolean } {
  return data.daily;
}

export function setDailyResult(date: string, timeMs: number): void {
  if (data.daily.date !== date) {
    data.daily.date = date;
    data.daily.firstTimeMs = timeMs;
    data.daily.bestTimeMs = timeMs;
    data.daily.played = true;
  } else if (!data.daily.played) {
    data.daily.firstTimeMs = timeMs;
    data.daily.bestTimeMs = Math.min(data.daily.bestTimeMs ?? timeMs, timeMs);
    data.daily.played = true;
  } else {
    data.daily.bestTimeMs = Math.min(data.daily.bestTimeMs ?? timeMs, timeMs);
  }
  save();
}

export function getUnlockedShapes(): string[] {
  const passed = campaignPassed();
  const shapes: string[] = [];
  if (passed >= 20) shapes.push("hex");
  if (passed >= 26) shapes.push("tri");
  if (passed >= 39) shapes.push("voronoi");
  return shapes;
}

export function isChaosUnlocked(): boolean {
  return campaignPassed() >= 50;
}

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}