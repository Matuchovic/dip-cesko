// Analyzuje dodané PNG, vytvoří odvozené varianty pro mapu a detail a zapíše manifest.
// Průhlednost se posuzuje výhradně podle alfa kanálu – černá barva se nikdy neodstraňuje.
import sharp from 'sharp';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'assets/source');
const OUT = path.join(ROOT, 'public/vehicles');
const PREVIEW = path.join(ROOT, 'docs/assets-preview');
const ALPHA_VISIBLE = 16;

const SOURCES = [
  { id: 'tram-top-redwhite', file: 'tram-top-redwhite.png', category: 'tram', view: 'top-down',
    declaredFront: 0, widthM: 2.5, widthOrigin: 'orientační šířka tramvaje 2,5 m', mapLengthPx: 768, bidirectional: false },
  { id: 'train-top-bluewhite', file: 'train-top-bluewhite.png', category: 'train', view: 'top-down',
    declaredFront: 0, widthM: 3.0, widthOrigin: 'orientační šířka železničního vozu 3,0 m', mapLengthPx: 960, bidirectional: true },
  { id: 'tram-oblique-redwhite', file: 'tram-oblique-redwhite.png', category: 'tram', view: 'oblique', detailWidth: 1200 },
  { id: 'tram-oblique-redwhite-alt', file: 'tram-oblique-redwhite-alt.png', category: 'tram', view: 'oblique', detailWidth: 1200 },
  { id: 'tram-oblique-bluewhite', file: 'tram-oblique-bluewhite.png', category: 'tram', view: 'oblique', detailWidth: 1200 },
  { id: 'train-oblique-bluewhite', file: 'train-oblique-bluewhite.png', category: 'train', view: 'oblique', detailWidth: 1200 },
];

async function analyze(file) {
  const img = sharp(path.join(SRC, file));
  const meta = await img.metadata();
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  let minX = W, minY = H, maxX = -1, maxY = -1, opaque = 0, partial = 0, transparent = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = data[(y * W + x) * 4 + 3];
    if (a === 0) transparent++; else if (a >= 250) opaque++; else partial++;
    if (a >= ALPHA_VISIBLE) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  const rect = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  return { meta, data, W, H, rect, alpha: { hasAlpha: Boolean(meta.hasAlpha), opaque, partial, transparent, visibleThreshold: ALPHA_VISIBLE } };
}

const lum = (d, i) => 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];

// Řádková analýza svislého spritu (čelo nahoře): tmavé pásy přes okraje střechy = měchy/přechodové lávky.
function detectJoints(a) {
  const { data, W, rect } = a;
  const bands = [[0.18, 0.32], [0.68, 0.82]];
  const rows = [];
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    let s = 0, n = 0;
    for (const [f0, f1] of bands) for (let x = Math.floor(rect.x + rect.width * f0); x < rect.x + rect.width * f1; x++) {
      const i = (y * W + x) * 4; if (data[i + 3] < 128) continue; s += lum(data, i); n++;
    }
    rows.push(n ? s / n : 255);
  }
  const runs = []; let i = 0; const L = rows.length;
  while (i < L) {
    if (rows[i] < 90) { let j = i; while (j < L && rows[j] < 90) j++; runs.push([i, j]); i = j; } else i++;
  }
  const merged = [];
  for (const r of runs) { const last = merged[merged.length - 1]; if (last && r[0] - last[1] <= 12) last[1] = r[1]; else merged.push([...r]); }
  return merged.filter(([s, e]) => e - s >= 8 && s > L * 0.08 && e < L * 0.92).map(([s, e]) => ({ from: +(s / L).toFixed(4), to: +(e / L).toFixed(4) }));
}

// Orientační kontrola čela: kabina se zasklením tvoří tmavou plochu u jednoho konce.
function frontEvidence(a) {
  const { data, W, rect } = a;
  const zone = (y0, y1) => {
    let s = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = rect.x + Math.floor(rect.width * 0.2); x < rect.x + rect.width * 0.8; x++) {
      const i = (y * W + x) * 4; if (data[i + 3] < 128) continue; s += lum(data, i); n++;
    }
    return n ? s / n : 255;
  };
  const h = Math.floor(rect.height * 0.12);
  const top = zone(rect.y, rect.y + h), bottom = zone(rect.y + rect.height - h, rect.y + rect.height);
  const diff = bottom - top;
  return { topLuminance: +top.toFixed(1), bottomLuminance: +bottom.toFixed(1),
    verdict: Math.abs(diff) < 25 ? 'symetrické konce' : diff > 0 ? 'tmavé zasklení nahoře – čelo nahoru' : 'tmavé zasklení dole – čelo dolů' };
}

function segmentsFrom(joints) {
  const segs = []; let start = 0;
  for (const j of joints) { segs.push({ kind: 'body', fromFront: +start.toFixed(4), toFront: j.from }); segs.push({ kind: 'joint', fromFront: j.from, toFront: j.to }); start = j.to; }
  segs.push({ kind: 'body', fromFront: +start.toFixed(4), toFront: 1 });
  return segs;
}

