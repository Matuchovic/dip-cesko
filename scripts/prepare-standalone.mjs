// Doplní do .next/standalone statické soubory (public, .next/static) a případná importovaná data.
import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const sa = path.join(root, '.next/standalone');
if (!existsSync(path.join(sa, 'server.js'))) { console.error('Chybí .next/standalone – nejdřív spusťte npm run build.'); process.exit(1); }
cpSync(path.join(root, 'public'), path.join(sa, 'public'), { recursive: true });
cpSync(path.join(root, '.next/static'), path.join(sa, '.next/static'), { recursive: true });
if (existsSync(path.join(root, 'data'))) cpSync(path.join(root, 'data'), path.join(sa, 'data'), { recursive: true });
console.log('Standalone připraven: node .next/standalone/server.js');
