import { z } from 'zod';
import { nsId } from '@/domain/ids';
import { isValidBearing } from '@/domain/angles';
import { inCzechia, isValidLngLat } from '@/domain/geo';
import { knownDelay, UNKNOWN_DELAY, type Delay, type Departure, type PositionState, type VehicleState } from '@/domain/model';
import { modeFromRouteType } from '@/domain/modes';
import { parseInstant } from '@/domain/time';

export const GOLEMIO_HOST = 'api.golemio.cz';
export const GOLEMIO_BASE = `https://${GOLEMIO_HOST}`;

const nstr = z.string().nullish();
const nnum = z.number().nullish();
const idLike = z.union([z.string(), z.number()]).nullish();

/** Volné schéma GeoJSON prvku z /v2/vehiclepositions – nepovinná pole se tolerují, neplatné prvky se zahodí. */
export const VehicleFeatureSchema = z.object({
  geometry: z.object({ coordinates: z.array(z.number()).min(2) }),
  properties: z.object({
    last_position: z.object({
      bearing: nnum,
      speed: nnum,
      origin_timestamp: nstr,
      delay: z.object({ actual: nnum }).partial().nullish(),
      is_canceled: z.boolean().nullish(),
      state_position: nstr,
      last_stop: z.object({ id: nstr, name: nstr }).partial().nullish(),
      next_stop: z.object({ id: nstr, name: nstr }).partial().nullish(),
    }).partial().nullish(),
    trip: z.object({
      gtfs: z.object({ route_id: nstr, route_short_name: nstr, route_type: nnum, trip_id: nstr, trip_headsign: nstr }).partial().nullish(),
      vehicle_registration_number: idLike,
      vehicle_type: z.object({ description_cs: nstr }).partial().nullish(),
      wheelchair_accessible: z.boolean().nullish(),
      air_conditioned: z.boolean().nullish(),
      origin_route_name: nstr,
    }).partial().nullish(),
  }),
});
export type VehicleFeature = z.infer<typeof VehicleFeatureSchema>;

const POSITION_STATES: readonly PositionState[] = ['on_track', 'off_track', 'at_stop', 'before_track', 'after_track', 'canceled'];

function toDelay(v: number | null | undefined): Delay {
  return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 6 * 3600 ? knownDelay(v) : UNKNOWN_DELAY;
}

/** Normalizace jednoho prvku polohy vozidla. Pořadí souřadnic GeoJSON: [zeměpisná délka, šířka]. */
export function mapVehicleFeature(raw: unknown): VehicleState | null {
  const parsed = VehicleFeatureSchema.safeParse(raw);
  if (!parsed.success) return null;
  const f = parsed.data;
  const [lng, lat] = f.geometry.coordinates as [number, number];
  if (!isValidLngLat(lng, lat) || !inCzechia(lng, lat)) return null;
  type LP = NonNullable<VehicleFeature['properties']['last_position']>;
  type Trip = NonNullable<VehicleFeature['properties']['trip']>;
  const lp: LP = f.properties.last_position ?? {};
  const trip: Trip = f.properties.trip ?? {};
  const gtfs: NonNullable<Trip['gtfs']> = trip.gtfs ?? {};
  const reg = trip.vehicle_registration_number;
  const tripId = gtfs.trip_id ?? null;
  const vehicleKey = reg !== null && reg !== undefined && String(reg).trim() ? `reg-${gtfs.route_type ?? 'x'}-${reg}` : tripId ? `trip-${tripId}` : null;
  if (!vehicleKey) return null;
  const shortName = (gtfs.route_short_name ?? trip.origin_route_name ?? '').trim();
  const measured = parseInstant(lp.origin_timestamp ?? null);
  const state = (lp.state_position ?? 'unknown') as PositionState;
  return {
    id: nsId('pid', 'vehicle', vehicleKey),
    route: { id: gtfs.route_id ? nsId('pid', 'route', gtfs.route_id) : null, shortName: shortName || '?', mode: modeFromRouteType(gtfs.route_type) },
    tripId: tripId ? nsId('pid', 'trip', tripId) : null,
    headsign: gtfs.trip_headsign?.trim() || null,
    lat, lon: lng,
    bearing: isValidBearing(lp.bearing) ? lp.bearing % 360 : null,
    bearingSource: isValidBearing(lp.bearing) ? 'provider' : null,
    speedMps: typeof lp.speed === 'number' && lp.speed >= 0 && lp.speed < 300 ? lp.speed / 3.6 : null,
    delay: toDelay(lp.delay?.actual),
    measuredAt: measured !== null ? new Date(measured).toISOString() : null,
    registration: reg !== null && reg !== undefined ? String(reg) : null,
    vehicleTypeLabel: trip.vehicle_type?.description_cs?.trim() || null,
    wheelchair: trip.wheelchair_accessible ?? null,
    airConditioned: trip.air_conditioned ?? null,
    isCanceled: lp.is_canceled === true,
    positionState: POSITION_STATES.includes(state) ? state : 'unknown',
    lastStopName: lp.last_stop?.name ?? null,
    nextStopName: lp.next_stop?.name ?? null,
  };
}

