'use client';
import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { depKey, hydrateWatches, unwatch, watchDeparture, watchesStore, type WatchError } from '@/lib/push';
import type { Departure } from '@/domain/model';
import { useI18n, useT } from '@/i18n';

const LEADS = [2, 5, 10] as const;
const BELL = 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0';

/** Zvonek u odjezdu: vybereš, kolik minut předem tě aplikace upozorní (i se zavřenou aplikací). */
export default function WatchButton({ stop, stopName, d }: { stop: string; stopName: string; d: Departure }) {
  const t = useT();
  const { locale } = useI18n();
  const key = depKey(stop, d);
  const active = useStore(watchesStore, (s) => s.items.find((w) => w.key === key) ?? null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => hydrateWatches(), []);

  const choose = async (lead: 2 | 5 | 10) => {
    setBusy(true); setMsg(null);
    const r = await watchDeparture(stop, stopName, d, lead, locale === 'en' ? 'en' : 'cs');
    setBusy(false); setOpen(false);
    setMsg(typeof r === 'string' ? t(`watch_${r as WatchError}` as never) : t('watch_on', { n: lead }));
    setTimeout(() => setMsg(null), 4500);
  };

  return (
    <span className="watch">
      <button type="button" className={`watch-btn${active ? ' on' : ''}${busy ? ' busy' : ''}`} aria-pressed={Boolean(active)} aria-expanded={open}
        aria-label={active ? t('watch_off') : t('watch_btn')}
        onClick={(e) => { e.stopPropagation(); if (active) { void unwatch(key); setMsg(t('watch_cancelled')); setTimeout(() => setMsg(null), 3000); } else setOpen((o) => !o); }}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path d={BELL} fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <span className="watch-pop" role="menu" aria-label={t('watch_pick')}>
          <span className="watch-pop-title">{t('watch_pick')}</span>
          {LEADS.map((n) => <button key={n} type="button" role="menuitem" disabled={busy} onClick={(e) => { e.stopPropagation(); void choose(n); }}>{t('watch_lead', { n })}</button>)}
        </span>
      )}
      {msg && <span className="watch-msg" role="status">{msg}</span>}
    </span>
  );
}
