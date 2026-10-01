import { describe, expect, it } from 'vitest';
import { isValidBearing, lerpAngle, normalizeDeg, screenAngleOfFront, shortestDelta, spriteIconRotate } from '@/domain/angles';
import { haversineM, inBBox, inCzechia, initialBearingDeg, isValidLngLat, metersPerPixel, parseBBox } from '@/domain/geo';
import { formatAge, formatClock, gtfsTimeToEpochMs, minutesUntil, parseGtfsTime, tzOffsetMinutes, zonedToEpochMs } from '@/domain/time';

describe('úhly a natočení spritu', () => {
  it('normalizuje do <0, 360)', () => {
    expect(normalizeDeg(-90)).toBe(270);
    expect(normalizeDeg(360)).toBe(0);
    expect(normalizeDeg(725)).toBe(5);
    expect(Object.is(normalizeDeg(-0), 0)).toBe(true);
  });
  it('nejkratší rozdíl a interpolace přes hranici 359°/0°', () => {
    expect(shortestDelta(359, 1)).toBe(2);
    expect(shortestDelta(1, 359)).toBe(-2);
    expect(shortestDelta(10, 190)).toBe(180);
    expect(lerpAngle(359, 1, 0.5)).toBeCloseTo(0, 6);
    expect(lerpAngle(350, 10, 0.25)).toBeCloseTo(355, 6);
    expect(lerpAngle(10, 350, 0.5)).toBeCloseTo(0, 6);
  });
  it('icon-rotate = směr jízdy − orientace čela; natočení mapy se nepřičítá', () => {
    expect(spriteIconRotate(0, 0)).toBe(0);
    expect(spriteIconRotate(90, 0)).toBe(90);
    expect(spriteIconRotate(270, 0)).toBe(270);
    expect(spriteIconRotate(90, 90)).toBe(0);
    expect(spriteIconRotate(10, 180)).toBe(190);
  });
  it('sever, východ, jih a západ při různém natočení mapy (mapa započtena právě jednou)', () => {
    for (const mapBearing of [0, 45, 90, 180, 270, 315, 359]) for (const heading of [0, 90, 180, 270]) {
      expect(screenAngleOfFront(heading, mapBearing, 0)).toBeCloseTo(normalizeDeg(heading - mapBearing), 6);
    }
    expect(screenAngleOfFront(90, 0, 0)).toBe(90);
    expect(screenAngleOfFront(90, 90, 0)).toBe(0);
    expect(screenAngleOfFront(0, 180, 0)).toBe(180);
  });
  it('validuje údaj o směru', () => {
    expect(isValidBearing(NaN)).toBe(false);
    expect(isValidBearing(-1)).toBe(false);
    expect(isValidBearing(361)).toBe(false);
    expect(isValidBearing(359.9)).toBe(true);
    expect(isValidBearing('90')).toBe(false);
  });
});

describe('geografie', () => {
  const A = { lng: 14.40363, lat: 50.07193 }; // Anděl A (dokumentace PID)
  const B = { lng: 14.4028063, lat: 50.0719528 }; // Anděl B
  it('haversine a azimut', () => {
    const d = haversineM(A, B);
    expect(d).toBeGreaterThan(55); expect(d).toBeLessThan(62);
    expect(initialBearingDeg(B, A)).toBeGreaterThan(85); expect(initialBearingDeg(B, A)).toBeLessThan(95);
    expect(initialBearingDeg(A, B)).toBeGreaterThan(265); expect(initialBearingDeg(A, B)).toBeLessThan(275);
  });
  it('metry na pixel (dlaždice 512 px)', () => {
    expect(metersPerPixel(0, 0)).toBeCloseTo(78271.517, 2);
    expect(metersPerPixel(50, 16) / metersPerPixel(50, 17)).toBeCloseTo(2, 9);
    expect(metersPerPixel(60, 10)).toBeCloseTo(metersPerPixel(0, 10) / 2, 6);
  });
  it('pořadí souřadnic a výřez mapy', () => {
    expect(isValidLngLat(14.4, 50.1)).toBe(true);
    expect(inCzechia(14.4, 50.1)).toBe(true);
    expect(inCzechia(50.1, 14.4)).toBe(false);
    expect(parseBBox('14.3,50.0,14.5,50.1')).toEqual([14.3, 50.0, 14.5, 50.1]);
    expect(parseBBox('14.5,50.0,14.3,50.1')).toBeNull();
    expect(parseBBox('a,b,c,d')).toBeNull();
    expect(parseBBox('1,2,3')).toBeNull();
    expect(parseBBox(null)).toBeNull();
    expect(inBBox([14, 50, 15, 51], 14.5, 50.5)).toBe(true);
  });
});

describe('čas Europe/Prague a GTFS', () => {
  it('posun pásma a změny času 2026', () => {
    expect(tzOffsetMinutes(Date.parse('2026-01-15T12:00:00Z'))).toBe(60);
    expect(tzOffsetMinutes(Date.parse('2026-07-15T12:00:00Z'))).toBe(120);
    expect(tzOffsetMinutes(Date.parse('2026-03-29T00:59:00Z'))).toBe(60);
    expect(tzOffsetMinutes(Date.parse('2026-03-29T01:00:00Z'))).toBe(120);
    expect(tzOffsetMinutes(Date.parse('2026-10-25T00:59:00Z'))).toBe(120);
    expect(tzOffsetMinutes(Date.parse('2026-10-25T01:00:00Z'))).toBe(60);
  });
  it('místní čas → okamžik', () => {
    expect(new Date(zonedToEpochMs(2026, 7, 1, 12, 0, 0)).toISOString()).toBe('2026-07-01T10:00:00.000Z');
    expect(new Date(zonedToEpochMs(2026, 1, 1, 0, 30, 0)).toISOString()).toBe('2025-12-31T23:30:00.000Z');
  });
  it('GTFS časy přes půlnoc (PID až 30:00)', () => {
    expect(parseGtfsTime('25:30:00')).toBe(91800);
    expect(parseGtfsTime('30:00:00')).toBe(108000);
    expect(parseGtfsTime('48:00:00')).toBeNull();
    expect(parseGtfsTime('12:60:00')).toBeNull();
    expect(parseGtfsTime('abc')).toBeNull();
    expect(new Date(gtfsTimeToEpochMs('20261001', '25:30:00')!).toISOString()).toBe('2026-10-01T23:30:00.000Z');
  });
  it('GTFS v den změny času se měří od „poledne minus 12 h“', () => {
    expect(new Date(gtfsTimeToEpochMs('20260329', '00:00:00')!).toISOString()).toBe('2026-03-28T22:00:00.000Z');
    expect(new Date(gtfsTimeToEpochMs('20260329', '12:00:00')!).toISOString()).toBe('2026-03-29T10:00:00.000Z');
    expect(new Date(gtfsTimeToEpochMs('20261025', '12:00:00')!).toISOString()).toBe('2026-10-25T11:00:00.000Z');
    expect(gtfsTimeToEpochMs('2026-10-25', '12:00:00')).toBeNull();
  });
  it('formátování a odpočty', () => {
    expect(formatClock(Date.parse('2026-10-01T10:05:00Z'))).toBe('12:05');
    expect(formatClock(Date.parse('2026-12-01T10:05:00Z'))).toBe('11:05');
    const now = Date.parse('2026-10-01T10:00:00Z');
    expect(minutesUntil(now + 90_000, now)).toBe(1);
    expect(minutesUntil(now - 60_000, now)).toBe(0);
    expect(formatAge(30)).toBe('před 30 s');
    expect(formatAge(600)).toBe('před 10 min');
  });
});
