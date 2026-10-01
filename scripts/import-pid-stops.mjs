// Import seznamu zastávek PID (CC BY 4.0) do data/pid/stops.json – oddělený od webových požadavků.
// Nová verze se nejdřív ověří; teprve potom atomicky nahradí předchozí (ta zůstane jako stops.prev.json).
import { copyFile, mkdir, rename, stat, writeFile } from 'node:fs/promises';
const SOURCE = 'https://data.pid.cz/stops/json/stops.json';
const dir = new URL('../data/pid/', import.meta.url);
try {
  const res = await fetch(SOURCE, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const json = JSON.parse(text);
  const groups = json.stopGroups ?? json.groups;
  if (!Array.isArray(groups) || groups.length < 500) throw new Error('Neočekávaný obsah (málo skupin zastávek).');
  let stops = 0, bad = 0;
  for (const g of groups) for (const s of g.stops ?? []) { stops++; if (!(s.lat > 48 && s.lat < 52 && s.lon > 11 && s.lon < 19.5)) bad++; }
  if (bad > stops * 0.02) throw new Error(`Příliš mnoho souřadnic mimo Česko (${bad}/${stops}).`);
  await mkdir(dir, { recursive: true });
  const target = new URL('stops.json', dir), tmp = new URL('stops.json.tmp', dir), prev = new URL('stops.prev.json', dir);
  await writeFile(tmp, text);
  try { await stat(target); await copyFile(target, prev); } catch { /* první import */ }
  await rename(tmp, target);
  console.log(`Importováno: ${groups.length} skupin, ${stops} sloupků (generatedAt: ${json.generatedAt ?? 'neuvedeno'}).`);
} catch (err) {
  console.error(`Import zastávek selhal, ponechána předchozí verze: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
