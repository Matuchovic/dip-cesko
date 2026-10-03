import 'server-only';
import { TOP_LANDMARKS, guessKind, type LandmarkKind } from '@/domain/landmarks';
import { haversineM } from '@/domain/geo';
import type { Mode, StopPoint } from '@/domain/model';
import { transit } from './transit';
import { normalizeName } from '@/providers/pid/stops';

export interface LandmarkStop { name: string; key: string; mode: Mode; walkMin: number; lines: string[] }
export interface Landmark { id: string; name: string; kind: LandmarkKind; area: string | null; lat: number; lon: number; desc: string | null; fame: number; top: boolean; distM?: number; stops?: LandmarkStop[] }

const MODE_ORDER: Mode[] = ['metro', 'tram', 'bus', 'train', 'trolleybus', 'funicular', 'ferry'];
const WALK_M_PER_MIN = 75;

/** Nejbližší zastávky po druzích dopravy (metro, tramvaj, autobus…) s linkami a minutami chůze. */
export function nearestStops(lat: number, lon: number, stops: StopPoint[]): LandmarkStop[] {
  const best = new Map<string, { name: string; key: string; mode: Mode; d: number; lines: Set<string> }>();
  for (const p of stops) {
    const d = haversineM({ lat, lng: lon }, { lat: p.lat, lng: p.lon });
    for (const mode of p.modes) {
      if (!MODE_ORDER.includes(mode)) continue;
      if (d > (mode === 'metro' || mode === 'train' ? 1000 : 650)) continue;
      const lines = p.lines.filter((l) => l.mode === mode && !l.isNight).map((l) => l.name);
      if (!lines.length) continue;
      const k = `${p.groupKey}|${mode}`;
      const e = best.get(k);
      if (!e) best.set(k, { name: p.name, key: p.groupKey, mode, d, lines: new Set(lines) });
      else { e.d = Math.min(e.d, d); lines.forEach((x) => e.lines.add(x)); }
    }
  }
  const byMode = new Map<Mode, { name: string; key: string; mode: Mode; d: number; lines: Set<string> }>();
  for (const e of best.values()) { const cur = byMode.get(e.mode); if (!cur || e.d < cur.d) byMode.set(e.mode, e); }
  const sortLines = (a: string, b: string) => (Number(a) || 1e9) - (Number(b) || 1e9) || a.localeCompare(b);
  return MODE_ORDER.filter((m) => byMode.has(m)).slice(0, 3).map((m) => {
    const e = byMode.get(m)!;
    return { name: e.name, key: e.key, mode: m, walkMin: Math.max(1, Math.round((e.d * 1.25) / WALK_M_PER_MIN)), lines: [...e.lines].sort(sortLines).slice(0, 8) };
  });
}

async function withStops(items: Landmark[]): Promise<Landmark[]> {
  const p = transit();
  return Promise.all(items.map(async (l) => {
    try {
      const r = await p.stopsInView([l.lon - 0.014, l.lat - 0.009, l.lon + 0.014, l.lat + 0.009]);
      return { ...l, stops: nearestStops(l.lat, l.lon, r.data) };
    } catch { return { ...l, stops: [] }; }
  }));
}

const top = (en: boolean): Landmark[] => TOP_LANDMARKS.map((s, i) => ({ id: `top:${s.id}`, name: en ? s.nameEn : s.name, kind: s.kind, area: s.area, lat: s.lat, lon: s.lon, desc: en ? s.descEn : s.desc, fame: 100_000 - i, top: true }));

// ---------- všechny kulturní památky v Praze (Wikidata: P762 = ÚSKP), mezipaměť 24 h ----------
const SPARQL = `SELECT ?item ?itemLabel ?coord ?sl WHERE {
  SERVICE wikibase:box { ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerSouthWest "Point(14.224 49.942)"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerNorthEast "Point(14.707 50.177)"^^geo:wktLiteral . }
  ?item wdt:P762 ?uskp . ?item wikibase:sitelinks ?sl .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "cs,en". }
}`;
let wdCache: { at: number; items: Landmark[] } | null = null;
export function parseWikidata(json: unknown): Landmark[] {
  const rows = (json as { results?: { bindings?: Record<string, { value: string }>[] } })?.results?.bindings ?? [];
  const out = new Map<string, Landmark>();
  for (const r of rows) {
    const name = r.itemLabel?.value ?? '';
    const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(r.coord?.value ?? '');
    if (!m || !name || /^Q\d+$/.test(name)) continue;
    const lon = Number(m[1]), lat = Number(m[2]), fame = Number(r.sl?.value ?? 0) || 0;
    const id = `wd:${(r.item?.value ?? '').split('/').pop()}`;
    const prev = out.get(id);
    if (prev && prev.fame >= fame) continue;
    out.set(id, { id, name, kind: guessKind(name), area: null, lat, lon, desc: null, fame, top: false });
  }
  return [...out.values()];
}
async function allMonuments(): Promise<Landmark[]> {
  if (wdCache && Date.now() - wdCache.at < 24 * 3600_000) return wdCache.items;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(SPARQL)}`;
  const r = await fetch(url, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'DopravaCR/1.0 (https://www.dopravacr.cz)' }, signal: AbortSignal.timeout(25_000), next: { revalidate: 86_400 } });
  if (!r.ok) throw new Error(`Wikidata ${r.status}`);
  const items = parseWikidata(await r.json());
  wdCache = { at: Date.now(), items };
  return items;
}

export async function landmarks(opts: { set: 'top' | 'all'; q: string; offset: number; limit: number; lat: number | null; lon: number | null; en: boolean }) {
  let pool = top(opts.en);
  let complete = true;
  if (opts.set === 'all') {
    try {
      const names = new Set(pool.map((p) => normalizeName(p.name)));
      pool = pool.concat((await allMonuments()).filter((w) => !names.has(normalizeName(w.name))));
    } catch { complete = false; }
  }
  const q = normalizeName(opts.q);
  if (q) pool = pool.filter((l) => normalizeName(`${l.name} ${l.area ?? ''}`).includes(q));
  if (opts.lat !== null && opts.lon !== null) {
    pool = pool.map((l) => ({ ...l, distM: Math.round(haversineM({ lat: opts.lat!, lng: opts.lon! }, { lat: l.lat, lng: l.lon })) })).sort((a, b) => a.distM! - b.distM!);
  } else pool = [...pool].sort((a, b) => b.fame - a.fame);
  const page = pool.slice(opts.offset, opts.offset + opts.limit);
  return { items: await withStops(page), total: pool.length, complete };
}
