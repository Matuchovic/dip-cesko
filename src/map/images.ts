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
