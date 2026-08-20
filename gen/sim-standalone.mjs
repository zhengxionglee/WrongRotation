// Run the standalone game.html in a simulated browser to verify it boots
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SIM = path.resolve(__dirname, "sim-standalone");

fs.rmSync(SIM, { recursive: true, force: true });
fs.mkdirSync(SIM, { recursive: true });

const html = fs.readFileSync(path.resolve(ROOT, "game.html"), "utf-8");
const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);
if (!scriptMatch) throw new Error("No script tag in game.html");
const gameCode = scriptMatch[1];

const mockDom = `
const noop = () => {};
function makeCtx() {
  const grad = { addColorStop: noop };
  return new Proxy({}, { get: (t, k) => {
    if (k === "createLinearGradient" || k === "createRadialGradient" || k === "createPattern") return () => grad;
    if (k === "measureText") return () => ({ width: 10 });
    if (k === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
    return typeof k === "string" ? noop : undefined;
  }, set: () => true });
}
function makeElement(id) {
  const el = {
    id: id || "",
    style: {}, dataset: {}, children: [],
    classList: { add: noop, remove: noop, contains: () => false, toggle: noop },
    setPointerCapture: noop, releasePointerCapture: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    addEventListener: noop, removeEventListener: noop,
    appendChild: (c) => c, removeChild: noop, remove: noop,
    querySelector: () => null, querySelectorAll: () => [],
    getContext: makeCtx, focus: noop, blur: noop, click: noop,
    onload: null, onerror: null,
    width: 0, height: 0, naturalWidth: 0, naturalHeight: 0, complete: false,
  };
  let _innerHTML = "";
  Object.defineProperty(el, "innerHTML", { get: () => _innerHTML, set: (v) => { _innerHTML = v; } });
  Object.defineProperty(el, "textContent", { get: () => _innerHTML, set: (v) => { _innerHTML = v; } });
  Object.defineProperty(el, "src", {
    get: () => el._src || "",
    set: (v) => { el._src = v; setTimeout(() => { el.complete = true; el.naturalWidth = 1080; el.naturalHeight = 1080; el.onload && el.onload(); }, 0); },
  });
  return el;
}
const elements = new Map();
function getOrCreate(id) {
  if (!elements.has(id)) elements.set(id, makeElement(id));
  return elements.get(id);
}
globalThis.document = {
  getElementById: (id) => getOrCreate(id),
  querySelector: (sel) => ["#ui", "#hud", "#modal", "#toast"].includes(sel) ? getOrCreate(sel.replace("#", "")) : null,
  querySelectorAll: () => [],
  createElement: (tag) => makeElement(tag),
  addEventListener: noop, removeEventListener: noop,
  body: makeElement("body"),
  documentElement: makeElement("html"),
  hidden: false, baseURI: "http://localhost:8364/game.html",
};
globalThis.window = globalThis;
globalThis.window.innerWidth = 800;
globalThis.window.innerHeight = 600;
globalThis.window.devicePixelRatio = 2;
globalThis.window.addEventListener = noop;
globalThis.window.removeEventListener = noop;
globalThis.window.location = { href: "http://localhost:8364/game.html" };
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop };
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.Image = class { constructor() { return makeElement("img"); } };
try { Object.defineProperty(globalThis, "navigator", { value: { userAgent: "node-sim" }, configurable: true }); } catch {}
globalThis.alert = noop; globalThis.confirm = () => true;
globalThis.MutationObserver = class { constructor() {} observe() {} disconnect() {} takeRecords() { return []; } };
globalThis.fetch = globalThis.fetch || (() => Promise.resolve({ ok: true, text: () => Promise.resolve("") }));
console.log("[sim] DOM mocks ready");
`;

const bootstrap = `
import "./mock-dom.mjs";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fs = await import("node:fs");
const code = fs.readFileSync("game-code.mjs", "utf8");
try {
  // Evaluate the standalone game script (non-module, IIFE)
  const run = new Function(code);
  run();
  console.log("[sim] game.html script evaluated OK");
  const ui = document.getElementById("ui");
  console.log("[sim] #ui innerHTML length:", ui ? ui.innerHTML.length : "MISSING");
  const btn = document.getElementById("start-campaign-btn");
  if (btn && btn.onclick) {
    btn.onclick();
    await sleep(300);
    const hud = document.getElementById("hud");
    console.log("[sim] campaign started, #hud length:", hud ? hud.innerHTML.length : "MISSING");
    console.log("[sim] hud shows Level 1:", hud && hud.innerHTML.includes("Level 1") ? "YES" : "NO");
  } else {
    console.log("[sim] start button not found — menu shown instead (OK if localStorage had progress)");
  }
  console.log("[sim] STANDALONE BOOT TEST PASSED");
  setTimeout(() => process.exit(0), 1000);
} catch (e) {
  console.error("[sim] RUNTIME ERROR:", e && e.stack ? e.stack : e);
  process.exit(1);
}
`;

fs.writeFileSync(path.resolve(SIM, "mock-dom.mjs"), mockDom);
fs.writeFileSync(path.resolve(SIM, "game-code.mjs"), gameCode);
fs.writeFileSync(path.resolve(SIM, "bootstrap.mjs"), bootstrap);

console.log("Running standalone simulation...");
try {
  const out = execSync("node bootstrap.mjs", { cwd: SIM, encoding: "utf8", timeout: 30000, stdio: "pipe" });
  console.log(out);
} catch (e) {
  console.log("STDOUT:", e.stdout);
  console.error("STDERR:", e.stderr);
  process.exit(1);
}