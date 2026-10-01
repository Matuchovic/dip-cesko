// Ikony PWA, favicon a logo z dodané grafiky (assets/brand). Spuštění: npm run icons
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC_ICON = path.join(ROOT, 'assets/brand/app-icon.png');
const SRC_LOGO = path.join(ROOT, 'assets/brand/logo-full.png');
const ICONS = path.join(ROOT, 'public/icons');
const BRAND = path.join(ROOT, 'public/brand');
/** Vnitřní emblém „D“ s kolejemi v ikoně 1254 × 1254 (bez skleněného rámu). */
const EMBLEM = { left: 190, top: 165, width: 930, height: 925 };
const BG = { r: 241, g: 245, b: 250, alpha: 1 }; // #F1F5FA – světlé sklo ikony
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

await mkdir(ICONS, { recursive: true });
await mkdir(BRAND, { recursive: true });

const emblem = (size) => sharp(SRC_ICON).extract(EMBLEM).resize(size, size, { fit: 'contain', background: CLEAR }).png().toBuffer();
async function onBackground(size, scale) {
  const inner = await emblem(Math.round(size * scale));
  return sharp({ create: { width: size, height: size, channels: 4, background: BG } }).composite([{ input: inner, gravity: 'center' }]).flatten({ background: BG }).png().toBuffer();
}

// PWA „any“ – celá ikona včetně skleněného rámu (průhledné rohy jsou povolené)
for (const n of [192, 512]) await sharp(SRC_ICON).resize(n, n).png().toFile(path.join(ICONS, `icon-${n}.png`));
// „maskable“ a iOS: plné pozadí, emblém v bezpečné zóně (iOS si rohy zaobluje sám)
await writeFile(path.join(ICONS, 'maskable-512.png'), await onBackground(512, 0.72));
await writeFile(path.join(ICONS, 'maskable-192.png'), await onBackground(192, 0.72));
await writeFile(path.join(ICONS, 'apple-touch-icon.png'), await onBackground(180, 0.82));

// favicon: samotný emblém (v malé velikosti čitelnější než celá ikona s rámem)
const fav = await Promise.all([16, 32, 48].map(async (s) => ({ s, buf: await emblem(s) })));
await writeFile(path.join(ICONS, 'favicon-32.png'), fav[1].buf);
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(fav.length, 4);
const dir = Buffer.alloc(16 * fav.length);
let offset = 6 + 16 * fav.length;
fav.forEach(({ s, buf }, i) => {
  const o = i * 16;
  dir.writeUInt8(s, o); dir.writeUInt8(s, o + 1); dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
  dir.writeUInt32LE(buf.length, o + 8); dir.writeUInt32LE(offset, o + 12); offset += buf.length;
});
await writeFile(path.join(ROOT, 'public/favicon.ico'), Buffer.concat([header, dir, ...fav.map((f) => f.buf)]));

// Logo: plné (se sloganem), do hlavičky bez sloganu, a světlá varianta nápisu pro tmavý vzhled
const { data, info } = await sharp(SRC_LOGO).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
const variant = (mode) => {
  const out = Buffer.from(data);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (x < 600) continue; // emblém vlevo beze změny
    if (mode !== 'full' && y >= 457) { out[i + 3] = 0; continue; } // bez sloganu
    if (mode === 'dark' && out[i + 3] > 0) {
      const r = out[i], g = out[i + 1], b = out[i + 2], lum = 0.3 * r + 0.59 * g + 0.11 * b;
      if (lum < 70) { out[i] = 242; out[i + 1] = 246; out[i + 2] = 251; }          // tmavomodrý nápis → světlý
      else if (b > r + 25) { out[i] = 143; out[i + 1] = 182; out[i + 2] = 227; }   // „ČR“ ocelově modrá → světle modrá
    }
  }
  return sharp(out, { raw: { width: W, height: H, channels: 4 } }).trim({ threshold: 1 });
};
await variant('full').resize({ height: 360 }).png().toFile(path.join(BRAND, 'logo-full.png'));
await variant('header').resize({ height: 144 }).png().toFile(path.join(BRAND, 'logo.png'));
await variant('dark').resize({ height: 144 }).png().toFile(path.join(BRAND, 'logo-dark.png'));
console.log('Ikony, favicon a logo vytvořeny (public/icons, public/brand, public/favicon.ico)');
