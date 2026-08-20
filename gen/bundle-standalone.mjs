import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.resolve(ROOT, "dist", "assets");

const mainFile = fs.readdirSync(DIST).find(f => f.startsWith("index-") && f.endsWith(".js"));
const dailyFile = fs.readdirSync(DIST).find(f => f.startsWith("daily-") && f.endsWith(".js"));
if (!mainFile || !dailyFile) throw new Error("Cannot find dist JS files");
const mainJs = fs.readFileSync(path.resolve(DIST, mainFile), "utf-8");
const dailyJs = fs.readFileSync(path.resolve(DIST, dailyFile), "utf-8");

// Strip the `export{...}` from main JS
const mainClean = mainJs.replace(/export\{(.+?)\};\s*$/, "");

// Extract the import statement from daily JS and the variables it imports
const importMatch = dailyJs.match(/^import\{(.+?)\}from".\/index-.+?\.js";?/);
const importVars = importMatch ? importMatch[1] : "";
const dailyClean = dailyJs
  .replace(/^import\{.+?}from"\.\/.+?\.js";?/, "")
  .replace(/export\{.+?\};\s*$/, "")
  .replace(/const L=\[/, 'const manifestData=[')
  .replace(/,q=\{images:L\}/, ',q={images:manifestData}');

// For the daily JS, we need to make the imported variables available
// The import statement maps exports to local names: `P as V, t as u, ...`
// We need to read the exports from the main file and assign them to the local names
// The main file exports: `Ut as P, Zt as R, ...`
// The daily imports: `P as V, t as u, ...` where P is Ut, t is Xt, etc.

// Parse the export map from main: "Ut as P, Zt as R, ..."
const exportMatch = mainJs.match(/export\{(.+?)\};/);
const exportMapStr = exportMatch ? exportMatch[1] : "";
const exportPairs = exportMapStr.split(",").map(s => {
  const [internal, external] = s.trim().split(" as ");
  return { internal: internal.trim(), external: external?.trim() || internal.trim() };
});

// Parse the import map from daily: "P as V, t as u, ..."
const importPairs = importVars.split(",").map(s => {
  const [external, local] = s.trim().split(" as ");
  return { external: external?.trim() || local?.trim(), local: local?.trim() || external?.trim() };
});

// Build the mapping: for each import in daily, find the corresponding export in main
// export: Ut as P (internal=Ut, external=P)
// import: P as V (external=P, local=V)
// So: V = Ut

const mapping = importPairs.map(imp => {
  const exp = exportPairs.find(e => e.external === imp.external);
  return { local: imp.local, internal: exp ? exp.internal : null };
});

const assignments = mapping
  .filter(m => m.internal)
  .map(m => `let ${m.local}=${m.internal};`)
  .join("");

// Build the HTML
// Fix image paths: img/mosaic_ -> assets/img/mosaic_
// Replace dynamic import of daily chunk with direct reference to inlined DailySession
const dynamicImportRe = /await (\w+)\(async\(\)=>\{const\{DailySession:(\w+)\}=await import\("\.\/.+?\.js"\);return\{DailySession:\2\}\},\[\],\w+\)/g;
const mainFixed = mainClean
  .replace(/"img\/mosaic_/g, '"assets/img/mosaic_')
  .replace(/import\.meta\.url/g, 'document.baseURI')
  .replace(dynamicImportRe, 'Promise.resolve({DailySession})');
const dailyFixed = dailyClean.replace(/"img\/mosaic_/g, '"assets/img/mosaic_');
const assignmentsFixed = assignments.replace(/"img\/mosaic_/g, '"assets/img/mosaic_');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>Wrong Rotation</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#0f1115;color:#e9ecf2;font-family:system-ui,sans-serif;user-select:none}
canvas{display:block;position:fixed;top:0;left:0;width:100%;height:100%;touch-action:none}
#ui,#hud,#modal{position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10}
#hud{z-index:15}#ui{z-index:20}#modal{z-index:30}
#ui>*,#hud>*,#modal>*{pointer-events:auto}
.screen{position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;gap:12px}
.title{font-size:clamp(28px,7vw,48px);font-weight:800;color:#ffd94d}
.subtitle{font-size:clamp(14px,3.5vw,22px);color:#8b93a5;margin-bottom:20px}
.btn{display:flex;align-items:center;justify-content:center;padding:14px 28px;border-radius:14px;border:none;font-size:clamp(16px,4vw,22px);font-weight:600;background:#22262e;color:#e9ecf2;cursor:pointer;transition:transform .1s;width:min(320px,80vw)}
.btn:active{transform:scale(.96)}
.btn-primary{background:#ffd94d;color:#0f1115}
.btn-lock{opacity:.5;background:#181c23;color:#5a6270}
.btn-sm{width:auto;padding:10px 20px;font-size:14px;border-radius:10px}
.btn-icon{width:44px;height:44px;padding:0;border-radius:12px;font-size:20px;flex-shrink:0}
.hud-top{display:flex;align-items:center;justify-content:space-between;padding:clamp(4px,1.5vh,12px) clamp(8px,2vw,16px);width:100%}
.hud-combo{font-size:clamp(28px,6vw,48px);font-weight:800;color:#ffd94d;text-align:center;flex:1}
.hud-score{font-size:clamp(14px,3vw,20px);color:#8b93a5;min-width:60px;text-align:right}
.hud-timer{width:100%;height:clamp(4px,1vw,6px);background:#1a1e26;border-radius:3px;overflow:hidden;margin:0}
.hud-timer-bar{height:100%;background:#ffd94d;border-radius:3px;transition:width .1s,background .3s}
.hud-timer-bar.danger{background:#e74c3c}
.level-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:clamp(6px,1.5vw,12px);padding:clamp(8px,2vw,16px);max-width:500px;width:100%}
.level-node{aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:12px;font-size:clamp(12px,3vw,16px);font-weight:600;border:2px solid #22262e;cursor:pointer;transition:transform .1s;gap:2px}
.level-node:active{transform:scale(.93)}
.level-node.locked{opacity:.3;cursor:default}
.level-node.current{border-color:#ffd94d}
.level-node .stars{font-size:clamp(8px,2vw,12px);color:#ffd94d}
.level-node .star-empty{color:#333}
.overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.65);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:30;backdrop-filter:blur(4px)}
.overlay-panel{background:#1a1e26;border-radius:20px;padding:clamp(20px,5vw,32px);width:min(360px,88vw);display:flex;flex-direction:column;align-items:center;gap:16px;text-align:center}
.overlay-panel .big{font-size:clamp(32px,8vw,56px);font-weight:800;color:#ffd94d}
.overlay-panel .label{font-size:clamp(14px,3.5vw,18px);color:#8b93a5}
.overlay-panel .row{display:flex;gap:16px;justify-content:center;flex-wrap:wrap}
.badge{font-size:clamp(12px,3vw,16px);color:#ffd94d;background:#ffd94d22;padding:4px 12px;border-radius:8px}
.hint-link{font-size:13px;color:#5a6270;cursor:pointer;text-decoration:underline;margin-top:8px}
.toast{position:fixed;bottom:clamp(40px,10vh,80px);left:50%;transform:translateX(-50%);background:#1a1e26;padding:10px 24px;border-radius:12px;font-size:14px;color:#e9ecf2;pointer-events:none;z-index:40;opacity:0;transition:opacity .3s}
.toast.show{opacity:1}
</style>
</head>
<body>
<canvas id="cv"></canvas>
<div id="hud"></div>
<div id="ui"></div>
<div id="modal"></div>
<div id="toast" class="toast"></div>
<script>
// Main bundle
${mainFixed}
// Daily imports
${assignmentsFixed}
// Daily bundle
${dailyFixed}
const DailySession = typeof C !== "undefined" ? C : (typeof C !== "undefined" ? C : null);
</script>
</body>
</html>`;

const outPath = path.resolve(ROOT, "game.html");
fs.writeFileSync(outPath, html);
console.log("Wrote standalone game.html");