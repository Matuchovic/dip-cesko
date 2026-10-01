'use client';
import { useState } from 'react';
import { mapApi } from '@/lib/app-state';
import type { Journey, JourneyLeg } from '@/domain/model';
import { delayTexts, modeName, useT, type TFn } from '@/i18n';
import type { MessageKey } from '@/i18n/messages';
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
function Leg({ leg, t }: { leg: JourneyLeg; t: TFn }) {
  const start = Date.parse(leg.start.estimated ?? leg.start.scheduled);
  const end = Date.parse(leg.end.estimated ?? leg.end.scheduled);
  if (!leg.route) return <li><strong><IconWalk size={16} /> {t('pl_walk', { d: t('dur', { s: leg.durationS }) })}</strong><div className="hint">{t('pl_walkTo', { m: leg.distanceM, to: leg.to.name })}</div></li>;
  return (
    <li>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><LineBadge line={leg.route.shortName} mode={leg.route.mode} /><strong>{t('pl_legTitle', { mode: modeName(t, leg.route.mode), h: leg.headsign ?? '—' })}</strong></div>
      <div className="hint">{formatClock(start)} {leg.from.name}{leg.from.platform ? ` (${t('platformShort', { p: leg.from.platform })})` : ''} → {formatClock(end)} {leg.to.name}{leg.to.platform ? ` (${t('platformShort', { p: leg.to.platform })})` : ''}</div>
      <div className="meta-line">{leg.realtime ? <DelayLabel delay={leg.start.delay} /> : <span className="pill pill-off">{t('pl_planned')}</span>}<span>{t('stopsCount', { n: leg.intermediateStops })}</span></div>
    </li>
  );
}

