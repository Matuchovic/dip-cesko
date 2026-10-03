'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const vehicleStyle = useStore(settingsStore, (s) => s.vehicleStyle);
  const [layersOpen, setLayersOpen] = useState(false);
  // menu vrstev zavře i klepnutí mimo něj a klávesa Esc (na úzkém displeji může zakrýt své tlačítko)
  useEffect(() => {
    if (!layersOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLayersOpen(false); };
    const onDown = (e: PointerEvent) => { const t = e.target as Element | null; if (t && !t.closest('#layers-menu, .ctrl-layers')) setLayersOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown, true); };
  }, [layersOpen]);
  const msg = locate === 'denied' ? t('toast_locDenied') : locate === 'unavailable' ? t('toast_locUnavailable') : basemap === 'fallback' ? t('toast_basemap') : null;
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const timer = setTimeout(() => setDismissed(msg), 6000);
    return () => clearTimeout(timer);
  }, [msg]);
  const toast = msg && dismissed !== msg ? msg : null;
  // Mobil: sloupec ovládání se vejde vždy mezi filtry nahoře a horní hranu panelu dole (nic se nepřekrývá);
  // když je místa málo, méně důležitá tlačítka se schovají (řeší CSS kontejnerové dotazy podle výšky).
  const ctrlRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // mobil i počítač: sloupec se vejde mezi horní lištu/filtry a to, co je pod ním (panel, pruh novinek, tlačítko Rodina)
    const el = ctrlRef.current;
    if (!el) return;
    let raf = 0, until = 0;
    const isShown = (x: Element) => { const cs = getComputedStyle(x); return cs.display !== 'none' && cs.visibility !== 'hidden' && x.getClientRects().length > 0; };
    const update = () => {
      until = performance.now() + 700; // ještě chvíli sledovat (panel se vysouvá animací)
      cancelAnimationFrame(raf);
      const frame = () => {
        const vh = window.innerHeight;
        const root = getComputedStyle(document.documentElement);
        const top = mobile ? (document.querySelector('.map-top')?.getBoundingClientRect().bottom ?? 120) : (parseFloat(root.getPropertyValue('--header-h')) || 64);
        const cr = el.getBoundingClientRect();
        const bottoms = (mobile ? ['.panel.sheet-host', '.panel.page-host', '.tabbar', '.ticker', 'a.fam-bar'] : ['.ticker', 'a.fam-bar'])
          .map((s) => document.querySelector(s)).filter((x): x is Element => Boolean(x) && isShown(x!))
          .map((x) => x.getBoundingClientRect())
          .filter((r) => mobile || (r.left < cr.right && r.right > cr.left)) // na počítači jen to, co je pod sloupcem
          .map((r) => r.top); // panel nad filtry = žádné místo → tlačítka se schovají
        const limit = bottoms.length ? Math.min(...bottoms) : vh - 80;
        el.style.setProperty('--ctrl-top', `${Math.round(top + 10)}px`);
        el.style.setProperty('--ctrl-bottom', `${Math.round(vh - limit + 12)}px`);
        if (performance.now() < until) raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    };
    update();
    const ro = new ResizeObserver(update);
    const watch = () => { ro.disconnect(); for (const s of ['.panel', '.tabbar', '.ticker', 'a.fam-bar', '.map-top']) document.querySelectorAll(s).forEach((n) => ro.observe(n)); };
    watch();
    const app = document.querySelector('.app');
    const mo = new MutationObserver(() => { watch(); update(); });
    if (app) mo.observe(app, { childList: true, attributes: true, attributeFilter: ['style'] });
    window.addEventListener('resize', update);
    document.addEventListener('transitionend', update, true);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect(); window.removeEventListener('resize', update); document.removeEventListener('transitionend', update, true); };
  }, [mobile]);

  const all = modes.length === MODES.length;
  const toggleMode = (m: Mode) => {
    const cur = new Set(modes);
    if (all) { appStore.set({ modes: [m] }); return; }
    if (cur.has(m)) cur.delete(m); else cur.add(m);
    appStore.set({ modes: cur.size ? [...cur] : [...MODES] });
  };

  const layersMenu = (
          <div id="layers-menu" className="card" role="dialog" aria-label={t('layers')} style={{ position: 'absolute', right: 56, top: mobile ? 'auto' : 0, bottom: mobile ? 0 : 'auto', width: 250 }}>
            <button type="button" className="layers-x" aria-label={t('close')} onClick={() => setLayersOpen(false)}>×</button>
            <div className="switch-row"><span>{t('layer_stops')}</span><label className="switch"><input type="checkbox" checked={showStops} onChange={(e) => settingsStore.set({ showStops: e.target.checked })} aria-label={t('layer_stopsAria')} /><span /></label></div>
            <div className="switch-row"><span>{t('layer_buildings')}</span><label className="switch"><input type="checkbox" checked={buildings} onChange={(e) => settingsStore.set({ buildings3d: e.target.checked })} aria-label={t('layer_buildingsAria')} /><span /></label></div>
            <div className="field" style={{ marginTop: 'var(--s2)' }}>
              <label className="label" htmlFor="vehicle-style">{t('set_vehicles')}</label>
              <select id="vehicle-style" className="input" value={vehicleStyle} onChange={(e) => settingsStore.set({ vehicleStyle: e.target.value as typeof vehicleStyle })}>
                <option value="models">{t('set_models')}</option><option value="sprites">{t('set_sprites')}</option><option value="markers">{t('set_markers')}</option>
              </select>
            </div>
            <button type="button" className="btn btn-secondary layers-list-btn" aria-pressed={listOpen} onClick={() => { appStore.set({ listOpen: !listOpen }); setLayersOpen(false); }}><IconList /> {t('vehicleListOpen')}</button>
            <p className="hint" style={{ marginBottom: 0 }}>{t('layersHint', { z: zoom.toFixed(1) })}</p>
          </div>
  );
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

      <div className="controls" ref={ctrlRef} aria-label={t('controls')}>
        <div className="ctrl-group ctrl-zoom">
          <button type="button" className="ctrl" onClick={() => mapApi.controller?.zoomBy(1)} disabled={!ready} aria-label={t('zoomIn')}><IconPlus /></button>
          <button type="button" className="ctrl" onClick={() => mapApi.controller?.zoomBy(-1)} disabled={!ready} aria-label={t('zoomOut')}><IconMinus /></button>
        </div>
        <div className="ctrl-group">
          <button type="button" className={`ctrl ctrl-compass${Math.abs(bearing) > 1 ? ' rotated' : ''}`} onClick={() => mapApi.controller?.resetNorth()} disabled={!ready} aria-label={t('northNow', { b: bearing })} title={t('north')}>
            <span style={{ display: 'grid', transform: `rotate(${-bearing}deg)` }}><IconCompass /></span>
          </button>
          <button type="button" className="ctrl ctrl-text ctrl-3d" onClick={() => mapApi.controller?.setPitched(!pitched)} disabled={!ready} aria-pressed={pitched} aria-label={pitched ? t('to2d') : t('to3d')}>{pitched ? '2D' : '3D'}</button>
          <button type="button" className="ctrl ctrl-locate" onClick={() => mapApi.controller?.locate()} disabled={!ready || locate === 'locating'} aria-label={t('myLocation')} aria-busy={locate === 'locating'}><IconLocate /></button>
        </div>
        <div className="ctrl-group ctrl-tools">
          <button type="button" className="ctrl ctrl-layers" onClick={() => setLayersOpen((o) => !o)} aria-expanded={layersOpen} aria-controls="layers-menu" aria-label={t('layers')}><IconLayers /></button>
          <button type="button" className="ctrl ctrl-list" onClick={() => appStore.set({ listOpen: !listOpen })} aria-pressed={listOpen} aria-label={t('vehicleList')}><IconList /></button>
        </div>
        {layersOpen && !mobile && layersMenu}
      </div>

      {layersOpen && mobile && typeof document !== 'undefined' && createPortal(<div className="layers-portal">{layersMenu}</div>, document.body)}
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
