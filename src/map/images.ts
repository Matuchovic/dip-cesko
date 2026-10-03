import { MODE_COLOR } from '@/domain/modes';
import type { Mode } from '@/domain/model';

const FONT = '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif';
export interface RasterImage { width: number; height: number; data: Uint8ClampedArray }

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
function canvas(w: number, h: number): { ctx: Ctx } {
  let ctx: Ctx | null;
  if (typeof OffscreenCanvas !== 'undefined') ctx = new OffscreenCanvas(w, h).getContext('2d');
  else { const el = document.createElement('canvas'); el.width = w; el.height = h; ctx = el.getContext('2d'); }
  if (!ctx) throw new Error('Canvas 2D není dostupný');
  return { ctx };
}
function roundRect(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
const read = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, w: number, h: number): RasterImage => ({ width: w, height: h, data: ctx.getImageData(0, 0, w, h).data });

/** Štítek linky (kreslený do obrázku – nezávislý na glyfech mapového stylu). Měřítko 2× pro ostré zobrazení. */
export function badgeImage(line: string, mode: Mode, state: 'live' | 'stale' | 'selected'): RasterImage {
  const s = 2, fontPx = 13 * s, padX = 7 * s, h = 22 * s, border = 2 * s;
  const { ctx: m } = canvas(4, 4);
  m.font = `800 ${fontPx}px ${FONT}`;
  const tw = Math.ceil(m.measureText(line).width);
  const w = Math.max(h, tw + padX * 2);
  const { ctx } = canvas(w, h + 6 * s);
  roundRect(ctx, border / 2, border / 2, w - border, h - border, 7 * s);
  ctx.fillStyle = state === 'stale' ? '#8D8A9C' : MODE_COLOR[mode];
  ctx.fill();
  ctx.lineWidth = border; ctx.strokeStyle = state === 'selected' ? '#2F6FB5' : '#FFFFFF'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w / 2 - 5 * s, h - border); ctx.lineTo(w / 2, h + 5 * s); ctx.lineTo(w / 2 + 5 * s, h - border); ctx.closePath();
  ctx.fillStyle = state === 'selected' ? '#2F6FB5' : '#FFFFFF'; ctx.fill();
  ctx.fillStyle = '#FFFFFF'; ctx.font = `800 ${fontPx}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(line, w / 2, h / 2 + s);
  return read(ctx, w, h + 6 * s);
}

export function clusterImage(count: number): RasterImage {
  const s = 2, d = (count >= 100 ? 40 : count >= 10 ? 34 : 30) * s;
  const { ctx } = canvas(d, d);
  ctx.beginPath(); ctx.arc(d / 2, d / 2, d / 2 - 2 * s, 0, Math.PI * 2);
  ctx.fillStyle = '#1C3A63'; ctx.fill(); ctx.lineWidth = 3 * s; ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.stroke();
  ctx.fillStyle = '#FFFFFF'; ctx.font = `800 ${13 * s}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(count > 999 ? '999+' : String(count), d / 2, d / 2 + s);
  return read(ctx, d, d);
}

export function stopLabelImage(name: string, platform: string | null): RasterImage {
  const s = 2, fontPx = 11.5 * s, padX = 6 * s, h = 18 * s;
  const text = platform ? `${name} · ${platform}` : name;
  const { ctx: m } = canvas(4, 4);
  m.font = `700 ${fontPx}px ${FONT}`;
  const w = Math.ceil(m.measureText(text).width) + padX * 2;
  const { ctx } = canvas(w, h);
  roundRect(ctx, 1, 1, w - 2, h - 2, 6 * s);
  ctx.fillStyle = 'rgba(255,255,255,0.94)'; ctx.fill(); ctx.lineWidth = s; ctx.strokeStyle = 'rgba(44,18,96,0.18)'; ctx.stroke();
  ctx.fillStyle = '#1A1238'; ctx.font = `700 ${fontPx}px ${FONT}`; ctx.textBaseline = 'middle'; ctx.fillText(text, padX, h / 2 + s);
  return read(ctx, w, h);
}

/** Barva kroužku zpoždění: včas zelená, mírné oranžová, velké červená, neznámé šedá. */
export const TONE_COLOR: Record<string, string> = { ok: '#2F9E58', early: '#2F6FB5', warn: '#E3A21A', late: '#D33A2C', unknown: '#9A98A6' };

