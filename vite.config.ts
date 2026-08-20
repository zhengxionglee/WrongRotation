import { defineConfig, Plugin } from "vite";
/// <reference types="vitest" />
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function serveStatic(dirName: string): Plugin {
  const dir = path.resolve(__dirname, dirName);
  return {
    name: `copy-${dirName}`,
    // NOTE: no configureServer middleware! Vite dev server already serves
    // files from the project root. A custom middleware here would intercept
    // module requests (e.g. "/levels/levels.json?import") BEFORE Vite's
    // transform pipeline and return raw JSON with the wrong MIME type,
    // which breaks ES module loading (black screen).
    closeBundle() {
      const out = path.resolve(__dirname, "dist", dirName);
      if (fs.existsSync(dir)) fs.cpSync(dir, out, { recursive: true });
    }
  };
}

export default defineConfig({
  publicDir: false,
  base: "./",
  plugins: [serveStatic("assets"), serveStatic("levels")],
  build: { target: "es2020", outDir: "dist" },
  test: { include: ["tests/**/*.test.ts"] }
});