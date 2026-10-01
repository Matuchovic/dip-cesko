/** Geometrie na krátké vzdálenosti (do několika km): rovinná aproximace kolem zeměpisné šířky úseku. */
export interface LngLat { lng: number; lat: number }

const R = 6371008.8;
export const D2R = Math.PI / 180;
export const M_PER_DEG_LAT = R * D2R;
export const mPerDegLng = (lat: number) => R * D2R * Math.cos(lat * D2R);

export function distM(a: LngLat, b: LngLat): number {
  const lat = (a.lat + b.lat) / 2;
  return Math.hypot((b.lng - a.lng) * mPerDegLng(lat), (b.lat - a.lat) * M_PER_DEG_LAT);
}

export function bearingDeg(a: LngLat, b: LngLat): number {
  const lat = (a.lat + b.lat) / 2;
  const deg = Math.atan2((b.lng - a.lng) * mPerDegLng(lat), (b.lat - a.lat) * M_PER_DEG_LAT) / D2R;
  return deg < 0 ? deg + 360 : deg;
}

/** Úhlový rozdíl 0–180°. */
export function angDiff(a: number, b: number): number {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180);
}

export const lerp = (a: LngLat, b: LngLat, t: number): LngLat => ({ lng: a.lng + (b.lng - a.lng) * t, lat: a.lat + (b.lat - a.lat) * t });

export function offsetM(p: LngLat, eastM: number, northM: number): LngLat {
  return { lng: p.lng + eastM / mPerDegLng(p.lat), lat: p.lat + northM / M_PER_DEG_LAT };
}

export function polyLength(pts: readonly LngLat[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += distM(pts[i - 1]!, pts[i]!);
  return s;
}

/** Bod ve vzdálenosti d od začátku lomené čáry a směr tečny v něm (null u nulové délky). */
export function pointAlong(pts: readonly LngLat[], d: number): { p: LngLat; bearing: number | null } {
  const first = pts[0];
  if (!first) throw new Error('Prázdná lomená čára');
  if (pts.length === 1) return { p: first, bearing: null };
  let rest = Math.max(0, d);
  let lastBearing: number | null = null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!;
    const len = distM(a, b);
    if (len > 0.01) lastBearing = bearingDeg(a, b);
    if (rest <= len || i === pts.length - 1) {
      const t = len > 0 ? Math.min(1, rest / len) : 1;
      return { p: lerp(a, b, t), bearing: lastBearing };
    }
    rest -= len;
  }
  return { p: pts[pts.length - 1]!, bearing: lastBearing };
}

/** Úsek lomené čáry mezi vzdálenostmi d0 ≤ d1 od začátku. */
export function slice(pts: readonly LngLat[], d0: number, d1: number): LngLat[] {
  if (pts.length < 2) return pts.length ? [pts[0]!] : [];
  const out: LngLat[] = [pointAlong(pts, d0).p];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += distM(pts[i - 1]!, pts[i]!);
    if (acc > d0 && acc < d1) out.push(pts[i]!);
    if (acc >= d1) break;
  }
  out.push(pointAlong(pts, d1).p);
  return out;
}

/** Posledních `length` metrů lomené čáry (od zadního konce k poslednímu bodu). */
export function tail(pts: readonly LngLat[], length: number): LngLat[] {
  const L = polyLength(pts);
  return L <= length ? [...pts] : slice(pts, L - length, L);
}

export function concat(a: readonly LngLat[], b: readonly LngLat[]): LngLat[] {
  if (!a.length) return [...b];
  if (!b.length) return [...a];
  return distM(a[a.length - 1]!, b[0]!) < 0.05 ? [...a, ...b.slice(1)] : [...a, ...b];
}

/** Kolmý průmět bodu na lomenou čáru: vzdálenost podél čáry a boční odchylka (m). */
export function projectOnPolyline(pts: readonly LngLat[], p: LngLat): { along: number; dist: number } {
  const kx = mPerDegLng(p.lat), ky = M_PER_DEG_LAT;
  let best = { along: 0, dist: Infinity }, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!;
    const ax = (a.lng - p.lng) * kx, ay = (a.lat - p.lat) * ky, bx = (b.lng - p.lng) * kx, by = (b.lat - p.lat) * ky;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, len = Math.sqrt(l2);
    const t = l2 > 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / l2)) : 0;
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best.dist) best = { along: acc + t * len, dist: d };
    acc += len;
  }
  return best;
}
