import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { departureBoardUrl, mapDepartureBoard, mapVehicleCollection, mapVehicleFeature } from '@/providers/pid/golemio';
import { buildStopIndex, normalizeName, searchStops, stopsInBBox, toAswId } from '@/providers/pid/stops';
import { parseAlertsRss, toPlainText } from '@/providers/pid/alerts';
import { mapPlanResponse, parseIsoDuration, planVariables, PlannerError, PLAN_QUERY } from '@/planning/otp';

// Fixtura podle polí, která adaptér používá. Proti živé odpovědi ji ověří `npm run verify:golemio` (viz docs/data-sources.md).
const feature = (over: Record<string, unknown> = {}, coords: number[] = [14.40363, 50.07193]) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: coords },
  properties: {
    last_position: { bearing: 92, speed: 18, origin_timestamp: '2026-10-01T14:02:10+02:00', delay: { actual: 60 }, is_canceled: false, state_position: 'on_track', ...over },
    trip: { gtfs: { route_id: 'L9', route_short_name: '9', route_type: 0, trip_id: '9_1234_260901', trip_headsign: 'Spojovací' }, vehicle_registration_number: 9241,
      vehicle_type: { description_cs: 'tramvaj' }, wheelchair_accessible: true, air_conditioned: true },
  },
});

describe('Golemio – polohy vozidel', () => {
  it('normalizuje prvek včetně jmenných prostorů a pořadí souřadnic', () => {
    const v = mapVehicleFeature(feature())!;
    expect(v).toMatchObject({ id: 'pid:vehicle:reg-0-9241', tripId: 'pid:trip:9_1234_260901', headsign: 'Spojovací', lon: 14.40363, lat: 50.07193, bearing: 92,
      bearingSource: 'provider', delay: { kind: 'known', seconds: 60 }, measuredAt: '2026-10-01T12:02:10.000Z', registration: '9241', vehicleTypeLabel: 'tramvaj',
      route: { id: 'pid:route:L9', shortName: '9', mode: 'tram' }, positionState: 'on_track' });
    expect(v.speedMps).toBeCloseTo(5, 6);
  });
  it('chybějící zpoždění a směr zůstanou neznámé (ne nula)', () => {
    const v = mapVehicleFeature(feature({ delay: { actual: null }, bearing: null }))!;
    expect(v.delay).toEqual({ kind: 'unknown' });
    expect(v.bearing).toBeNull(); expect(v.bearingSource).toBeNull();
    expect(mapVehicleFeature(feature({ delay: { actual: 0 } }))!.delay).toEqual({ kind: 'known', seconds: 0 });
  });
  it('zahodí neplatné souřadnice i prohozené pořadí; kolekce deduplikuje', () => {
    expect(mapVehicleFeature(feature({}, [50.07193, 14.40363]))).toBeNull();
    expect(mapVehicleFeature(feature({}, [NaN, 50]))).toBeNull();
    expect(mapVehicleFeature({ geometry: {} })).toBeNull();
    const r = mapVehicleCollection({ type: 'FeatureCollection', features: [feature(), feature(), { bad: true }, feature({}, [0, 0])] });
    expect(r.vehicles).toHaveLength(1); expect(r.invalid).toBe(2);
    expect(() => mapVehicleCollection({ nothing: 1 })).toThrow();
  });
});

