/** Schéma pražského metra (stylizované, na výšku pro mobil) a převod polohy soupravy na místo ve schématu. */
export type MetroLineId = 'A' | 'B' | 'C';
export const METRO_COLOR: Record<MetroLineId, string> = { A: '#00A562', B: '#F8B322', C: '#E2001A' };

type Seg = { to: [number, number]; names: string[] };
/** Úseky schématu: stanice se rozloží rovnoměrně, přestupní stanice leží ve vrcholech (shodně pro obě linky). */
const SEGMENTS: Record<MetroLineId, { start: [number, number]; first: string; segs: Seg[] }> = {
  A: { start: [16, 190], first: 'Nemocnice Motol', segs: [
    { to: [100, 190], names: ['Petřiny', 'Nádraží Veleslavín', 'Bořislavka', 'Dejvická'] },
    { to: [170, 300], names: ['Hradčanská', 'Malostranská', 'Staroměstská', 'Můstek'] },
    { to: [200, 330], names: ['Muzeum'] },
    { to: [344, 330], names: ['Náměstí Míru', 'Jiřího z Poděbrad', 'Flora', 'Želivského', 'Strašnická', 'Skalka', 'Depo Hostivař'] }] },
  B: { start: [16, 520], first: 'Zličín', segs: [
    { to: [136, 520], names: ['Stodůlky', 'Luka', 'Lužiny', 'Hůrka', 'Nové Butovice'] },
    { to: [136, 400], names: ['Jinonice', 'Radlická', 'Smíchovské nádraží', 'Anděl'] },
    { to: [170, 300], names: ['Karlovo náměstí', 'Národní třída', 'Můstek'] },
    { to: [215, 240], names: ['Náměstí Republiky', 'Florenc'] },
    { to: [290, 160], names: ['Křižíkova', 'Invalidovna', 'Palmovka'] },
    { to: [344, 40], names: ['Českomoravská', 'Vysočanská', 'Kolbenova', 'Hloubětín', 'Rajská zahrada', 'Černý Most'] }] },
  C: { start: [215, 20], first: 'Letňany', segs: [
    { to: [215, 240], names: ['Prosek', 'Střížkov', 'Ládví', 'Kobylisy', 'Nádraží Holešovice', 'Vltavská', 'Florenc'] },
    { to: [200, 330], names: ['Hlavní nádraží', 'Muzeum'] },
    { to: [200, 470], names: ['I. P. Pavlova', 'Vyšehrad', 'Pražského povstání', 'Pankrác', 'Budějovická'] },
    { to: [250, 590], names: ['Kačerov', 'Roztyly', 'Chodov', 'Opatov', 'Háje'] }] },
};

export interface SchemaStation { name: string; x: number; y: number; transfer: boolean }
export const METRO_SCHEMA: Record<MetroLineId, SchemaStation[]> = (() => {
  const out = {} as Record<MetroLineId, SchemaStation[]>;
  const count = new Map<string, number>();
  for (const id of ['A', 'B', 'C'] as MetroLineId[]) {
    const d = SEGMENTS[id];
    const st: SchemaStation[] = [{ name: d.first, x: d.start[0], y: d.start[1], transfer: false }];
    let from = d.start;
    for (const s of d.segs) {
      s.names.forEach((name, i) => {
        const k = (i + 1) / s.names.length;
        st.push({ name, x: Math.round(from[0] + (s.to[0] - from[0]) * k), y: Math.round(from[1] + (s.to[1] - from[1]) * k), transfer: false });
      });
      from = s.to;
    }
    out[id] = st;
    for (const s of st) count.set(s.name, (count.get(s.name) ?? 0) + 1);
  }
  for (const id of ['A', 'B', 'C'] as MetroLineId[]) for (const s of out[id]) s.transfer = (count.get(s.name) ?? 0) > 1;
  return out;
})();

/** Poloha ve schématu podle zlomkového indexu stanice (např. 4,3 = mezi 5. a 6. stanicí). */
export function schemaPoint(line: MetroLineId, index: number): { x: number; y: number } {
  const st = METRO_SCHEMA[line];
  const i = Math.max(0, Math.min(st.length - 1, index));
  const a = st[Math.floor(i)]!, b = st[Math.min(st.length - 1, Math.floor(i) + 1)]!, k = i - Math.floor(i);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/**
 * Zlomkový index soupravy na lince: kolmý průmět polohy na lomenou čáru stanic (zeměpisně).
 * Vrací i směr úseku (ve směru pořadí stanic), aby šlo poznat směr jízdy, a odchylku od trati v metrech.
 */
export function progressOnStations(stations: { lat: number; lon: number }[], lat: number, lon: number): { index: number; dist: number; segBearing: number } | null {
  if (stations.length < 2) return null;
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180), ky = 110_574;
  let best: { index: number; dist: number; segBearing: number } | null = null;
  for (let i = 1; i < stations.length; i++) {
    const a = stations[i - 1]!, b = stations[i]!;
    const ax = (a.lon - lon) * kx, ay = (a.lat - lat) * ky, bx = (b.lon - lon) * kx, by = (b.lat - lat) * ky;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / l2)) : 0;
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (!best || d < best.dist) best = { index: i - 1 + t, dist: d, segBearing: ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360 };
  }
  return best;
}
