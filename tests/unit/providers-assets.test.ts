import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDemoProvider, demoRotationVehicles, demoVehicles } from '@/providers/demo/provider';
import { createPidProvider } from '@/providers/pid/provider';
import { SharedCache } from '@/server/cache';
import { TokenBucket } from '@/server/rateLimit';
import { classifyPositionAge } from '@/domain/freshness';
import { nsId, parseNsId } from '@/domain/ids';
import { manifest, mapAssetFor, mapVariant, spriteSizeStops } from '@/map/assets';

const stopsFile = path.join(process.cwd(), 'tests/fixtures/pid-stops.json');
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('jmenné prostory ID', () => {
  it('stejné původní ID z různých zdrojů se nesmí slít', () => {
    expect(nsId('pid', 'vehicle', '9241')).not.toBe(nsId('demo', 'vehicle', '9241'));
    expect(parseNsId('pid:stop:1040/1')).toEqual({ provider: 'pid', kind: 'stop', raw: '1040/1' });
    expect(parseNsId('neznamy:stop:1')).toBeNull();
    expect(() => nsId('pid', 'trip', '  ')).toThrow();
  });
});

describe('ukázková data', () => {
  const now = Date.parse('2026-10-01T12:00:05Z');
  it('jsou vždy označena jako ukázková', async () => {
    const p = createDemoProvider(() => now);
    expect((await p.vehicles(null)).meta.status).toBe('demo');
    expect((await p.departures('Anděl', 200)).meta.status).toBe('demo');
    expect((await p.alerts()).meta.status).toBe('demo');
  });
  it('obsahují zastaralé měření, neznámý směr, neznámé i nulové zpoždění a zrušený spoj', async () => {
    const v = demoVehicles(now);
    expect(v.some((x) => classifyPositionAge((now - Date.parse(x.measuredAt!)) / 1000) === 'stale')).toBe(true);
    expect(v.some((x) => x.bearing === null)).toBe(true);
    expect(v.some((x) => x.delay.kind === 'unknown')).toBe(true);
    expect(v.every((x) => Date.parse(x.measuredAt!) % 10_000 === 0)).toBe(true);
    const d = (await createDemoProvider(() => now).departures('Anděl', 200)).data.departures;
    expect(d.some((x) => x.delay.kind === 'unknown')).toBe(true);
    expect(d.some((x) => x.delay.kind === 'known' && x.delay.seconds === 0)).toBe(true);
    expect(d.some((x) => x.isCanceled)).toBe(true);
  });
  it('testovací sada natočení: S, V, J, Z a přechod 359°/1°', () => {
    const by = Object.fromEntries(demoRotationVehicles(now).map((x) => [x.id, x.bearing]));
    for (const m of ['tram', 'train']) expect([by[`demo:vehicle:rot-${m}-N`], by[`demo:vehicle:rot-${m}-E`], by[`demo:vehicle:rot-${m}-S`], by[`demo:vehicle:rot-${m}-W`]]).toEqual([0, 90, 180, 270]);
    expect([359, 1]).toContain(by['demo:vehicle:rot-wrap']);
  });
});

describe('PID adaptér', () => {
  const mk = (key: string | null, now = () => Date.now()) => createPidProvider({ golemioKey: key, cache: new SharedCache(now), bucket: new TokenBucket(16, 16 / 8000), stopsFile });
  it('bez klíče nevymýšlí polohy ani odjezdy', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const p = mk(null);
    const v = await p.vehicles(null);
    expect(v.data).toEqual([]);
    expect(v.meta).toMatchObject({ status: 'unavailable', reason: 'missing_api_key' });
    const d = await p.departures('Anděl', 20);
    expect(d.meta.status).toBe('unavailable');
    expect(d.data.departures).toEqual([]);
    expect(d.data.group?.name).toBe('Anděl');
    expect((await p.departures('Neexistuje', 20)).meta.status).toBe('error');
    const s = await p.searchStops('andel', 5);
    expect(s.data[0]?.name).toBe('Anděl');
    expect(s.meta.sourceTimestamp).toBe('2026-10-01T04:15:00+02:00');
  });
  it('živá data, pak výpadek zdroje → poslední data označená jako zastaralá', async () => {
    for (const m of ['log', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation(() => {});
    let clock = Date.now();
    const body = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [14.40363, 50.07193] },
      properties: { last_position: { bearing: 90, origin_timestamp: new Date(clock - 20_000).toISOString(), delay: { actual: 0 } },
        trip: { gtfs: { route_short_name: '9', route_type: 0, trip_id: 't1' }, vehicle_registration_number: '9241' } } }] };
    const f = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 })).mockResolvedValue(new Response('chyba', { status: 503 }));
    vi.stubGlobal('fetch', f);
    const p = mk('test-key', () => clock);
    const live = await p.vehicles(null);
    expect(live.meta.status).toBe('live');
    expect(live.data).toHaveLength(1);
    expect(((f.mock.calls[0]![1] as RequestInit).headers as Record<string, string>)['X-Access-Token']).toBe('test-key');
    clock += 11_000;
    const stale = await p.vehicles(null);
    expect(stale.meta).toMatchObject({ status: 'stale', reason: 'upstream_error' });
    expect(stale.data).toHaveLength(1);
  });
});

