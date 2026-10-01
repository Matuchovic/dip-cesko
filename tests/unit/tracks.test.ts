import { describe, expect, it } from 'vitest';
import { nsId } from '@/domain/ids';
import { knownDelay, type VehicleState } from '@/domain/model';
import { angDiff, bearingDeg, distM, offsetM, pointAlong, polyLength, slice, tail, type LngLat } from '@/map/geometry';
import { TrackNetwork } from '@/map/tracks';
import { TrackFollower } from '@/map/follower';
import { buildExtrusions, buildPieces, partPolygon } from '@/map/vehicle3d';

const O: LngLat = { lng: 14.42, lat: 50.08 };
const P = (e: number, n: number) => offsetM(O, e, n);
// Kolej: 200 m na východ, oblouk 90° vlevo (poloměr 25 m), pak 200 m na sever; souběžná kolej 3 m jižněji.
function curveLine(): LngLat[] {
  const pts: LngLat[] = [];
  for (let e = -200; e <= 0; e += 10) pts.push(P(e, 0));
  for (let a = 1; a <= 9; a++) { const t = (a / 9) * (Math.PI / 2); pts.push(P(25 * Math.sin(t), 25 - 25 * Math.cos(t))); }
  for (let n = 35; n <= 225; n += 10) pts.push(P(25, n));
  return pts;
}
const parallel = (): LngLat[] => { const pts: LngLat[] = []; for (let e = -200; e <= -5; e += 10) pts.push(P(e, -3)); return pts; };

function veh(id: string, p: LngLat, measuredAt: number, bearing: number | null): VehicleState {
  return { id: nsId('pid', 'vehicle', id), route: { id: null, shortName: '9', mode: 'tram' }, tripId: null, headsign: null, lat: p.lat, lon: p.lng, bearing,
    bearingSource: bearing === null ? null : 'provider', speedMps: null, delay: knownDelay(0), measuredAt: new Date(measuredAt).toISOString(), registration: null,
    vehicleTypeLabel: null, wheelchair: null, airConditioned: null, isCanceled: false, positionState: 'on_track', lastStopName: null, nextStopName: null };
}

describe('geometrie lomené čáry', () => {
  const line = [P(0, 0), P(100, 0), P(100, 100)];
  it('délka, bod podél čáry, výřez a konec', () => {
    expect(polyLength(line)).toBeCloseTo(200, 0);
    const m = pointAlong(line, 150);
    expect(distM(m.p, P(100, 50))).toBeLessThan(0.5);
    expect(m.bearing!).toBeCloseTo(0, 0);
    expect(polyLength(slice(line, 50, 150))).toBeCloseTo(100, 0);
    expect(polyLength(tail(line, 30))).toBeCloseTo(30, 0);
    expect(angDiff(350, 10)).toBe(20);
    expect(bearingDeg(P(0, 0), P(10, 0))).toBeCloseTo(90, 0);
  });
});

describe('síť kolejí', () => {
  const net = new TrackNetwork([curveLine(), parallel()], O.lat);
  it('přichytí bod na nejbližší kolej a respektuje pravostranný provoz', () => {
    const s = net.nearest(P(-100, 4), 28)!;
    expect(s.dist).toBeCloseTo(4, 0);
    // bod mezi kolejemi, jízda na východ → pravá (jižní) kolej
    const r = net.nearest(P(-100, -1.4), 28, 90)!;
    expect(distM(r.point, P(-100, -3))).toBeLessThan(0.6);
    expect(net.nearest(P(-100, 60), 28)).toBeNull();
  });
  it('cesta vede po oblouku, ne vzdušnou čarou', () => {
    const a = net.nearest(P(-40, 0), 10)!, b = net.nearest(P(25, 60), 10)!;
    const path = net.path(a, b, 400)!;
    expect(path).not.toBeNull();
    const len = polyLength(path);
    const arc = 40 + (Math.PI / 2) * 25 + 35; // ~114 m po trati
    expect(len).toBeGreaterThan(arc - 3); expect(len).toBeLessThan(arc + 3);
    // žádný bod cesty není mimo trať
    for (const p of path) expect(net.nearest(p, 1)).not.toBeNull();
  });
  it('průchod zpět o danou délku po trati', () => {
    const s = net.nearest(P(25, 20), 10)!;
    const back = net.walk(s, 180, 40);
    expect(polyLength(back)).toBeCloseTo(40, 0);
    for (const p of back) expect(net.nearest(p, 1)).not.toBeNull();
  });
});

describe('vozidlo na trati', () => {
  const net = new TrackNetwork([curveLine()], O.lat);
  const T0 = Date.parse('2026-10-01T12:00:00Z');
  it('přichytí GPS mimo kolej, mezi měřeními jede po oblouku a karoserie sleduje trať', () => {
    const f = new TrackFollower(() => 22);
    f.update([veh('a', P(-60, 6), T0, 90)], T0, T0, () => net);
    const s0 = f.sample('pid:vehicle:a', T0)!;
    expect(s0.onTrack).toBe(true);
    expect(distM(s0.front, P(-60, 0))).toBeLessThan(0.6);
    expect(polyLength(s0.body)).toBeCloseTo(22, 0);
    f.update([veh('a', P(31, 70), T0 + 10_000, 0)], T0 + 10_000, T0 + 10_000, () => net);
    for (const t of [2000, 5000, 8000, 10_000]) {
      const s = f.sample('pid:vehicle:a', T0 + 10_000 + t)!;
      expect(net.nearest(s.front, 0.8)).not.toBeNull();
      for (const p of s.body) expect(net.nearest(p, 1)).not.toBeNull();
    }
    const end = f.sample('pid:vehicle:a', T0 + 20_000)!;
    expect(distM(end.front, P(25, 70))).toBeLessThan(0.8);
    expect(angDiff(end.bearing!, 0)).toBeLessThan(5);
  });
  it('bez trati zůstává původní chování (přímka podle směru)', () => {
    const f = new TrackFollower(() => 12);
    f.update([veh('b', P(0, 0), T0, 90)], T0, T0, () => null);
    const s = f.sample('pid:vehicle:b', T0)!;
    expect(s.onTrack).toBe(false);
    expect(polyLength(s.body)).toBeCloseTo(12, 0);
  });
});

describe('3D a části spritu', () => {
  const body = [P(-22, 0), P(-11, 0), P(0, 0)];
  const shape = { id: 'pid:vehicle:x', mode: 'tram' as const, lengthM: 22, widthM: 2.5, pieces: [{ fromFront: 0, toFront: 0.5 }, { fromFront: 0.5, toFront: 1 }], bidirectional: false, stale: false, selected: false, detail: true };
  it('obrys části je uzavřený a má správnou šířku', () => {
    const ring = partPolygon(P(0, 0), P(10, 0), 2.5);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    const ys = ring.map((p) => distM({ lng: p.lng, lat: O.lat }, p));
    expect(Math.max(...ys) * 2).toBeCloseTo(2.5, 1);
  });
  it('kloubová tramvaj: pruhy, čelo, kloub a pantograf; části spritu natočené po trati', () => {
    const ext = buildExtrusions(body, shape);
    expect(ext.length).toBeGreaterThan(8);
    for (const f of ext) { const p = f.properties as { base: number; height: number }; expect(p.height).toBeGreaterThan(p.base); }
    const pieces = buildPieces(body, shape, 'tram-top-redwhite', {});
    expect(pieces).toHaveLength(2);
    for (const p of pieces) expect((p.properties as { rot: number }).rot).toBeCloseTo(90, 0);
  });
});
