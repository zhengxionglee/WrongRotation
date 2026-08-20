import sharp from "sharp";
import { buildGrid } from "../core/grid";
import { downsampleLuma, extractCell } from "../core/salience";

async function main() {
  const buf = await sharp("assets/img/mosaic_009.webp").raw().toBuffer();
  const data = new Float32Array(1080 * 1080);
  for (let i = 0; i < 1080 * 1080; i++) data[i] = buf[i * 3] / 255;
  const lm = { w: 1080, h: 1080, data };
  const ds = downsampleLuma(lm, 540);
  const grid = buildGrid({ type: "square", seed: 0, param: 3 });
  const cell = grid.cells[4];
  const { w, h, data: cellData } = extractCell(ds, cell, ds.w, ds.h);

  let mean = 0, max = 0, min = 1;
  for (let i = 0; i < cellData.length; i++) {
    mean += cellData[i];
    if (cellData[i] > max) max = cellData[i];
    if (cellData[i] < min) min = cellData[i];
  }
  mean /= cellData.length;
  let var_ = 0;
  for (let i = 0; i < cellData.length; i++) var_ += (cellData[i] - mean) ** 2;
  var_ /= cellData.length;
  const std = Math.sqrt(var_);
  console.log("cell stats:", { w, h, mean, max, min, std, count: cellData.length });

  // Check rotateLuma
  const rad = 90 * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  let sumDiff = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x - cx, dy = y - cy;
    const sx = Math.round(cx + dx * cos + dy * sin);
    const sy = Math.round(cy - dx * sin + dy * cos);
    const outVal = (sx >= 0 && sx < w && sy >= 0 && sy < h) ? cellData[sy * w + sx] : 255;
    sumDiff += Math.abs(cellData[y * w + x] - outVal);
  }
  console.log("sum diff 90deg:", sumDiff, "mean diff:", sumDiff / (w * h));

  // Also check 180 deg
  const rad2 = 180 * Math.PI / 180;
  const cos2 = Math.cos(rad2), sin2 = Math.sin(rad2);
  let sumDiff2 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x - cx, dy = y - cy;
    const sx = Math.round(cx + dx * cos2 + dy * sin2);
    const sy = Math.round(cy - dx * sin2 + dy * cos2);
    const outVal = (sx >= 0 && sx < w && sy >= 0 && sy < h) ? cellData[sy * w + sx] : 255;
    sumDiff2 += Math.abs(cellData[y * w + x] - outVal);
  }
  console.log("sum diff 180deg:", sumDiff2, "mean diff:", sumDiff2 / (w * h));
}
main().catch(console.error);