describe('manifest grafiky vozidel', () => {
  it('varianty i zdrojové soubory existují', () => {
    for (const a of manifest.assets) {
      for (const v of a.variants) expect(existsSync(path.join(process.cwd(), 'public', v.file)), v.file).toBe(true);
      expect(existsSync(path.join(process.cwd(), (a as unknown as { source: { file: string } }).source.file))).toBe(true);
    }
  });
  it('mapové sprity: pohled shora, čelo nahoru, kotva ve středu, délka s původem, souvislé segmenty', () => {
    for (const mode of ['tram', 'train'] as const) {
      const a = mapAssetFor(mode)!;
      expect(a.view).toBe('top-down');
      expect(a.frontDirectionDeg).toBe(0);
      expect(a.anchor).toEqual({ x: 0.5, y: 0.5 });
      expect(a.physical!.lengthM).toBeGreaterThan(15);
      expect(a.physical!.origin.length).toBeGreaterThan(10);
      const segs = a.segments!;
      expect(segs[0]!.fromFront).toBe(0); expect(segs.at(-1)!.toFront).toBe(1);
      for (let i = 1; i < segs.length; i++) expect(segs[i]!.fromFront).toBeCloseTo(segs[i - 1]!.toFront, 6);
    }
    expect(mapAssetFor('bus')).toBeNull();
  });
  it('velikost na obrazovce roste s přiblížením a drží se v mezích', () => {
    const a = mapAssetFor('tram')!;
    const v = mapVariant(a)!;
    const stops = spriteSizeStops(a, 50.08);
    expect(stops[0]![0]).toBe(15.5);
    let prev = 0;
    for (const [, size] of stops) {
      const px = size * (v.height / v.pixelRatio);
      expect(px).toBeGreaterThanOrEqual(a.sizing!.minScreenLengthPx - 0.5);
      expect(px).toBeLessThanOrEqual(a.sizing!.maxScreenLengthPx + 0.5);
      expect(size).toBeGreaterThanOrEqual(prev);
      prev = size;
    }
  });
});

describe('odjezdy: spolehlivé napojení na Golemio (i pro metro)', () => {
  const mk = () => createPidProvider({ golemioKey: 'k', cache: new SharedCache(() => Date.now()), bucket: new TokenBucket(16, 16 / 8000), stopsFile });
  const board = { stops: [], infotexts: [], departures: [{ departure_timestamp: { predicted: new Date(Date.now() + 120_000).toISOString(), scheduled: new Date(Date.now() + 60_000).toISOString() },
    delay: { is_available: true, minutes: 1, seconds: 60 }, route: { short_name: 'B', type: 1, is_night: false, is_regional: false, is_substitute_transport: false },
    stop: { id: 'U1040Z101P', platform_code: 'M1' }, trip: { id: 't', headsign: 'Černý Most', direction: null, is_at_stop: false, is_canceled: false, is_wheelchair_accessible: true, is_air_conditioned: null, short_name: null } }] };
  it('nepodporovanou kombinaci aswIds + includeMetroTrains neposílá a při chybě zkusí další způsob dotazu', async () => {
    for (const m of ['log', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation(() => {});
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string | URL | Request) => {
      const url = decodeURIComponent(String(u)); urls.push(url);
      return url.includes('aswIds[]') ? new Response('{"error":"bad"}', { status: 400 }) : new Response(JSON.stringify(board), { status: 200 });
    }));
    const d = await mk().departures('Anděl', 20);
    expect(d.meta.status).toBe('live');
    expect(d.data.departures[0]).toMatchObject({ headsign: 'Černý Most', platform: 'M1' });
    expect(d.data.departures[0]!.route.mode).toBe('metro');
    const asw = urls.find((x) => x.includes('aswIds[]'));
    if (asw) expect(asw).not.toContain('includeMetroTrains');
    const byName = urls.find((x) => x.includes('names[]'))!;
    expect(byName).toContain('names[]=Anděl');
    expect(byName).toContain('includeMetroTrains=true');
    vi.unstubAllGlobals();
  });
});
