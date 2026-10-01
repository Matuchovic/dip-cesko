// Ikony PWA (vektorový návrh → PNG). Spuštění: npm run icons
import sharp from 'sharp';
import path from 'node:path';
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../public/icons');
const svg = ({ rounded, scale }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B1A80"/><stop offset="1" stop-color="#7B4DFF"/></linearGradient></defs>
<rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="url(#g)"/>
<g transform="translate(256 256) scale(${scale}) translate(-256 -256)" fill="none" stroke="#fff" stroke-width="30" stroke-linecap="round" stroke-linejoin="round">
<path d="M186 118 104 148v250l82-30 140 30 82-30V118l-82 30-140-30Z"/><path d="M186 118v250M326 148v250"/></g></svg>`;
const jobs = [
  ['icon-192.png', 192, { rounded: true, scale: 0.86 }],
  ['icon-512.png', 512, { rounded: true, scale: 0.86 }],
  ['maskable-512.png', 512, { rounded: false, scale: 0.62 }],
  ['apple-touch-icon.png', 180, { rounded: false, scale: 0.78 }],
];
for (const [file, size, opts] of jobs) await sharp(Buffer.from(svg(opts))).resize(size, size).png().toFile(path.join(OUT, file));
console.log('Ikony vytvořeny v public/icons');
