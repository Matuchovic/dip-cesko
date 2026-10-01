export const PRAGUE_TZ = 'Europe/Prague';

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

/** Posun časového pásma v minutách pro daný okamžik (např. +60 v zimě, +120 v létě pro Europe/Prague). */
export function tzOffsetMinutes(epochMs: number, timeZone = PRAGUE_TZ): number {
  let f = offsetFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    offsetFormatters.set(timeZone, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(epochMs)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return Math.round((asUtc - Math.floor(epochMs / 1000) * 1000) / 60000);
}

/** Převod místního času (bez posunu) v daném pásmu na epoch ms. */
export function zonedToEpochMs(y: number, mo: number, d: number, h: number, mi: number, s: number, timeZone = PRAGUE_TZ): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let off = tzOffsetMinutes(guess, timeZone);
  let ms = guess - off * 60000;
  const off2 = tzOffsetMinutes(ms, timeZone);
  if (off2 !== off) { off = off2; ms = guess - off * 60000; }
  return ms;
}

/** GTFS čas HH:MM:SS (hodiny mohou přesáhnout 24, u PID až do 30:00) → sekundy od „poledne minus 12 h“. */
export function parseGtfsTime(value: string): number | null {
  const m = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 47) return null;
  return h * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/**
 * Okamžik GTFS času pro provozní den YYYYMMDD. Podle specifikace se čas měří od „poledne minus 12 h“
 * provozního dne v místním pásmu – tím je správně ošetřena změna letního času i časy po půlnoci.
 */
export function gtfsTimeToEpochMs(serviceDate: string, gtfsTime: string, timeZone = PRAGUE_TZ): number | null {
  const dm = /^(\d{4})(\d{2})(\d{2})$/.exec(serviceDate);
  const secs = parseGtfsTime(gtfsTime);
  if (!dm || secs === null) return null;
  const noon = zonedToEpochMs(Number(dm[1]), Number(dm[2]), Number(dm[3]), 12, 0, 0, timeZone);
  return noon - 12 * 3600_000 + secs * 1000;
}

const timeFmt = new Intl.DateTimeFormat('cs-CZ', { timeZone: PRAGUE_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const timeSecFmt = new Intl.DateTimeFormat('cs-CZ', { timeZone: PRAGUE_TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

export function parseInstant(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export const formatClock = (ms: number) => timeFmt.format(new Date(ms));
export const formatClockSeconds = (ms: number) => timeSecFmt.format(new Date(ms));

/** Celé minuty do odjezdu (zaokrouhleno dolů, minimálně 0). */
export function minutesUntil(targetMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((targetMs - nowMs) / 60000));
}

export function formatAge(seconds: number): string {
  if (seconds < 60) return `před ${Math.max(1, Math.round(seconds))} s`;
  const min = Math.round(seconds / 60);
  if (min < 60) return `před ${min} min`;
  const h = Math.floor(min / 60);
  return `před ${h} h ${min % 60} min`;
}
