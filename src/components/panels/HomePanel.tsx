'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { appStore, mapApi } from '@/lib/app-state';
import { useStore } from '@/lib/store';
import { getJson, useVisibleInterval } from '@/lib/hooks';
import { favoritesStore } from '@/lib/favorites';
import { haversineM } from '@/domain/geo';
import type { Alert, Envelope, Mode, StopPoint } from '@/domain/model';
import { MODE_RANK } from '@/domain/departures';
import { modeName, useT } from '@/i18n';
import type { MessageKey } from '@/i18n/messages';
import { formatClock } from '@/domain/time';
import StopSearch from '../StopSearch';
import { LineBadge } from '../ui';
import { IconAlert, IconExternal, IconLocate, IconRoute } from '../icons';

interface Nearby { key: string; name: string; modes: Mode[]; distance: number; platforms: number }

export default function HomePanel() {
  const router = useRouter();
  const t = useT();
  const ready = useStore(appStore, (s) => s.mapReady);
  const locate = useStore(appStore, (s) => s.locate);
  const viewKey = useStore(appStore, (s) => s.viewKey);
  const meta = useStore(appStore, (s) => s.feedMeta);
  const favs = useStore(favoritesStore, (s) => s.items);
  const [nearby, setNearby] = useState<Nearby[] | null>(null);
  const [nearbyMsg, setNearbyMsg] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Envelope<Alert[]> | null>(null);

  const loadNearby = useCallback(async () => {
    const c = mapApi.controller;
    if (!c) return;
    const ref = c.myPosition() ?? (() => { const m = c.map.getCenter(); return { lng: m.lng, lat: m.lat }; })();
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
    setNearby([...groups.values()].sort((a, b) => a.distance - b.distance).slice(0, 6));
  }, []);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => void loadNearby(), 450);
    return () => clearTimeout(t);
  }, [ready, locate, viewKey, loadNearby]);
  useVisibleInterval(() => { void getJson<Envelope<Alert[]>>('/api/alerts').then((r) => setAlerts(r.body)); }, 120_000, []);

  const favStops = favs.filter((f) => f.kind === 'stop').slice(0, 4);

  return (
    <>
      <h1>{t('home_title')}</h1>
      <StopSearch label={t('home_stopLabel')} placeholder={t('home_placeholder')} onSelect={(g) => { if (g) { mapApi.controller?.flyTo(g.lon, g.lat, 16.5); router.push(`/odjezdy?zastavka=${encodeURIComponent(g.key)}`); } }} />
      <div className="actions" style={{ marginTop: 0 }}>
        <Link className="btn btn-primary" href="/spojeni"><IconRoute size={18} />{t('home_plan')}</Link>
        <button type="button" className="btn btn-secondary" onClick={() => mapApi.controller?.locate()} disabled={!ready || locate === 'locating'}><IconLocate size={18} />{locate === 'locating' ? t('home_locating') : t('home_nearMe')}</button>
      </div>

      {meta?.status === 'unavailable' && <div className="notice" style={{ marginTop: 'var(--s4)' }}><span><strong>{t('home_liveMissingTitle')}</strong> {meta.reason ? t(`reason_${meta.reason}` as MessageKey) : meta.message} {t('home_liveMissingText')}</span></div>}
      {meta?.status === 'demo' && <div className="notice notice-demo" style={{ marginTop: 'var(--s4)' }}><span><strong>{t('home_demoTitle')}</strong> {t('home_demoText')}</span></div>}
      {locate === 'denied' && <div className="notice notice-warn" style={{ marginTop: 'var(--s4)' }}><span>{t('home_denied')}</span></div>}

      <h2>{t('home_nearby')} <span className="hint">{locate === 'ok' ? t('home_fromYou') : t('home_fromCenter')}</span></h2>
      {nearby === null ? <><div className="skeleton" /><div className="skeleton" /></> : nearby.length === 0 ? (
        <div className="empty"><strong>{t('home_noneNearby')}</strong>{nearbyMsg ? t(nearbyMsg as MessageKey) : t('home_noneNearbyText')}</div>
      ) : (
        <ul className="list">
          {nearby.map((n) => (
            <li key={n.key}>
              <Link className="row" href={`/odjezdy?zastavka=${encodeURIComponent(n.key)}`}>
                <LineBadge line={modeName(t, n.modes[0] ?? 'other').slice(0, 1)} mode={n.modes[0] ?? 'other'} />
                <span className="row-main"><span className="row-title">{n.name}</span><span className="row-sub">{n.modes.map((m) => modeName(t, m)).join(' · ')} · {t('platforms', { n: n.platforms })}</span></span>
                <span className="row-side"><span className="clock">{n.distance < 1000 ? `${Math.round(n.distance / 10) * 10} m` : `${(n.distance / 1000).toFixed(1)} km`}</span></span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {favStops.length > 0 && (<>
        <h2>{t('home_favStops')} <Link href="/oblibene" className="hint">{t('all')}</Link></h2>
        <div className="legs">{favStops.map((f) => f.kind === 'stop' && <Link key={f.key} className="chip" href={`/odjezdy?zastavka=${encodeURIComponent(f.key)}`}>{f.name}</Link>)}</div>
      </>)}

      <h2>{t('home_alerts')} {alerts?.meta.status === 'demo' && <span className="pill pill-demo">{t('home_alertsDemo')}</span>}</h2>
      {!alerts ? <div className="skeleton" /> : alerts.data.length === 0 ? (
        <div className="empty">{alerts.meta.status === 'live' || alerts.meta.status === 'stale' ? <><strong>{t('home_noAlerts')}</strong>{t('home_noAlertsText')}</> : <><strong>{t('home_alertsUnavailable')}</strong>{alerts.meta.reason ? t(`reason_${alerts.meta.reason}` as MessageKey) : alerts.meta.message}</>}</div>
      ) : (
        <ul className="list">
          {alerts.data.slice(0, 4).map((a) => (
            <li key={a.id} className="row" style={{ alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--late)', paddingTop: 2 }}><IconAlert size={20} /></span>
              <span className="row-main"><span className="row-title" style={{ whiteSpace: 'normal' }}>{a.title}</span><span className="row-sub">{a.publishedAt ? t('home_published', { t: formatClock(Date.parse(a.publishedAt)) }) : ''}</span></span>
              {a.link && <a href={a.link} target="_blank" rel="noopener noreferrer" className="icon-btn" aria-label={t('home_openAlert', { t: a.title })}><IconExternal size={18} /></a>}
            </li>
          ))}
        </ul>
      )}
      <p className="footer-note">{t('attribution', { s: meta?.attribution ?? 'ROPID / PID, Golemio' })}</p>
    </>
  );
}
