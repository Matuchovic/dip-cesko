'use client';
import { useState } from 'react';
import { appStore } from '@/lib/app-state';
import { useStore } from '@/lib/store';
import { getJson, useVisibleInterval } from '@/lib/hooks';
import { formatAge } from '@/domain/time';

interface Status { mode: 'demo' | 'live'; sources: { id: string; name: string; configured: boolean; lastSuccessAgeS: number | null }[]; time: string }

export default function StatusPanel() {
  const [s, setS] = useState<Status | null>(null);
  const [err, setErr] = useState(false);
  const basemap = useStore(appStore, (x) => x.basemap);
  const feed = useStore(appStore, (x) => x.feedMeta);
  const feedError = useStore(appStore, (x) => x.feedError);
  useVisibleInterval(() => { void getJson<Status>('/api/status').then((r) => { setS(r.body); setErr(!r.ok); }); }, 30_000, []);
  return (
    <>
      <h1>Stav dat</h1>
      {err && <div className="notice notice-error" role="alert"><span>Stav serveru se nepodařilo načíst.</span></div>}
      {s?.mode === 'demo' && <div className="notice notice-demo"><span>Server běží v ukázkovém režimu.</span></div>}
      <ul className="list">
        {s?.sources.map((src) => (
          <li key={src.id} className="row">
            <span className="row-main"><span className="row-title">{src.name}</span><span className="row-sub">{!src.configured ? 'Nepřipojeno' : src.lastSuccessAgeS === null ? 'Připojeno · zatím bez načtení na tomto serveru' : `Poslední úspěšné načtení ${formatAge(src.lastSuccessAgeS)}`}</span></span>
            <span className={`pill ${src.configured ? 'pill-live' : 'pill-off'}`}>{src.configured ? 'aktivní' : 'neaktivní'}</span>
          </li>
        ))}
        <li className="row"><span className="row-main"><span className="row-title">Mapový podklad (v tomto prohlížeči)</span><span className="row-sub">{basemap === 'ok' ? 'Načten' : basemap === 'fallback' ? 'Nedostupný – zjednodušená mapa' : 'Načítání…'}</span></span></li>
        <li className="row"><span className="row-main"><span className="row-title">Polohy vozidel (v tomto prohlížeči)</span><span className="row-sub">{feedError ?? feed?.message ?? (feed ? `Stav: ${feed.status}` : 'Načítání…')}</span></span></li>
      </ul>
      <p className="footer-note">Podrobná diagnostika je dostupná jen správcům (chráněný endpoint).</p>
    </>
  );
}
