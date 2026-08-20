import { defineConfig, Plugin } from "vite";
/// <reference types="vitest" />
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function serveStatic(dirName: string): Plugin {
  const dir = path.resolve(__dirname, dirName);
  return {
    name: `serve-${dirName}`,
    configureServer(server) {
      server.middlewares.use(`/${dirName}`, (req, res, next) => {
        const file = path.join(dir, decodeURIComponent((req.url || "").split("?")[0]));
        if (fs.existsSync(file) && fs.statSync(file).isFile()) {
          const ext = path.extname(file);
          const mime: Record<string, string> = { ".webp": "image/webp", ".json": "application/json" };
          res.setHeader("Content-Type", mime[ext] || "application/octet-stream");
          fs.createReadStream(file).pipe(res);
        } else next();
      });
    },
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