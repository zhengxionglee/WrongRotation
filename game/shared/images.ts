import type { LumaMatrix } from "../../core/types";

const imgCache = new Map<string, HTMLImageElement>();
const lumaCache = new Map<string, LumaMatrix>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imgCache.get(src);
  if (cached && cached.complete && cached.naturalWidth > 0) return Promise.resolve(cached);
  if (cached) return new Promise<HTMLImageElement>((resolve, reject) => {
    cached.onload = () => resolve(cached);
    cached.onerror = () => reject(new Error(`Failed to load ${src}`));
  });
  const img = new Image();
  imgCache.set(src, img);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

export function preload(src: string): void {
  if (!imgCache.has(src)) {
    const img = new Image();
    img.src = src;
    imgCache.set(src, img);
  }
}

export function getImage(src: string): HTMLImageElement | undefined {
  const img = imgCache.get(src);
  return img && img.complete && img.naturalWidth > 0 ? img : undefined;
}

export async function getLuma(src: string): Promise<LumaMatrix> {
  const cached = lumaCache.get(src);
  if (cached) return cached;
  const img = await loadImage(src);
  const size = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, size, size);
  const id = ctx.getImageData(0, 0, size, size);
  const data = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const p = i * 4;
    data[i] = 0.299 * id.data[p] + 0.587 * id.data[p + 1] + 0.114 * id.data[p + 2];
  }
  const luma: LumaMatrix = { w: size, h: size, data };
  lumaCache.set(src, luma);
  return luma;
}

export function clearLumaCache(): void {
  lumaCache.clear();
}