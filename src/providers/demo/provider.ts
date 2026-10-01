import { nsId } from '@/domain/ids';
import { initialBearingDeg, lerpLngLat, inBBox, type BBox } from '@/domain/geo';
import { knownDelay, UNKNOWN_DELAY, type Alert, type Departure, type Envelope, type Mode, type SourceMeta, type StopGroup, type StopPoint, type VehicleState } from '@/domain/model';
import { normalizeName } from '../pid/stops';
import { pointAlong, polyLength } from '@/map/geometry';
import { DEMO_TRACK_7 } from './track';
import type { TransitProvider } from '../types';

/**
 * UKÁZKOVÁ DATA pro vývoj a testy. Souřadnice zastávek pocházejí z příkladů v oficiální dokumentaci PID
 * (pid.cz/o-systemu/opendata, CC BY 4.0). Vozidla, časy a zpoždění jsou vymyšlené a v UI se tak označují.
 */
const ATTR = 'Ukázková data – nejde o skutečný provoz';
const meta = (source: string): SourceMeta => ({ provider: 'demo', source, status: 'demo', fetchedAt: new Date().toISOString(), sourceTimestamp: new Date().toISOString(), ageSeconds: 0, attribution: ATTR, message: 'Ukázková data pro vývoj – nejsou skutečná.' });

type P = { id: string; platform: string; lat: number; lon: number; lines: [string, Mode, string][] };
const G = (name: string, municipality: string, modes: Mode[], ps: P[]): StopGroup => ({
  key: name, name, municipality, modes,
  lat: ps.reduce((s, p) => s + p.lat, 0) / ps.length, lon: ps.reduce((s, p) => s + p.lon, 0) / ps.length,
  platforms: ps.map((p) => ({ id: nsId('demo', 'stop', p.id), groupKey: name, name, platform: p.platform, lat: p.lat, lon: p.lon,
    modes: [...new Set(p.lines.map((l) => l[1]))], lines: p.lines.map(([n, mode, direction]) => ({ name: n, mode, direction, isNight: false })) })),
});

export const DEMO_GROUPS: StopGroup[] = [
  G('Anděl', 'Praha', ['metro', 'tram', 'bus'], [
    { id: '1040/1', platform: 'A', lat: 50.07193, lon: 14.40363, lines: [['9', 'tram', 'Sídliště Řepy'], ['12', 'tram', 'Sídliště Barrandov']] },
    { id: '1040/2', platform: 'B', lat: 50.0719528, lon: 14.4028063, lines: [['9', 'tram', 'Spojovací'], ['12', 'tram', 'Výstaviště']] },
    { id: '1040/3', platform: 'C', lat: 50.071804, lon: 14.4042273, lines: [['4', 'tram', 'Sídliště Modřany'], ['20', 'tram', 'Nádraží Braník']] },
    { id: '1040/4', platform: 'D', lat: 50.0709763, lon: 14.40455, lines: [['4', 'tram', 'Čechovo náměstí'], ['20', 'tram', 'Divoká Šárka']] },
    { id: '1040/11', platform: 'K', lat: 50.0717354, lon: 14.4019508, lines: [['176', 'bus', 'Karlovo náměstí']] },
    { id: '1040/12', platform: 'L', lat: 50.0715, lon: 14.4029284, lines: [['176', 'bus', 'Stadion Strahov']] },
    { id: '1040/101', platform: 'M1', lat: 50.06953, lon: 14.4035711, lines: [['B', 'metro', 'Zličín']] },
    { id: '1040/102', platform: 'M2', lat: 50.070488, lon: 14.4048777, lines: [['B', 'metro', 'Černý Most']] },
  ]),
  G('Můstek', 'Praha', ['metro'], [
    { id: 'U1072Z101P', platform: 'M1', lat: 50.08312, lon: 14.42496, lines: [['A', 'metro', 'Depo Hostivař']] },
    { id: 'U1072Z102P', platform: 'M2', lat: 50.08394, lon: 14.42415, lines: [['A', 'metro', 'Nemocnice Motol']] },
    { id: 'U1072Z121P', platform: 'M3', lat: 50.08321, lon: 14.42279, lines: [['B', 'metro', 'Zličín']] },
    { id: 'U1072Z122P', platform: 'M4', lat: 50.08361, lon: 14.42398, lines: [['B', 'metro', 'Černý Most']] },
  ]),
  G('Černý Most', 'Praha', ['metro', 'bus'], [{ id: 'U897Z1P', platform: 'V1', lat: 50.10912, lon: 14.57713, lines: [['B', 'metro', 'Zličín']] }]),
];

const pt = (key: string, platform: string) => { const p = DEMO_GROUPS.find((g) => g.key === key)!.platforms.find((x) => x.platform === platform)!; return { lng: p.lon, lat: p.lat }; };

