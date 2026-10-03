import { describe, expect, it } from 'vitest';
import { nearestStops, parseWikidata } from '@/server/landmarks';
import { TOP_LANDMARKS, guessKind } from '@/domain/landmarks';
import type { StopPoint } from '@/domain/model';

const stop = (name: string, lat: number, lon: number, lines: [string, StopPoint['lines'][number]['mode'], boolean?][]): StopPoint =>
  ({ id: `s-${name}-${lat}`, groupKey: `pid:${name}`, name, platform: null, lat, lon, modes: [...new Set(lines.map((l) => l[1]))], lines: lines.map(([n, m, night]) => ({ name: n, mode: m, direction: null, isNight: night === true })), gtfsIds: [] }) as unknown as StopPoint;

describe('památky', () => {
  it('nejbližší zastávka pro každý druh dopravy: metro, tramvaj, autobus; linky bez nočních, seřazené; minuty chůze', () => {
    const at = { lat: 50.0865, lon: 14.4114 }; // Karlův most
    const r = nearestStops(at.lat, at.lon, [
      stop('Staroměstská', 50.0884, 14.4176, [['A', 'metro']]),
      stop('Karlovy lázně', 50.0853, 14.4144, [['17', 'tram'], ['2', 'tram'], ['93', 'tram', true]]),
      stop('Daleko', 50.1100, 14.4114, [['22', 'tram']]),
      stop('Malostranská', 50.0909, 14.4093, [['194', 'bus']]),
    ]);
    expect(r.map((x) => x.mode)).toEqual(['metro', 'tram', 'bus']);
    expect(r[1]!.name).toBe('Karlovy lázně');
    expect(r[1]!.lines).toEqual(['2', '17']);
    expect(r.every((x) => x.walkMin >= 1 && x.walkMin < 20)).toBe(true);
  });
  it('Wikidata: název, poloha, slavnost; bez položek bez názvu; bez duplicit', () => {
    const rows = { results: { bindings: [
      { item: { value: 'http://www.wikidata.org/entity/Q1' }, itemLabel: { value: 'Kostel sv. Havla' }, coord: { value: 'Point(14.4210 50.0855)' }, sl: { value: '12' } },
      { item: { value: 'http://www.wikidata.org/entity/Q1' }, itemLabel: { value: 'Kostel sv. Havla' }, coord: { value: 'Point(14.4210 50.0855)' }, sl: { value: '3' } },
      { item: { value: 'http://www.wikidata.org/entity/Q2' }, itemLabel: { value: 'Q2' }, coord: { value: 'Point(14.4 50.0)' }, sl: { value: '1' } },
    ] } };
    const r = parseWikidata(rows);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: 'wd:Q1', name: 'Kostel sv. Havla', kind: 'church', lat: 50.0855, lon: 14.421, fame: 12 });
  });
  it('vybrané památky leží v Praze a mají unikátní id; druh podle názvu', () => {
    expect(new Set(TOP_LANDMARKS.map((l) => l.id)).size).toBe(TOP_LANDMARKS.length);
    for (const l of TOP_LANDMARKS) { expect(l.lat).toBeGreaterThan(49.94); expect(l.lat).toBeLessThan(50.18); expect(l.lon).toBeGreaterThan(14.22); expect(l.lon).toBeLessThan(14.71); }
    expect(guessKind('Staronová synagoga')).toBe('synagogue');
    expect(guessKind('Letohrádek Hvězda')).toBe('palace');
    expect(guessKind('Socha sv. Jana Nepomuckého')).toBe('monument');
  });
});
