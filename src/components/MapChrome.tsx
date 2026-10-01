'use client';
import { useEffect, useState } from 'react';
import { appStore, mapApi } from '@/lib/app-state';
import { useStore } from '@/lib/store';
import { settingsStore } from '@/lib/settings';
import { MODES, type Mode } from '@/domain/model';
import { MODE_COLOR } from '@/domain/modes';
import { modesName, useT } from '@/i18n';
import { IconCompass, IconLayers, IconList, IconLocate, IconMinus, IconPlus } from './icons';
import VehicleList from './VehicleList';

const CHIP_MODES: Mode[] = ['tram', 'metro', 'bus', 'train', 'trolleybus', 'ferry'];

export default function MapChrome({ mobile }: { mobile: boolean }) {
  const t = useT();
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
  const msg = locate === 'denied' ? t('toast_locDenied') : locate === 'unavailable' ? t('toast_locUnavailable') : basemap === 'fallback' ? t('toast_basemap') : null;
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const timer = setTimeout(() => setDismissed(msg), 6000);
    return () => clearTimeout(timer);
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
      <div className="map-top" role="toolbar" aria-label={t('filters')}>
        <button type="button" className="chip" aria-pressed={all} onClick={() => appStore.set({ modes: [...MODES] })}>{t('all')}</button>
        {CHIP_MODES.map((m) => (
          <button key={m} type="button" className="chip" aria-pressed={!all && modes.includes(m)} onClick={() => toggleMode(m)}>
            <span className="dot" style={{ background: MODE_COLOR[m] }} aria-hidden />{modesName(t, m)}
          </button>
        ))}
        {feedMeta?.status === 'demo' && <span className="pill pill-demo">{t('demoBanner')}</span>}
        {feedMeta?.status === 'unavailable' && <span className="pill pill-off" title={feedMeta.message}>{t('liveMissing')}</span>}
      </div>

      <div className="controls" aria-label={t('controls')}>
        <div className="ctrl-group ctrl-zoom">
          <button type="button" className="ctrl" onClick={() => mapApi.controller?.zoomBy(1)} disabled={!ready} aria-label={t('zoomIn')}><IconPlus /></button>
          <button type="button" className="ctrl" onClick={() => mapApi.controller?.zoomBy(-1)} disabled={!ready} aria-label={t('zoomOut')}><IconMinus /></button>
        </div>
        <div className="ctrl-group">
          <button type="button" className="ctrl" onClick={() => mapApi.controller?.resetNorth()} disabled={!ready} aria-label={t('northNow', { b: bearing })} title={t('north')}>
            <span style={{ display: 'grid', transform: `rotate(${-bearing}deg)` }}><IconCompass /></span>
          </button>
          <button type="button" className="ctrl ctrl-text" onClick={() => mapApi.controller?.setPitched(!pitched)} disabled={!ready} aria-pressed={pitched} aria-label={pitched ? t('to2d') : t('to3d')}>{pitched ? '2D' : '3D'}</button>
          <button type="button" className="ctrl" onClick={() => mapApi.controller?.locate()} disabled={!ready || locate === 'locating'} aria-label={t('myLocation')} aria-busy={locate === 'locating'}><IconLocate /></button>
        </div>
        <div className="ctrl-group">
          <button type="button" className="ctrl" onClick={() => setLayersOpen((o) => !o)} aria-expanded={layersOpen} aria-controls="layers-menu" aria-label={t('layers')}><IconLayers /></button>
          <button type="button" className="ctrl" onClick={() => appStore.set({ listOpen: !listOpen })} aria-pressed={listOpen} aria-label={t('vehicleList')}><IconList /></button>
        </div>
        {layersOpen && (
          <div id="layers-menu" className="card" style={{ position: 'absolute', right: 56, top: mobile ? 'auto' : 160, bottom: mobile ? 0 : 'auto', width: 250 }}>
            <div className="switch-row"><span>{t('layer_stops')}</span><label className="switch"><input type="checkbox" checked={showStops} onChange={(e) => settingsStore.set({ showStops: e.target.checked })} aria-label={t('layer_stopsAria')} /><span /></label></div>
            <div className="switch-row"><span>{t('layer_buildings')}</span><label className="switch"><input type="checkbox" checked={buildings} onChange={(e) => settingsStore.set({ buildings3d: e.target.checked })} aria-label={t('layer_buildingsAria')} /><span /></label></div>
            <p className="hint" style={{ marginBottom: 0 }}>{t('layersHint', { z: zoom.toFixed(1) })}</p>
          </div>
        )}
      </div>

      {listOpen && <VehicleList />}
      {failed && (
        <div className="map-fallback" role="alert">
          <div className="card" style={{ maxWidth: 420 }}>
            <strong>{t('mapFailedTitle')}</strong>
            <p className="hint">{t('mapFailedText')}</p>
            <button type="button" className="btn btn-secondary" onClick={() => appStore.set({ listOpen: true })}>{t('showVehicleList')}</button>
          </div>
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
