import sharp from 'sharp';
import { buildGrid } from '../core/grid.js';
import { downsampleLuma, salience, extractCell } from '../core/salience.js';

const buf = await sharp('../assets/img/mosaic_009.webp').raw().toBuffer();
const data = new Float32Array(1080 * 1080);
for (let i = 0; i < 1080 * 1080; i++) data[i] = buf[i * 3] / 255;
const lm = { w: 1080, h: 1080, data };
const ds = downsampleLuma(lm, 540);
console.log('ds size:', ds.w, ds.h);

const grid = buildGrid({ type: 'square', seed: 0, param: 3 });
const cell = grid.cells[4];
const { w, h, data: cellData } = extractCell(ds, cell, ds.w, ds.h);
console.log('cell extract:', w, h, 'data[0]:', cellData ? cellData[0] : 'null');

const result = salience(lm, cell, 90);
console.log('S:', result.S, 'edge:', result.edge, 'ssim:', result.ssim);