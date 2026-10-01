'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { mapApi } from '@/lib/app-state';
import { useStore } from '@/lib/store';
import { getJson, useNow, useVisibleInterval } from '@/lib/hooks';
import { favoritesStore, isFavorite, toggleFavorite } from '@/lib/favorites';
import type { DepartureBoard, Envelope } from '@/domain/model';
import { MODE_LABEL } from '@/domain/modes';
import { formatAge, formatClock, formatClockSeconds, minutesUntil } from '@/domain/time';
import StopSearch from '../StopSearch';
import { DelayLabel, LineBadge } from '../ui';
import { IconMap, IconStar, IconWheelchair } from '../icons';

export default function DeparturesPanel() {
  const sp = useSearchParams();
  const router = useRouter();
  const key = sp.get('zastavka');
  const favs = useStore(favoritesStore, (s) => s.items);
  const [board, setBoard] = useState<Envelope<DepartureBoard> | null>(null);
  const [loading, setLoading] = useState(false);
  const [netError, setNetError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const now = useNow(15_000);

  const load = useCallback(async () => {
    if (!key) { setBoard(null); return; }
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setLoading(true);
    try {
      const r = await getJson<Envelope<DepartureBoard>>(`/api/departures?stop=${encodeURIComponent(key)}&limit=40`, c.signal);
      if (r.body?.data) { setBoard(r.body); setNetError(null); } else setNetError(r.status === 429 ? 'Příliš mnoho požadavků, zkusíme to za chvíli.' : 'Odjezdy se nepodařilo načíst. Zkontrolujte připojení.');
    } catch { /* přerušeno */ } finally { if (!c.signal.aborted) setLoading(false); }
  }, [key]);

  useVisibleInterval(() => void load(), 20_000, [key]);

  const group = board?.data.group ?? null;
  const fav = group ? isFavorite(favs, 'stop', group.key) : false;
  const platforms = group ? [...new Set(group.platforms.map((p) => p.platform).filter((p): p is string => Boolean(p)))] : [];
  const deps = (board?.data.departures ?? []).filter((d) => !platform || d.platform === platform);
  const st = board?.meta.status;

  return (
    <>
      <h1>Odjezdy</h1>
      <StopSearch label="Zastávka" placeholder="Hledat zastávku" initial={group?.name ?? ''} autoFocus={!key} onSelect={(g) => { if (g) { setPlatform(null); router.replace(`/odjezdy?zastavka=${encodeURIComponent(g.key)}`); } }} />
      {!key && (
        <>
          {favs.some((f) => f.kind === 'stop') ? (<>
            <h2>Oblíbené zastávky</h2>
            <div className="legs">{favs.map((f) => f.kind === 'stop' && <Link key={f.key} className="chip" href={`/odjezdy?zastavka=${encodeURIComponent(f.key)}`}>{f.name}</Link>)}</div>
          </>) : <div className="empty"><strong>Vyhledejte zastávku</strong>Zobrazíme nejbližší odjezdy se zpožděním, nástupištěm a bezbariérovostí.</div>}
        </>
      )}

      {key && group && (
        <div className="detail-head" style={{ marginTop: 'var(--s2)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="detail-title">{group.name}</div>
            <div className="detail-sub">{group.modes.map((m) => MODE_LABEL[m]).join(' · ')}{group.municipality ? ` · ${group.municipality}` : ''}</div>
          </div>
          <button type="button" className="icon-btn" aria-label="Ukázat na mapě" onClick={() => { mapApi.controller?.flyTo(group.lon, group.lat, 17); router.push('/'); }}><IconMap size={20} /></button>
          <button type="button" className="icon-btn" aria-pressed={fav} aria-label={fav ? 'Odebrat z oblíbených' : 'Uložit zastávku do oblíbených'} onClick={() => toggleFavorite({ kind: 'stop', key: group.key, name: group.name, modes: group.modes, savedAt: new Date().toISOString() })}><IconStar filled={fav} /></button>
        </div>
      )}

      {key && platforms.length > 1 && (
        <div className="legs" role="group" aria-label="Filtr nástupiště">
          <button type="button" className="chip" aria-pressed={platform === null} onClick={() => setPlatform(null)}>Vše</button>
          {platforms.map((p) => <button key={p} type="button" className="chip" aria-pressed={platform === p} onClick={() => setPlatform(p)}>{p}</button>)}
        </div>
      )}

      {key && board && (
        <div className="meta-line" role="status">
          {st === 'live' && <span className="pill pill-live"><span className="pulse" aria-hidden />Živě</span>}
          {st === 'stale' && <span className="pill pill-stale">Zastaralá data</span>}
          {st === 'demo' && <span className="pill pill-demo">Ukázková data</span>}
          {(st === 'unavailable' || st === 'error') && <span className="pill pill-off">Odjezdy nedostupné</span>}
          {board.meta.fetchedAt && st !== 'unavailable' && <span>Aktualizováno {formatClockSeconds(Date.parse(board.meta.fetchedAt))} ({formatAge(Math.max(1, (now - Date.parse(board.meta.fetchedAt)) / 1000))})</span>}
          {loading && <span aria-hidden>· načítám…</span>}
        </div>
      )}
      {netError && <div className="notice notice-error" role="alert" style={{ marginTop: 'var(--s3)' }}><span>{netError} {board ? 'Zobrazujeme poslední načtená data.' : ''}</span><button type="button" className="btn btn-secondary" onClick={() => void load()}>Zkusit znovu</button></div>}
      {key && (st === 'unavailable' || st === 'error') && <div className="notice" style={{ marginTop: 'var(--s3)' }}><span>{board?.meta.message}</span></div>}
      {board?.data.notices.map((n, i) => <div key={i} className="notice notice-warn" style={{ marginTop: 'var(--s3)' }}><span>{n}</span></div>)}

      {key && !board && !netError && <div style={{ marginTop: 'var(--s4)' }}><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>}
      {key && board && (st === 'live' || st === 'stale' || st === 'demo') && deps.length === 0 && <div className="empty"><strong>Žádné odjezdy</strong>V nejbližších dvou hodinách odsud nic nejede.</div>}
      {deps.length > 0 && (
        <ul className="list" aria-label={`Odjezdy ze zastávky ${group?.name ?? ''}`} style={{ marginTop: 'var(--s3)' }}>
          {deps.map((d) => {
            const t = Date.parse(d.predictedAt ?? d.scheduledAt ?? '');
            const sched = d.scheduledAt ? Date.parse(d.scheduledAt) : null;
            const mins = Number.isFinite(t) ? minutesUntil(t, now) : null;
            return (
              <li key={d.id} className={`row${d.isCanceled ? ' canceled' : ''}`}>
                <LineBadge line={d.route.shortName} mode={d.route.mode} />
                <span className="row-main">
                  <span className="row-title">{d.headsign}</span>
                  <span className="row-sub">{d.platform ? `Nástupiště ${d.platform}` : 'Nástupiště neuvedeno'}{d.wheelchair && <> · <IconWheelchair size={13} /><span className="sr-only">bezbariérový spoj</span></>}{d.isCanceled ? ' · ZRUŠENO' : ''}</span>
                </span>
                <span className="row-side">
                  <span className="mins">{d.isCanceled ? '—' : mins === null ? '?' : mins === 0 ? (d.isAtStop ? 'v zastávce' : '<1') : mins}{!d.isCanceled && mins !== null && mins > 0 && <small>min</small>}</span>
                  <span className="clock">{sched ? formatClock(sched) : ''}{d.predictedAt && sched && Math.abs(Date.parse(d.predictedAt) - sched) >= 60_000 ? ` → ${formatClock(Date.parse(d.predictedAt))}` : ''}</span>
                  <DelayLabel delay={d.delay} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {board && <p className="footer-note">Zdroj: {board.meta.attribution}. „Bez údaje“ znamená, že zdroj zpoždění neuvádí – nejde o jízdu včas.</p>}
    </>
  );
}
