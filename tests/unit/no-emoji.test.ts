import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Hlídač: v kódu aplikace nesmí být žádné emoji (máme vlastní 3D ikony). Povolené jsou jen značky ©, ®, ™. */
const ROOT = join(__dirname, '..', '..');
const ALLOWED = new Set(['©', '®', '™']);
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|css|js|json|html|webmanifest)$/.test(f) ? [p] : [];
  });
}
describe('žádná emoji v aplikaci', () => {
  it('zdrojové kódy, texty ve všech jazycích, servisní pracovník a manifest jsou bez emoji', () => {
    const list = [...files(join(ROOT, 'src')), join(ROOT, 'public', 'sw.js'), ...files(join(ROOT, 'public')).filter((f) => /\.(webmanifest|json|html)$/.test(f) && !f.includes('maplibre'))];
    const found: string[] = [];
    for (const f of list) {
      const lines = readFileSync(f, 'utf8').split('\n');
      lines.forEach((line, i) => {
        for (const m of line.matchAll(/\p{Extended_Pictographic}/gu)) if (!ALLOWED.has(m[0])) found.push(`${relative(ROOT, f)}:${i + 1} ${m[0]}`);
      });
    }
    expect(found).toEqual([]);
  });
});