/** Pilulka s číslem linky a kroužkem zpoždění (od přiblížení 12,5 místo teček). */
export function pillImage(line: string, mode: Mode, tone: string, state: 'live' | 'stale' | 'selected'): RasterImage {
  const s = 2, fontPx = 12.5 * s, h = 22 * s, ring = 3 * s, pad = 8 * s;
  const { ctx: m } = canvas(4, 4);
  m.font = `800 ${fontPx}px ${FONT}`;
  const tw = Math.ceil(m.measureText(line).width);
  const w = Math.max(h, tw + pad * 2), W = w + ring * 2 + 2 * s, H = h + ring * 2 + 2 * s;
  const { ctx } = canvas(W, H);
  roundRect(ctx, s, s, W - 2 * s, H - 2 * s, (H - 2 * s) / 2);
  ctx.fillStyle = state === 'stale' ? '#B9B7C4' : TONE_COLOR[tone] ?? TONE_COLOR.unknown!; ctx.fill();
  roundRect(ctx, s + ring, s + ring, w, h, h / 2);
  ctx.fillStyle = state === 'stale' ? '#8D8A9C' : MODE_COLOR[mode]; ctx.fill();
  ctx.lineWidth = 1.6 * s; ctx.strokeStyle = state === 'selected' ? '#0F2341' : '#FFFFFF'; ctx.stroke();
  ctx.fillStyle = '#FFFFFF'; ctx.font = `800 ${fontPx}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(line, W / 2, H / 2 + 0.8 * s);
  return read(ctx, W, H);
}

/** Klín směru jízdy (otáčí se podle kurzu, pilulka zůstává vodorovně). Čtverec 64 px, klín nahoře. */
export function headingImage(mode: Mode): RasterImage {
  const d = 64;
  const { ctx } = canvas(d, d);
  ctx.beginPath(); ctx.moveTo(d / 2, 1); ctx.lineTo(d / 2 + 9, 15); ctx.lineTo(d / 2 - 9, 15); ctx.closePath();
  ctx.fillStyle = MODE_COLOR[mode]; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#FFFFFF'; ctx.stroke();
  return read(ctx, d, d);
}

/** Shluk při oddálení: prstenec rozdělený podle druhů dopravy a počet uprostřed. */
export function donutImage(counts: Partial<Record<Mode, number>>): RasterImage {
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const s = 2, d = (total >= 100 ? 50 : total >= 10 ? 44 : 38) * s, r = d / 2 - 5 * s;
  const { ctx } = canvas(d, d);
  ctx.beginPath(); ctx.arc(d / 2, d / 2, d / 2 - 1 * s, 0, Math.PI * 2); ctx.fillStyle = '#FFFFFF'; ctx.fill();
  let a0 = -Math.PI / 2;
  const entries = Object.entries(counts).filter(([, n]) => (n ?? 0) > 0) as [Mode, number][];
  for (const [mode, n] of entries) {
    const a1 = a0 + (n / Math.max(1, total)) * Math.PI * 2;
    ctx.beginPath(); ctx.arc(d / 2, d / 2, r, a0 + (entries.length > 1 ? 0.07 : 0), a1 - (entries.length > 1 ? 0.07 : 0));
    ctx.strokeStyle = MODE_COLOR[mode]; ctx.lineWidth = 5 * s; ctx.lineCap = 'round'; ctx.stroke(); a0 = a1;
  }
  ctx.fillStyle = '#0F2341'; ctx.font = `800 ${(total >= 100 ? 13 : 14) * s}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(total > 999 ? '999+' : String(total), d / 2, d / 2 + s);
  return read(ctx, d, d);
}

/** Štítek zastávky na trase sledovaného vozu: název a odpočet. */
export function etaImage(name: string, eta: string, color: string): RasterImage {
  const s = 2, fontPx = 11.5 * s, h = 22 * s, pad = 8 * s;
  const { ctx: m } = canvas(4, 4);
  m.font = `700 ${fontPx}px ${FONT}`;
  const text = `${name} · ${eta}`, tw = Math.ceil(m.measureText(text).width), w = tw + pad * 2;
  const { ctx } = canvas(w + 2 * s, h + 2 * s);
  roundRect(ctx, s, s, w, h, h / 2); ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.lineWidth = 1.6 * s; ctx.strokeStyle = color; ctx.stroke();
  ctx.fillStyle = '#0F2341'; ctx.font = `700 ${fontPx}px ${FONT}`; ctx.textBaseline = 'middle'; ctx.fillText(text, s + pad, s + h / 2 + 0.6 * s);
  return read(ctx, w + 2 * s, h + 2 * s);
}
