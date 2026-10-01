import { describe, expect, it } from 'vitest';
import { describeDelay } from '@/domain/delay';
import { classifyPositionAge } from '@/domain/freshness';
import { haversineM } from '@/domain/geo';
import { nsId } from '@/domain/ids';
import { knownDelay, UNKNOWN_DELAY, type Mode, type VehicleState } from '@/domain/model';
import { departureDelay } from '@/providers/pid/golemio';
import { VehicleAnimator } from '@/map/animator';

describe('zpoždění: nula ≠ neznámá hodnota', () => {
  it('neznámé zpoždění se nikdy nezobrazí jako včas', () => {
    const d = describeDelay(UNKNOWN_DELAY);
    expect(d.tone).toBe('unknown');
    expect(d.label).not.toMatch(/včas/i);
  });
  it('známá nula, zpoždění a náskok', () => {
    expect(describeDelay(knownDelay(0))).toMatchObject({ tone: 'ok', label: 'Včas' });
    expect(describeDelay(knownDelay(29)).tone).toBe('ok');
    expect(describeDelay(knownDelay(30))).toMatchObject({ tone: 'late', short: '+1' });
    expect(describeDelay(knownDelay(180))).toMatchObject({ tone: 'late', label: 'Zpoždění 3 min' });
    expect(describeDelay(knownDelay(-120))).toMatchObject({ tone: 'early', short: '−2' });
  });
  it('Golemio: is_available=false znamená neznámé, i když je v datech 0', () => {
    expect(departureDelay({ is_available: false, seconds: 0, minutes: 0 })).toEqual(UNKNOWN_DELAY);
    expect(departureDelay({ is_available: true, seconds: 0 })).toEqual(knownDelay(0));
    expect(departureDelay({ is_available: true, minutes: 2 })).toEqual(knownDelay(120));
    expect(departureDelay(undefined)).toEqual(UNKNOWN_DELAY);
    expect(departureDelay({ is_available: true })).toEqual(UNKNOWN_DELAY);
  });
  it('aktuálnost polohy: živá / zastaralá / prošlá', () => {
    expect(classifyPositionAge(null)).toBe('unknown');
    expect(classifyPositionAge(5)).toBe('live');
    expect(classifyPositionAge(90)).toBe('live');
    expect(classifyPositionAge(91)).toBe('stale');
    expect(classifyPositionAge(300)).toBe('stale');
    expect(classifyPositionAge(301)).toBe('expired');
    expect(classifyPositionAge(-30)).toBe('live');
    expect(classifyPositionAge(-600)).toBe('unknown');
  });
});

const T0 = Date.parse('2026-10-01T12:00:00Z');
const ID = 'pid:vehicle:a';
const P0 = { lng: 14.4, lat: 50.07 };
const P1 = { lng: 14.4007, lat: 50.07 }; // ~50 m na východ
function veh(id: string, lng: number, lat: number, measuredAt: number, bearing: number | null = null, mode: Mode = 'tram'): VehicleState {
  return { id: nsId('pid', 'vehicle', id), route: { id: null, shortName: '9', mode }, tripId: null, headsign: null, lat, lon: lng, bearing,
    bearingSource: bearing === null ? null : 'provider', speedMps: null, delay: knownDelay(0), measuredAt: new Date(measuredAt).toISOString(), registration: null,
    vehicleTypeLabel: null, wheelchair: null, airConditioned: null, isCanceled: false, positionState: 'on_track', lastStopName: null, nextStopName: null };
}

