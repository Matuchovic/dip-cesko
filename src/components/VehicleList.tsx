'use client';
import { useState } from 'react';
import { appStore, latestVehicles, mapApi } from '@/lib/app-state';
import { useStore } from '@/lib/store';
import type { PositionFreshness } from '@/domain/freshness';
import type { VehicleState } from '@/domain/model';
import { DelayLabel, LineBadge } from './ui';
import { IconClose } from './icons';

type Item = { v: VehicleState; freshness: PositionFreshness };
const collect = (): Item[] => (mapApi.controller ? mapApi.controller.vehiclesInView(80) : latestVehicles.list.slice(0, 80).map((v) => ({ v, freshness: 'unknown' as const })));

/** Textová alternativa k mapě: vozidla ve výřezu. Obnovuje se na vyžádání (bez neustálých hlášení čtečce). */
export default function VehicleList() {
  const received = useStore(appStore, (s) => s.feedReceivedAt);
  const [items, setItems] = useState<Item[]>(collect);
  return (
    <section className="vlist card" aria-labelledby="vl-title">
      <div className="detail-head" style={{ marginBottom: 'var(--s2)' }}>
        <h2 id="vl-title" style={{ margin: 0, flex: 1, fontSize: 'var(--fs-md)' }}>Vozidla ve výřezu ({items.length})</h2>
        <button type="button" className="btn btn-ghost" onClick={() => setItems(collect())} disabled={!received}>Obnovit</button>
        <button type="button" className="icon-btn" aria-label="Zavřít seznam" onClick={() => appStore.set({ listOpen: false })}><IconClose /></button>
      </div>
      {items.length === 0 ? <div className="empty"><strong>Žádná vozidla</strong>Ve výřezu mapy nejsou žádná vozidla s aktuální polohou.</div> : (
        <ul className="list">
          {items.map(({ v, freshness }) => (
            <li key={v.id}>
              <button type="button" className="row" onClick={() => { mapApi.controller?.select(v.id, { fly: true, follow: true }); appStore.set({ listOpen: false }); }}>
                <LineBadge line={v.route.shortName} mode={v.route.mode} stale={freshness !== 'live'} />
                <span className="row-main"><span className="row-title">{v.headsign ? `směr ${v.headsign}` : '—'}</span><span className="row-sub">{freshness === 'live' ? 'aktuální poloha' : 'poloha není aktuální'}</span></span>
                <span className="row-side"><DelayLabel delay={v.delay} /></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
