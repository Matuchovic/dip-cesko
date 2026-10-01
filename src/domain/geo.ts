export interface LngLat { lng: number; lat: number }

const EARTH_RADIUS_M = 6_371_008.8;
const EARTH_CIRCUMFERENCE_M = 40_075_016.686;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Velký kruh (haversine) – vhodné pro vzdálenosti vozidel a délky souprav. */
export function haversineM(a: LngLat, b: LngLat): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Počáteční azimut a → b ve stupních od severu. */
export function initialBearingDeg(a: LngLat, b: LngLat): number {
  const φ1 = toRad(a.lat), φ2 = toRad(b.lat), Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Metry na CSS pixel ve Web Mercatoru pro MapLibre (dlaždice 512 px). */
export function metersPerPixel(lat: number, zoom: number, tileSize = 512): number {
  return (EARTH_CIRCUMFERENCE_M * Math.cos(toRad(lat))) / (tileSize * 2 ** zoom);
}

export function lerpLngLat(a: LngLat, b: LngLat, t: number): LngLat {
  return { lng: a.lng + (b.lng - a.lng) * t, lat: a.lat + (b.lat - a.lat) * t };
}

/** Hranice pro validaci vstupních souřadnic (Česko s rezervou). Pořadí: zeměpisná délka, šířka. */
export const CZ_BOUNDS = { minLng: 11.8, minLat: 48.4, maxLng: 19.0, maxLat: 51.2 } as const;

export function isValidLngLat(lng: unknown, lat: unknown): boolean {
  return typeof lng === 'number' && typeof lat === 'number' && Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90;
}

export function inCzechia(lng: number, lat: number): boolean {
  return lng >= CZ_BOUNDS.minLng && lng <= CZ_BOUNDS.maxLng && lat >= CZ_BOUNDS.minLat && lat <= CZ_BOUNDS.maxLat;
}

export type BBox = [number, number, number, number];
export function parseBBox(input: string | null): BBox | null {
  if (!input) return null;
  const parts = input.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [minLng, minLat, maxLng, maxLat] = parts as BBox;
  if (!isValidLngLat(minLng, minLat) || !isValidLngLat(maxLng, maxLat) || minLng >= maxLng || minLat >= maxLat) return null;
  return [minLng, minLat, maxLng, maxLat];
}
export const inBBox = (b: BBox, lng: number, lat: number) => lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3];
