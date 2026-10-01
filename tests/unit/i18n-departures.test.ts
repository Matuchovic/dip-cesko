import { describe, expect, it } from 'vitest';
import { LOCALES, negotiate } from '@/i18n/locales';
import { MESSAGES } from '@/i18n/messages';
import { makeT } from '@/i18n';
import { groupDepartures, modesOf } from '@/domain/departures';
import { knownDelay, UNKNOWN_DELAY, type Departure, type Mode } from '@/domain/model';

describe('jazyky', () => {
  it('automatický výběr podle prohlížeče', () => {
    expect(negotiate('de-AT,de;q=0.9,en;q=0.8')).toBe('de');
    expect(negotiate(['uk-UA', 'ru'])).toBe('uk');
    expect(negotiate('sk-SK,sk;q=0.9')).toBe('cs');
    expect(negotiate('ar-EG')).toBe('ar');
    expect(negotiate('fr-FR,ja')).toBe('cs');
    expect(negotiate(null)).toBe('cs');
  });
  it('všechny jazyky mají všechny texty a funkce vrací neprázdný text', () => {
    const keys = Object.keys(MESSAGES.cs);
    for (const l of LOCALES) {
      const t = makeT(l);
      expect(Object.keys(MESSAGES[l]).sort()).toEqual([...keys].sort());
      for (const k of keys) {
        const out = t(k as keyof typeof MESSAGES.cs, { n: 3, s: 125, h: 'X', p: 'A', q: 'x', t: '12:00', age: '1', m: 5, to: 'Y', mode: 'Z', d: '4', list: 'a', on: 1, all: 2, b: 0, z: '16', r: '1', l: '9', u: '', s2: '' });
        expect(out.length, `${l}.${k}`).toBeGreaterThan(0);
        expect(out, `${l}.${k}`).not.toMatch(/\{[a-z]+\}/);
      }
    }
  });
  it('množná čísla podle jazyka', () => {
    expect(makeT('cs')('transfers', { n: 2 })).toBe('2 přestupy');
    expect(makeT('cs')('transfers', { n: 5 })).toBe('5 přestupů');
    expect(makeT('uk')('transfers', { n: 5 })).toBe('5 пересадок');
    expect(makeT('en')('platforms', { n: 1 })).toBe('1 platform');
    expect(makeT('ar')('transfers', { n: 2 })).toBe('تبديلان');
  });
});

function dep(id: string, mode: Mode, line: string, headsign: string, minutes: number, platform: string | null): Departure {
  const at = new Date(Date.parse('2026-10-01T12:00:00Z') + minutes * 60_000).toISOString();
  return { id, route: { id: null, shortName: line, mode }, tripId: null, headsign, platform, stopName: 'Anděl', scheduledAt: at, predictedAt: null,
    delay: minutes % 2 ? knownDelay(60) : UNKNOWN_DELAY, isCanceled: false, isAtStop: false, wheelchair: null, airConditioned: null };
}

describe('přehled odjezdů po linkách', () => {
  const deps = [dep('1', 'tram', '9', 'Spojovací', 7, 'A'), dep('2', 'metro', 'B', 'Černý Most', 2, 'M1'), dep('3', 'tram', '9', 'Spojovací', 1, 'A'),
    dep('4', 'train', 'S7', 'Beroun', 3, '2'), dep('5', 'tram', '12', 'Lehovec', 4, 'B'), dep('6', 'tram', '9', 'Spojovací', 15, 'A'), dep('7', 'bus', '137', 'Na Knížecí', 5, 'C')];
  it('řadí metro → tramvaje → autobusy → vlaky a uvnitř podle čísla linky; časy vzestupně', () => {
    const g = groupDepartures(deps, 2);
    expect(g.map((x) => x.route.shortName)).toEqual(['B', '9', '12', '137', 'S7']);
    expect(g[1]!.items.map((d) => d.id)).toEqual(['3', '1']);
    expect(g[1]!.platforms).toEqual(['A']);
    expect(modesOf(deps)).toEqual(['metro', 'tram', 'bus', 'train']);
  });
});
