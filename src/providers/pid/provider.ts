import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Alert, DepartureBoard, Envelope, SourceMeta, StopGroup, StopPoint, VehicleState } from '@/domain/model';
import { FEED_LIVE_MAX_S } from '@/domain/freshness';
import { inBBox, type BBox } from '@/domain/geo';
import type { SharedCache } from '@/server/cache';
import type { TokenBucket } from '@/server/rateLimit';
import { fetchJson, fetchText } from '@/server/http';
import { log } from '@/server/log';
import { makeMeta } from '@/server/respond';
import type { ProviderInfo, TransitProvider } from '../types';
import { GOLEMIO_HOST, departureBoardUrl, type BoardQuery, golemioHeaders, mapDepartureBoard, mapVehicleCollection, vehiclePositionsUrl } from './golemio';
import { PID_DATA_HOST, PID_STOPS_URL, buildStopIndex, searchStops, stopsInBBox, toAswId, type StopIndex } from './stops';
import { PID_ALERTS_URL, PID_WEB_HOST, parseAlertsRss } from './alerts';

const INFO: ProviderInfo = {
  id: 'pid', name: 'Pražská integrovaná doprava (PID)', territory: 'Praha a Středočeský kraj',
  attribution: 'Data: ROPID / PID (CC BY 4.0), Golemio API (Operátor ICT)', license: 'CC BY 4.0 (data z pid.cz); Golemio dle podmínek API',
};

interface Config { golemioKey: string | null; cache: SharedCache; bucket: TokenBucket; stopsFile?: string }

