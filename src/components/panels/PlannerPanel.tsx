'use client';
import { useState } from 'react';
import { mapApi } from '@/lib/app-state';
import type { Journey, JourneyLeg } from '@/domain/model';
import { describeDelay } from '@/domain/delay';
import { MODE_LABEL } from '@/domain/modes';
import { formatClock, PRAGUE_TZ, tzOffsetMinutes } from '@/domain/time';
import StopSearch from '../StopSearch';
import { DelayLabel, LineBadge } from '../ui';
import { IconSwap, IconWalk } from '../icons';

interface Pt { lat: number; lon: number; label: string }
type Result = { status: 'ok' | 'empty' | 'unavailable' | 'error' | 'invalid'; journeys?: Journey[]; message?: string; reason?: string; fetchedAt?: string };

function localInputValue(ms: number) {
  const off = tzOffsetMinutes(ms, PRAGUE_TZ);
  return new Date(ms + off * 60000).toISOString().slice(0, 16);
}
/** Hodnota datetime-local se interpretuje v pásmu Europe/Prague a převede na ISO s posunem. */
function toIsoPrague(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const guess = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!);
  let ms = guess - tzOffsetMinutes(guess, PRAGUE_TZ) * 60000;
  ms = guess - tzOffsetMinutes(ms, PRAGUE_TZ) * 60000;
  const off = tzOffsetMinutes(ms, PRAGUE_TZ);
  const sign = off >= 0 ? '+' : '-';
  return `${local}:00${sign}${String(Math.floor(Math.abs(off) / 60)).padStart(2, '0')}:${String(Math.abs(off) % 60).padStart(2, '0')}`;
}
const dur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${Math.max(1, Math.round(s / 60))} min`);

function Leg({ leg }: { leg: JourneyLeg }) {
  const start = Date.parse(leg.start.estimated ?? leg.start.scheduled);
  const end = Date.parse(leg.end.estimated ?? leg.end.scheduled);
  if (!leg.route) return <li><strong><IconWalk size={16} /> Chůze {dur(leg.durationS)}</strong><div className="hint">{leg.distanceM} m · do {leg.to.name}</div></li>;
  return (
    <li>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><LineBadge line={leg.route.shortName} mode={leg.route.mode} /><strong>{MODE_LABEL[leg.route.mode]} směr {leg.headsign ?? '—'}</strong></div>
      <div className="hint">{formatClock(start)} {leg.from.name}{leg.from.platform ? ` (nást. ${leg.from.platform})` : ''} → {formatClock(end)} {leg.to.name}{leg.to.platform ? ` (nást. ${leg.to.platform})` : ''}</div>
      <div className="meta-line">{leg.realtime ? <DelayLabel delay={leg.start.delay} /> : <span className="pill pill-off">plánovaný čas</span>}<span>{leg.intermediateStops} mezizastávek</span></div>
    </li>
  );
}

export default function PlannerPanel() {
  const [from, setFrom] = useState<Pt | null>(null);
  const [to, setTo] = useState<Pt | null>(null);
  const [fromLabel, setFromLabel] = useState('');
  const [toLabel, setToLabel] = useState('');
  const [arriveBy, setArriveBy] = useState(false);
  const [when, setWhen] = useState(() => localInputValue(Date.now()));
  const [wheelchair, setWheelchair] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const pickMyLocation = () => {
    if (!('geolocation' in navigator)) { setError('Zařízení neumí zjistit polohu.'); return; }
    navigator.geolocation.getCurrentPosition((p) => { setFrom({ lat: p.coords.latitude, lon: p.coords.longitude, label: 'Moje poloha' }); setFromLabel('Moje poloha'); },
      (e) => setError(e.code === e.PERMISSION_DENIED ? 'Přístup k poloze byl zamítnut – zadejte výchozí zastávku.' : 'Polohu se nepodařilo zjistit.'), { timeout: 10_000, maximumAge: 60_000 });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!from || !to) { setError('Vyberte výchozí místo i cíl ze seznamu.'); return; }
    if (from.label === to.label && Math.abs(from.lat - to.lat) < 1e-6) { setError('Výchozí místo a cíl jsou stejné.'); return; }
    const iso = toIsoPrague(when);
    if (!iso) { setError('Zadejte platný čas.'); return; }
    setBusy(true); setResult(null);
    try {
      const res = await fetch('/api/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ from, to, dateTime: iso, arriveBy, wheelchair }) });
      setResult((await res.json()) as Result);
    } catch { setResult({ status: 'error', message: 'Nepodařilo se spojit se serverem. Zkontrolujte připojení.' }); }
    finally { setBusy(false); }
  };

  return (
    <>
      <h1>Spojení</h1>
      <form onSubmit={submit} noValidate aria-describedby={error ? 'plan-err' : undefined}>
        <StopSearch label="Odkud" placeholder="Výchozí zastávka" initial={fromLabel} onSelect={(g, l) => { setFromLabel(l); setFrom(g ? { lat: g.lat, lon: g.lon, label: g.name } : null); }} extraOption={{ label: 'Moje poloha', onPick: pickMyLocation }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -6 }}>
          <button type="button" className="btn btn-ghost" onClick={() => { setFrom(to); setTo(from); setFromLabel(toLabel); setToLabel(fromLabel); }} aria-label="Prohodit odkud a kam"><IconSwap size={18} />Prohodit</button>
        </div>
        <StopSearch label="Kam" placeholder="Cílová zastávka" initial={toLabel} onSelect={(g, l) => { setToLabel(l); setTo(g ? { lat: g.lat, lon: g.lon, label: g.name } : null); }} />
        <div className="field">
          <span className="label" id="when-label">Čas</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div className="seg" role="group" aria-labelledby="when-label">
              <button type="button" aria-pressed={!arriveBy} onClick={() => setArriveBy(false)}>Odjezd</button>
              <button type="button" aria-pressed={arriveBy} onClick={() => setArriveBy(true)}>Příjezd</button>
            </div>
            <input className="input" style={{ flex: '1 1 100%' }} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Datum a čas" />
          </div>
        </div>
        <div className="switch-row" style={{ borderBottom: 0 }}>
          <span>Bezbariérově <span className="hint">(podle dostupnosti dat)</span></span>
          <label className="switch"><input type="checkbox" checked={wheelchair} onChange={(e) => setWheelchair(e.target.checked)} aria-label="Hledat bezbariérové spojení" /><span /></label>
        </div>
        {error && <p id="plan-err" className="error-text" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? 'Hledám spojení…' : 'Vyhledat spojení'}</button>
      </form>

      {busy && <div style={{ marginTop: 'var(--s4)' }}><div className="skeleton" /><div className="skeleton" /></div>}
      {result && result.status === 'unavailable' && (
        <div className="card" style={{ marginTop: 'var(--s4)' }} role="status">
          <strong>Plánovač spojení není připojen</strong>
          <p className="hint">{result.message} Vyhledání přestupů vyžaduje skutečný dopravní plánovač (OpenTripPlanner s jízdními řády PID). Mapová ani pěší trasa ho nenahrazuje, proto zde nezobrazujeme odhady.</p>
        </div>
      )}
      {result && (result.status === 'error' || result.status === 'invalid') && <div className="notice notice-error" role="alert" style={{ marginTop: 'var(--s4)' }}><span>{result.message}</span></div>}
      {result && result.status === 'empty' && <div className="empty"><strong>Spojení nenalezeno</strong>{result.message ?? 'Zkuste jiný čas nebo blízkou zastávku.'}</div>}
      {result?.status === 'ok' && result.journeys && (
        <section aria-label="Nalezená spojení" style={{ marginTop: 'var(--s4)' }}>
          {result.journeys.map((j) => {
            const expanded = open === j.id;
            return (
              <div key={j.id} className="card journey" aria-expanded={expanded}>
                <button type="button" className="row" style={{ padding: 0, minHeight: 0 }} onClick={() => setOpen(expanded ? null : j.id)} aria-expanded={expanded}>
                  <span className="row-main">
                    <span className="journey-times"><strong>{formatClock(Date.parse(j.start))} – {formatClock(Date.parse(j.end))}</strong><span>{dur(j.durationS)}</span></span>
                    <span className="legs">{j.legs.map((l, i) => l.route ? <LineBadge key={i} line={l.route.shortName} mode={l.route.mode} /> : <span key={i} className="leg-walk"><IconWalk size={14} />{Math.max(1, Math.round(l.durationS / 60))}</span>)}</span>
                    <span className="row-sub">{j.transfers === 0 ? 'Bez přestupu' : `${j.transfers} ${j.transfers === 1 ? 'přestup' : j.transfers < 5 ? 'přestupy' : 'přestupů'}`} · chůze {j.walkDistanceM} m</span>
                  </span>
                </button>
                {expanded && <ol className="itinerary">{j.legs.map((l, i) => <Leg key={i} leg={l} />)}</ol>}
                {expanded && <button type="button" className="btn btn-secondary" onClick={() => { const f = j.legs[0]?.from; if (f) mapApi.controller?.flyTo(f.lon, f.lat, 16); }}>Ukázat začátek cesty na mapě</button>}
                {expanded && j.legs.some((l) => l.route && l.start.delay.kind === 'known') && <p className="hint">Zpoždění: {j.legs.filter((l) => l.route).map((l) => `${l.route!.shortName}: ${describeDelay(l.start.delay).label}`).join(', ')}</p>}
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}
