'use client';
import { appStore, mapApi } from '@/lib/app-state';
import { useStore } from '@/lib/store';

/** Testovací panel (jen v ukázkovém režimu): ověření natočení PNG při různém natočení mapy. */
export default function RotationHarness() {
  const bearing = useStore(appStore, (s) => s.bearing);
  const ready = useStore(appStore, (s) => s.mapReady);
  const go = (b: number) => { const c = mapApi.controller; if (!c) return; c.map.jumpTo({ center: [14.38, 50.06], zoom: 17.2, bearing: b, pitch: 0 }); };
  return (
    <>
      <h1>Test natočení vozidel</h1>
      <div className="actions"><button type="button" className="btn btn-primary" disabled={!ready} onClick={() => mapApi.controller?.map.jumpTo({ center: [14.38, 50.06], zoom: 17.5, bearing: -25, pitch: 62 })}>Prostorový pohled</button></div>
      <p className="hint">Horní řada: tramvaje S, V, J, Z (0°, 90°, 180°, 270°). Dolní řada: vlaky. Nahoře uprostřed: přechod 359° ↔ 1° každé 4 s. Čelo vozidla musí vždy mířit ve směru jízdy bez ohledu na natočení mapy.</p>
      <div className="legs" role="group" aria-label="Natočení mapy">
        {[0, 45, 90, 180, 270, 315].map((b) => <button key={b} type="button" className="chip" disabled={!ready} aria-pressed={bearing === b} onClick={() => go(b)}>Mapa {b}°</button>)}
      </div>
      <p className="hint" data-testid="bearing">Aktuální natočení mapy: {bearing}°</p>
    </>
  );
}