export default function PlannerPanel() {
  const t = useT();
  const [from, setFrom] = useState<Pt | null>(null);
  const [to, setTo] = useState<Pt | null>(null);
  const [fromLabel, setFromLabel] = useState('');
  const [toLabel, setToLabel] = useState('');
  const [arriveBy, setArriveBy] = useState(false);
  const [when, setWhen] = useState(() => localInputValue(Date.now()));
  const [wheelchair, setWheelchair] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const pickMyLocation = () => {
    if (!('geolocation' in navigator)) { setError('pl_noGeo'); return; }
    navigator.geolocation.getCurrentPosition((p) => { setFrom({ lat: p.coords.latitude, lon: p.coords.longitude, label: t('pl_myLocation') }); setFromLabel(t('pl_myLocation')); },
      (e) => setError(e.code === e.PERMISSION_DENIED ? 'pl_geoDenied' : 'pl_geoFailed'), { timeout: 10_000, maximumAge: 60_000 });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!from || !to) { setError('pl_needBoth'); return; }
    if (from.label === to.label && Math.abs(from.lat - to.lat) < 1e-6) { setError('pl_same'); return; }
    const iso = toIsoPrague(when);
    if (!iso) { setError('pl_badTime'); return; }
    setBusy(true); setResult(null);
    try {
      const res = await fetch('/api/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ from, to, dateTime: iso, arriveBy, wheelchair }) });
      setResult((await res.json()) as Result);
    } catch { setResult({ status: 'error', reason: 'network' }); }
    finally { setBusy(false); }
  };

  return (
    <>
      <h1>{t('pl_title')}</h1>
      <form onSubmit={submit} noValidate aria-describedby={error ? 'plan-err' : undefined}>
        <StopSearch label={t('pl_from')} placeholder={t('pl_fromPh')} initial={fromLabel} onSelect={(g, l) => { setFromLabel(l); setFrom(g ? { lat: g.lat, lon: g.lon, label: g.name } : null); }} extraOption={{ label: t('pl_myLocation'), onPick: pickMyLocation }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -6 }}>
          <button type="button" className="btn btn-ghost" onClick={() => { setFrom(to); setTo(from); setFromLabel(toLabel); setToLabel(fromLabel); }} aria-label={t('pl_swapAria')}><IconSwap size={18} />{t('pl_swap')}</button>
        </div>
        <StopSearch label={t('pl_to')} placeholder={t('pl_toPh')} initial={toLabel} onSelect={(g, l) => { setToLabel(l); setTo(g ? { lat: g.lat, lon: g.lon, label: g.name } : null); }} />
        <div className="field">
          <span className="label" id="when-label">{t('pl_time')}</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div className="seg" role="group" aria-labelledby="when-label">
              <button type="button" aria-pressed={!arriveBy} onClick={() => setArriveBy(false)}>{t('pl_depart')}</button>
              <button type="button" aria-pressed={arriveBy} onClick={() => setArriveBy(true)}>{t('pl_arrive')}</button>
            </div>
            <input className="input" style={{ flex: '1 1 100%' }} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label={t('pl_dateTime')} />
          </div>
        </div>
        <div className="switch-row" style={{ borderBottom: 0 }}>
          <span>{t('pl_wheelchair')} <span className="hint">{t('pl_wheelchairNote')}</span></span>
          <label className="switch"><input type="checkbox" checked={wheelchair} onChange={(e) => setWheelchair(e.target.checked)} aria-label={t('pl_wheelchairAria')} /><span /></label>
        </div>
        {error && <p id="plan-err" className="error-text" role="alert">{t(error)}</p>}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? t('pl_searching') : t('pl_search')}</button>
      </form>

      {busy && <div style={{ marginTop: 'var(--s4)' }}><div className="skeleton" /><div className="skeleton" /></div>}
      {result && result.status === 'unavailable' && (
        <div className="card" style={{ marginTop: 'var(--s4)' }} role="status">
          <strong>{t('pl_unavailableTitle')}</strong>
          <p className="hint">{t('pl_unavailableText')}</p>
        </div>
      )}
      {result && (result.status === 'error' || result.status === 'invalid') && <div className="notice notice-error" role="alert" style={{ marginTop: 'var(--s4)' }}><span>{result.reason === 'network' ? t('pl_serverError') : result.status === 'invalid' ? t('pl_invalid') : t('pl_plannerError')}</span></div>}
      {result && result.status === 'empty' && <div className="empty"><strong>{t('pl_noneTitle')}</strong>{t('pl_noneText')}</div>}
      {result?.status === 'ok' && result.journeys && (
        <section aria-label={t('pl_results')} style={{ marginTop: 'var(--s4)' }}>
          {result.journeys.map((j) => {
            const expanded = open === j.id;
            return (
              <div key={j.id} className="card journey" aria-expanded={expanded}>
                <button type="button" className="row" style={{ padding: 0, minHeight: 0 }} onClick={() => setOpen(expanded ? null : j.id)} aria-expanded={expanded}>
                  <span className="row-main">
                    <span className="journey-times"><strong>{formatClock(Date.parse(j.start))} – {formatClock(Date.parse(j.end))}</strong><span>{t('dur', { s: j.durationS })}</span></span>
                    <span className="legs">{j.legs.map((l, i) => l.route ? <LineBadge key={i} line={l.route.shortName} mode={l.route.mode} /> : <span key={i} className="leg-walk"><IconWalk size={14} />{Math.max(1, Math.round(l.durationS / 60))}</span>)}</span>
                    <span className="row-sub">{j.transfers === 0 ? t('pl_noTransfer') : t('transfers', { n: j.transfers })} · {t('pl_walkM', { m: j.walkDistanceM })}</span>
                  </span>
                </button>
                {expanded && <ol className="itinerary">{j.legs.map((l, i) => <Leg key={i} leg={l} t={t} />)}</ol>}
                {expanded && <button type="button" className="btn btn-secondary" onClick={() => { const f = j.legs[0]?.from; if (f) mapApi.controller?.flyTo(f.lon, f.lat, 16); }}>{t('pl_showStart')}</button>}
                {expanded && j.legs.some((l) => l.route && l.start.delay.kind === 'known') && <p className="hint">{t('pl_delays', { list: j.legs.filter((l) => l.route).map((l) => `${l.route!.shortName}: ${delayTexts(t, l.start.delay).label}`).join(', ') })}</p>}
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}
