'use client';
import { useEffect, useState } from 'react';
import { appStore, mapApi } from '@/lib/app-state';
import { useStore } from '@/lib/store';
import { settingsStore } from '@/lib/settings';
import { MODES, type Mode } from '@/domain/model';
import { MODE_COLOR, MODE_LABEL_PLURAL } from '@/domain/modes';
import { IconCompass, IconLayers, IconList, IconLocate, IconMinus, IconPlus } from './icons';
import VehicleList from './VehicleList';

const CHIP_MODES: Mode[] = ['tram', 'metro', 'bus', 'train', 'trolleybus', 'ferry'];

export default function MapChrome({ mobile }: { mobile: boolean }) {
  const ready = useStore(appStore, (s) => s.mapReady);
  const failed = useStore(appStore, (s) => s.mapFailed);
  const basemap = useStore(appStore, (s) => s.basemap);
  const bearing = useStore(appStore, (s) => s.bearing);
  const pitched = useStore(appStore, (s) => s.pitched);
  const modes = useStore(appStore, (s) => s.modes);
  const locate = useStore(appStore, (s) => s.locate);
  const listOpen = useStore(appStore, (s) => s.listOpen);
  const feedMeta = useStore(appStore, (s) => s.feedMeta);
  const zoom = useStore(appStore, (s) => s.zoom);
  const showStops = useStore(settingsStore, (s) => s.showStops);
  const buildings = useStore(settingsStore, (s) => s.buildings3d);
  const [layersOpen, setLayersOpen] = useState(false);
  const msg = locate === 'denied' ? 'Přístup k poloze byl zamítnut. Povolte ho v nastavení prohlížeče.' : locate === 'unavailable' ? 'Polohu se nepodařilo zjistit.' : basemap === 'fallback' ? 'Mapový podklad není dostupný – zobrazena zjednodušená mapa.' : null;
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setDismissed(msg), 6000);
    return () => clearTimeout(t);
  }, [msg]);
  const toast = msg && dismissed !== msg ? msg : null;

  const all = modes.length === MODES.length;
  const toggleMode = (m: Mode) => {
    const cur = new Set(modes);
    if (all) { appStore.set({ modes: [m] }); return; }
    if (cur.has(m)) cur.delete(m); else cur.add(m);
    appStore.set({ modes: cur.size ? [...cur] : [...MODES] });
  };

  return (
    <>
      <div className="map-top" role="toolbar" aria-label="Filtry dopravy">
        <button type="button" className="chip" aria-pressed={all} onClick={() => appStore.set({ modes: [...MODES] })}>Vše</button>
        {CHIP_MODES.map((m) => (
          <button key={m} type="button" className="chip" aria-pressed={!all && modes.includes(m)} onClick={() => toggleMode(m)}>
            <span className="dot" style={{ background: MODE_COLOR[m] }} aria-hidden />{MODE_LABEL_PLURAL[m]}
          </button>
        ))}
        {feedMeta?.status === 'demo' && <span className="pill pill-demo">Ukázková data – nejde o skutečný provoz</span>}
        {feedMeta?.status === 'unavailable' && <span className="pill pill-off" title={feedMeta.message}>Živé polohy nejsou připojené</span>}
      </div>

      <div className="controls" aria-label="Ovládání mapy">
        <div className="ctrl-group ctrl-zoom">
          <button type="button" className="ctrl" onClick={() => mapApi.controller?.zoomBy(1)} disabled={!ready} aria-label="Přiblížit"><IconPlus /></button>
          <button type="button" className="ctrl" onClick={() => mapApi.controller?.zoomBy(-1)} disabled={!ready} aria-label="Oddálit"><IconMinus /></button>
        </div>
        <div className="ctrl-group">
          <button type="button" className="ctrl" onClick={() => mapApi.controller?.resetNorth()} disabled={!ready} aria-label={`Natočit na sever (aktuálně ${bearing}°)`} title="Natočit na sever">
            <span style={{ display: 'grid', transform: `rotate(${-bearing}deg)` }}><IconCompass /></span>
          </button>
          <button type="button" className="ctrl ctrl-text" onClick={() => mapApi.controller?.setPitched(!pitched)} disabled={!ready} aria-pressed={pitched} aria-label={pitched ? 'Přepnout na 2D pohled' : 'Přepnout na 3D pohled'}>{pitched ? '2D' : '3D'}</button>
          <button type="button" className="ctrl" onClick={() => mapApi.controller?.locate()} disabled={!ready || locate === 'locating'} aria-label="Moje poloha" aria-busy={locate === 'locating'}><IconLocate /></button>
        </div>
        <div className="ctrl-group">
          <button type="button" className="ctrl" onClick={() => setLayersOpen((o) => !o)} aria-expanded={layersOpen} aria-controls="layers-menu" aria-label="Vrstvy mapy"><IconLayers /></button>
          <button type="button" className="ctrl" onClick={() => appStore.set({ listOpen: !listOpen })} aria-pressed={listOpen} aria-label="Seznam vozidel ve výřezu"><IconList /></button>
        </div>
        {layersOpen && (
          <div id="layers-menu" className="card" style={{ position: 'absolute', right: 56, top: mobile ? 'auto' : 160, bottom: mobile ? 0 : 'auto', width: 250 }}>
            <div className="switch-row"><span>Zastávky</span><label className="switch"><input type="checkbox" checked={showStops} onChange={(e) => settingsStore.set({ showStops: e.target.checked })} aria-label="Zobrazit zastávky" /><span /></label></div>
            <div className="switch-row"><span>3D budovy</span><label className="switch"><input type="checkbox" checked={buildings} onChange={(e) => settingsStore.set({ buildings3d: e.target.checked })} aria-label="Zobrazit 3D budovy" /><span /></label></div>
            <p className="hint" style={{ marginBottom: 0 }}>Vozidla se jako obrázky zobrazují od přiblížení 15,5 (nyní {zoom.toFixed(1)}).</p>
          </div>
        )}
      </div>

      {listOpen && <VehicleList />}
      {failed && (
        <div className="map-fallback" role="alert">
          <div className="card" style={{ maxWidth: 420 }}>
            <strong>Mapu nelze v tomto zařízení vykreslit.</strong>
            <p className="hint">Prohlížeč nepodporuje WebGL nebo bylo vykreslování zakázáno. Odjezdy, spojení a seznam vozidel fungují i bez mapy.</p>
            <button type="button" className="btn btn-secondary" onClick={() => appStore.set({ listOpen: true })}>Zobrazit seznam vozidel</button>
          </div>
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
