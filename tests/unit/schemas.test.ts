import { describe, expect, it } from 'vitest';
import { METRO_SCHEMA, progressOnStations, schemaPoint } from '@/domain/metro';
import { mapVehicleDetail, VEHICLE_ID_RE } from '@/providers/pid/golemio';
import { createDemoProvider } from '@/providers/demo/provider';

describe('schéma metra', () => {
  it('má všechny stanice A, B, C a přestupy ve shodných bodech', () => {
    expect(METRO_SCHEMA.A).toHaveLength(17);
    expect(METRO_SCHEMA.B).toHaveLength(24);
    expect(METRO_SCHEMA.C).toHaveLength(20);
    const at = (l: 'A' | 'B' | 'C', n: string) => METRO_SCHEMA[l].find((s) => s.name === n)!;
    for (const [l1, l2, n] of [['A', 'B', 'Můstek'], ['A', 'C', 'Muzeum'], ['B', 'C', 'Florenc']] as const) {
      expect(at(l1, n)).toMatchObject({ x: at(l2, n).x, y: at(l2, n).y, transfer: true });
    }
    expect(METRO_SCHEMA.A.filter((s) => s.transfer).map((s) => s.name)).toEqual(['Můstek', 'Muzeum']);
  });
  it('převede polohu soupravy na místo mezi stanicemi a pozná směr', () => {
    const st = [{ lat: 50.0, lon: 14.0 }, { lat: 50.0, lon: 14.01 }, { lat: 50.0, lon: 14.02 }];
    const p = progressOnStations(st, 50.0001, 14.015)!;
    expect(p.index).toBeCloseTo(1.5, 1);
    expect(p.dist).toBeLessThan(20);
    expect(p.segBearing).toBeCloseTo(90, 0);
    const a = schemaPoint('C', 0), b = schemaPoint('C', 1), m = schemaPoint('C', 0.5);
    expect(m.y).toBeCloseTo((a.y + b.y) / 2, 5);
  });
});

describe('průběh spoje z detailu vozidla Golemio', () => {
  const raw = { route_type: 'tram', route_short_name: '22', trip_headsign: 'Bílá Hora', delay: 120, last_stop_sequence: 3,
    stop_times: { type: 'FeatureCollection', features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [14.43, 50.07] }, properties: { stop_name: 'Muzeum', stop_sequence: 2, arrival_time: '12:01:00', departure_time: '12:01:00' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [14.42, 50.075] }, properties: { stop_name: 'I. P. Pavlova', stop_sequence: 1, arrival_time: '12:00:00' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [14.44, 50.08] }, properties: { stop_name: 'Vinohradská tržnice', stop_sequence: 3, realtime_arrival_time: '2026-10-03T10:03:30Z' } },
      { type: 'Feature', geometry: null, properties: { stop_name: 'vadná', stop_sequence: 9 } }] },
    shapes: { type: 'FeatureCollection', features: [[14.42, 50.075], [14.42001, 50.07501], [14.43, 50.07], [14.44, 50.08]].map((c) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: {} })) } };
  it('zastávky seřadí podle pořadí, vadné vynechá, tvar zředí', () => {
    const d = mapVehicleDetail(raw, 'pid:vehicle:reg-0-9257')!;
    expect(d.stops.map((s) => s.name)).toEqual(['I. P. Pavlova', 'Muzeum', 'Vinohradská tržnice']);
    expect(d).toMatchObject({ line: '22', mode: 'tram', headsign: 'Bílá Hora', lastStopSeq: 3, delay: { kind: 'known', seconds: 120 } });
    expect(d.shape).toHaveLength(3);
    expect(mapVehicleDetail({ nonsense: true }, 'x')).toBeNull();
  });
  it('ID vozu se ověřuje (žádné vkládání do URL)', () => {
    expect(VEHICLE_ID_RE.test('service-0-9257')).toBe(true);
    for (const bad of ['service-0-92/57', '../../admin', 'service-0-9257?x=1', 'service-x-1']) expect(VEHICLE_ID_RE.test(bad)).toBe(false);
  });
});

describe('ukázková data pro schémata', () => {
  it('metro má stanice se souřadnicemi a soupravy; tramvaj má průběh spoje', async () => {
    const p = createDemoProvider(() => Date.parse('2026-10-03T10:00:00Z'));
    const m = await p.metro();
    expect(m.data.map((l) => l.stations.length)).toEqual([17, 24, 20]);
    const v = await p.vehicles(null);
    expect(v.data.filter((x) => x.route.mode === 'metro').length).toBeGreaterThanOrEqual(6);
    const tram = v.data.find((x) => x.route.mode === 'tram')!;
    const t = await p.trip(tram.id);
    expect(t.data?.stops.length).toBeGreaterThanOrEqual(2);
  });
});
