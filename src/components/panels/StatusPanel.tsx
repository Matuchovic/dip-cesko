'use client';
import { useState } from 'react';
import { appStore, mapApi } from '@/lib/app-state';
import { useStore } from '@/lib/store';
import { getJson, useVisibleInterval } from '@/lib/hooks';
import { modesName, useT } from '@/i18n';
import type { Mode } from '@/domain/model';
import { MESSAGES, type MessageKey } from '@/i18n/messages';

interface Status { mode: 'demo' | 'live'; vehiclesByMode?: Record<string, number>; sources: { id: string; name: string; configured: boolean; lastSuccessAgeS: number | null }[]; time: string }

export default function StatusPanel() {
  const t = useT();
  const [s, setS] = useState<Status | null>(null);
  const [err, setErr] = useState(false);
  const basemap = useStore(appStore, (x) => x.basemap);
  const feed = useStore(appStore, (x) => x.feedMeta);
  const feedError = useStore(appStore, (x) => x.feedError);
  useVisibleInterval(() => { void getJson<Status>('/api/status').then((r) => { setS(r.body); setErr(!r.ok); }); }, 30_000, []);
  const srcName = (id: string, fallback: string) => { const k = `src_${id}`; return k in MESSAGES.cs ? t(k as MessageKey) : fallback; };
  const tracks = mapApi.controller?.trackStats() ?? null;
  const mine = Object.entries(mapApi.controller?.countsByMode() ?? {}) as [Mode, number][];
  return (
    <>
      <h1>{t('st_title')}</h1>
      {err && <div className="notice notice-error" role="alert"><span>{t('st_error')}</span></div>}
      {s?.mode === 'demo' && <div className="notice notice-demo"><span>{t('st_demo')}</span></div>}
      <ul className="list">
        {s?.sources.map((src) => (
          <li key={src.id} className="row">
            <span className="row-main"><span className="row-title">{srcName(src.id, src.name)}</span><span className="row-sub">{!src.configured ? t('st_notConnected') : src.lastSuccessAgeS === null ? t('st_connectedNoLoad') : t('st_lastOk', { age: t('ago', { s: src.lastSuccessAgeS }) })}</span></span>
            <span className={`pill ${src.configured ? 'pill-live' : 'pill-off'}`}>{src.configured ? t('st_active') : t('st_inactive')}</span>
          </li>
        ))}
        <li className="row"><span className="row-main"><span className="row-title">{t('st_basemapBrowser')}</span><span className="row-sub">{basemap === 'ok' ? t('st_loaded') : basemap === 'fallback' ? t('st_fallback') : t('loading')}</span></span></li>
        <li className="row"><span className="row-main"><span className="row-title">{t('st_vehiclesBrowser')}</span><span className="row-sub">{feedError ?? (feed?.reason ? t(`reason_${feed.reason}` as MessageKey) : feed ? t('st_state', { s: feed.status }) : t('loading'))}{tracks && tracks.all > 0 ? ` · ${t('st_tracks', { on: tracks.on, all: tracks.all })}` : ''}</span></span></li>
      </ul>
      {s?.vehiclesByMode && Object.keys(s.vehiclesByMode).length > 0 && <p className="hint">{t('st_modes', { list: Object.entries(s.vehiclesByMode).sort((x, y) => y[1] - x[1]).map(([m, n]) => `${modesName(t, m as Mode)} ${n}`).join(' · ') })}</p>}
      {mine.length > 0 && <p className="hint">{t('st_modesClient', { list: mine.sort((x, y) => y[1] - x[1]).map(([m, n]) => `${modesName(t, m)} ${n}`).join(' · ') })}</p>}
      <p className="footer-note">{t('st_footer')}</p>
    </>
  );
}
