import type { Feature, Point, Polygon } from 'geojson';
import type { Mode } from '@/domain/model';
import { spriteIconRotate } from '@/domain/angles';
import { bearingDeg, D2R, distM, lerp, offsetM, pointAlong, polyLength, type LngLat } from './geometry';

/** Barevné provedení 3D vozidel (stylizované, kreslené přímo v MapLibre – bez 3D modelů). */
interface Livery { base: string; glass: string; upper: string; roof: string; joint: string }
const LIVERY: Record<'tram' | 'train' | 'bus' | 'ferry' | 'other', Livery> = {
  tram: { base: '#C8102E', glass: '#1D2129', upper: '#F4F4F1', roof: '#B9BEC6', joint: '#2A2B30' },
  train: { base: '#1F4FB5', glass: '#1B2230', upper: '#F2F3F5', roof: '#AEB5BF', joint: '#2A2B30' },
  bus: { base: '#C8102E', glass: '#1D2129', upper: '#F4F4F1', roof: '#C3C7CE', joint: '#2A2B30' },
  ferry: { base: '#1F4FB5', glass: '#1D2129', upper: '#F4F4F1', roof: '#D5D8DD', joint: '#2A2B30' },
  other: { base: '#5F5A73', glass: '#1D2129', upper: '#E8E7EE', roof: '#C3C7CE', joint: '#2A2B30' },
};
type Band = { from: number; to: number; color: keyof Livery; inset?: number };
const BANDS: Record<keyof typeof LIVERY, Band[]> = {
  tram: [{ from: 0.32, to: 1.0, color: 'base' }, { from: 1.0, to: 2.25, color: 'glass' }, { from: 2.25, to: 2.95, color: 'upper' }, { from: 2.95, to: 3.25, color: 'roof', inset: 0.25 }],
  train: [{ from: 0.45, to: 1.25, color: 'base' }, { from: 1.25, to: 2.6, color: 'glass' }, { from: 2.6, to: 3.6, color: 'upper' }, { from: 3.6, to: 3.95, color: 'roof', inset: 0.3 }],
  bus: [{ from: 0.35, to: 1.05, color: 'base' }, { from: 1.05, to: 2.4, color: 'glass' }, { from: 2.4, to: 3.0, color: 'upper' }, { from: 3.0, to: 3.2, color: 'roof', inset: 0.3 }],
  ferry: [{ from: 0, to: 1.3, color: 'base' }, { from: 1.3, to: 2.4, color: 'upper' }, { from: 2.4, to: 3.2, color: 'glass', inset: 0.8 }, { from: 3.2, to: 3.4, color: 'roof', inset: 0.8 }],
  other: [{ from: 0.3, to: 2.8, color: 'base' }],
};
const CAB: Band[] = [{ from: 0.32, to: 1.0, color: 'base' }, { from: 1.0, to: 2.85, color: 'glass' }, { from: 2.85, to: 3.2, color: 'roof', inset: 0.2 }];

export interface VehicleShape {
  id: string; mode: Mode; lengthM: number; widthM: number;
  /** Rozdělení na tuhé části (zlomky délky od čela) – kloubové soupravy projíždějí oblouky. */
  pieces: { fromFront: number; toFront: number }[];
  bidirectional: boolean; stale: boolean; selected: boolean; detail: boolean;
}

export const DEFAULT_SHAPES: Record<Mode, { lengthM: number; widthM: number; pieces: { fromFront: number; toFront: number }[]; bidirectional: boolean }> = {
  tram: { lengthM: 22.4, widthM: 2.5, pieces: [{ fromFront: 0, toFront: 1 }], bidirectional: false },
  train: { lengthM: 35.5, widthM: 3.0, pieces: [{ fromFront: 0, toFront: 1 }], bidirectional: true },
  bus: { lengthM: 12, widthM: 2.55, pieces: [{ fromFront: 0, toFront: 1 }], bidirectional: false },
  trolleybus: { lengthM: 12, widthM: 2.55, pieces: [{ fromFront: 0, toFront: 1 }], bidirectional: false },
  ferry: { lengthM: 18, widthM: 5, pieces: [{ fromFront: 0, toFront: 1 }], bidirectional: true },
  metro: { lengthM: 96, widthM: 2.7, pieces: [{ fromFront: 0, toFront: 1 }], bidirectional: true },
  funicular: { lengthM: 12, widthM: 2.6, pieces: [{ fromFront: 0, toFront: 1 }], bidirectional: true },
  other: { lengthM: 10, widthM: 2.5, pieces: [{ fromFront: 0, toFront: 1 }], bidirectional: false },
};

const liveryKey = (m: Mode): keyof typeof LIVERY => (m === 'tram' ? 'tram' : m === 'train' || m === 'metro' || m === 'funicular' ? 'train' : m === 'bus' || m === 'trolleybus' ? 'bus' : m === 'ferry' ? 'ferry' : 'other');

function mix(hex: string, to: string, k: number): string {
  const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16);
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

/** Bod osy karoserie ve zlomku délky od čela (karoserie je lomená čára od zadního konce k čelu). */
function at(body: LngLat[], bodyLen: number, L: number, fromFront: number): LngLat {
  return pointAlong(body, Math.max(0, bodyLen - fromFront * L)).p;
}

/**
 * Obrys tuhé části mezi zadním bodem R a předním F (šířka W, odsazení inset, zkosení čela/zádi).
 * Vrcholy proti směru hodinových ručiček (RFC 7946).
 */
