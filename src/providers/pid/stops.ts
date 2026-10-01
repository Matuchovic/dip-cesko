import { z } from 'zod';
import { nsId } from '@/domain/ids';
import type { Mode, StopGroup, StopPoint } from '@/domain/model';
import { inBBox, type BBox } from '@/domain/geo';

export const PID_STOPS_URL = 'https://data.pid.cz/stops/json/stops.json';
export const PID_DATA_HOST = 'data.pid.cz';

const LineSchema = z.object({ id: z.union([z.string(), z.number()]).nullish(), name: z.string(), type: z.string().nullish(), isNight: z.boolean().nullish(), direction: z.string().nullish() });
const StopSchema = z.object({ id: z.string(), platform: z.string().nullish(), altIdosName: z.string().nullish(), lat: z.number(), lon: z.number(), lines: z.array(LineSchema).nullish() });
const GroupSchema = z.object({
  name: z.string(), uniqueName: z.string().nullish(), idosName: z.string().nullish(), municipality: z.string().nullish(),
  avgLat: z.number(), avgLon: z.number(), mainTrafficType: z.string().nullish(), isTrain: z.boolean().nullish(), stops: z.array(StopSchema).default([]),
});

// Pořadí je důležité: „trolleybus“ obsahuje „bus“.
const TRAFFIC: Record<string, Mode> = { metro: 'metro', trolleybus: 'trolleybus', tram: 'tram', train: 'train', bus: 'bus', ferry: 'ferry', funicular: 'funicular' };
function trafficMode(t: string | null | undefined): Mode {
  if (!t) return 'other';
  const k = t.toLowerCase();
  for (const [needle, mode] of Object.entries(TRAFFIC)) if (k.includes(needle)) return mode;
  return k.includes('rail') ? 'train' : k.includes('bus') ? 'bus' : 'other';
}
const MODE_RANK: Record<Mode, number> = { metro: 0, train: 1, tram: 2, trolleybus: 3, bus: 4, ferry: 5, funicular: 5, other: 6 };

export function normalizeName(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export interface StopIndex { generatedAt: string | null; groups: StopGroup[]; keys: Map<string, StopGroup>; norm: string[] }

/** Zpracování seznamu zastávek PID (JSON). Neplatné záznamy se přeskočí, aby nezastavily celý import. */
export function buildStopIndex(raw: unknown): StopIndex {
  const root = z.object({ generatedAt: z.string().nullish(), stopGroups: z.array(z.unknown()).nullish(), groups: z.array(z.unknown()).nullish() }).safeParse(raw);
  if (!root.success) throw new Error('Neočekávaný formát seznamu zastávek');
  const list = root.data.stopGroups ?? root.data.groups ?? [];
  const groups: StopGroup[] = [];
  const keys = new Map<string, StopGroup>();
  for (const item of list.slice(0, 40000)) {
    const g = GroupSchema.safeParse(item);
    if (!g.success) continue;
    const key = (g.data.uniqueName ?? g.data.idosName ?? g.data.name).trim();
    if (!key || keys.has(key)) continue;
    const platforms: StopPoint[] = g.data.stops.map((s) => {
      const lines = (s.lines ?? []).map((l) => ({ name: l.name, mode: trafficMode(l.type), direction: l.direction ?? null, isNight: l.isNight === true }));
      return { id: nsId('pid', 'stop', s.id), groupKey: key, name: g.data.name, platform: s.platform ?? null, lat: s.lat, lon: s.lon, modes: [...new Set(lines.map((l) => l.mode))], lines };
    });
    const modes = [...new Set(platforms.flatMap((p) => p.modes))];
    if (!modes.length) modes.push(g.data.isTrain ? 'train' : trafficMode(g.data.mainTrafficType));
    modes.sort((a, b) => MODE_RANK[a] - MODE_RANK[b]);
    const group: StopGroup = { key, name: g.data.name, municipality: g.data.municipality ?? null, lat: g.data.avgLat, lon: g.data.avgLon, modes, platforms };
    groups.push(group);
    keys.set(key, group);
  }
  return { generatedAt: root.data.generatedAt ?? null, groups, keys, norm: groups.map((g) => normalizeName(`${g.name} ${g.municipality ?? ''}`)) };
}

/** Vyhledávání bez diakritiky: přesná shoda > začátek názvu > začátek slova > obsahuje. */
export function searchStops(index: StopIndex, query: string, limit = 8): StopGroup[] {
  const q = normalizeName(query);
  if (q.length < 2) return [];
  const scored: { g: StopGroup; s: number }[] = [];
  index.groups.forEach((g, i) => {
    const n = index.norm[i] ?? '';
    const name = normalizeName(g.name);
    let s = -1;
    if (name === q) s = 0; else if (name.startsWith(q)) s = 1; else if (n.split(' ').some((w) => w.startsWith(q))) s = 2; else if (n.includes(q)) s = 3;
    if (s >= 0) scored.push({ g, s: s * 10 + MODE_RANK[g.modes[0] ?? 'other'] });
  });
  return scored.sort((a, b) => a.s - b.s || a.g.name.localeCompare(b.g.name, 'cs')).slice(0, limit).map((x) => x.g);
}

export function stopsInBBox(index: StopIndex, bbox: BBox, limit = 400): StopPoint[] {
  const out: StopPoint[] = [];
  for (const g of index.groups) {
    if (!inBBox(bbox, g.lon, g.lat)) continue;
    for (const p of g.platforms) { if (inBBox(bbox, p.lon, p.lat)) out.push(p); if (out.length >= limit) return out; }
  }
  return out;
}

/** ID sloupku PID „uzel/sloupek“ → formát aswIds pro odjezdové tabule Golemio („uzel_sloupek“). */
export function toAswId(stopId: string): string | null {
  const raw = stopId.split(':').pop() ?? '';
  const m = /^(\d+)\/(\d+)$/.exec(raw);
  return m ? `${m[1]}_${m[2]}` : null;
}
