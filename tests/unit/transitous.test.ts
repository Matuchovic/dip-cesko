import { describe, expect, it, vi } from 'vitest';
import { mapTransitous, planTransitous, transitousParams } from '@/planning/transitous';

const req = { from: { lat: 50.0716, lon: 14.4035, label: 'Anděl' }, to: { lat: 50.0833, lon: 14.4232, label: 'Můstek' }, dateTime: '2026-10-01T12:00:00+02:00', arriveBy: false, wheelchair: true };
// Tvar podle MOTIS OpenAPI (Itinerary / Leg / Place)
const sample = { itineraries: [{ id: 'x1', duration: 780, startTime: '2026-10-01T10:02:00Z', endTime: '2026-10-01T10:15:00Z', transfers: 0, legs: [
  { mode: 'WALK', from: { name: 'START', lat: 50.0716, lon: 14.4035 }, to: { name: 'Anděl', lat: 50.0712, lon: 14.4040, track: 'B' }, duration: 120, startTime: '2026-10-01T10:02:00Z', endTime: '2026-10-01T10:04:00Z', scheduledStartTime: '2026-10-01T10:02:00Z', scheduledEndTime: '2026-10-01T10:04:00Z', realTime: false, scheduled: true, distance: 140, legGeometry: { points: '', length: 0 } },
  { mode: 'SUBWAY', routeType: 1, routeShortName: 'B', headsign: 'Černý Most', routeColor: 'F2C200', from: { name: 'Anděl', lat: 50.0712, lon: 14.404, track: '1' }, to: { name: 'Můstek', lat: 50.0833, lon: 14.4232 }, duration: 540, startTime: '2026-10-01T10:06:00Z', endTime: '2026-10-01T10:15:00Z', scheduledStartTime: '2026-10-01T10:05:00Z', scheduledEndTime: '2026-10-01T10:14:00Z', realTime: true, scheduled: true, intermediateStops: [{}, {}, {}], legGeometry: { points: '', length: 0 } },
] }] };

describe('Transitous (MOTIS 2)', () => {
  it('parametry dotazu', () => {
    const p = transitousParams(req);
    expect(p.get('fromPlace')).toBe('50.071600,14.403500');
    expect(p.get('time')).toBe('2026-10-01T10:00:00.000Z');
    expect(p.get('pedestrianProfile')).toBe('WHEELCHAIR');
  });
  it('převod spojení: chůze, metro se zpožděním, nástupiště, mezizastávky', () => {
    const [j] = mapTransitous(sample);
    expect(j!.legs).toHaveLength(2);
    expect(j!.walkDistanceM).toBe(140);
    const m = j!.legs[1]!;
    expect(m.route).toEqual({ shortName: 'B', mode: 'metro', color: '#F2C200' });
    expect(m.start.delay).toEqual({ kind: 'known', seconds: 60 });
    expect(m.from.platform).toBe('1');
    expect(m.intermediateStops).toBe(3);
    expect(j!.legs[0]!.route).toBeNull();
  });
  it('zkusí novější verzi API a při 404 přejde na starší', async () => {
    const calls: string[] = [];
    const f = vi.fn(async (url: string | URL | Request) => { calls.push(String(url)); return String(url).includes('/v6/') ? new Response('', { status: 404 }) : new Response(JSON.stringify(sample), { status: 200 }); });
    const out = await planTransitous({ ...req, dateTime: '2026-10-01T13:00:00+02:00' }, f as unknown as typeof fetch);
    expect(out).toHaveLength(1);
    expect(calls[0]).toContain('/api/v6/plan?');
    expect(calls[1]).toContain('/api/v5/plan?');
  });
});