export function partPolygon(R: LngLat, F: LngLat, W: number, inset = 0, chamferFront = 0, chamferRear = 0): LngLat[] {
  const len = distM(R, F);
  if (len < 0.2) return [];
  const b = bearingDeg(R, F) * D2R;
  const ux = Math.sin(b), uy = Math.cos(b);
  const lx = -uy, ly = ux;
  const w = W / 2 - inset, s0 = inset, s1 = len - inset;
  const P = (s: number, q: number) => offsetM(R, s * ux + q * lx, s * uy + q * ly);
  const cf = Math.min(chamferFront, w * 0.8, (s1 - s0) / 3), cr = Math.min(chamferRear, w * 0.8, (s1 - s0) / 3);
  const ring = [P(s0 + cr, -w), P(s1 - cf, -w), P(s1, -w + cf), P(s1, w - cf), P(s1 - cf, w), P(s0 + cr, w), P(s0, w - cr), P(s0, -w + cr)];
  ring.push(ring[0]!);
  return ring;
}

const poly = (ring: LngLat[], props: Record<string, unknown>): Feature<Polygon> => ({
  type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring.map((p) => [p.lng, p.lat])] }, properties: props,
});

/** Prostorové (fill-extrusion) části vozidla podle osy karoserie: pruhy barev, čelní okna, klouby, pantograf. */
export function buildExtrusions(body: LngLat[], v: VehicleShape): Feature<Polygon>[] {
  const out: Feature<Polygon>[] = [];
  if (body.length < 2) return out;
  const key = liveryKey(v.mode);
  const base = LIVERY[key];
  const col = (c: keyof Livery) => (v.stale ? mix(base[c], '#9A98A6', 0.7) : base[c]);
  const bodyLen = polyLength(body);
  const L = v.lengthM, W = v.widthM;
  const push = (ring: LngLat[], from: number, to: number, color: string) => { if (ring.length) out.push(poly(ring, { vid: v.id, base: from, height: to, color })); };
  if (!v.detail) {
    push(partPolygon(at(body, bodyLen, L, 1), at(body, bodyLen, L, 0), W, 0, 0.6), 0.3, 3, col('base'));
    return out;
  }
  const bands = BANDS[key];
  const n = v.pieces.length;
  v.pieces.forEach((pc, i) => {
    const F = at(body, bodyLen, L, pc.fromFront), Rr = at(body, bodyLen, L, pc.toFront);
    const pieceLen = distM(Rr, F);
    const frontCab = i === 0 && key !== 'ferry' && key !== 'other';
    const rearCab = i === n - 1 && v.bidirectional && key !== 'ferry' && key !== 'other';
    const cabLen = Math.min(1.5, pieceLen / 4);
    const F2 = frontCab ? lerp(F, Rr, cabLen / Math.max(pieceLen, 0.01)) : F;
    const R2 = rearCab ? lerp(Rr, F, cabLen / Math.max(pieceLen, 0.01)) : Rr;
    for (const bnd of bands) push(partPolygon(R2, F2, W, bnd.inset ?? 0), bnd.from, bnd.to, col(bnd.color));
    if (frontCab) for (const bnd of CAB) push(partPolygon(F2, F, W, bnd.inset ?? 0, 0.7), bnd.from, bnd.to, col(bnd.color));
    if (rearCab) for (const bnd of CAB) push(partPolygon(R2, Rr, W, bnd.inset ?? 0, 0, 0.7), bnd.from, bnd.to, col(bnd.color));
    if (i < n - 1) {
      const next = v.pieces[i + 1]!;
      const jR = at(body, bodyLen, L, Math.min(1, pc.toFront + 0.01)), jF = at(body, bodyLen, L, Math.max(0, next.fromFront - 0.01));
      push(partPolygon(jR, jF, W * 0.92), 0.35, 2.95, col('joint'));
    }
    const roofTop = bands[bands.length - 1]!.to;
    const pantograph = (key === 'tram' && i === Math.min(1, n - 1)) || (key === 'train' && (i === 0 || i === n - 1));
    if (pantograph) {
      const mid = lerp(Rr, F, i === 0 && key === 'train' ? 0.65 : 0.5);
      const dir = bearingDeg(Rr, F) * D2R;
      const a = offsetM(mid, -Math.sin(dir) * 0.9, -Math.cos(dir) * 0.9), b = offsetM(mid, Math.sin(dir) * 0.9, Math.cos(dir) * 0.9);
      push(partPolygon(a, b, 0.5), roofTop, roofTop + 0.55, '#3A3E46');
    }
  });
  if (v.mode === 'trolleybus') {
    const rear = at(body, bodyLen, L, 0.95), mid = at(body, bodyLen, L, 0.45);
    for (const q of [-0.35, 0.35]) {
      const dir = bearingDeg(rear, mid) * D2R, ox = -Math.cos(dir) * q, oy = Math.sin(dir) * q;
      push(partPolygon(offsetM(rear, ox, oy), offsetM(mid, ox, oy), 0.12), 3.2, 3.42, '#30333A');
    }
  }
  return out;
}

/** Části PNG spritu (pohled shora) – každá na své části osy, natočená podle trati. */
export function buildPieces(body: LngLat[], v: VehicleShape, assetId: string, extra: Record<string, unknown>): Feature<Point>[] {
  if (body.length < 2) return [];
  const bodyLen = polyLength(body);
  return v.pieces.map((pc, i) => {
    const F = at(body, bodyLen, v.lengthM, pc.fromFront), Rr = at(body, bodyLen, v.lengthM, pc.toFront);
    const c = lerp(Rr, F, 0.5);
    const rot = distM(Rr, F) > 0.05 ? spriteIconRotate(bearingDeg(Rr, F), 0) : 0;
    return { type: 'Feature', geometry: { type: 'Point', coordinates: [c.lng, c.lat] }, properties: { vid: v.id, icon: `${assetId}#${i}`, asset: assetId, rot, ...extra } };
  });
}
