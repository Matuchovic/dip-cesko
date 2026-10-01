import { z } from 'zod';
import { knownDelay, UNKNOWN_DELAY, type Delay, type Journey, type JourneyLeg, type Mode, type PlanRequest } from '@/domain/model';

/** Dotaz pro GTFS GraphQL API OpenTripPlanneru 2.x (planConnection, endpoint /otp/gtfs/v1). */
export const PLAN_QUERY = `query Plan($origin: PlanLabeledLocationInput!, $destination: PlanLabeledLocationInput!, $dateTime: PlanDateTimeInput, $first: Int) {
  planConnection(origin: $origin, destination: $destination, dateTime: $dateTime, first: $first) {
    routingErrors { code description }
    edges { node {
      start end duration numberOfTransfers walkDistance
      legs {
        mode duration distance realTime headsign
        start { scheduledTime estimated { time delay } }
        end { scheduledTime estimated { time delay } }
        from { name lat lon stop { platformCode } }
        to { name lat lon stop { platformCode } }
        route { shortName color mode }
        intermediatePlaces { name }
      }
    } }
  }
}`;

export function planVariables(req: PlanRequest) {
  const loc = (p: PlanRequest['from']) => ({ label: p.label, location: { coordinate: { latitude: p.lat, longitude: p.lon } } });
  return { origin: loc(req.from), destination: loc(req.to), first: 5, dateTime: req.arriveBy ? { latestArrival: req.dateTime } : { earliestDeparture: req.dateTime } };
}

/** ISO-8601 doba trvání (např. PT2M30S, -PT1M) → sekundy. */
export function parseIsoDuration(v: string | null | undefined): number | null {
  if (!v) return null;
  const m = /^(-)?P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(v);
  if (!m) return null;
  const s = (Number(m[2] ?? 0) * 86400) + (Number(m[3] ?? 0) * 3600) + (Number(m[4] ?? 0) * 60) + Number(m[5] ?? 0);
  return m[1] ? -s : s;
}

const OTP_MODES: Record<string, Mode | 'walk' | 'bicycle' | 'car'> = {
  TRAM: 'tram', SUBWAY: 'metro', RAIL: 'train', BUS: 'bus', COACH: 'bus', TROLLEYBUS: 'trolleybus', FERRY: 'ferry', FUNICULAR: 'funicular', CABLE_CAR: 'funicular', GONDOLA: 'funicular',
  WALK: 'walk', BICYCLE: 'bicycle', CAR: 'car',
};

const n = z.number().nullish();
const s = z.string().nullish();
const TimeSchema = z.object({ scheduledTime: z.string(), estimated: z.object({ time: s, delay: s }).nullish() });
const PlaceSchema = z.object({ name: s, lat: z.number(), lon: z.number(), stop: z.object({ platformCode: s }).nullish() });
const LegSchema = z.object({ mode: z.string(), duration: n, distance: n, realTime: z.boolean().nullish(), headsign: s, start: TimeSchema, end: TimeSchema,
  from: PlaceSchema, to: PlaceSchema, route: z.object({ shortName: s, color: s, mode: s }).nullish(), intermediatePlaces: z.array(z.unknown()).nullish() });
const ResponseSchema = z.object({
  data: z.object({ planConnection: z.object({
    routingErrors: z.array(z.object({ code: z.string(), description: s })).nullish(),
    edges: z.array(z.object({ node: z.object({ start: z.string(), end: z.string(), duration: n, numberOfTransfers: n, walkDistance: n, legs: z.array(LegSchema) }) })).nullish(),
  }).nullish() }).nullish(),
  errors: z.array(z.object({ message: z.string() })).nullish(),
});

const legDelay = (d: string | null | undefined): Delay => { const v = parseIsoDuration(d ?? null); return v === null ? UNKNOWN_DELAY : knownDelay(v); };

export class PlannerError extends Error { constructor(public readonly code: string, message: string) { super(message); } }

export function mapPlanResponse(raw: unknown): Journey[] {
  const p = ResponseSchema.safeParse(raw);
  if (!p.success) throw new PlannerError('invalid_response', 'Plánovač vrátil neočekávanou odpověď.');
  if (p.data.errors?.length) throw new PlannerError('graphql_error', 'Plánovač odmítl dotaz.');
  const pc = p.data.data?.planConnection;
  const errs = pc?.routingErrors ?? [];
  const edges = pc?.edges ?? [];
  if (!edges.length && errs.length) throw new PlannerError(errs[0]!.code, errs[0]!.description ?? 'Spojení nebylo nalezeno.');
  return edges.map((e, i): Journey => {
    const legs: JourneyLeg[] = e.node.legs.map((l) => {
      const mode = OTP_MODES[l.mode] ?? 'other';
      return {
        mode,
        from: { name: l.from.name ?? 'Výchozí bod', lat: l.from.lat, lon: l.from.lon, platform: l.from.stop?.platformCode ?? null },
        to: { name: l.to.name ?? 'Cíl', lat: l.to.lat, lon: l.to.lon, platform: l.to.stop?.platformCode ?? null },
        start: { scheduled: l.start.scheduledTime, estimated: l.start.estimated?.time ?? null, delay: l.start.estimated ? legDelay(l.start.estimated.delay) : UNKNOWN_DELAY },
        end: { scheduled: l.end.scheduledTime, estimated: l.end.estimated?.time ?? null, delay: l.end.estimated ? legDelay(l.end.estimated.delay) : UNKNOWN_DELAY },
        durationS: Math.round(l.duration ?? 0), distanceM: Math.round(l.distance ?? 0),
        route: l.route && mode !== 'walk' && mode !== 'bicycle' && mode !== 'car' ? { shortName: l.route.shortName ?? '?', mode: mode as Mode, color: l.route.color ? `#${l.route.color.replace('#', '')}` : null } : null,
        headsign: l.headsign ?? null, realtime: l.realTime === true, intermediateStops: l.intermediatePlaces?.length ?? 0,
      };
    });
    return { id: `${e.node.start}-${i}`, start: e.node.start, end: e.node.end, durationS: Math.round(e.node.duration ?? 0), transfers: e.node.numberOfTransfers ?? Math.max(0, legs.filter((l) => l.route).length - 1), walkDistanceM: Math.round(e.node.walkDistance ?? 0), legs };
  });
}
