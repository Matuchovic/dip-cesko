'use client';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { favId, favoritesStore, toggleFavorite } from '@/lib/favorites';
import { modeName, useT } from '@/i18n';
import { LineBadge } from '../ui';
import { IconClose } from '../icons';

export default function FavoritesPanel() {
  const t = useT();
  const items = useStore(favoritesStore, (s) => s.items);
  const stops = items.filter((f) => f.kind === 'stop');
  const lines = items.filter((f) => f.kind === 'line');
  return (
    <>
      <h1>{t('fav_title')}</h1>
      <p className="hint">{t('fav_intro')}</p>
      <h2>{t('fav_stops')}</h2>
      {stops.length === 0 ? <div className="empty"><strong>{t('fav_noStops')}</strong>{t('fav_noStopsText')}</div> : (
        <ul className="list">{stops.map((f) => f.kind === 'stop' && (
          <li key={favId(f)} className="row">
            <LineBadge line={modeName(t, f.modes[0] ?? 'other').slice(0, 1)} mode={f.modes[0] ?? 'other'} />
            <Link href={`/odjezdy?zastavka=${encodeURIComponent(f.key)}`} className="row-main" style={{ textDecoration: 'none', color: 'inherit' }}><span className="row-title">{f.name}</span><span className="row-sub">{t('fav_showDepartures')}</span></Link>
            <button type="button" className="icon-btn" aria-label={t('fav_remove', { n: f.name })} onClick={() => toggleFavorite(f)}><IconClose size={18} /></button>
          </li>))}
        </ul>
      )}
      <h2>{t('fav_lines')}</h2>
      {lines.length === 0 ? <div className="empty"><strong>{t('fav_noLines')}</strong>{t('fav_noLinesText')}</div> : (
        <ul className="list">{lines.map((f) => f.kind === 'line' && (
          <li key={favId(f)} className="row">
            <LineBadge line={f.line} mode={f.mode} />
            <span className="row-main"><span className="row-title">{modeName(t, f.mode)} {f.line}</span><span className="row-sub">{f.headsign ? t('fav_lastHeadsign', { h: f.headsign }) : ''}</span></span>
            <button type="button" className="icon-btn" aria-label={t('fav_removeLine', { l: f.line })} onClick={() => toggleFavorite(f)}><IconClose size={18} /></button>
          </li>))}
        </ul>
      )}
      <h2>{t('fav_places')}</h2>
      <div className="empty"><strong>{t('fav_soon')}</strong>{t('fav_placesText')}</div>
    </>
  );
}
