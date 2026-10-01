// MapLibre GL 6 odvozuje URL workeru z import.meta.url, což po sestavení Next.js nefunguje.
// Worker proto servírujeme z /public/maplibre (stejná verze jako v node_modules) a nastavujeme setWorkerUrl().
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = path.join(root, 'node_modules/maplibre-gl/dist');
const out = path.join(root, 'public/maplibre');
mkdirSync(out, { recursive: true });
for (const f of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) copyFileSync(path.join(src, f), path.join(out, f));
console.log('MapLibre worker zkopírován do public/maplibre');
