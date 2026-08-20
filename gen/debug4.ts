import sharp from "sharp";
import { buildGrid } from "../core/grid";
import { downsampleLuma, salience, extractCell } from "../core/salience";

async function check(imgName: string) {
  const buf = await sharp(`assets/img/${imgName}`).raw().toBuffer();
  const data = new Float32Array(1080 * 1080);
  for (let i = 0; i < 1080 * 1080; i++) {
    data[i] = (0.299 * buf[i * 3] + 0.587 * buf[i * 3 + 1] + 0.114 * buf[i * 3 + 2]) / 255;
  }
  const lm = { w: 1080, h: 1080, data };
  const ds = downsampleLuma(lm, 540);
  const grid = buildGrid({ type: "square", seed: 0, param: 3 });
  const results = grid.cells.map(c => {
    const { S, edge, ssim } = salience(lm, c, 90);
    const { w, h, data: cd } = extractCell(ds, c, ds.w, ds.h);
    let mn = 0, mx = 0, vr = 0;
    for (let i = 0; i < cd.length; i++) { mn += cd[i]; mx = Math.max(mx, cd[i]); vr += cd[i] * cd[i]; }
    mn /= cd.length; vr = vr / cd.length - mn * mn;
    return { id: c.id, S: S.toFixed(4), edge: edge.toFixed(6), ssim: ssim.toFixed(4), mean: mn.toFixed(3), max: mx.toFixed(3), std: Math.sqrt(vr).toFixed(3) };
  });
  console.log(imgName, ":", JSON.stringify(results));
}

async function main() {
  await check("mosaic_002.webp"); // stripes
  await check("mosaic_092.webp"); // barcode
  await check("mosaic_001.webp"); // fbm
}
main().catch(console.error);