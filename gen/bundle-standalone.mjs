import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.resolve(ROOT, "dist", "assets");

const mainFile = fs.readdirSync(DIST).find(f => f.startsWith("index-") && f.endsWith(".js"));
const dailyFile = fs.readdirSync(DIST).find(f => f.startsWith("daily-") && f.endsWith(".js"));
if (!mainFile || !dailyFile) throw new Error("Cannot find dist JS files. Run 'npx vite build' first.");
const mainJs = fs.readFileSync(path.resolve(DIST, mainFile), "utf-8");
const dailyJs = fs.readFileSync(path.resolve(DIST, dailyFile), "utf-8");

// ---- Extract CSS from built index.html so game.html styles stay in sync ----
const distHtml = fs.readFileSync(path.resolve(ROOT, "dist", "index.html"), "utf-8");
const styleMatch = distHtml.match(/<style>([\s\S]*?)<\/style>/);
if (!styleMatch) throw new Error("Cannot find <style> block in dist/index.html");
const css = styleMatch[1];

// ---- Parse main exports: "export{Ut as P,Zt as R,...};" ----
const exportMatch = mainJs.match(/export\{(.+?)\};\s*$/);
if (!exportMatch) throw new Error("Cannot find export statement in main bundle");
const exportPairs = exportMatch[1].split(",").map(s => {
  const [internal, external] = s.trim().split(" as ");
  return { internal: internal.trim(), external: (external || internal).trim() };
});
const mainClean = mainJs.replace(/export\{.+?\};\s*$/, "");
const returnObj = "return {" + exportPairs.map(p => `${p.external}: ${p.internal}`).join(", ") + "};";

// ---- Parse daily imports: "import{P as b,m as S,...}from"./index-xxx.js";" ----
const importMatch = dailyJs.match(/^import\{(.+?)\}from"\.\/.+?\.js";?/);
if (!importMatch) throw new Error("Cannot find import statement in daily bundle");
const importPairs = importMatch[1].split(",").map(s => {
  const [external, local] = s.trim().split(" as ");
  return { external: (external || local).trim(), local: (local || external).trim() };
});
const dailyClean = dailyJs
  .replace(/^import\{.+?\}from"\.\/.+?\.js";?/, "")
  .replace(/export\{.+?\};\s*$/, "");
const dailyExportMatch = dailyJs.match(/export\{(.+?) as DailySession\};\s*$/);
if (!dailyExportMatch) throw new Error("Cannot find DailySession export in daily bundle");
const dailyInternal = dailyExportMatch[1].trim();
const dailyVars = importPairs.map(p => `var ${p.local} = __mainExp.${p.external};`).join(" ");

// ---- Replace dynamic import of daily chunk with global reference ----
const mainFixed = mainClean
  .replace(/await (\w+)\(async\(\)=>\{const\{DailySession:(\w+)\}=await import\("\.\/daily-[^"]*"\);return\{DailySession:\2\}\},\[\],[^)]*\)/g,
    '({DailySession: (typeof __DailySession !== "undefined" ? __DailySession : window.__DailySession)})')
  .replace(/import\.meta\.url/g, 'document.baseURI');

// ---- Embed all images as base64 so game.html works from file:// ----
function embedDir(dirPath, prefix) {
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith(".webp")).sort();
  return files.map(f => {
    const b64 = fs.readFileSync(path.join(dirPath, f)).toString("base64");
    return `"${prefix}${f}":"data:image/webp;base64,${b64}"`;
  });
}
const imgDir = path.resolve(ROOT, "assets", "img");
const relaxDir = path.resolve(ROOT, "assets", "relax");
const imageDataEntries = [
  ...embedDir(imgDir, "assets/img/"),
  ...embedDir(relaxDir, "assets/relax/")
];
const imageDataJs = `window.__IMAGE_DATA__={${imageDataEntries.join(",")}};`;
const imagePatchJs = `
(function () {
  var OrigImage = window.Image;
  window.Image = class extends OrigImage {
    set src(v) {
      var d = window.__IMAGE_DATA__ && window.__IMAGE_DATA__[v];
      this.__origSrc = v;
      super.src = d || v;
    }
    get src() { return this.__origSrc !== undefined ? this.__origSrc : super.src; }
  };
})();
`;

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>转错了</title>
<style>${css}</style>
</head>
<body>
<canvas id="cv"></canvas>
<div id="hud"></div>
<div id="ui"></div>
<div id="modal"></div>
<div id="toast" class="toast"></div>
<script>
window.addEventListener("error", function (e) {
  var d = document.getElementById("err-overlay") || (function () {
    var el = document.createElement("div"); el.id = "err-overlay"; document.body.appendChild(el); return el;
  })();
  d.textContent = (d.textContent ? d.textContent + "\\n" : "") + "Error: " + (e.message || "unknown") + (e.filename ? " @ " + e.filename + ":" + e.lineno : "");
});
window.addEventListener("unhandledrejection", function (e) {
  var d = document.getElementById("err-overlay") || (function () {
    var el = document.createElement("div"); el.id = "err-overlay"; document.body.appendChild(el); return el;
  })();
  d.textContent = (d.textContent ? d.textContent + "\\n" : "") + "Promise rejection: " + (e.reason && e.reason.message ? e.reason.message : e.reason);
});
${imageDataJs}
${imagePatchJs}
(function () {
"use strict";
// ===== Main bundle (scoped) =====
var __mainExp = (function () {
${mainFixed}
${returnObj}
})();
// ===== Daily bundle (scoped, imports resolved from __mainExp) =====
var __DailySession = (function () {
${dailyVars}
${dailyClean}
return ${dailyInternal};
})();
window.__DailySession = __DailySession;
})();
</script>
</body>
</html>`;

const outPath = path.resolve(ROOT, "game.html");
fs.writeFileSync(outPath, html);
console.log(`Wrote standalone game.html (${(html.length / 1024).toFixed(1)}KB) from ${mainFile} + ${dailyFile}`);