async function preview(buf, id) {
  const m = await sharp(buf).metadata();
  const pad = 16, w = m.width + pad * 2, h = m.height + pad * 2;
  for (const [name, bg] of [['light', '#ffffff'], ['dark', '#111018']]) {
    await sharp({ create: { width: w, height: h, channels: 4, background: bg } })
      .composite([{ input: buf, left: pad, top: pad }]).png().toFile(path.join(PREVIEW, `${id}.${name}.png`));
  }
}

async function main() {
  await mkdir(OUT, { recursive: true }); await mkdir(PREVIEW, { recursive: true });
  const assets = [];
  for (const s of SOURCES) {
    const a = await analyze(s.file);
    const srcStat = await stat(path.join(SRC, s.file));
    const entry = {
      id: s.id, category: s.category, view: s.view,
      source: { file: `assets/source/${s.file}`, bytes: srcStat.size, width: a.W, height: a.H, format: a.meta.format, alpha: a.alpha, visibleRect: a.rect },
      variants: [], anchor: { x: 0.5, y: 0.5 }, directionalVariants: [],
    };
    const pad = 2;
    const crop = { left: Math.max(0, a.rect.x - pad), top: Math.max(0, a.rect.y - pad),
      width: Math.min(a.W, a.rect.x + a.rect.width + pad) - Math.max(0, a.rect.x - pad),
      height: Math.min(a.H, a.rect.y + a.rect.height + pad) - Math.max(0, a.rect.y - pad) };
    if (s.view === 'top-down') {
      const buf = await sharp(path.join(SRC, s.file)).extract(crop)
        .resize({ height: s.mapLengthPx, kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer();
      const m = await sharp(buf).metadata();
      const out = `${s.id}.map.png`;
      await writeFile(path.join(OUT, out), buf);
      await preview(buf, s.id);
      const joints = detectJoints(a);
      const lengthM = +(s.widthM * a.rect.height / a.rect.width).toFixed(1);
      Object.assign(entry, {
        frontDirectionDeg: s.declaredFront,
        orientation: { declared: 'čelo směrem nahoru (pohled přímo shora)', check: s.bidirectional ? { ...frontEvidence(a), verdict: 'obousměrná jednotka – kabiny na obou koncích, čelo určuje deklarace dodavatele' } : frontEvidence(a), bidirectional: s.bidirectional },
        variants: [{ purpose: 'map', file: `/vehicles/${out}`, width: m.width, height: m.height, pixelRatio: 2, bytes: buf.length }],
        physical: { lengthM, widthM: s.widthM, origin: `odvozeno z poměru stran viditelné oblasti PNG (${a.rect.width}×${a.rect.height} px) při ${s.widthOrigin}; skutečná délka konkrétních vozů se liší` },
        segments: segmentsFrom(joints),
        sizing: { spriteFromZoom: 15.5, minScreenLengthPx: 34, maxScreenLengthPx: 560 },
        fallback: 'marker',
      });
    } else {
      const buf = await sharp(path.join(SRC, s.file)).extract(crop)
        .resize({ width: s.detailWidth, withoutEnlargement: true, kernel: 'lanczos3' }).webp({ quality: 84, alphaQuality: 100, effort: 6 }).toBuffer();
      const m = await sharp(buf).metadata();
      const out = `${s.id}.detail.webp`;
      await writeFile(path.join(OUT, out), buf);
      Object.assign(entry, { variants: [{ purpose: 'detail', file: `/vehicles/${out}`, width: m.width, height: m.height, pixelRatio: 1, bytes: buf.length }],
        note: 'Šikmý nadhled – jen pro detailové karty. Jediný šikmý obrázek nelze otáčením převést na směrové pohledy na mapě.' });
    }
    assets.push(entry);
    console.log(`${s.id}: ${a.W}×${a.H}, viditelná oblast ${a.rect.width}×${a.rect.height} @${a.rect.x},${a.rect.y}, alfa opaque=${a.alpha.opaque} partial=${a.alpha.partial}`);
  }
  const manifest = {
    version: 1,
    generatedBy: 'scripts/build-assets.mjs',
    categoryDefaults: {
      tram: { map: 'tram-top-redwhite', detail: 'tram-oblique-redwhite' },
      train: { map: 'train-top-bluewhite', detail: 'train-oblique-bluewhite' },
      bus: { map: null, detail: null }, trolleybus: { map: null, detail: null }, metro: { map: null, detail: null },
      ferry: { map: null, detail: null }, funicular: { map: null, detail: null }, other: { map: null, detail: null },
    },
    assets,
  };
  await writeFile(path.join(ROOT, 'src/config/vehicle-assets.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('Manifest zapsán: src/config/vehicle-assets.json');
}

main().catch((e) => { console.error(e); process.exit(1); });