describe('Golemio – odjezdová tabule', () => {
  const board = {
    departures: [
      { departure_timestamp: { scheduled: '2026-10-01T14:02:30+02:00', predicted: '2026-10-01T14:03:30+02:00' }, delay: { is_available: true, minutes: 1, seconds: 60 },
        route: { short_name: '9', type: 0, is_night: false }, stop: { id: 'U1040Z1P', platform_code: 'A' },
        trip: { id: '9_1234_260901', headsign: 'Spojovací', is_canceled: false, is_at_stop: false, is_wheelchair_accessible: true, is_air_conditioned: true } },
      { departure_timestamp: { scheduled: '2026-10-01T14:05:00+02:00', predicted: null }, delay: { is_available: false, minutes: null, seconds: null },
        route: { short_name: '176', type: 3 }, stop: { platform_code: 'K' }, trip: { id: '176_1', headsign: 'Karlovo náměstí' } },
      { departure_timestamp: { scheduled: '2026-10-01T14:06:00+02:00' }, delay: { is_available: true, seconds: 0 }, route: { short_name: '12', type: 0 }, trip: { id: '12_9', headsign: 'Výstaviště', is_canceled: true } },
      { departure_timestamp: {} },
    ],
    infotexts: [{ text: '<b>Výluka</b> linky 9', display_type: 'inline' }, { foo: 1 }],
  };
  it('mapuje odjezdy, neznámé zpoždění, zrušené spoje a upozornění', () => {
    const r = mapDepartureBoard(board, 'Anděl');
    expect(r.departures).toHaveLength(3); expect(r.invalid).toBe(1);
    const [a, b, c] = r.departures;
    expect(a).toMatchObject({ platform: 'A', delay: { kind: 'known', seconds: 60 }, tripId: 'pid:trip:9_1234_260901', wheelchair: true, route: { shortName: '9', mode: 'tram' } });
    expect(b).toMatchObject({ delay: { kind: 'unknown' }, predictedAt: null, route: { mode: 'bus' }, platform: 'K' });
    expect(c).toMatchObject({ isCanceled: true, delay: { kind: 'known', seconds: 0 } });
    expect(r.notices).toEqual(['Výluka linky 9']);
  });
  it('URL tabule obsahuje aswIds a časové pásmo', () => {
    const u = new URL(departureBoardUrl(['1040_1', '1040_2'], 20));
    expect(u.host).toBe('api.golemio.cz');
    expect(u.searchParams.getAll('aswIds[]')).toEqual(['1040_1', '1040_2']);
    expect(u.searchParams.get('preferredTimezone')).toBe('Europe/Prague');
  });
});

describe('seznam zastávek PID', () => {
  const index = buildStopIndex(JSON.parse(readFileSync(path.join(process.cwd(), 'tests/fixtures/pid-stops.json'), 'utf8')));
  it('načte platné skupiny a přeskočí neplatné', () => {
    expect(index.groups.map((g) => g.key)).toEqual(['Anděl', 'Můstek', 'Chrášťany']);
    expect(index.generatedAt).toBe('2026-10-01T04:15:00+02:00');
    const andel = index.keys.get('Anděl')!;
    expect(andel.platforms[0]).toMatchObject({ id: 'pid:stop:1040/1', platform: 'A', lat: 50.07193, lon: 14.40363 });
    expect(andel.modes).toEqual(['metro', 'tram', 'bus']);
    expect(index.keys.get('Chrášťany')!.modes).toEqual(['train']);
  });
  it('vyhledává bez diakritiky a převádí ID pro odjezdové tabule', () => {
    expect(normalizeName('Anděl  (ul. Plzeňská)')).toBe('andel ul plzenska');
    expect(searchStops(index, 'andel')[0]!.name).toBe('Anděl');
    expect(searchStops(index, 'MUS')[0]!.name).toBe('Můstek');
    expect(searchStops(index, 'a')).toEqual([]);
    expect(searchStops(index, 'xyz')).toEqual([]);
    expect(stopsInBBox(index, [14.4, 50.069, 14.41, 50.075]).map((p) => p.platform)).toEqual(['A', 'B', 'K', 'M1']);
    expect(toAswId('pid:stop:1040/1')).toBe('1040_1');
    expect(toAswId('U1040Z1P')).toBeNull();
    expect(() => buildStopIndex([1, 2])).toThrow();
  });
});

