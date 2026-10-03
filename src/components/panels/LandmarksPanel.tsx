'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n, useT } from '@/i18n';
import { mapApi } from '@/lib/app-state';
import { MODE_COLOR } from '@/domain/modes';
import { METRO_COLOR } from '@/domain/metro';
import type { Mode } from '@/domain/model';
import type { LandmarkKind } from '@/domain/landmarks';
import TLink from '../TLink';
import E3, { type E3Name } from '../icons/E3';

interface LStop { name: string; key: string; mode: Mode; walkMin: number; lines: string[] }
interface Item { id: string; name: string; kind: LandmarkKind; area: string | null; lat: number; lon: number; desc: string | null; top: boolean; distM?: number; stops?: LStop[] }
type Tab = 'top' | 'near' | 'all';
const KIND_ICON: Record<LandmarkKind, E3Name> = { castle: 'castle', church: 'church', bridge: 'bridge', square: 'landmark', museum: 'gallery', palace: 'palace', tower: 'tower', park: 'park', synagogue: 'synagogue', monument: 'monument', theatre: 'theatre', cemetery: 'candle', other: 'pin' };
const MODE_ICON: Partial<Record<Mode, E3Name>> = { metro: 'metro', tram: 'tram', bus: 'bus', train: 'train', trolleybus: 'trolley', funicular: 'cable', ferry: 'ferry' };
const PAGE = 30;

const badge = (mode: Mode, line: string) => {
  const metro = mode === 'metro' ? METRO_COLOR[line.toUpperCase() as 'A' | 'B' | 'C'] : undefined;
  return { background: metro ?? MODE_COLOR[mode], color: metro && line.toUpperCase() === 'B' ? '#2B2100' : '#fff' };
};

/** Památky Prahy: nejznámější / v okolí / všechny kulturní památky – u každé nejbližší metro, tramvaj a autobus. */
export default function LandmarksPanel() {
  const t = useT();
  const { locale } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('top');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const pos = useRef<{ lat: number; lon: number } | null>(null);

  const load = async (append: boolean) => {
    setLoading(true); setNote(null);
    const sp = new URLSearchParams({ set: tab === 'top' ? 'top' : 'all', q, offset: String(append ? items.length : 0), limit: String(PAGE), lang: locale === 'en' ? 'en' : 'cs' });
    if (tab === 'near' && pos.current) { sp.set('lat', pos.current.lat.toFixed(5)); sp.set('lon', pos.current.lon.toFixed(5)); }
    try {
      const r = await fetch(`/api/landmarks?${sp}`);
      const j = (await r.json()) as { items: Item[]; total: number; complete: boolean };
      setItems((prev) => (append ? [...prev, ...j.items] : j.items)); setTotal(j.total);
      if (tab !== 'top' && !j.complete) setNote(t('lm_partial'));
    } catch { setNote(t('lm_error')); }
    setLoading(false);
  };

  // načtení při změně záložky nebo hledání (s krátkou prodlevou při psaní)
  useEffect(() => {
    if (tab === 'near' && !pos.current) {
      if (!navigator.geolocation) return; // hláška se odvodí při vykreslení (noGeo)
      navigator.geolocation.getCurrentPosition((p) => { pos.current = { lat: p.coords.latitude, lon: p.coords.longitude }; void load(false); }, () => setNote(t('lm_noGeo')), { timeout: 15_000, maximumAge: 60_000 });
      return;
    }
    const id = setTimeout(() => void load(false), q ? 250 : 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, q, locale]);

  const noGeo = tab === 'near' && typeof navigator !== 'undefined' && !navigator.geolocation;
  const showOnMap = (it: Item) => { mapApi.controller?.flyTo(it.lon, it.lat, 17); router.push('/'); };

  return (
    <section className="lm" aria-labelledby="lm-title">
      <h1 id="lm-title">{t('nav_landmarks')}</h1>
      <p className="lm-sub">{t('lm_sub')}</p>
      <div className="field lm-search">
        <label htmlFor="lm-q" className="sr-only">{t('lm_search')}</label>
        <input id="lm-q" className="input" type="search" value={q} placeholder={t('lm_search')} autoComplete="off" onChange={(e) => setQ(e.target.value)} />
        {q && <button type="button" className="search-clear" aria-label={t('close')} onClick={() => setQ('')}>×</button>}
      </div>
      <div className="lm-tabs" role="tablist" aria-label={t('nav_landmarks')}>
        {(['top', 'near', 'all'] as Tab[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`chip${tab === k ? ' on' : ''}`} onClick={() => { setTab(k); setOpen(null); }}>{t(`lm_tab_${k}` as never)}</button>
        ))}
      </div>
      <p className="lm-count" aria-live="polite">{loading && !items.length ? t('loading') : t('lm_count', { n: total })}</p>
      {(note || noGeo) && <p className="hint">{note ?? t('lm_noGeo')}</p>}
      <ul className="lm-list">
        {items.map((it) => (
          <li key={it.id} className={`lm-card${open === it.id ? ' open' : ''}`}>
            <button type="button" className="lm-head" aria-expanded={open === it.id} onClick={() => setOpen(open === it.id ? null : it.id)}>
              <span className="lm-ico" aria-hidden><E3 name={KIND_ICON[it.kind]} size={40} motion="hover" /></span>
              <span className="lm-names"><span className="lm-name">{it.name}</span>
                <span className="lm-meta">{[t(`lm_kind_${it.kind}` as never), it.area, it.distM !== undefined ? t('lm_dist', { n: it.distM < 1000 ? `${it.distM} m` : `${(it.distM / 1000).toFixed(1)} km` }) : null].filter(Boolean).join(' · ')}</span></span>
            </button>
            {it.stops && it.stops.length > 0 ? (
              <ul className="lm-stops" aria-label={t('lm_howTo')}>
                {it.stops.map((s) => (
                  <li key={`${s.key}-${s.mode}`}>
                    <span className="lm-mode" aria-hidden><E3 name={MODE_ICON[s.mode] ?? 'stop'} size={20} /></span>
                    <span className="lm-stop"><TLink href={`/odjezdy?zastavka=${encodeURIComponent(s.key)}`}>{s.name}</TLink><span className="lm-walk"> · {t('walkMin', { n: s.walkMin })}</span></span>
                    <span className="lm-lines">{s.lines.slice(0, 6).map((l) => <span key={l} className="lm-line" style={badge(s.mode, l)}>{l}</span>)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="lm-nostop">{t('lm_noStop')}</p>}
            {open === it.id && it.desc && <p className="lm-desc">{it.desc}</p>}
            <div className="lm-actions">
              <button type="button" className="btn btn-secondary" onClick={() => showOnMap(it)}>{t('lm_onMap')}</button>
              <TLink className="btn btn-primary" href={`/spojeni?toLat=${it.lat.toFixed(5)}&toLon=${it.lon.toFixed(5)}&toName=${encodeURIComponent(it.name.slice(0, 120))}`}>{t('lm_route')}</TLink>
            </div>
          </li>
        ))}
      </ul>
      {items.length < total && <button type="button" className="btn btn-secondary lm-more" disabled={loading} onClick={() => void load(true)}>{loading ? t('loading') : t('lm_more', { n: Math.min(PAGE, total - items.length) })}</button>}
      <p className="lm-foot">{t('lm_source')} · <TLink href="/jizdenky">{t('nav_tickets')}</TLink></p>
    </section>
  );
}
