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
  it('přichytí GPS mimo kolej, jede po oblouku dál v reálném čase, karoserie sleduje trať a vozidlo necouvá', () => {
    const f = new TrackFollower(() => 22);
    f.update([veh('a', P(-60, 6), T0, 90)], T0, T0, () => net);
    const s0 = f.sample('pid:vehicle:a', T0)!;
    expect(s0.onTrack).toBe(true);
    expect(distM(s0.front, P(-60, 0))).toBeLessThan(0.6);
    expect(polyLength(s0.body)).toBeCloseTo(22, 0);
    // druhé měření o 10 s později za obloukem → rychlost ≈ 14 m/s po trati
    f.update([veh('a', P(31, 70), T0 + 10_000, 0)], T0 + 10_000, T0 + 10_000, () => net);
    let lastY = -Infinity, prevX = -Infinity;
    for (const t of [500, 1500, 3000, 6000, 9000]) {
      const s = f.sample('pid:vehicle:a', T0 + 10_000 + t)!;
      expect(net.nearest(s.front, 0.8)).not.toBeNull();
      for (const p of s.body) expect(net.nearest(p, 1)).not.toBeNull();
      const e = distM({ lng: O.lng, lat: s.front.lat }, { lng: s.front.lng, lat: s.front.lat }) * Math.sign(s.front.lng - O.lng);
      const n = distM({ lng: s.front.lng, lat: O.lat }, s.front) * Math.sign(s.front.lat - O.lat);
      // pohyb jen dopředu: nejdřív na východ, za obloukem na sever
      expect(e >= prevX - 0.5 || n >= lastY - 0.5).toBe(true);
      prevX = Math.max(prevX, e); lastY = Math.max(lastY, n);
    }
    // 9 s po měření je souprava zhruba o 9 s × rychlost za změřeným bodem (25, 70)
    const late = f.sample('pid:vehicle:a', T0 + 19_000)!;
    const ahead = distM(late.front, P(25, 70));
    expect(ahead).toBeGreaterThan(60);
    expect(angDiff(late.bearing!, 0)).toBeLessThan(5);
    // za horizontem odhadu se zastaví
    const a = f.sample('pid:vehicle:a', T0 + 40_000)!, b = f.sample('pid:vehicle:a', T0 + 60_000)!;
    expect(distM(a.front, b.front)).toBeLessThan(0.01);
  });
  it('měření za odhadnutou polohou: vozidlo počká, necouvá', () => {
    const f = new TrackFollower(() => 22);
    f.update([veh('c', P(-150, 0), T0, 90)], T0, T0, () => net);
    f.update([veh('c', P(-110, 0), T0 + 4_000, 90)], T0 + 4_000, T0 + 4_000, () => net);
    const ahead = f.sample('pid:vehicle:c', T0 + 9_000)!;
    f.update([veh('c', P(-90, 0), T0 + 9_000, 90)], T0 + 9_000, T0 + 9_000, () => net);
    const after = f.sample('pid:vehicle:c', T0 + 9_200)!;
    const x = (p: LngLat) => (p.lng - O.lng) / (P(1, 0).lng - O.lng);
    expect(x(after.front)).toBeGreaterThanOrEqual(x(ahead.front) - 0.5);
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

describe('reálný čas: dopočet polohy po trati', () => {
  const T0 = Date.parse('2026-10-01T12:00:00Z');
  const line: LngLat[] = []; for (let e = -400; e <= 400; e += 10) line.push(P(e, 0));
  const net = new TrackNetwork([line], O.lat);
  const mk = (e: number, t: number, speed: number | null) => ({ ...veh('r', P(e, 0), t, 90), speedMps: speed });
  it('pokračuje po trati rychlostí z dat a zastaví na zastávce', () => {
    const f = new TrackFollower(() => 20);
    f.setStops([P(150, 4)]);
    f.update([mk(0, T0, null)], T0, T0, () => net);
    f.update([mk(100, T0 + 10_000, 10)], T0 + 10_000, T0 + 10_000, () => net);
    const s5 = f.sample('pid:vehicle:r', T0 + 15_000)!;
    expect(s5.front.lng).toBeGreaterThan(P(140, 0).lng); // ~150 m − 4 m: dopočteno k zastávce
    expect(s5.predictedS).toBeGreaterThanOrEqual(0);
    const s20 = f.sample('pid:vehicle:r', T0 + 40_000)!;
    expect(distM(s20.front, P(146, 0))).toBeLessThan(2); // na zastávce stojí, nepřejede ji
    expect(net.nearest(s20.front, 0.5)).not.toBeNull();
  });
  it('při zpožděném měření necouvá: počká, dokud ho předpověď nedožene', () => {
    const f = new TrackFollower(() => 20);
    f.update([mk(0, T0, 10)], T0, T0, () => net);
    const ahead = f.sample('pid:vehicle:r', T0 + 20_000)!; // ~200 m
    f.update([mk(150, T0 + 12_000, 10)], T0 + 20_000, T0 + 20_000, () => net); // nové měření je za zobrazenou polohou
    const after = f.sample('pid:vehicle:r', T0 + 20_500)!;
    expect(after.front.lng).toBeGreaterThanOrEqual(ahead.front.lng - 1e-7);
  });
});

describe('fronta na zastávce: vozidla se nepřekrývají', () => {
  const T0 = Date.parse('2026-10-02T00:10:00Z');
  const line: LngLat[] = []; for (let e = -400; e <= 400; e += 10) line.push(P(e, 0));
  const net = new TrackNetwork([line], O.lat);
  const tram = (id: string, e: number, t: number, speed: number) => ({ ...veh(id, P(e, 0), t, 90), speedMps: speed });
  it('tři tramvaje mířící na stejnou zastávku zastaví za sebou s rozestupem', () => {
    const f = new TrackFollower(() => 30);
    f.setStops([P(150, 4)]);
    const list = [tram('a', 100, T0, 8), tram('b', 60, T0, 8), tram('c', 20, T0, 8)];
    f.update(list, T0, T0, () => net);
    const fronts = ['a', 'b', 'c'].map((id) => f.sample(`pid:vehicle:${id}`, T0 + 19_000)!.front);
    expect(distM(fronts[0]!, fronts[1]!)).toBeGreaterThanOrEqual(30);
    expect(distM(fronts[1]!, fronts[2]!)).toBeGreaterThanOrEqual(30);
    expect(fronts[0]!.lng).toBeGreaterThan(fronts[1]!.lng);
  });
});
