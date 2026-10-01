import type { Journey, JourneyLeg, Mode, PlanRequest } from '@/domain/model';
import { knownDelay, UNKNOWN_DELAY } from '@/domain/model';
import { modeFromRouteType } from '@/domain/modes';
import { PlannerError } from './otp';

/**
 * Transitous – komunitní veřejné API (MOTIS 2) nad otevřenými jízdními řády včetně Česka.
 * Podmínky: https://transitous.org/api/ (identifikace aplikace, uvedení zdrojů, šetrné používání).
 */
export const TRANSITOUS_BASE = 'https://api.transitous.org';
export const TRANSITOUS_ATTRIBUTION = 'Transitous (MOTIS) · zdroje transitous.org/sources · © OpenStreetMap';
const VERSIONS = ['v6', 'v5', 'v4', 'v3', 'v2', 'v1'];
let workingVersion: string | null = null;

const MODE: Record<string, JourneyLeg['mode']> = {
  WALK: 'walk', BIKE: 'bicycle', CAR: 'car', TRAM: 'tram', SUBWAY: 'metro', METRO: 'metro', FERRY: 'ferry', BUS: 'bus', COACH: 'bus',
  RAIL: 'train', HIGHSPEED_RAIL: 'train', LONG_DISTANCE: 'train', NIGHT_RAIL: 'train', REGIONAL_FAST_RAIL: 'train', REGIONAL_RAIL: 'train', SUBURBAN: 'train',
  FUNICULAR: 'funicular', AERIAL_LIFT: 'other', AREAL_LIFT: 'other', CABLE_CAR: 'other', OTHER: 'other',
};

type Obj = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function transitousParams(req: PlanRequest): URLSearchParams {
  const p = new URLSearchParams({
    fromPlace: `${req.from.lat.toFixed(6)},${req.from.lon.toFixed(6)}`,
    toPlace: `${req.to.lat.toFixed(6)},${req.to.lon.toFixed(6)}`,
    time: new Date(req.dateTime).toISOString(),
    arriveBy: String(req.arriveBy),
    detailedTransfers: 'false',
    language: 'cs',
  });
  if (req.wheelchair) p.set('pedestrianProfile', 'WHEELCHAIR');
  return p;
}

function place(raw: unknown): JourneyLeg['from'] {
  const p = (raw ?? {}) as Obj;
  return { name: str(p.name) ?? '—', lat: num(p.lat) ?? 0, lon: num(p.lon) ?? 0, platform: str(p.track) ?? str(p.scheduledTrack) };
}

function legTime(scheduled: unknown, actual: unknown, realtime: boolean): JourneyLeg['start'] {
  const s = str(scheduled) ?? str(actual) ?? new Date(0).toISOString();
  const a = str(actual);
  if (!realtime || !a) return { scheduled: s, estimated: null, delay: UNKNOWN_DELAY };
  const d = (Date.parse(a) - Date.parse(s)) / 1000;
  return { scheduled: s, estimated: a, delay: Number.isFinite(d) ? knownDelay(d) : UNKNOWN_DELAY };
}

/** Převod odpovědi MOTIS `plan` na společný model spojení (shodný s OTP adaptérem). */
export function mapTransitous(raw: unknown): Journey[] {
  const body = (raw ?? {}) as Obj;
  const its = Array.isArray(body.itineraries) ? (body.itineraries as Obj[]) : [];
  return its.map((it, i): Journey | null => {
    const legsRaw = Array.isArray(it.legs) ? (it.legs as Obj[]) : [];
    const legs = legsRaw.map((l): JourneyLeg => {
      const modeKey = String(l.mode ?? 'OTHER');
      const base = MODE[modeKey] ?? 'other';
      const transit = !['walk', 'bicycle', 'car'].includes(base);
      const rt = num(l.routeType);
      const mode: Mode = transit ? (rt !== null && modeFromRouteType(rt) !== 'other' ? modeFromRouteType(rt) : (base as Mode)) : 'other';
      const realtime = l.realTime === true;
      const from = place(l.from), to = place(l.to);
      const durationS = num(l.duration) ?? Math.max(0, (Date.parse(String(l.endTime)) - Date.parse(String(l.startTime))) / 1000);
      const shortName = str(l.routeShortName) ?? str(l.displayName) ?? str(l.tripShortName);
      return {
        mode: transit ? mode : (base as JourneyLeg['mode']), from, to,
        start: legTime(l.scheduledStartTime, l.startTime, realtime), end: legTime(l.scheduledEndTime, l.endTime, realtime),
        durationS, distanceM: Math.round(num(l.distance) ?? (transit ? 0 : durationS * 1.3)),
        route: transit ? { shortName: shortName ?? '?', mode, color: str(l.routeColor) ? `#${String(l.routeColor).replace(/^#/, '')}` : null } : null,
        headsign: str(l.headsign), realtime, intermediateStops: Array.isArray(l.intermediateStops) ? l.intermediateStops.length : 0,
      };
    });
    const start = str(it.startTime), end = str(it.endTime);
    if (!legs.length || !start || !end) return null;
    return {
      id: str(it.id) ?? `tr-${i}-${start}`, start, end, durationS: num(it.duration) ?? (Date.parse(end) - Date.parse(start)) / 1000,
      transfers: num(it.transfers) ?? Math.max(0, legs.filter((l) => l.route).length - 1),
      walkDistanceM: legs.filter((l) => l.mode === 'walk').reduce((a, l) => a + l.distanceM, 0), legs,
    };
  }).filter((j): j is Journey => j !== null);
}

const cache = new Map<string, { at: number; journeys: Journey[] }>();

/** Dotaz na Transitous: zkusí nejnovější verzi API a při 404 starší; krátká cache šetří komunitní službu. */
export async function planTransitous(req: PlanRequest, fetchImpl: typeof fetch = fetch): Promise<Journey[]> {
  const params = transitousParams(req);
  const key = params.toString().replace(/time=[^&]+/, `time=${Math.floor(Date.parse(req.dateTime) / 60_000)}`);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.journeys;
  const versions = workingVersion ? [workingVersion, ...VERSIONS.filter((v) => v !== workingVersion)] : VERSIONS;
  for (const v of versions) {
    const res = await fetchImpl(`${TRANSITOUS_BASE}/api/${v}/plan?${params}`, {
      headers: { accept: 'application/json', 'user-agent': 'dip-cesko/0.3 (+https://github.com/Matuchovic/dip-cesko)' },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404) continue;
    if (res.status === 400) throw new PlannerError('invalid', 'Plánovač odmítl dotaz.');
    if (!res.ok) throw new Error(`Transitous ${res.status}`);
    workingVersion = v;
    const journeys = mapTransitous(await res.json());
    cache.set(key, { at: Date.now(), journeys });
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    return journeys;
  }
  throw new Error('Transitous: žádná podporovaná verze API');
}