export function mapVehicleCollection(raw: unknown, limit = 6000): { vehicles: VehicleState[]; invalid: number } {
  const features = z.object({ features: z.array(z.unknown()) }).safeParse(raw);
  if (!features.success) throw new Error('Neočekávaný formát poloh vozidel');
  const vehicles: VehicleState[] = [];
  const seen = new Set<string>();
  let invalid = 0;
  for (const f of features.data.features.slice(0, limit)) {
    const v = mapVehicleFeature(f);
    if (!v) { invalid++; continue; }
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    vehicles.push(v);
  }
  return { vehicles, invalid };
}

const TimeObj = z.object({ predicted: nstr, scheduled: nstr }).partial().nullish();
export const DepartureSchema = z.object({
  arrival_timestamp: TimeObj,
  departure_timestamp: TimeObj,
  delay: z.object({ is_available: z.boolean().nullish(), seconds: nnum, minutes: nnum }).partial().nullish(),
  route: z.object({ short_name: nstr, type: nnum, is_night: z.boolean().nullish(), is_substitute_transport: z.boolean().nullish() }).partial().nullish(),
  stop: z.object({ id: nstr, platform_code: nstr }).partial().nullish(),
  trip: z.object({ id: nstr, headsign: nstr, is_canceled: z.boolean().nullish(), is_at_stop: z.boolean().nullish(), is_wheelchair_accessible: z.boolean().nullish(), is_air_conditioned: z.boolean().nullish() }).partial().nullish(),
});

/** Zpoždění z odjezdové tabule: is_available=false nebo chybějící údaj → neznámé (nikdy ne nula). */
export function departureDelay(d: z.infer<typeof DepartureSchema>['delay']): Delay {
  if (!d || d.is_available !== true) return UNKNOWN_DELAY;
  if (typeof d.seconds === 'number') return knownDelay(d.seconds);
  if (typeof d.minutes === 'number') return knownDelay(d.minutes * 60);
  return UNKNOWN_DELAY;
}

export function mapDepartureBoard(raw: unknown, stopName: string): { departures: Departure[]; notices: string[]; invalid: number } {
  const root = z.object({ departures: z.array(z.unknown()).default([]), infotexts: z.array(z.unknown()).default([]) }).safeParse(raw);
  if (!root.success) throw new Error('Neočekávaný formát odjezdové tabule');
  const departures: Departure[] = [];
  let invalid = 0;
  for (const [i, item] of root.data.departures.slice(0, 200).entries()) {
    const p = DepartureSchema.safeParse(item);
    if (!p.success) { invalid++; continue; }
    const d = p.data;
    const scheduled = parseInstant(d.departure_timestamp?.scheduled ?? d.arrival_timestamp?.scheduled ?? null);
    const predicted = parseInstant(d.departure_timestamp?.predicted ?? null);
    if (scheduled === null && predicted === null) { invalid++; continue; }
    const tripId = d.trip?.id ?? null;
    departures.push({
      id: `${tripId ?? 'x'}-${scheduled ?? predicted}-${i}`,
      route: { id: null, shortName: d.route?.short_name?.trim() || '?', mode: modeFromRouteType(d.route?.type), isNight: d.route?.is_night ?? null, isSubstitute: d.route?.is_substitute_transport ?? null },
      tripId: tripId ? nsId('pid', 'trip', tripId) : null,
      headsign: d.trip?.headsign?.trim() || '—',
      platform: d.stop?.platform_code ?? null,
      stopName,
      scheduledAt: scheduled !== null ? new Date(scheduled).toISOString() : null,
      predictedAt: predicted !== null ? new Date(predicted).toISOString() : null,
      delay: departureDelay(d.delay),
      isCanceled: d.trip?.is_canceled === true,
      isAtStop: d.trip?.is_at_stop === true,
      wheelchair: d.trip?.is_wheelchair_accessible ?? null,
      airConditioned: d.trip?.is_air_conditioned ?? null,
    });
  }
  const notices = root.data.infotexts
    .map((t) => z.object({ text: z.string() }).safeParse(t))
    .filter((r) => r.success)
    .map((r) => r.data.text.replace(/<[^>]*>/g, '').trim().slice(0, 400))
    .filter(Boolean);
  return { departures, notices, invalid };
}

export function golemioHeaders(key: string): Record<string, string> {
  return { 'X-Access-Token': key, accept: 'application/json' };
}

export function vehiclePositionsUrl(): string {
  return `${GOLEMIO_BASE}/v2/vehiclepositions?preferredTimezone=Europe%2FPrague`;
}

export function departureBoardUrl(aswIds: string[], limit: number): string {
  const p = new URLSearchParams({ minutesBefore: '0', minutesAfter: '120', limit: String(limit), preferredTimezone: 'Europe/Prague', includeMetroTrains: 'true', airCondition: 'true', mode: 'departures', order: 'real' });
  for (const id of aswIds.slice(0, 20)) p.append('aswIds[]', id);
  return `${GOLEMIO_BASE}/v2/pid/departureboards?${p.toString()}`;
}