describe('pohyb vozidel', () => {
  it('interpoluje mezi měřeními a za poslední měření neextrapoluje', () => {
    const a = new VehicleAnimator();
    a.ingest([veh('a', P0.lng, P0.lat, T0, 90)], T0, T0);
    expect(a.sample(ID, T0)).toMatchObject({ lng: P0.lng, lat: P0.lat });
    a.ingest([veh('a', P1.lng, P1.lat, T0 + 10_000, 90)], T0 + 10_000, T0 + 10_000);
    expect(a.sample(ID, T0 + 10_000)!.lng).toBeCloseTo(P0.lng, 9);
    expect(a.sample(ID, T0 + 15_000)!.lng).toBeCloseTo((P0.lng + P1.lng) / 2, 9);
    expect(a.sample(ID, T0 + 20_000)!.lng).toBeCloseTo(P1.lng, 9);
    expect(a.sample(ID, T0 + 120_000)!.lng).toBeCloseTo(P1.lng, 9);
    expect(a.isAnimating(T0 + 120_000)).toBe(false);
  });
  it('pozdě doručená (starší) data ignoruje', () => {
    const a = new VehicleAnimator();
    a.ingest([veh('a', P1.lng, P1.lat, T0 + 10_000, 90)], T0, T0);
    a.ingest([veh('a', P0.lng, P0.lat, T0, 90)], T0 + 1000, T0 + 1000);
    expect(a.sample(ID, T0 + 5000)!.lng).toBeCloseTo(P1.lng, 9);
    expect(a.sample(ID, T0 + 5000)!.measuredAt).toBe(T0 + 10_000);
  });
  it('velký skok GPS zobrazí bez animace', () => {
    const a = new VehicleAnimator();
    a.ingest([veh('a', P0.lng, P0.lat, T0, 90)], T0, T0);
    a.ingest([veh('a', 14.43, 50.07, T0 + 10_000, 90)], T0 + 10_000, T0 + 10_000);
    const s = a.sample(ID, T0 + 10_000)!;
    expect(s.jumped).toBe(true);
    expect(s.lng).toBeCloseTo(14.43, 9);
  });
  it('směr odvodí z dostatečného pohybu, šum jej nezmění; GTFS direction_id se nepoužívá', () => {
    const a = new VehicleAnimator();
    a.ingest([veh('a', P0.lng, P0.lat, T0)], T0, T0);
    a.ingest([veh('a', P1.lng, P1.lat, T0 + 10_000)], T0 + 10_000, T0 + 10_000);
    const s = a.sample(ID, T0 + 20_000)!;
    expect(s.bearingSource).toBe('derived');
    expect(s.bearing!).toBeGreaterThan(85); expect(s.bearing!).toBeLessThan(95);
    a.ingest([veh('a', P1.lng + 0.00002, P1.lat, T0 + 20_000)], T0 + 20_000, T0 + 20_000);
    expect(a.sample(ID, T0 + 40_000)!.bearing!).toBeCloseTo(s.bearing!, 6);
  });
  it('natočení přechází 359° → 1° nejkratší cestou', () => {
    const a = new VehicleAnimator();
    a.ingest([veh('a', P0.lng, P0.lat, T0, 359)], T0, T0);
    a.ingest([veh('a', P0.lng, P0.lat + 0.0003, T0 + 10_000, 1)], T0 + 10_000, T0 + 10_000);
    const mid = a.sample(ID, T0 + 15_000)!.bearing!;
    expect(Math.min(mid, 360 - mid)).toBeLessThan(1.01);
  });
  it('omezené animace a odebrání vozidel po přepnutí zdroje', () => {
    const a = new VehicleAnimator({ maxAnimMs: 12_000, minAnimMs: 800, minMoveForBearingM: 12, reducedMotion: true });
    a.ingest([veh('a', P0.lng, P0.lat, T0, 90)], T0, T0);
    a.ingest([veh('a', P1.lng, P1.lat, T0 + 10_000, 90)], T0 + 10_000, T0 + 10_000);
    expect(a.sample(ID, T0 + 10_000)!.lng).toBeCloseTo(P1.lng, 9);
    a.ingest([veh('b', P0.lng, P0.lat, T0 + 20_000, 0)], T0 + 20_000, T0 + 20_000);
    expect(a.sample(ID, T0 + 20_000)).toBeNull();
    expect(a.size).toBe(1);
    expect(haversineM(P0, P1)).toBeGreaterThan(45);
  });
});
