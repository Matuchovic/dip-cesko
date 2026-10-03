'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { appStore, mapApi } from '@/lib/app-state';
import { useStore } from '@/lib/store';
import { getJson, useNow, useVisibleInterval } from '@/lib/hooks';
import { favoritesStore } from '@/lib/favorites';
import { hydratePlaces, placesStore, setPlace, type SavedPlace } from '@/lib/places';
import { haversineM } from '@/domain/geo';
import type { Alert, Departure, DepartureBoard, Envelope, Journey, Mode, StopPoint } from '@/domain/model';
import { MODE_RANK } from '@/domain/departures';
import { MODE_COLOR } from '@/domain/modes';
import { METRO_COLOR } from '@/domain/metro';
import { formatClock } from '@/domain/time';
import TLink from '../TLink';
import { modeName, useT } from '@/i18n';
import type { MessageKey } from '@/i18n/messages';
import StopSearch from '../StopSearch';
import { IconAlert, IconClose, IconExternal, IconMap, IconRoute, IconStar, IconWalk } from '../icons';

interface Nearby { key: string; name: string; modes: Mode[]; distance: number; platforms: number }
const WALK_M_PER_MIN = 75;
const walkMin = (m: number) => Math.max(1, Math.round(m / WALK_M_PER_MIN));
/** Barva odznaku linky: metro A, B, C ve svých barvách (B s tmavým písmem), jinak barva druhu dopravy. */
const badgeStyle = (mode: Mode, line: string) => {
  const metro = mode === 'metro' ? METRO_COLOR[line.toUpperCase() as 'A' | 'B' | 'C'] : undefined;
  return { background: metro ?? MODE_COLOR[mode], color: metro && line.toUpperCase() === 'B' ? '#2B2100' : '#fff' };
};
const depTime = (d: Departure) => Date.parse(d.predictedAt ?? d.scheduledAt ?? '');

/**
 * Domovská obrazovka s jasnou hierarchií: 1) nejbližší zastávka a tři nejbližší odjezdy s radou, zda spoj stihneš,
 * 2) Tvoje místa (Domů, Práce, oblíbené), 3) V okolí, 4) Provoz.
 */