describe('mimořádnosti PID (RSS)', () => {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>PID</title>
  <item><title>Omezení &amp; výluka tramvají</title><link>https://pid.cz/zmena/123</link><description><![CDATA[<p>Linka <b>9</b> odklonena.</p><script>alert(1)</script>]]></description><pubDate>Thu, 01 Oct 2026 12:00:00 +0200</pubDate><guid>a1</guid></item>
  <item><title>Podvržený odkaz</title><link>https://evil.example/x</link><description>text</description></item>
  <item><description>bez titulku</description></item>
  </channel></rss>`;
  it('převede položky na prostý text a pustí jen odkazy na pid.cz', () => {
    const a = parseAlertsRss(xml);
    expect(a).toHaveLength(2);
    expect(a[0]).toMatchObject({ id: 'pid:alert:a1', title: 'Omezení & výluka tramvají', link: 'https://pid.cz/zmena/123', publishedAt: '2026-10-01T10:00:00.000Z' });
    expect(a[0]!.summary).not.toContain('<');
    expect(a[1]!.link).toBeNull();
    expect(toPlainText('<a href="x">A</a>&nbsp;B')).toBe('A B');
  });
});

describe('plánovač OpenTripPlanner (GTFS GraphQL)', () => {
  const place = (name: string, lat: number, lon: number, platformCode: string | null = null) => ({ name, lat, lon, stop: platformCode ? { platformCode } : null });
  const ok = { data: { planConnection: { routingErrors: [], edges: [{ node: {
    start: '2026-10-01T14:00:00+02:00', end: '2026-10-01T14:25:00+02:00', duration: 1500, numberOfTransfers: 0, walkDistance: 320.4,
    legs: [
      { mode: 'WALK', duration: 240, distance: 280.2, realTime: false, headsign: null, start: { scheduledTime: '2026-10-01T14:00:00+02:00', estimated: null },
        end: { scheduledTime: '2026-10-01T14:04:00+02:00', estimated: null }, from: place('Start', 50.0705, 14.4001), to: place('Anděl', 50.07193, 14.40363, 'A'), route: null, intermediatePlaces: null },
      { mode: 'TRAM', duration: 960, distance: 4100, realTime: true, headsign: 'Spojovací',
        start: { scheduledTime: '2026-10-01T14:05:00+02:00', estimated: { time: '2026-10-01T14:07:00+02:00', delay: 'PT2M' } },
        end: { scheduledTime: '2026-10-01T14:21:00+02:00', estimated: { time: '2026-10-01T14:23:00+02:00', delay: 'PT2M' } },
        from: place('Anděl', 50.07193, 14.40363, 'A'), to: place('Hlavní nádraží', 50.0831, 14.4353), route: { shortName: '9', color: 'B3122E', mode: 'TRAM' }, intermediatePlaces: [{ name: 'a' }, { name: 'b' }] },
    ] } }] } } };
  it('ISO 8601 doby trvání a proměnné dotazu', () => {
    expect(parseIsoDuration('PT2M30S')).toBe(150);
    expect(parseIsoDuration('-PT1M')).toBe(-60);
    expect(parseIsoDuration('P1DT1H')).toBe(90000);
    expect(parseIsoDuration('2 min')).toBeNull();
    const base = { from: { lat: 50.07, lon: 14.4, label: 'A' }, to: { lat: 50.08, lon: 14.43, label: 'B' }, dateTime: '2026-10-01T14:00:00+02:00', wheelchair: false };
    expect(planVariables({ ...base, arriveBy: false }).dateTime).toEqual({ earliestDeparture: base.dateTime });
    expect(planVariables({ ...base, arriveBy: true }).dateTime).toEqual({ latestArrival: base.dateTime });
    expect(planVariables({ ...base, arriveBy: false }).origin.location.coordinate).toEqual({ latitude: 50.07, longitude: 14.4 });
    expect(PLAN_QUERY).toContain('planConnection');
  });
  it('mapuje itinerář včetně chůze, nástupiště a zpoždění', () => {
    const [j] = mapPlanResponse(ok);
    expect(j).toMatchObject({ durationS: 1500, transfers: 0, walkDistanceM: 320 });
    expect(j!.legs[0]).toMatchObject({ mode: 'walk', route: null, to: { platform: 'A' } });
    expect(j!.legs[0]!.start.delay).toEqual({ kind: 'unknown' });
    expect(j!.legs[1]).toMatchObject({ mode: 'tram', realtime: true, intermediateStops: 2, route: { shortName: '9', color: '#B3122E', mode: 'tram' }, start: { delay: { kind: 'known', seconds: 120 } } });
  });
  it('chyby plánovače se nevydávají za výsledek', () => {
    expect(() => mapPlanResponse({ data: { planConnection: { routingErrors: [{ code: 'NO_TRANSIT_CONNECTION', description: 'Bez spojení' }], edges: [] } } })).toThrow(PlannerError);
    expect(() => mapPlanResponse({ errors: [{ message: 'Validation error' }] })).toThrow(PlannerError);
    expect(() => mapPlanResponse('nesmysl')).toThrow(PlannerError);
    expect(mapPlanResponse({ data: { planConnection: { routingErrors: [], edges: [] } } })).toEqual([]);
  });
});
