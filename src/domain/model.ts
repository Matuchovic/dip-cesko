import type { NsId, ProviderId } from './ids';

export type Mode = 'tram' | 'metro' | 'train' | 'bus' | 'trolleybus' | 'ferry' | 'funicular' | 'other';
export const MODES: readonly Mode[] = ['tram', 'metro', 'train', 'bus', 'trolleybus', 'ferry', 'funicular', 'other'];

/** Zpoždění: nula a neznámá hodnota jsou odlišné stavy. */
export type Delay = { kind: 'known'; seconds: number } | { kind: 'unknown' };
export const UNKNOWN_DELAY: Delay = { kind: 'unknown' };
export const knownDelay = (seconds: number): Delay => ({ kind: 'known', seconds: Math.round(seconds) });

export type DataStatus = 'live' | 'stale' | 'demo' | 'unavailable' | 'error';

export interface SourceMeta {
  provider: ProviderId;
  source: string;
  status: DataStatus;
  fetchedAt: string | null;
  sourceTimestamp: string | null;
  ageSeconds: number | null;
  reason?: 'missing_api_key' | 'upstream_error' | 'rate_limited' | 'not_configured' | 'invalid_data';
  message?: string;
  attribution: string;
}

export interface Envelope<T> { data: T; meta: SourceMeta }

export interface RouteRef { id: NsId<'route'> | null; shortName: string; mode: Mode; isNight?: boolean | null; isSubstitute?: boolean | null }

export type PositionState = 'on_track' | 'off_track' | 'at_stop' | 'before_track' | 'after_track' | 'canceled' | 'unknown';

export interface VehicleState {
  id: NsId<'vehicle'>;
  route: RouteRef;
  tripId: NsId<'trip'> | null;
  headsign: string | null;
  lat: number;
  lon: number;
  /** Ve stupních od severu po směru hodinových ručiček; null = neznámý. Nikdy se neodvozuje z GTFS direction_id. */
  bearing: number | null;
  bearingSource: 'provider' | 'derived' | null;
  speedMps: number | null;
  delay: Delay;
  /** Čas měření polohy u zdroje (ISO); null = zdroj neuvádí. */
  measuredAt: string | null;
  registration: string | null;
  vehicleTypeLabel: string | null;
  wheelchair: boolean | null;
  airConditioned: boolean | null;
  isCanceled: boolean;
  positionState: PositionState;
  lastStopName: string | null;
  nextStopName: string | null;
}

export interface StopPoint {
  id: NsId<'stop'>;
  groupKey: string;
  name: string;
  platform: string | null;
  lat: number;
  lon: number;
  modes: Mode[];
  lines: { name: string; mode: Mode; direction: string | null; isNight: boolean }[];
  /** GTFS stop_id nástupiště (pro odjezdové tabule – spolehlivé i pro metro). */
  gtfsIds?: string[];
}

export interface StopGroup {
  key: string;
  name: string;
  municipality: string | null;
  lat: number;
  lon: number;
  modes: Mode[];
  platforms: StopPoint[];
}

export interface Departure {
  id: string;
  route: RouteRef;
  tripId: NsId<'trip'> | null;
  headsign: string;
  platform: string | null;
  stopName: string;
  scheduledAt: string | null;
  predictedAt: string | null;
  delay: Delay;
  isCanceled: boolean;
  isAtStop: boolean;
  wheelchair: boolean | null;
  airConditioned: boolean | null;
}

export interface DepartureBoard { group: StopGroup | null; departures: Departure[]; notices: string[] }

export interface Alert { id: NsId<'alert'>; title: string; summary: string; link: string | null; publishedAt: string | null }

export interface LegTime { scheduled: string; estimated: string | null; delay: Delay }
export interface Place { name: string; lat: number; lon: number; platform: string | null }

export interface JourneyLeg {
  mode: Mode | 'walk' | 'bicycle' | 'car';
  from: Place;
  to: Place;
  start: LegTime;
  end: LegTime;
  durationS: number;
  distanceM: number;
  route: { shortName: string; mode: Mode; color: string | null } | null;
  headsign: string | null;
  realtime: boolean;
  intermediateStops: number;
}

export interface Journey { id: string; start: string; end: string; durationS: number; transfers: number; walkDistanceM: number; legs: JourneyLeg[] }

export interface PlanRequest {
  from: { lat: number; lon: number; label: string };
  to: { lat: number; lon: number; label: string };
  dateTime: string;
  arriveBy: boolean;
  wheelchair: boolean;
}
