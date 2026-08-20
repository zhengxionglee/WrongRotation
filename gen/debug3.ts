import sharp from "sharp";
import { buildGrid } from "../core/grid";
import { downsampleLuma, salience } from "../core/salience";

async function check(imgName: string) {
  const buf = await sharp(`assets/img/${imgName}`).raw().toBuffer();
  const data = new Float32Array(1080 * 1080);
  for (let i = 0; i < 1080 * 1080; i++) data[i] = buf[i * 3] / 255;
  const lm = { w: 1080, h: 1080, data };
  const grid = buildGrid({ type: "square", seed: 0, param: 3 });
  const results = grid.cells.map(c => {
    const s = salience(lm, c, 90);
    return { id: c.id, S: s.S.toFixed(4), edge: s.edge.toFixed(6) };
  });
  console.log(imgName, ":", JSON.stringify(results));
}

async function main() {
  await check("mosaic_092.webp"); // barcode
  await check("mosaic_069.webp"); // arrowfield
  await check("mosaic_096.webp"); // confetti
  await check("mosaic_001.webp"); // fbm (weak)
  await check("mosaic_002.webp"); // stripes (strong)
}
main().catch(console.error);