interface DemoRun { reg: string; line: string; mode: Mode; headsign: string; a: { lng: number; lat: number }; b: { lng: number; lat: number }; periodS: number; phaseS: number; delayS: number | null; bearingKnown: boolean; ageOffsetS?: number }
const RUNS: DemoRun[] = [
  { reg: '9241', line: '9', mode: 'tram', headsign: 'Spojovací', a: pt('Anděl', 'B'), b: pt('Anděl', 'A'), periodS: 60, phaseS: 0, delayS: 60, bearingKnown: true },
  { reg: '9312', line: '12', mode: 'tram', headsign: 'Sídliště Barrandov', a: pt('Anděl', 'A'), b: pt('Anděl', 'B'), periodS: 60, phaseS: 30, delayS: 0, bearingKnown: true },
  { reg: '9418', line: '4', mode: 'tram', headsign: 'Sídliště Modřany', a: pt('Anděl', 'C'), b: pt('Anděl', 'D'), periodS: 70, phaseS: 10, delayS: null, bearingKnown: true },
  { reg: '9120', line: '20', mode: 'tram', headsign: 'Divoká Šárka', a: pt('Anděl', 'D'), b: pt('Anděl', 'C'), periodS: 70, phaseS: 45, delayS: 180, bearingKnown: true },
  { reg: '8571', line: '176', mode: 'bus', headsign: 'Karlovo náměstí', a: pt('Anděl', 'K'), b: pt('Anděl', 'L'), periodS: 80, phaseS: 0, delayS: 0, bearingKnown: false },
  { reg: '9005', line: '9', mode: 'tram', headsign: 'Sídliště Řepy', a: pt('Anděl', 'A'), b: pt('Anděl', 'B'), periodS: 90, phaseS: 0, delayS: 0, bearingKnown: true, ageOffsetS: 200 },
];

const TRACK7 = DEMO_TRACK_7.map(([lng, lat]) => ({ lng, lat }));
const TRACK7_LEN = polyLength(TRACK7);

/** Ukázková tramvaj na oblouku: měření po 10 s (GPS posunutá o 4 m vedle koleje), jízda tam i zpět. */
function curveRun(measuredMs: number): VehicleState {
  const t = ((measuredMs / 1000) % 120) / 120;
  const forward = t < 0.5;
  const d = (forward ? t * 2 : (1 - t) * 2) * TRACK7_LEN;
  const at = pointAlong(TRACK7, d);
  const b = at.bearing === null ? 0 : forward ? at.bearing : (at.bearing + 180) % 360;
  const gps = { lng: at.p.lng + 0.00004, lat: at.p.lat + 0.00002 };
  return { id: nsId('demo', 'vehicle', '9350'), route: { id: nsId('demo', 'route', '7'), shortName: '7', mode: 'tram' }, tripId: nsId('demo', 'trip', '7-9350'),
    headsign: forward ? 'Radlická' : 'Anděl', lat: gps.lat, lon: gps.lng, bearing: Math.round(b), bearingSource: 'provider', speedMps: 6,
    delay: knownDelay(120), measuredAt: new Date(measuredMs).toISOString(), registration: '9350', vehicleTypeLabel: null, wheelchair: true, airConditioned: true,
    isCanceled: false, positionState: 'on_track', lastStopName: 'Anděl', nextStopName: null };
}

/** Poloha se „měří“ po 10 s – klient tak ověřuje interpolaci mezi měřeními. */
export function demoVehicles(nowMs: number): VehicleState[] {
  return [curveRun(Math.floor(nowMs / 10_000) * 10_000), ...RUNS.map((r): VehicleState => {
    const measuredMs = Math.floor(nowMs / 10_000) * 10_000 - (r.ageOffsetS ?? 0) * 1000;
    const t = (((measuredMs / 1000 + r.phaseS) % r.periodS) + r.periodS) % r.periodS / r.periodS;
    const forward = t < 0.5;
    const u = forward ? t * 2 : (1 - t) * 2;
    const pos = lerpLngLat(r.a, r.b, u);
    const bearing = forward ? initialBearingDeg(r.a, r.b) : initialBearingDeg(r.b, r.a);
    return {
      id: nsId('demo', 'vehicle', r.reg), route: { id: nsId('demo', 'route', r.line), shortName: r.line, mode: r.mode },
      tripId: nsId('demo', 'trip', `${r.line}-${r.reg}`), headsign: r.headsign, lat: pos.lat, lon: pos.lng,
      bearing: r.bearingKnown ? Math.round(bearing * 10) / 10 : null, bearingSource: r.bearingKnown ? 'provider' : null,
      speedMps: 4, delay: r.delayS === null ? UNKNOWN_DELAY : knownDelay(r.delayS), measuredAt: new Date(measuredMs).toISOString(),
      registration: r.reg, vehicleTypeLabel: null, wheelchair: true, airConditioned: r.mode === 'tram' ? true : null, isCanceled: false,
      positionState: 'on_track', lastStopName: 'Anděl', nextStopName: null,
    };
  })];
}

