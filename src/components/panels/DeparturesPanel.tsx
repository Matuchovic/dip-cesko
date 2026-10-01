'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { mapApi } from '@/lib/app-state';
import { useStore } from '@/lib/store';
import { getJson, useNow, useVisibleInterval } from '@/lib/hooks';
import { favoritesStore, isFavorite, toggleFavorite } from '@/lib/favorites';
import type { DepartureBoard, Envelope, Mode } from '@/domain/model';
import { groupDepartures, modesOf } from '@/domain/departures';
import { MODE_COLOR } from '@/domain/modes';
import { formatClockSeconds } from '@/domain/time';
import { modeName, modesName, useT } from '@/i18n';
import type { MessageKey } from '@/i18n/messages';
import StopSearch from '../StopSearch';
import { DepartureGroups, DepartureTimeline } from '../Departures';
import { IconMap, IconStar } from '../icons';

export default function DeparturesPanel() {
  const t = useT();
  const sp = useSearchParams();
  const router = useRouter();
  const key = sp.get('zastavka');
  const favs = useStore(favoritesStore, (s) => s.items);
  const [board, setBoard] = useState<Envelope<DepartureBoard> | null>(null);
  const [loading, setLoading] = useState(false);
  const [netError, setNetError] = useState<MessageKey | null>(null);
  const [platform, setPlatform] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [view, setView] = useState<'line' | 'time'>('line');
  const ctrl = useRef<AbortController | null>(null);
  const now = useNow(15_000);

  const load = useCallback(async () => {
    if (!key) { setBoard(null); return; }
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setLoading(true);
    try {
      const r = await getJson<Envelope<DepartureBoard>>(`/api/departures?stop=${encodeURIComponent(key)}&limit=60`, c.signal);
      if (r.body?.data) { setBoard(r.body); setNetError(null); } else setNetError(r.status === 429 ? 'dep_rateLimited' : 'dep_netError');
    } catch { /* přerušeno */ } finally { if (!c.signal.aborted) setLoading(false); }
  }, [key]);

  useVisibleInterval(() => void load(), 10_000, [key]);

  const group = board?.data.group ?? null;
  const fav = group ? isFavorite(favs, 'stop', group.key) : false;
  const platforms = group ? [...new Set(group.platforms.map((p) => p.platform).filter((p): p is string => Boolean(p)))] : [];
  const allDeps = board?.data.departures ?? [];
  const modes = modesOf(allDeps);
  const activeMode = mode && modes.includes(mode) ? mode : null;
  const deps = allDeps.filter((d) => (!platform || d.platform === platform) && (!activeMode || d.route.mode === activeMode));
  const groups = view === 'line' ? groupDepartures(deps, 4) : [];
  const st = board?.meta.status;
  const listLabel = t('dep_listAria', { n: group?.name ?? '' });

  return (
    <>
      <h1>{t('dep_title')}</h1>
      <StopSearch label={t('dep_stop')} placeholder={t('dep_search')} initial={group?.name ?? ''} autoFocus={!key} onSelect={(g) => { if (g) { setPlatform(null); setMode(null); router.replace(`/odjezdy?zastavka=${encodeURIComponent(g.key)}`); } }} />
      {!key && (
        <>
          {favs.some((f) => f.kind === 'stop') ? (<>
            <h2>{t('home_favStops')}</h2>
            <div className="legs">{favs.map((f) => f.kind === 'stop' && <Link key={f.key} className="chip" href={`/odjezdy?zastavka=${encodeURIComponent(f.key)}`}>{f.name}</Link>)}</div>
          </>) : <div className="empty"><strong>{t('dep_emptyTitle')}</strong>{t('dep_emptyText')}</div>}
        </>
      )}

      {key && group && (
        <div className="detail-head" style={{ marginTop: 'var(--s2)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="detail-title">{group.name}</div>
            <div className="detail-sub">{group.modes.map((m) => modeName(t, m)).join(' · ')}{group.municipality ? ` · ${group.municipality}` : ''}</div>
          </div>
          <button type="button" className="icon-btn" aria-label={t('dep_showOnMap')} onClick={() => { mapApi.controller?.flyTo(group.lon, group.lat, 17); router.push('/'); }}><IconMap size={20} /></button>
          <button type="button" className="icon-btn" aria-pressed={fav} aria-label={fav ? t('sc_removeFav') : t('dep_saveFav')} onClick={() => toggleFavorite({ kind: 'stop', key: group.key, name: group.name, modes: group.modes, savedAt: new Date().toISOString() })}><IconStar filled={fav} /></button>
        </div>
      )}

      {key && modes.length > 1 && (
        <div className="legs mode-tabs" role="group" aria-label={t('dep_modeFilter')}>
          <button type="button" className="chip" aria-pressed={activeMode === null} onClick={() => setMode(null)}>{t('all')}</button>
          {modes.map((m) => <button key={m} type="button" className="chip" aria-pressed={activeMode === m} onClick={() => setMode(m)}><span className="dot" style={{ background: MODE_COLOR[m] }} aria-hidden />{modesName(t, m)}</button>)}
        </div>
      )}
      {key && platforms.length > 1 && (
        <div className="legs" role="group" aria-label={t('dep_platformFilter')}>
          <button type="button" className="chip chip-sm" aria-pressed={platform === null} onClick={() => setPlatform(null)}>{t('all')}</button>
          {platforms.map((p) => <button key={p} type="button" className="chip chip-sm" aria-pressed={platform === p} onClick={() => setPlatform(p)}>{p}</button>)}
        </div>
      )}

      {key && board && (
        <div className="meta-line" role="status">
          {st === 'live' && <span className="pill pill-live"><span className="pulse" aria-hidden />{t('pill_live')}</span>}
          {st === 'stale' && <span className="pill pill-stale">{t('pill_stale')}</span>}
          {st === 'demo' && <span className="pill pill-demo">{t('pill_demo')}</span>}
          {st === 'unavailable' && <span className="pill pill-off">{t('pill_unavailable')}</span>}
          {st === 'error' && <span className="pill pill-error">{t('pill_error')}</span>}
          {board.meta.fetchedAt && st !== 'unavailable' && <span>{t('dep_updated', { t: formatClockSeconds(Date.parse(board.meta.fetchedAt)), age: t('ago', { s: Math.max(1, (now - Date.parse(board.meta.fetchedAt)) / 1000) }) })}</span>}
          {loading && <span aria-hidden>· {t('dep_loading')}</span>}
          <span className="seg" role="group" aria-label={t('dep_title')}>
            <button type="button" aria-pressed={view === 'line'} onClick={() => setView('line')}>{t('dep_byLine')}</button>
            <button type="button" aria-pressed={view === 'time'} onClick={() => setView('time')}>{t('dep_byTime')}</button>
          </span>
        </div>
      )}
      {netError && <div className="notice notice-error" role="alert" style={{ marginTop: 'var(--s3)' }}><span>{t(netError)} {board ? t('dep_lastData') : ''}</span><button type="button" className="btn btn-secondary" onClick={() => void load()}>{t('retry')}</button></div>}
      {key && (st === 'unavailable' || st === 'error') && <div className="notice" style={{ marginTop: 'var(--s3)' }}><span>{board?.meta.reason ? t(`reason_${board.meta.reason}` as MessageKey) : board?.data.group ? board?.meta.message : t('dep_stopNotFound')}</span></div>}
      {board?.data.notices.map((n, i) => <div key={i} className="notice notice-warn" style={{ marginTop: 'var(--s3)' }}><span>{n}</span></div>)}

      {key && !board && !netError && <div style={{ marginTop: 'var(--s4)' }}><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>}
      {key && board && (st === 'live' || st === 'stale' || st === 'demo') && deps.length === 0 && <div className="empty"><strong>{t('dep_noneTitle')}</strong>{t('dep_noneText')}</div>}
      {deps.length > 0 && (view === 'line'
        ? <div style={{ marginTop: 'var(--s3)' }}><DepartureGroups groups={groups} now={now} label={listLabel} /></div>
        : <div style={{ marginTop: 'var(--s3)' }}><DepartureTimeline deps={deps} now={now} label={listLabel} /></div>)}
      {board && <p className="footer-note">{t('dep_footer', { s: board.meta.attribution })}</p>}
    </>
  );
}
