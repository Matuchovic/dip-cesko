'use client';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { appStore } from '@/lib/app-state';
import { useStore } from '@/lib/store';
import { getJson, useNow, useVisibleInterval } from '@/lib/hooks';
import { favoritesStore, isFavorite, toggleFavorite } from '@/lib/favorites';
import type { DepartureBoard, Envelope } from '@/domain/model';
import { groupDepartures, MODE_RANK } from '@/domain/departures';
import { useT } from '@/i18n';
import type { MessageKey } from '@/i18n/messages';
import { LineBadge } from './ui';
import { DepartureGroups } from './Departures';
import { IconClose, IconStar } from './icons';

/** Detail zastávky na mapě: linky a nejbližší odjezdy z tohoto nástupiště (obnova po 20 s). */
export default function StopCard() {
  const t = useT();
  const p = useStore(appStore, (s) => s.stop);
  const favs = useStore(favoritesStore, (s) => s.items);
  const now = useNow(15_000);
  const key = p?.groupKey ?? null;
  const [data, setData] = useState<{ key: string; env: Envelope<DepartureBoard> | null } | null>(null);
  const load = useCallback(async () => {
    if (!key) return;
    const r = await getJson<Envelope<DepartureBoard>>(`/api/departures?stop=${encodeURIComponent(key)}&limit=50`);
    setData({ key, env: r.body });
  }, [key]);
  useVisibleInterval(() => void load(), 20_000, [key]);
  if (!p) return null;

  const fav = isFavorite(favs, 'stop', p.groupKey);
  const lines = [...new Map(p.lines.map((l) => [`${l.mode}:${l.name}`, l])).values()]
    .sort((a, b) => MODE_RANK[a.mode] - MODE_RANK[b.mode] || a.name.localeCompare(b.name, 'cs', { numeric: true })).slice(0, 18);
  const env = data?.key === key ? data.env : undefined;
  const all = env?.data?.departures ?? [];
  const own = all.filter((d) => d.platform && d.platform === p.platform);
  const groups = groupDepartures(own.length ? own : all, 3).slice(0, 8);
  const failed = env === null || env?.meta.status === 'unavailable' || env?.meta.status === 'error';
  const reason = env?.meta.reason ? t(`reason_${env.meta.reason}` as MessageKey) : t('dep_netError');

  return (
    <article aria-labelledby="sc-title">
      <div className="detail-head">
        <div style={{ flex: 1 }}>
          <div id="sc-title" className="detail-title">{p.name}</div>
          <div className="detail-sub">{t('platform', { p: p.platform ?? '—' })}</div>
        </div>
        <button type="button" className="icon-btn" aria-pressed={fav} aria-label={fav ? t('sc_removeFav') : t('sc_saveStop')} onClick={() => toggleFavorite({ kind: 'stop', key: p.groupKey, name: p.name, modes: p.modes, savedAt: new Date().toISOString() })}><IconStar filled={fav} /></button>
        <button type="button" className="icon-btn" aria-label={t('sc_close')} onClick={() => appStore.set({ stop: null })}><IconClose /></button>
      </div>
      {lines.length > 0 && <div className="legs" aria-label={t('sc_lines')}>{lines.map((l) => <LineBadge key={`${l.mode}${l.name}`} line={l.name} mode={l.mode} />)}</div>}
      <h2 className="section-label">{t('sc_next')}</h2>
      {env === undefined ? <><div className="skeleton" /><div className="skeleton" /></>
        : failed ? <p className="hint">{reason}</p>
        : groups.length === 0 ? <p className="hint">{t('sc_none')}</p>
        : <DepartureGroups groups={groups} now={now} label={t('dep_listAria', { n: p.name })} />}
      <div className="actions"><Link className="btn btn-primary" href={`/odjezdy?zastavka=${encodeURIComponent(p.groupKey)}`}>{t('sc_showDepartures')}</Link></div>
    </article>
  );
}