/** Testovací vozidla pro ověření natočení: každé kategorie čtyři směry (S, V, J, Z) a přechod 359°→1°. */
export function demoRotationVehicles(nowMs: number, centerLng = 14.38, centerLat = 50.06): VehicleState[] {
  const dirs: [string, number][] = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];
  const out: VehicleState[] = [];
  (['tram', 'train'] as Mode[]).forEach((mode, row) => dirs.forEach(([name, deg], i) => {
    out.push({ id: nsId('demo', 'vehicle', `rot-${mode}-${name}`), route: { id: null, shortName: name, mode }, tripId: null, headsign: `${name} ${deg}°`,
      lat: centerLat + (row === 0 ? 0.0004 : -0.0004), lon: centerLng + (i - 1.5) * 0.0011, bearing: deg, bearingSource: 'provider', speedMps: null,
      delay: knownDelay(0), measuredAt: new Date(nowMs).toISOString(), registration: null, vehicleTypeLabel: null, wheelchair: null, airConditioned: null,
      isCanceled: false, positionState: 'on_track', lastStopName: null, nextStopName: null });
  }));
  const wrap = ((nowMs / 1000) % 8) < 4 ? 359 : 1;
  out.push({ ...out[0]!, id: nsId('demo', 'vehicle', 'rot-wrap'), route: { id: null, shortName: '359↔1', mode: 'tram' }, headsign: 'Přechod 359°/0°', lat: centerLat + 0.0012, lon: centerLng, bearing: wrap });
  return out;
}

function demoDepartures(group: StopGroup, nowMs: number, limit: number): Departure[] {
  const out: Departure[] = [];
  const base = Math.floor(nowMs / 60_000) * 60_000;
  group.platforms.forEach((p, pi) => p.lines.forEach((l, li) => {
    for (let k = 0; k < 4; k++) {
      const sched = base + ((pi * 2 + li * 3 + k * 7) % 40) * 60_000 + 60_000;
      const variant = (pi + li + k) % 5;
      const delay = variant === 0 ? UNKNOWN_DELAY : knownDelay([0, 60, 0, 240][variant - 1] ?? 0);
      out.push({ id: `demo-${p.id}-${l.name}-${k}`, route: { id: null, shortName: l.name, mode: l.mode }, tripId: null, headsign: l.direction ?? '—', platform: p.platform, stopName: group.name,
        scheduledAt: new Date(sched).toISOString(), predictedAt: delay.kind === 'known' ? new Date(sched + delay.seconds * 1000).toISOString() : null,
        delay, isCanceled: variant === 3 && k === 2, isAtStop: false, wheelchair: variant !== 1, airConditioned: l.mode === 'tram' ? true : null });
    }
  }));
  return out.sort((a, b) => Date.parse(a.predictedAt ?? a.scheduledAt!) - Date.parse(b.predictedAt ?? b.scheduledAt!)).slice(0, limit);
}

export function createDemoProvider(now: () => number = Date.now): TransitProvider {
  const env = <T>(data: T, source: string): Envelope<T> => ({ data, meta: meta(source) });
  return {
    info: { id: 'demo', name: 'Ukázková data', territory: 'Ukázka', attribution: ATTR, license: '—' },
    async vehicles(bbox: BBox | null) { const v = demoVehicles(now()); return env(bbox ? v.filter((x) => inBBox(bbox, x.lon, x.lat)) : v, 'demo:vehicles'); },
    async departures(groupKey: string, limit: number) {
      const group = DEMO_GROUPS.find((g) => g.key === groupKey) ?? null;
      return env({ group, departures: group ? demoDepartures(group, now(), limit) : [], notices: group ? ['Ukázkové upozornění: odjezdy jsou vygenerované pro vývoj.'] : [] }, 'demo:departures');
    },
    async searchStops(q: string, limit: number) {
      const n = normalizeName(q);
      return env(n.length < 2 ? [] : DEMO_GROUPS.filter((g) => normalizeName(g.name).includes(n)).slice(0, limit), 'demo:stops');
    },
    async stopsInView(bbox: BBox) { return env<StopPoint[]>(DEMO_GROUPS.flatMap((g) => g.platforms).filter((p) => inBBox(bbox, p.lon, p.lat)), 'demo:stops'); },
    async alerts() { return env<Alert[]>([{ id: nsId('demo', 'alert', '1'), title: 'Ukázková mimořádnost: omezení provozu tramvají', summary: 'Tento text je ukázkový a neodpovídá skutečnému provozu.', link: null, publishedAt: new Date(now() - 1800_000).toISOString() }], 'demo:alerts'); },
  };
}
