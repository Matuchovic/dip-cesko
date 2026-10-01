import manifestJson from '@/config/vehicle-assets.json';
import type { Mode } from '@/domain/model';
import { metersPerPixel } from '@/domain/geo';

export interface AssetVariant { purpose: 'map' | 'detail'; file: string; width: number; height: number; pixelRatio: number; bytes: number }
export interface VehicleAsset {
  id: string; category: Mode; view: 'top-down' | 'oblique';
  variants: AssetVariant[]; anchor: { x: number; y: number }; directionalVariants: unknown[];
  frontDirectionDeg?: number;
  physical?: { lengthM: number; widthM: number; origin: string };
  segments?: { kind: 'body' | 'joint'; fromFront: number; toFront: number }[];
  pieces?: { index: number; file: string; fromFront: number; toFront: number; width: number; height: number; pixelRatio: number }[];
  sizing?: { spriteFromZoom: number; minScreenLengthPx: number; maxScreenLengthPx: number };
  fallback?: 'marker';
}
export interface AssetManifest { version: number; categoryDefaults: Record<Mode, { map: string | null; detail: string | null }>; assets: VehicleAsset[] }

export const manifest = manifestJson as unknown as AssetManifest;

const byId = new Map(manifest.assets.map((a) => [a.id, a]));
export const assetById = (id: string | null | undefined) => (id ? byId.get(id) ?? null : null);

/** Mapový sprite pro kategorii; null = použije se náhradní značka. */
export function mapAssetFor(mode: Mode): VehicleAsset | null {
  const a = assetById(manifest.categoryDefaults[mode]?.map);
  return a && a.view === 'top-down' && a.variants.some((v) => v.purpose === 'map') ? a : null;
}
export function detailAssetFor(mode: Mode): VehicleAsset | null {
  return assetById(manifest.categoryDefaults[mode]?.detail);
}
export const mapVariant = (a: VehicleAsset) => a.variants.find((v) => v.purpose === 'map') ?? null;
export const detailVariant = (a: VehicleAsset) => a.variants.find((v) => v.purpose === 'detail') ?? null;

/**
 * Zastávky výrazu icon-size: délka na obrazovce = fyzická délka / (m na px), omezená min/max,
 * aby vozidlo zůstalo čitelné a stabilní při výměně variant (velikost se počítá z viditelné oblasti).
 */
export function spriteSizeStops(asset: VehicleAsset, lat: number, fromZoom = asset.sizing?.spriteFromZoom ?? 15.5, toZoom = 22): [number, number][] {
  const v = mapVariant(asset);
  if (!v || !asset.physical) return [];
  const imgCssLength = v.height / v.pixelRatio;
  const min = asset.sizing?.minScreenLengthPx ?? 30;
  const max = asset.sizing?.maxScreenLengthPx ?? 600;
  const out: [number, number][] = [];
  for (let z = fromZoom; z <= toZoom + 1e-9; z += 0.5) {
    const px = Math.min(max, Math.max(min, asset.physical.lengthM / metersPerPixel(lat, z)));
    out.push([Math.round(z * 10) / 10, Math.round((px / imgCssLength) * 10000) / 10000]);
  }
  return out;
}