export function createPidProvider(cfg: Config): TransitProvider {
  const meta = (source: string, extra: Partial<SourceMeta>): SourceMeta =>
    makeMeta({ provider: 'pid', source, status: 'live', fetchedAt: null, sourceTimestamp: null, attribution: INFO.attribution, ...extra });

  const unavailable = <T>(data: T, source: string, reason: SourceMeta['reason'], message: string): Envelope<T> =>
    ({ data, meta: meta(source, { status: 'unavailable', reason, message }) });

  async function stopIndex(): Promise<{ index: StopIndex; fetchedAt: number; stale: boolean }> {
    const r = await cfg.cache.get<StopIndex>('pid:stops', { ttlMs: 12 * 3600_000, staleMs: 7 * 24 * 3600_000 }, async () => {
      const file = cfg.stopsFile ?? path.join(process.cwd(), 'data/pid/stops.json');
      try {
        const local = await readFile(/*turbopackIgnore: true*/ file, 'utf8');
        log('info', 'stops.local', { file });
        return buildStopIndex(JSON.parse(local));
      } catch {
        return buildStopIndex(await fetchJson(PID_STOPS_URL, { provider: 'pid-stops', allowHosts: [PID_DATA_HOST], timeoutMs: 20000, retries: 1, maxBytes: 60 * 1024 * 1024 }));
      }
    });
    return { index: r.value, fetchedAt: r.fetchedAt, stale: r.stale };
  }

  return {
    info: INFO,
    async vehicles(bbox: BBox | null) {
      if (!cfg.golemioKey) return unavailable<VehicleState[]>([], 'golemio:vehiclepositions', 'missing_api_key', 'Živé polohy PID vyžadují klíč Golemio API na serveru.');
      const key = cfg.golemioKey;
      try {
        const r = await cfg.cache.get('pid:vehicles', { ttlMs: 3_000, staleMs: 180_000, canFetch: () => cfg.bucket.take() }, async () => {
          const raw = await fetchJson(vehiclePositionsUrl(), { provider: 'golemio', allowHosts: [GOLEMIO_HOST], headers: golemioHeaders(key), timeoutMs: 15000, retries: 1, maxBytes: 60 * 1024 * 1024 });
          const { vehicles, invalid } = mapVehicleCollection(raw);
          if (invalid) log('warn', 'golemio.vehicles.invalid', { invalid, valid: vehicles.length });
          const newest = vehicles.reduce((m, v) => Math.max(m, v.measuredAt ? Date.parse(v.measuredAt) : 0), 0);
          return { vehicles, newest };
        });
        const sourceTs = r.value.newest ? new Date(r.value.newest).toISOString() : null;
        const feedAge = r.value.newest ? (Date.now() - r.value.newest) / 1000 : null;
        const status = r.stale || feedAge === null || feedAge > FEED_LIVE_MAX_S ? 'stale' : 'live';
        const data = bbox ? r.value.vehicles.filter((v) => inBBox(bbox, v.lon, v.lat)) : r.value.vehicles;
        return { data, meta: meta('golemio:vehiclepositions', { status, fetchedAt: new Date(r.fetchedAt).toISOString(), sourceTimestamp: sourceTs, ...(r.error ? { reason: r.error === 'rate_limited' ? 'rate_limited' : 'upstream_error', message: 'Zobrazena poslední úspěšně načtená data.' } : {}) }) };
      } catch (err) {
        log('error', 'golemio.vehicles.error', { error: err instanceof Error ? err.message : String(err) });
        return { data: [], meta: meta('golemio:vehiclepositions', { status: 'error', reason: 'upstream_error', message: 'Polohy vozidel se nepodařilo načíst.' }) };
      }
    },

    async departures(groupKey: string, limit: number) {
      const group: StopGroup | null = await stopIndex().then((s) => s.index.keys.get(groupKey) ?? null, () => null);
      const empty: DepartureBoard = { group, departures: [], notices: [] };
      if (!group) return { data: empty, meta: meta('pid:stops', { status: 'error', reason: 'invalid_data', message: 'Zastávka nebyla nalezena v seznamu PID.' }) };
      if (!cfg.golemioKey) return unavailable(empty, 'golemio:departureboards', 'missing_api_key', 'Odjezdy v reálném čase vyžadují klíč Golemio API na serveru.');
      const asw = group.platforms.map((p) => toAswId(p.id)).filter((x): x is string => Boolean(x));
      const gtfs = [...new Set(group.platforms.flatMap((p) => p.gtfsIds ?? []))];
      // Postupně: GTFS id nástupišť (spolehlivé i pro metro) → ASW id → přesný název uzlu (vč. metra a vlaků).
      const queries: BoardQuery[] = [
        ...(gtfs.length ? [{ by: 'ids' as const, values: gtfs }] : []),
        ...(asw.length ? [{ by: 'aswIds' as const, values: asw }] : []),
        { by: 'names', values: [group.name] },
      ];
      const key = cfg.golemioKey;
      try {
        const r = await cfg.cache.get(`pid:dep:${groupKey}:${limit}`, { ttlMs: 8_000, staleMs: 300_000, canFetch: () => cfg.bucket.take() }, async () => {
          let lastErr: unknown = null;
          for (const q of queries) {
            try {
              const raw = await fetchJson(departureBoardUrl(q, limit), { provider: 'golemio', allowHosts: [GOLEMIO_HOST], headers: golemioHeaders(key), timeoutMs: 8000, retries: 1 });
              const board = mapDepartureBoard(raw, group.name);
              if (board.departures.length || q === queries[queries.length - 1]) return board;
              lastErr = new Error(`prázdná tabule (${q.by})`);
            } catch (e) {
              lastErr = e;
              log('warn', 'golemio.departures.retry', { by: q.by, error: e instanceof Error ? e.message : String(e) });
            }
          }
          throw lastErr instanceof Error ? lastErr : new Error('Odjezdy se nepodařilo načíst');
        });
        return { data: { group, departures: r.value.departures, notices: r.value.notices }, meta: meta('golemio:departureboards', { status: r.stale ? 'stale' : 'live', fetchedAt: new Date(r.fetchedAt).toISOString(), sourceTimestamp: new Date(r.fetchedAt).toISOString() }) };
      } catch (err) {
        log('error', 'golemio.departures.error', { error: err instanceof Error ? err.message : String(err) });
        return { data: empty, meta: meta('golemio:departureboards', { status: 'error', reason: 'upstream_error', message: 'Odjezdy se nepodařilo načíst.' }) };
      }
    },

    async searchStops(q: string, limit: number) {
      try {
        const s = await stopIndex();
        return { data: searchStops(s.index, q, limit), meta: meta('pid:stops', { status: s.stale ? 'stale' : 'live', fetchedAt: new Date(s.fetchedAt).toISOString(), sourceTimestamp: s.index.generatedAt, ageSeconds: null }) };
      } catch {
        return unavailable<StopGroup[]>([], 'pid:stops', 'upstream_error', 'Seznam zastávek PID není dostupný.');
      }
    },

    async stopsInView(bbox: BBox) {
      try {
        const s = await stopIndex();
        return { data: stopsInBBox(s.index, bbox), meta: meta('pid:stops', { status: s.stale ? 'stale' : 'live', fetchedAt: new Date(s.fetchedAt).toISOString(), sourceTimestamp: s.index.generatedAt, ageSeconds: null }) };
      } catch {
        return unavailable<StopPoint[]>([], 'pid:stops', 'upstream_error', 'Seznam zastávek PID není dostupný.');
      }
    },

    async alerts() {
      try {
        const r = await cfg.cache.get('pid:alerts', { ttlMs: 120_000, staleMs: 3600_000 }, async () => {
          const { text } = await fetchText(PID_ALERTS_URL, { provider: 'pid-rss', allowHosts: [PID_WEB_HOST], timeoutMs: 8000, retries: 1, maxBytes: 5 * 1024 * 1024 });
          return parseAlertsRss(text);
        });
        return { data: r.value, meta: meta('pid:rss-mimoradnosti', { status: r.stale ? 'stale' : 'live', fetchedAt: new Date(r.fetchedAt).toISOString(), sourceTimestamp: new Date(r.fetchedAt).toISOString() }) };
      } catch {
        return unavailable<Alert[]>([], 'pid:rss-mimoradnosti', 'upstream_error', 'Mimořádnosti se nepodařilo načíst.');
      }
    },
  };
}
