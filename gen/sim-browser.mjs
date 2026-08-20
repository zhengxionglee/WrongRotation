// Simulate browser module execution to find runtime errors
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:8364";
const SIM = path.resolve(__dirname, "sim");

// Clean
fs.rmSync(SIM, { recursive: true, force: true });
fs.mkdirSync(path.resolve(SIM, "game/arcade"), { recursive: true });
fs.mkdirSync(path.resolve(SIM, "game/campaign"), { recursive: true });
fs.mkdirSync(path.resolve(SIM, "game/shared"), { recursive: true });
fs.mkdirSync(path.resolve(SIM, "core"), { recursive: true });
fs.mkdirSync(path.resolve(SIM, "levels"), { recursive: true });
fs.mkdirSync(path.resolve(SIM, "assets"), { recursive: true });
fs.mkdirSync(path.resolve(SIM, "deps"), { recursive: true });

// module url -> local file path (relative to SIM root)
const moduleMap = {
  "/game/main.ts": "game/main.mjs",
  "/game/shared/audio.ts": "game/shared/audio.mjs",
  "/game/shared/save.ts": "game/shared/save.mjs",
  "/game/shared/ui.ts": "game/shared/ui.mjs",
  "/game/shared/tween.ts": "game/shared/tween.mjs",
  "/game/shared/images.ts": "game/shared/images.mjs",
  "/game/shared/renderer.ts": "game/shared/renderer.mjs",
  "/game/shared/input.ts": "game/shared/input.mjs",
  "/game/arcade/arcade.ts": "game/arcade/arcade.mjs",
  "/game/campaign/campaign.ts": "game/campaign/campaign.mjs",
  "/core/rng.ts": "core/rng.mjs",
  "/core/grid.ts": "core/grid.mjs",
  "/core/salience.ts": "core/salience.mjs",
  "/core/difficulty.ts": "core/difficulty.mjs",
  "/levels/levels.json?import": "levels/levels.mjs",
  "/assets/manifest.json?import": "assets/manifest.mjs",
};

function toRel(fromLocalPath, targetLocal) {
  let rel = path.relative(path.dirname(path.resolve(SIM, fromLocalPath)), path.resolve(SIM, targetLocal)).replace(/\\/g, "/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

function rewriteImports(code, fromLocalPath) {
  // rewrite "/xxx" imports and dep imports to relative paths
  let out = code;
  // dep import
  out = out.replace(/from\s+"(\/node_modules\/\.vite\/deps\/[^"]+)"/g, (_m, url) => {
    const depFile = url.split("?")[0].replace("/node_modules/.vite/deps/", "").replace(/\.js$/, ".mjs");
    return `from "${toRel(fromLocalPath, "deps/" + depFile)}"`;
  });
  // module imports
  for (const [url, local] of Object.entries(moduleMap)) {
    out = out.split(`"${url}"`).join(`"${toRel(fromLocalPath, local)}"`);
  }
  return out;
}

