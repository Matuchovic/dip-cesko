'use client';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { favId, favoritesStore, toggleFavorite } from '@/lib/favorites';
import { MODE_LABEL } from '@/domain/modes';
import { LineBadge } from '../ui';
import { IconClose } from '../icons';

export default function FavoritesPanel() {
  const items = useStore(favoritesStore, (s) => s.items);
  const stops = items.filter((f) => f.kind === 'stop');
  const lines = items.filter((f) => f.kind === 'line');
  return (
    <>
      <h1>Oblíbené</h1>
      <p className="hint">Ukládá se jen v tomto zařízení – bez registrace. Synchronizace mezi zařízeními by vyžadovala účet (zatím není implementován).</p>
      <h2>Zastávky</h2>
      {stops.length === 0 ? <div className="empty"><strong>Zatím žádné zastávky</strong>Uložte si zastávku hvězdičkou v odjezdech nebo na mapě.</div> : (
        <ul className="list">{stops.map((f) => f.kind === 'stop' && (
          <li key={favId(f)} className="row">
            <LineBadge line={MODE_LABEL[f.modes[0] ?? 'other'].slice(0, 1)} mode={f.modes[0] ?? 'other'} />
            <Link href={`/odjezdy?zastavka=${encodeURIComponent(f.key)}`} className="row-main" style={{ textDecoration: 'none', color: 'inherit' }}><span className="row-title">{f.name}</span><span className="row-sub">Zobrazit odjezdy</span></Link>
            <button type="button" className="icon-btn" aria-label={`Odebrat ${f.name}`} onClick={() => toggleFavorite(f)}><IconClose size={18} /></button>
          </li>))}
        </ul>
      )}
      <h2>Linky</h2>
      {lines.length === 0 ? <div className="empty"><strong>Zatím žádné linky</strong>Linku uložíte v detailu vozidla na mapě.</div> : (
        <ul className="list">{lines.map((f) => f.kind === 'line' && (
          <li key={favId(f)} className="row">
            <LineBadge line={f.line} mode={f.mode} />
            <span className="row-main"><span className="row-title">{MODE_LABEL[f.mode]} {f.line}</span><span className="row-sub">{f.headsign ? `naposledy směr ${f.headsign}` : ''}</span></span>
            <button type="button" className="icon-btn" aria-label={`Odebrat linku ${f.line}`} onClick={() => toggleFavorite(f)}><IconClose size={18} /></button>
          </li>))}
        </ul>
      )}
      <h2>Častá místa</h2>
      <div className="empty"><strong>Připravujeme</strong>Uložení adres vyžaduje vyhledávání adres (geokodér), které zatím není připojeno.</div>
    </>
  );
}
