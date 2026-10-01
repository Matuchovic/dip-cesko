import type { Departure, Mode } from './model';

/** Pořadí druhů dopravy v přehledech: metro, tramvaje, trolejbusy, autobusy, vlaky, ostatní. */
export const MODE_RANK: Record<Mode, number> = { metro: 0, tram: 1, trolleybus: 2, bus: 3, train: 4, ferry: 5, funicular: 6, other: 7 };

export interface DepartureGroup { key: string; route: Departure['route']; headsign: string; platforms: string[]; items: Departure[] }

export const departureMs = (d: Departure): number => Date.parse(d.predictedAt ?? d.scheduledAt ?? '');

/** Druhy dopravy, které ze zastávky jedou (v pořadí přehledu). */
export function modesOf(deps: readonly Departure[]): Mode[] {
  return [...new Set(deps.map((d) => d.route.mode))].sort((a, b) => MODE_RANK[a] - MODE_RANK[b]);
}

/** Přehled „v kolik co jede“: linka + směr → nejbližší odjezdy (seřazeno metro → tram → … → vlak, pak číslo linky). */
export function groupDepartures(deps: readonly Departure[], perGroup = 4): DepartureGroup[] {
  const map = new Map<string, DepartureGroup>();
  const sorted = [...deps].sort((a, b) => (departureMs(a) || 0) - (departureMs(b) || 0));
  for (const d of sorted) {
    const key = `${d.route.mode}|${d.route.shortName}|${d.headsign}`;
    let g = map.get(key);
    if (!g) { g = { key, route: d.route, headsign: d.headsign, platforms: [], items: [] }; map.set(key, g); }
    if (d.platform && !g.platforms.includes(d.platform)) g.platforms.push(d.platform);
    if (g.items.length < perGroup) g.items.push(d);
  }
  return [...map.values()].sort((a, b) => MODE_RANK[a.route.mode] - MODE_RANK[b.route.mode]
    || a.route.shortName.localeCompare(b.route.shortName, 'cs', { numeric: true }) || a.headsign.localeCompare(b.headsign, 'cs'));
}