async function fetchModule(url) {
  const res = await fetch(BASE + url);
  if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`);
  return res.text();
}

async function main() {
  // fetch d3-delaunay dep
  const depCode = await fetchModule("/node_modules/.vite/deps/d3-delaunay.js?v=546d4a35");
  fs.writeFileSync(path.resolve(SIM, "deps/d3-delaunay.mjs"), depCode);

  // fetch all modules
  for (const [url, local] of Object.entries(moduleMap)) {
    const code = await fetchModule(url);
    const rewritten = rewriteImports(code, local);
    fs.writeFileSync(path.resolve(SIM, local), rewritten);
  }

  // create mock DOM
  const mockDom = `
const noop = () => {};
function makeCtx() {
  const grad = { addColorStop: noop };
  return new Proxy({}, { get: (t, k) => {
    if (k === "createLinearGradient" || k === "createRadialGradient" || k === "createPattern") return () => grad;
    if (k === "measureText") return () => ({ width: 10 });
    if (k === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
    if (k === "createImageData") return () => ({ data: new Uint8ClampedArray(4) });
    return typeof k === "string" ? noop : undefined;
  }, set: () => true });
}
function makeElement(id) {
  const el = {
    id: id || "",
    style: {},
    dataset: {},
    children: [],
    classList: { add: noop, remove: noop, contains: () => false, toggle: noop },
    setPointerCapture: noop, releasePointerCapture: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    addEventListener: noop, removeEventListener: noop,
    appendChild: (c) => c, removeChild: noop, remove: noop,
    querySelector: () => null, querySelectorAll: () => [],
    getContext: makeCtx, focus: noop, blur: noop, click: noop,
    onload: null, onerror: null, pointerId: 0,
    width: 0, height: 0, naturalWidth: 0, naturalHeight: 0, complete: false,
  };
  let _innerHTML = "";
  Object.defineProperty(el, "innerHTML", {
    get: () => _innerHTML,
    set: (v) => { _innerHTML = v; },
  });
  Object.defineProperty(el, "textContent", {
    get: () => _innerHTML,
    set: (v) => { _innerHTML = v; },
  });
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
  querySelector: (sel) => (sel === "#ui" || sel === "#hud" || sel === "#modal" || sel === "#toast" || sel === "canvas") ? getOrCreate(sel.replace("#", "")) : null,
  querySelectorAll: () => [],
  createElement: (tag) => makeElement(tag),
  addEventListener: noop, removeEventListener: noop,
  body: makeElement("body"),
  documentElement: makeElement("html"),
  hidden: false,
};
globalThis.window = {
  innerWidth: 800, innerHeight: 600, devicePixelRatio: 2,
  addEventListener: noop, removeEventListener: noop,
  location: { href: "http://localhost:5173/" },
};
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop };
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.Image = class { constructor() { return makeElement("img"); } };
try { Object.defineProperty(globalThis, "navigator", { value: { userAgent: "node-sim" }, configurable: true }); } catch {}
globalThis.alert = noop; globalThis.confirm = () => true;
console.log("[sim] DOM mocks ready");
`;
  fs.writeFileSync(path.resolve(SIM, "mock-dom.mjs"), mockDom);

  // bootstrap
  const bootstrap = `
import "./mock-dom.mjs";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
try {
  await import("./game/main.mjs");
  console.log("[sim] main.ts evaluated OK");
  const ui = document.getElementById("ui");
  console.log("[sim] #ui innerHTML length:", ui ? ui.innerHTML.length : "MISSING");
  // Simulate clicking "Start Campaign"
  const btn = document.getElementById("start-campaign-btn");
  if (btn && btn.onclick) {
    btn.onclick();
    await sleep(300); // let async level loading settle (mock Image onload fires async)
    const hud = document.getElementById("hud");
    console.log("[sim] campaign started, #hud innerHTML length:", hud ? hud.innerHTML.length : "MISSING");
    console.log("[sim] #hud contains level text:", hud && hud.innerHTML.includes("Level 1") ? "YES" : "NO");
  } else {
    console.log("[sim] start-campaign-btn not found (maybe passed>=3, menu shown instead)");
  }
  console.log("[sim] FULL BOOT TEST PASSED");
  setTimeout(() => { console.log("[sim] exiting (game loop still running = healthy)"); process.exit(0); }, 1500);
} catch (e) {
  console.error("[sim] RUNTIME ERROR:", e && e.stack ? e.stack : e);
  process.exit(1);
}
`;
  fs.writeFileSync(path.resolve(SIM, "bootstrap.mjs"), bootstrap);

  console.log("Running simulation...");
  const { execSync } = await import("node:child_process");
  try {
    const out = execSync("node bootstrap.mjs", { cwd: SIM, encoding: "utf8", timeout: 30000, stdio: "pipe" });
    console.log(out);
  } catch (e) {
    console.log("STDOUT:", e.stdout);
    console.error("STDERR:", e.stderr);
  }
}

main().catch(e => { console.error("SIM SETUP ERROR:", e); process.exit(1); });