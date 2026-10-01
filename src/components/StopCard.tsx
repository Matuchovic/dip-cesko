'use client';
import Link from 'next/link';
import { appStore } from '@/lib/app-state';
import { useStore } from '@/lib/store';
import { favoritesStore, isFavorite, toggleFavorite } from '@/lib/favorites';
import { LineBadge } from './ui';
import { IconClose, IconStar } from './icons';

export default function StopCard() {
  const p = useStore(appStore, (s) => s.stop);
  const favs = useStore(favoritesStore, (s) => s.items);
  if (!p) return null;
  const fav = isFavorite(favs, 'stop', p.groupKey);
  const lines = [...new Map(p.lines.map((l) => [`${l.mode}:${l.name}`, l])).values()].slice(0, 16);
  return (
    <article aria-labelledby="sc-title">
      <div className="detail-head">
        <div style={{ flex: 1 }}>
          <div id="sc-title" className="detail-title">{p.name}</div>
          <div className="detail-sub">Nástupiště {p.platform ?? '—'}</div>
        </div>
        <button type="button" className="icon-btn" aria-pressed={fav} aria-label={fav ? 'Odebrat z oblíbených' : 'Uložit zastávku'} onClick={() => toggleFavorite({ kind: 'stop', key: p.groupKey, name: p.name, modes: p.modes, savedAt: new Date().toISOString() })}><IconStar filled={fav} /></button>
        <button type="button" className="icon-btn" aria-label="Zavřít detail zastávky" onClick={() => appStore.set({ stop: null })}><IconClose /></button>
      </div>
      {lines.length > 0 && <div className="legs" aria-label="Linky v zastávce">{lines.map((l) => <LineBadge key={`${l.mode}${l.name}`} line={l.name} mode={l.mode} />)}</div>}
      <div className="actions"><Link className="btn btn-primary" href={`/odjezdy?zastavka=${encodeURIComponent(p.groupKey)}`}>Zobrazit odjezdy</Link></div>
    </article>
  );
}