export default function HomePanel() {
  const t = useT();
  const now = useNow(1000);
  const ready = useStore(appStore, (s) => s.mapReady);
  const locate = useStore(appStore, (s) => s.locate);
  const viewKey = useStore(appStore, (s) => s.viewKey);
  const favs = useStore(favoritesStore, (s) => s.items);
  const places = useStore(placesStore, (s) => s);
  const [nearby, setNearby] = useState<Nearby[] | null>(null);
  const [nearbyMsg, setNearbyMsg] = useState<string | null>(null);
  const [boards, setBoards] = useState<Record<string, Departure[]>>({});
  const [alerts, setAlerts] = useState<Envelope<Alert[]> | null>(null);
  const [picking, setPicking] = useState<'home' | 'work' | null>(null);
  const [plans, setPlans] = useState<Record<string, { at: number; j: Journey | null }>>({});
  useEffect(() => hydratePlaces(), []);

  const origin = () => { const c = mapApi.controller; if (!c) return null; const m = c.myPosition(); if (m) return m; const ce = c.map.getCenter(); return { lng: ce.lng, lat: ce.lat }; };

  const loadNearby = useCallback(async () => {
    const ref = origin();
    if (!ref) return;
    const d = 0.006;
    const r = await getJson<Envelope<StopPoint[]>>(`/api/stops?bbox=${[ref.lng - d, ref.lat - d * 0.7, ref.lng + d, ref.lat + d * 0.7].map((n) => n.toFixed(5)).join(',')}`);
    if (!r.ok || !r.body || r.body.meta.status === 'unavailable' || r.body.meta.status === 'error') { setNearby([]); setNearbyMsg(r.body?.meta.reason ? `reason_${r.body.meta.reason}` : 'reason_upstream_error'); return; }
    const groups = new Map<string, Nearby>();
    for (const p of r.body.data) {
      const dist = haversineM(ref, { lng: p.lon, lat: p.lat });
      const g = groups.get(p.groupKey);
      if (!g) groups.set(p.groupKey, { key: p.groupKey, name: p.name, modes: [...p.modes], distance: dist, platforms: 1 });
      else { g.distance = Math.min(g.distance, dist); g.platforms++; for (const m of p.modes) if (!g.modes.includes(m)) g.modes.push(m); }
    }
    setNearbyMsg(null);
    for (const g of groups.values()) g.modes.sort((a, b) => MODE_RANK[a] - MODE_RANK[b]);
    setNearby([...groups.values()].sort((a, b) => a.distance - b.distance).slice(0, 3));
  }, []);
  useEffect(() => {
    if (!ready) return;
    const tm = setTimeout(() => void loadNearby(), 450);
    return () => clearTimeout(tm);
  }, [ready, locate, viewKey, loadNearby]);

  // Odjezdy: hlavní zastávka každých 10 s, další dvě s ní (odlehčeno serverovou mezipamětí).
  const keys = (nearby ?? []).map((n) => n.key).join('|');
  useVisibleInterval(() => {
    for (const n of nearby ?? []) void getJson<Envelope<DepartureBoard>>(`/api/departures?stop=${encodeURIComponent(n.key)}&limit=12`)
      .then((r) => { if (r.body?.data) setBoards((b) => ({ ...b, [n.key]: r.body!.data.departures.filter((d) => !d.isCanceled) })); });
  }, 10_000, [keys]);
  useVisibleInterval(() => { void getJson<Envelope<Alert[]>>('/api/alerts').then((r) => setAlerts(r.body)); }, 120_000, []);

  // Tvoje místa: cesta z aktuální polohy (nebo středu mapy) – obnova nejvýš jednou za minutu.
  const planTo = useCallback(async (kind: 'home' | 'work', p: SavedPlace) => {
    const o = origin();
    if (!o) return;
    const body = { from: { lat: o.lat, lon: o.lng, label: t('pl_myLocation') }, to: { lat: p.lat, lon: p.lon, label: p.name }, dateTime: new Date().toISOString(), arriveBy: false, wheelchair: false };
    try {
      const res = await fetch('/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const js = res.ok ? (await res.json()) as Envelope<Journey[]> : null;
      setPlans((s) => ({ ...s, [kind]: { at: Date.now(), j: js?.data?.[0] ?? null } }));
    } catch { setPlans((s) => ({ ...s, [kind]: { at: Date.now(), j: null } })); }
  }, [t]);
  useVisibleInterval(() => {
    for (const kind of ['home', 'work'] as const) { const p = places[kind]; if (p && (!plans[kind] || Date.now() - plans[kind]!.at > 60_000)) void planTo(kind, p); }
  }, 15_000, [places.home?.key, places.work?.key, ready]);

  const top = nearby?.[0] ?? null;
  const deps = useMemo(() => (top ? (boards[top.key] ?? []).filter((d) => Number.isFinite(depTime(d)) && depTime(d) > now - 30_000).sort((a, b) => depTime(a) - depTime(b)).slice(0, 3) : []), [boards, top, now]);
  const favStops = favs.filter((f) => f.kind === 'stop').slice(0, 3);
  const mins = (d: Departure) => Math.round((depTime(d) - now) / 60_000);

  const advice = (d: Departure, next: Departure | undefined): { cls: string; text: string } => {
    if (!top) return { cls: '', text: '' };
    const slack = (depTime(d) - now) / 60_000 - walkMin(top.distance);
    if (slack >= 1) return { cls: 'ok', text: t('adv_ok', { n: Math.floor(slack) }) };
    if (slack >= 0) return { cls: 'warn', text: t('adv_now') };
    return { cls: 'bad', text: next ? t('adv_missNext', { n: Math.max(1, mins(next)) }) : t('adv_miss') };
  };

  const placeRow = (kind: 'home' | 'work') => {
    const p = places[kind], plan = plans[kind];
    const label = t(kind === 'home' ? 'place_home' : 'place_work');
    if (!p) return (
      <li key={kind}><button type="button" className="place-row" onClick={() => setPicking(kind)}>
        <span className={`place-ico ${kind}`} aria-hidden>{kind === 'home' ? '⌂' : '◼'}</span>
        <span className="place-main"><span className="place-title">{label}</span><span className="place-sub">{t('place_set')}</span></span>
        <span className="place-add" aria-hidden>+</span>
      </button></li>
    );
    const j = plan?.j ?? null, leave = j ? Math.round((Date.parse(j.start) - now) / 60_000) : null;
    const sub = j && leave !== null ? (leave <= 0 ? t('place_leaveNow', { t: formatClock(Date.parse(j.end)) }) : t('place_leave', { n: leave, t: formatClock(Date.parse(j.end)) })) : plan ? t('home_plan') : t('dep_loading');
    return (
      <li key={kind} className="place-item">
        <TLink className="place-row" href={`/spojeni?toLat=${p.lat.toFixed(6)}&toLon=${p.lon.toFixed(6)}&toName=${encodeURIComponent(p.name)}`}>
          <span className={`place-ico ${kind}`} aria-hidden>{kind === 'home' ? '⌂' : '◼'}</span>
          <span className="place-main"><span className="place-title">{label} · {p.name}</span><span className={`place-sub${leave !== null && leave <= 2 ? ' warn' : ''}`}>{sub}</span></span>
          <span className="chev" aria-hidden>›</span>
        </TLink>
        <button type="button" className="icon-btn place-x" aria-label={t('fav_remove', { n: label })} onClick={() => { setPlace(kind, null); setPlans((s) => ({ ...s, [kind]: undefined as never })); }}><IconClose size={16} /></button>
      </li>
    );
  };

  return (
    <>
      <section className="home-hero" aria-labelledby="hero-title">
        {nearby === null ? <><div className="skeleton" /><div className="skeleton" /></>
          : !top ? <div className="empty"><strong>{t('home_noneNearby')}</strong>{nearbyMsg ? t(nearbyMsg as MessageKey) : t('home_noneNearbyText')}</div>
          : (
            <>
              <div className="eyebrow"><IconWalk size={15} />{t('home_nearestStop', { n: walkMin(top.distance) })}</div>
              <h1 id="hero-title" className="hero-title">{top.name}</h1>
              {deps.length === 0 ? <div className="skeleton" /> : (
                <ol className="dep-list" aria-label={t('dep_aria', { s: top.name })}>
                  {deps.map((d, i) => {
                    const m = mins(d), a = i === 0 ? advice(d, deps[1]) : null, late = d.delay.kind === 'known' && d.delay.seconds >= 60;
                    return (
                      <li key={`${d.tripId ?? d.route.shortName}-${d.scheduledAt ?? i}`} className="dep-row">
                        <span className="dep-badge" style={badgeStyle(d.route.mode, d.route.shortName)} aria-label={`${modeName(t, d.route.mode)} ${d.route.shortName}`}>{d.route.shortName}</span>
                        <span className="dep-main">
                          <span className="dep-dest">{d.headsign}</span>
                          <span className="dep-meta">
                            {a && <><span className={a.cls}>{a.text}</span><br /></>}
                            {d.platform ? <>{t('platformShort', { p: d.platform })}{d.delay.kind === 'known' ? ' · ' : ''}</> : null}
                            {late ? <span className="warn">{t('delay_minutes', { n: Math.round(d.delay.kind === 'known' ? d.delay.seconds / 60 : 0) })}</span> : d.delay.kind === 'known' ? t('delayShort_onTime') : null}
                          </span>
                        </span>
                        <span className="dep-cd" aria-label={m <= 0 ? t('now') : t('inMin', { n: m })}>{m <= 0 ? <b className="now">{t('now')}</b> : <><b>{m}</b><small>min</small></>}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
              <TLink className="more-link" href={`/odjezdy?zastavka=${encodeURIComponent(top.key)}`}>{t('home_allDepartures')}<span aria-hidden>›</span></TLink>
            </>
          )}
      </section>

      <h2 className="sec-title">{t('home_places')}</h2>
      {picking ? (
        <div className="place-pick">
          <StopSearch label={t(picking === 'home' ? 'place_home' : 'place_work')} placeholder={t('place_pick')} autoFocus
            onSelect={(g) => { if (g) { setPlace(picking, { name: g.name, key: g.key, lat: g.lat, lon: g.lon }); setPicking(null); } }} />
          <button type="button" className="btn btn-ghost" onClick={() => setPicking(null)}>{t('cancel')}</button>
        </div>
      ) : (
        <ul className="place-list">
          {placeRow('home')}{placeRow('work')}
          {favStops.map((f) => (
            <li key={f.key} className="place-item">
              <TLink className="place-row" href={`/odjezdy?zastavka=${encodeURIComponent(f.key)}`}>
                <span className="place-ico fav" aria-hidden><IconStar size={18} filled /></span>
                <span className="place-main"><span className="place-title">{f.name}</span><span className="place-sub">{t('home_allDepartures')}</span></span>
                <span className="chev" aria-hidden>›</span>
              </TLink>
            </li>
          ))}
        </ul>
      )}

      {nearby !== null && (
        <>
          <h2 className="sec-title">{t('home_around')}<TLink className="sec-link" href="/metro">{t('metro_open')}</TLink></h2>
          {nearby.length > 1 && <ul className="place-list">
            {nearby!.slice(1).map((n) => {
              const next = (boards[n.key] ?? []).filter((d) => depTime(d) > now).sort((a, b) => depTime(a) - depTime(b));
              const shown: Departure[] = [];
              for (const d of next) { if (!shown.some((x) => x.route.shortName === d.route.shortName)) shown.push(d); if (shown.length === 2) break; }
              return (
                <li key={n.key} className="place-item">
                  <TLink className="place-row" href={`/odjezdy?zastavka=${encodeURIComponent(n.key)}`}>
                    <span className="place-ico mode" style={{ background: MODE_COLOR[n.modes[0] ?? 'bus'] }} aria-hidden>{n.modes[0] === 'metro' ? 'M' : n.modes[0] === 'tram' ? 'T' : n.modes[0] === 'train' ? 'S' : 'B'}</span>
                    <span className="place-main"><span className="place-title">{n.name}</span><span className="place-sub">{n.modes.map((m) => modeName(t, m)).join(', ')} · {t('walkMin', { n: walkMin(n.distance) })}</span></span>
                    <span className="place-next">{shown.map((d) => <span key={d.route.shortName}><b>{d.route.shortName}</b> {mins(d) <= 0 ? t('now') : t('inMin', { n: mins(d) })}</span>)}</span>
                  </TLink>
                </li>
              );
            })}
          </ul>}
        </>
      )}

      <h2 className="sec-title">{t('home_traffic')}</h2>
      {!alerts ? <div className="skeleton" /> : alerts.data.length === 0 ? <p className="hint">{t('home_noAlerts')}</p> : (
        <ul className="alert-list">
          {alerts.data.slice(0, 2).map((a) => (
            <li key={a.id} className="alert-card">
              <IconAlert size={20} />
              <span><strong>{a.title}</strong>{a.link && <> <a href={a.link} target="_blank" rel="noopener noreferrer">{t('more')}<IconExternal size={12} /></a></>}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="home-foot"><IconMap size={14} /><span>DopravaČR · {t('appTagline')}</span></div>
      <span hidden><IconRoute size={1} /></span>
    </>
  );
}
