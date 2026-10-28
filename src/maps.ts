import type { Bounds, MapMeta } from './types';

export const RADAR_SIZE = 1024;

export interface MapAssets {
  meta: MapMeta | null;
  upper: HTMLImageElement | null;
  lower: HTMLImageElement | null;
}

const base = import.meta.env.BASE_URL;

const loadImage = (src: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

export async function loadMapAssets(mapName: string): Promise<MapAssets> {
  try {
    const res = await fetch(`${base}maps/${mapName}.json`);
    if (!res.ok) return { meta: null, upper: null, lower: null };
    const meta = (await res.json()) as MapMeta;
    const [upper, lower] = await Promise.all([
      loadImage(`${base}maps/${mapName}.png`),
      meta.hasLower ? loadImage(`${base}maps/${mapName}_lower.png`) : Promise.resolve(null),
    ]);
    return { meta, upper, lower };
  } catch {
    return { meta: null, upper: null, lower: null };
  }
}

export interface Projection {
  /** world -> radar pixel (0..1024) */
  toRadar(x: number, y: number): [number, number];
  /** world units per radar pixel */
  unitsPerPx: number;
}

export function makeProjection(meta: MapMeta | null, bounds: Bounds): Projection {
  if (meta) {
    return {
      toRadar: (x, y) => [(x - meta.posX) / meta.scale, (meta.posY - y) / meta.scale],
      unitsPerPx: meta.scale,
    };
  }
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const size = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 500) * 1.12;
  const k = RADAR_SIZE / size;
  return {
    toRadar: (x, y) => [(x - cx) * k + RADAR_SIZE / 2, (cy - y) * k + RADAR_SIZE / 2],
    unitsPerPx: 1 / k,
  };
}
