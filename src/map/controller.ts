import { Map as MlMap, setWorkerUrl, type GeoJSONSource, type MapGeoJSONFeature, type ExpressionSpecification, type FilterSpecification, type LayerSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { spriteIconRotate } from '@/domain/angles';
import { classifyPositionAge, type PositionFreshness } from '@/domain/freshness';
import { MODES, type Mode, type StopPoint, type VehicleState } from '@/domain/model';
import { MODE_COLOR } from '@/domain/modes';
import { metersPerPixel } from '@/domain/geo';
import { VehicleAnimator } from './animator';
import { manifest, mapAssetFor, mapVariant, spriteSizeStops } from './assets';
import { badgeImage, clusterImage, stopLabelImage } from './images';

export interface MapSettings { vehicleStyle: 'sprites' | 'markers'; buildings3d: boolean; showStops: boolean; reducedMotion: boolean }
export interface CameraState { bearing: number; pitch: number; zoom: number; lng: number; lat: number }
export interface MapEvents {
  onReady(): void;
  onSelect(v: VehicleState | null, freshness: PositionFreshness): void;
  onStop(p: StopPoint | null): void;
  onCamera(c: CameraState): void;
  onFollow(follow: boolean): void;
  onBasemap(state: 'ok' | 'fallback'): void;
  onLocate(state: 'locating' | 'ok' | 'denied' | 'unavailable'): void;
  onRender(ok: boolean): void;
}

const LIVE = 'dop-live', OV = 'dop-overview', STOPS = 'dop-stops', ME = 'dop-me';
const SPRITE_ZOOM = 15.5, LIVE_ZOOM = 12.5;
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
export const FALLBACK_STYLE_URL = '/map/offline-style.json';
/** Worker MapLibre servírovaný z /public (viz scripts/copy-maplibre-worker.mjs). */
const WORKER_URL = '/maplibre/maplibre-gl-worker.mjs';
const PRAGUE: [number, number] = [14.4205, 50.0815];

const modeColor = ['match', ['get', 'mode'], ...MODES.flatMap((m) => [m, MODE_COLOR[m]]), MODE_COLOR.other] as unknown as ExpressionSpecification;
const freshOpacity: ExpressionSpecification = ['match', ['get', 'fresh'], 'live', 1, 0.5];
const safe = (s: string) => s.replace(/\|/g, '/').slice(0, 8);

export class MapController {
  readonly map: MlMap;
  private animator = new VehicleAnimator();
  private vehicles = new Map<string, VehicleState>();
  private modes = new Set<Mode>(MODES);
  private selectedId: string | null = null;
  private follow = false;
  private raf = 0;
  private lastPush = 0;
  private lastSelEmit = 0;
  private ready = false;
  private destroyed = false;
  private stopsAbort: AbortController | null = null;
  private stopsTimer: ReturnType<typeof setTimeout> | null = null;
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private usedFallback = false;
  private readonly coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  private me: { lng: number; lat: number; acc: number } | null = null;
  private viewAngles = { bearing: 0, pitch: 0 };

  constructor(container: HTMLElement, private styleUrl: string, private settings: MapSettings, private events: MapEvents) {
    this.animator.setReducedMotion(settings.reducedMotion);
    setWorkerUrl(WORKER_URL);
    this.map = new MlMap({
      container, style: styleUrl, center: PRAGUE, zoom: 13.2, pitch: 0, bearing: 0, maxZoom: 20.5, minZoom: 6,
      maxBounds: [[11.2, 48.1], [19.6, 51.6]], attributionControl: { compact: true }, dragRotate: true, pitchWithRotate: true,
      cooperativeGestures: false, fadeDuration: 150,
    });
    this.map.on('load', () => this.onStyleLoad());
    this.map.on('error', (e) => { if (!this.ready && !this.usedFallback && /style|fetch|load/i.test(String(e.error?.message ?? ''))) this.useFallbackStyle(); });
    this.loadTimer = setTimeout(() => { if (!this.ready) this.useFallbackStyle(); }, 12_000);
    this.map.on('styleimagemissing', (e) => this.provideImage(e.id));
    this.map.on('click', (e) => this.handleClick(e.point.x, e.point.y));
    this.map.on('mousemove', (e) => this.hover(e.point.x, e.point.y));
    this.map.on('move', () => { this.emitCamera(); this.onViewChange(); });
    this.map.on('moveend', () => { this.scheduleStops(); this.lastPush = 0; this.kick(); });
    this.map.on('dragstart', () => this.setFollow(false));
    this.map.on('webglcontextlost', () => this.events.onRender(false));
    this.map.on('webglcontextrestored', () => { this.events.onRender(true); this.lastPush = 0; this.kick(); });
  }

  private useFallbackStyle() {
    if (this.usedFallback || this.destroyed || this.styleUrl === FALLBACK_STYLE_URL) return;
    this.usedFallback = true;
    this.events.onBasemap('fallback');
    this.map.setStyle(FALLBACK_STYLE_URL);
    this.map.once('style.load', () => this.onStyleLoad());
  }

  private async onStyleLoad() {
    if (this.destroyed) return;
    if (this.loadTimer) clearTimeout(this.loadTimer);
    await this.addVehicleImages();
    this.addLayers();
    this.applyBuildings();
    this.ready = true;
    if (!this.usedFallback) this.events.onBasemap('ok');
    this.events.onReady();
    this.pushOverview();
    this.kick();
    this.scheduleStops();
    this.emitCamera();
  }

  private async addVehicleImages() {
    for (const a of manifest.assets) {
      const v = mapVariant(a);
      if (a.view !== 'top-down' || !v || this.map.hasImage(a.id)) continue;
      try { const img = await this.map.loadImage(v.file); if (!this.map.hasImage(a.id)) this.map.addImage(a.id, img.data, { pixelRatio: v.pixelRatio }); } catch { /* chybějící asset → náhradní značka */ }
    }
  }

  private spriteSizeExpr(): ExpressionSpecification {
    const lat = this.map.getCenter().lat;
    const tram = mapAssetFor('tram'), train = mapAssetFor('train');
    const stopsFor = (id: string | undefined) => (id ? spriteSizeStops(manifest.assets.find((a) => a.id === id)!, lat) : []);
    const zs = stopsFor(tram?.id).map(([z]) => z);
    if (!zs.length) return ['literal', 0.5] as unknown as ExpressionSpecification;
    const tr = stopsFor(tram?.id), tn = stopsFor(train?.id);
    const parts: unknown[] = ['interpolate', ['linear'], ['zoom']];
    zs.forEach((z, i) => parts.push(z, ['match', ['get', 'icon'], ...(train ? [train.id, tn[i]?.[1] ?? 0.5] : []), tr[i]?.[1] ?? 0.5]));
    return parts as ExpressionSpecification;
  }

  private addLayers() {
    const m = this.map;
    if (!m.getSource(STOPS)) m.addSource(STOPS, { type: 'geojson', data: EMPTY });
    if (!m.getSource(OV)) m.addSource(OV, { type: 'geojson', data: EMPTY, cluster: true, clusterMaxZoom: 12, clusterRadius: 46 });
    if (!m.getSource(LIVE)) m.addSource(LIVE, { type: 'geojson', data: EMPTY });
    if (!m.getSource(ME)) m.addSource(ME, { type: 'geojson', data: EMPTY });
    const layers: LayerSpecification[] = [
      { id: 'dop-stops-dot', type: 'circle', source: STOPS, minzoom: 14.5, layout: { visibility: this.settings.showStops ? 'visible' : 'none' },
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 14.5, 3, 18, 6.5], 'circle-color': '#FFFFFF', 'circle-stroke-color': modeColor, 'circle-stroke-width': 2.2, 'circle-pitch-alignment': 'map' } },
      { id: 'dop-stops-label', type: 'symbol', source: STOPS, minzoom: 16.8, layout: { visibility: this.settings.showStops ? 'visible' : 'none', 'icon-image': ['get', 'label'], 'icon-anchor': 'left', 'icon-offset': [7, 0], 'icon-allow-overlap': false, 'symbol-sort-key': ['get', 'rank'] } },
      { id: 'dop-me-acc', type: 'circle', source: ME, paint: { 'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 10, ['/', ['get', 'acc'], 120], 20, ['/', ['get', 'acc'], 0.12]], 'circle-color': '#2F7BFF', 'circle-opacity': 0.12, 'circle-pitch-alignment': 'map' } },
      { id: 'dop-me', type: 'circle', source: ME, paint: { 'circle-radius': 7, 'circle-color': '#2F7BFF', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3 } },
      { id: 'dop-ov-dot', type: 'circle', source: OV, maxzoom: LIVE_ZOOM, filter: ['!', ['has', 'point_count']],
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2.5, 12.5, 5], 'circle-color': modeColor, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 1.2, 'circle-opacity': freshOpacity, 'circle-stroke-opacity': freshOpacity } },
      { id: 'dop-ov-cluster', type: 'symbol', source: OV, maxzoom: LIVE_ZOOM, filter: ['has', 'point_count'], layout: { 'icon-image': ['concat', 'c|', ['to-string', ['get', 'point_count']]], 'icon-allow-overlap': true } },
      { id: 'dop-halo', type: 'circle', source: LIVE, minzoom: LIVE_ZOOM, filter: ['==', ['get', 'id'], ''],
        paint: { 'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 12.5, 14, 16, 26, 19, 110, 21, 380], 'circle-color': '#7B4DFF', 'circle-opacity': 0.16, 'circle-stroke-color': '#7B4DFF', 'circle-stroke-width': 2, 'circle-stroke-opacity': 0.6, 'circle-pitch-alignment': 'map' } },
      { id: 'dop-dot', type: 'circle', source: LIVE, minzoom: LIVE_ZOOM, maxzoom: SPRITE_ZOOM,
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12.5, 5, 15.5, 7.5], 'circle-color': modeColor, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 1.6, 'circle-opacity': freshOpacity, 'circle-stroke-opacity': freshOpacity } },
      { id: 'dop-marker', type: 'circle', source: LIVE, minzoom: SPRITE_ZOOM, filter: ['==', ['get', 'sprite'], false],
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 15.5, 8, 19, 12], 'circle-color': modeColor, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2.5, 'circle-opacity': freshOpacity, 'circle-pitch-alignment': 'map' } },
      { id: 'dop-sprite', type: 'symbol', source: LIVE, minzoom: SPRITE_ZOOM, filter: ['==', ['get', 'sprite'], true],
        layout: { 'icon-image': ['get', 'icon'], 'icon-size': this.spriteSizeExpr(), 'icon-rotate': ['get', 'rot'], 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map',
          'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-anchor': 'center', 'symbol-sort-key': ['get', 'sort'] },
        paint: { 'icon-opacity': freshOpacity } },
      { id: 'dop-badge', type: 'symbol', source: LIVE, minzoom: 13.5,
        layout: { 'icon-image': ['get', 'badge'], 'icon-anchor': 'bottom', 'icon-offset': ['get', 'off'], 'icon-allow-overlap': true, 'icon-ignore-placement': true,
          'icon-rotation-alignment': 'viewport', 'icon-pitch-alignment': 'viewport', 'symbol-sort-key': ['get', 'sort'] } },
    ];
    for (const l of layers) if (!m.getLayer(l.id)) m.addLayer(l);
    this.applySelectionFilter();
  }

  private provideImage(id: string) {
    if (this.map.hasImage(id)) return;
    try {
      const [kind, a, b, c] = id.split('|');
      if (kind === 'b' && a && b !== undefined) this.map.addImage(id, badgeImage(b, a as Mode, (c as 'live' | 'stale' | 'selected') ?? 'live'), { pixelRatio: 2 });
      else if (kind === 'c' && a) this.map.addImage(id, clusterImage(Number(a)), { pixelRatio: 2 });
      else if (kind === 's' && a) this.map.addImage(id, stopLabelImage(a, b || null), { pixelRatio: 2 });
    } catch { /* obrázek se nepodařilo vytvořit – vrstva zůstane bez štítku */ }
  }

  /** Nová dávka dat ze serveru: oddělená od animace, React se nepřekresluje. */
  ingest(list: VehicleState[], receivedAt: number) {
    this.vehicles = new Map(list.map((v) => [v.id, v]));
    this.animator.ingest(list, receivedAt, Date.now());
    if (this.selectedId && !this.vehicles.has(this.selectedId)) { this.selectedId = null; this.applySelectionFilter(); this.setFollow(false); this.events.onSelect(null, 'expired'); }
    this.pushOverview();
    this.emitSelected();
    this.kick();
  }

  private pushOverview() {
    if (!this.ready) return;
    const now = Date.now();
    const features: Feature[] = [];
    for (const v of this.vehicles.values()) {
      if (!this.modes.has(v.route.mode)) continue;
      const fresh = this.freshness(v, now);
      if (fresh === 'expired') continue;
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [v.lon, v.lat] }, properties: { id: v.id, mode: v.route.mode, fresh: fresh === 'live' ? 'live' : 'stale' } });
    }
    (this.map.getSource(OV) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
  }

  private freshness(v: VehicleState, now: number): PositionFreshness {
    const t = v.measuredAt ? Date.parse(v.measuredAt) : NaN;
    return classifyPositionAge(Number.isFinite(t) ? (now - t) / 1000 : null);
  }

  /** Při otáčení a naklápění mapy se přepočítá posun štítků (vozidla samotná natáčí MapLibre). */
  private onViewChange() {
    const b = this.map.getBearing(), p = this.map.getPitch();
    if (Math.abs(b - this.viewAngles.bearing) > 1 || Math.abs(p - this.viewAngles.pitch) > 1) { this.viewAngles = { bearing: b, pitch: p }; this.kick(); }
  }

  private kick() { if (!this.raf && !this.destroyed) this.raf = requestAnimationFrame(this.frame); }

  private frame = () => {
    this.raf = 0;
    if (!this.ready || this.destroyed) return;
    const now = Date.now();
    const z = this.map.getZoom();
    const animating = this.animator.isAnimating(now);
    const minGap = this.settings.reducedMotion ? 1000 : 33;
    if (z >= LIVE_ZOOM - 0.3 && now - this.lastPush >= minGap) { this.pushLive(now); this.lastPush = now; }
    if (this.follow && this.selectedId) this.followStep(now);
    if (now - this.lastSelEmit > 1000) this.emitSelected();
    if (animating || this.follow) this.raf = requestAnimationFrame(this.frame);
  };

  private pushLive(now: number) {
    const b = this.map.getBounds();
    const zoom = this.map.getZoom(), mapBearing = this.map.getBearing();
    const mpp = metersPerPixel(this.map.getCenter().lat, zoom);
    const pitchK = Math.cos((this.map.getPitch() * Math.PI) / 180);
    const padLng = (b.getEast() - b.getWest()) * 0.25, padLat = (b.getNorth() - b.getSouth()) * 0.25;
    const features: Feature[] = [];
    for (const [id, v] of this.vehicles) {
      if (!this.modes.has(v.route.mode)) continue;
      const d = this.animator.sample(id, now);
      if (!d) continue;
      if (d.lng < b.getWest() - padLng || d.lng > b.getEast() + padLng || d.lat < b.getSouth() - padLat || d.lat > b.getNorth() + padLat) continue;
      const fresh = this.freshness(v, now);
      if (fresh === 'expired' && id !== this.selectedId) continue;
      const asset = this.settings.vehicleStyle === 'sprites' ? mapAssetFor(v.route.mode) : null;
      const sprite = Boolean(asset && d.bearing !== null && this.map.hasImage(asset.id));
      const sel = id === this.selectedId;
      const state = sel ? 'selected' : fresh === 'live' ? 'live' : 'stale';
      // Štítek nad vozidlem: posun = půl promítnuté délky/šířky podle úhlu na obrazovce, aby nezakrýval čelo.
      let off = zoom < SPRITE_ZOOM ? 9 : 15;
      if (sprite && asset?.physical && asset.sizing) {
        const len = Math.min(asset.sizing.maxScreenLengthPx, Math.max(asset.sizing.minScreenLengthPx, asset.physical.lengthM / mpp));
        const wid = (len * asset.physical.widthM) / asset.physical.lengthM;
        const th = (((d.bearing as number) - mapBearing) * Math.PI) / 180;
        off = (Math.abs(Math.cos(th)) * len * pitchK + Math.abs(Math.sin(th)) * wid) / 2 + 7;
      }
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [d.lng, d.lat] }, properties: {
        id, mode: v.route.mode, sprite, icon: asset?.id ?? '', rot: sprite ? spriteIconRotate(d.bearing as number, asset?.frontDirectionDeg ?? 0) : 0,
        fresh: fresh === 'live' ? 'live' : 'stale', badge: `b|${v.route.mode}|${safe(v.route.shortName)}|${state}`, sort: sel ? 1000 : fresh === 'live' ? 10 : 1, off: [0, -Math.round(off)],
      } });
    }
    (this.map.getSource(LIVE) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
  }

  private followStep(now: number) {
    const d = this.selectedId ? this.animator.sample(this.selectedId, now) : null;
    if (!d) return;
    const c = this.map.getCenter();
    const k = this.settings.reducedMotion ? 1 : 0.12;
    this.map.jumpTo({ center: [c.lng + (d.lng - c.lng) * k, c.lat + (d.lat - c.lat) * k] });
  }

  private emitSelected() {
    this.lastSelEmit = Date.now();
    if (!this.selectedId) return;
    const v = this.vehicles.get(this.selectedId);
    if (v) this.events.onSelect(v, this.freshness(v, Date.now()));
  }

  private emitCamera() {
    const c = this.map.getCenter();
    this.events.onCamera({ bearing: this.map.getBearing(), pitch: this.map.getPitch(), zoom: this.map.getZoom(), lng: c.lng, lat: c.lat });
  }

  private applySelectionFilter() {
    if (this.map.getLayer('dop-halo')) this.map.setFilter('dop-halo', ['==', ['get', 'id'], this.selectedId ?? ''] as FilterSpecification);
  }

  select(id: string | null, opts: { fly?: boolean; follow?: boolean } = {}) {
    this.selectedId = id;
    this.applySelectionFilter();
    const v = id ? this.vehicles.get(id) ?? null : null;
    this.events.onSelect(v, v ? this.freshness(v, Date.now()) : 'unknown');
    if (v && opts.fly) {
      const d = this.animator.sample(v.id, Date.now()) ?? { lng: v.lon, lat: v.lat };
      this.map.easeTo({ center: [d.lng, d.lat], zoom: Math.max(this.map.getZoom(), 16.6), duration: this.settings.reducedMotion ? 0 : 900 });
    }
    this.setFollow(Boolean(v && opts.follow));
    this.lastPush = 0;
    this.kick();
  }

  setFollow(on: boolean) {
    if (this.follow === on) return;
    this.follow = on;
    this.events.onFollow(on);
    this.kick();
  }

  private pick(x: number, y: number): MapGeoJSONFeature | null {
    const r = this.coarse ? 26 : 14;
    const layers = ['dop-sprite', 'dop-marker', 'dop-dot', 'dop-badge', 'dop-ov-cluster', 'dop-ov-dot', 'dop-stops-dot'].filter((l) => this.map.getLayer(l));
    const feats = this.map.queryRenderedFeatures([[x - r, y - r], [x + r, y + r]], { layers });
    let best: MapGeoJSONFeature | null = null, bestD = Infinity;
    for (const f of feats) {
      if (f.geometry.type !== 'Point') continue;
      const p = this.map.project(f.geometry.coordinates as [number, number]);
      const prio = f.layer.id.startsWith('dop-stops') ? 400 : f.layer.id === 'dop-ov-cluster' ? 200 : 0;
      const dist = Math.hypot(p.x - x, p.y - y) + prio;
      if (dist < bestD) { bestD = dist; best = f; }
    }
    return best;
  }

  private hover(x: number, y: number) {
    if (this.coarse) return;
    this.map.getCanvas().style.cursor = this.pick(x, y) ? 'pointer' : '';
  }

  private async handleClick(x: number, y: number) {
    const f = this.pick(x, y);
    if (!f) { if (this.selectedId) this.select(null); this.events.onStop(null); return; }
    if (f.layer.id === 'dop-ov-cluster') {
      const src = this.map.getSource(OV) as GeoJSONSource;
      const zoom = await src.getClusterExpansionZoom(Number(f.properties?.cluster_id));
      this.map.easeTo({ center: (f.geometry as Point).coordinates as [number, number], zoom: Math.min(zoom + 0.5, 17), duration: this.settings.reducedMotion ? 0 : 600 });
      return;
    }
    if (f.layer.id === 'dop-stops-dot') {
      const raw = f.properties?.json;
      if (typeof raw === 'string') { this.select(null); this.events.onStop(JSON.parse(raw) as StopPoint); }
      return;
    }
    const id = String(f.properties?.id ?? '');
    if (id) { this.events.onStop(null); this.select(id, { fly: f.layer.id === 'dop-ov-dot' }); }
  }

  private scheduleStops() {
    if (this.stopsTimer) clearTimeout(this.stopsTimer);
    this.stopsTimer = setTimeout(() => void this.loadStops(), 350);
  }

  private async loadStops() {
    if (!this.ready || !this.settings.showStops || this.map.getZoom() < 14.5) return;
    const b = this.map.getBounds();
    this.stopsAbort?.abort();
    const ctrl = new AbortController();
    this.stopsAbort = ctrl;
    try {
      const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((n) => n.toFixed(5)).join(',');
      const res = await fetch(`/api/stops?bbox=${bbox}`, { signal: ctrl.signal });
      if (!res.ok) return;
      const body = (await res.json()) as { data: StopPoint[] | null };
      const features: Feature[] = (body.data ?? []).map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        properties: { mode: p.modes[0] ?? 'other', label: `s|${p.name.replace(/\|/g, '/')}|${p.platform ?? ''}`, rank: p.modes[0] === 'metro' ? 0 : p.modes[0] === 'train' ? 1 : 2, json: JSON.stringify(p) } }));
      (this.map.getSource(STOPS) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
    } catch { /* přerušeno nebo nedostupné */ }
  }

  setModes(modes: Mode[]) { this.modes = new Set(modes); this.pushOverview(); this.lastPush = 0; this.kick(); }

  setSettings(s: MapSettings) {
    const prev = this.settings;
    this.settings = s;
    this.animator.setReducedMotion(s.reducedMotion);
    if (!this.ready) return;
    if (prev.buildings3d !== s.buildings3d) this.applyBuildings();
    if (prev.showStops !== s.showStops) for (const l of ['dop-stops-dot', 'dop-stops-label']) if (this.map.getLayer(l)) this.map.setLayoutProperty(l, 'visibility', s.showStops ? 'visible' : 'none');
    if (s.showStops) this.scheduleStops();
    this.lastPush = 0;
    this.kick();
  }

  private applyBuildings() {
    const style = this.map.getStyle();
    for (const l of style.layers ?? []) if (l.type === 'fill-extrusion') this.map.setLayoutProperty(l.id, 'visibility', this.settings.buildings3d ? 'visible' : 'none');
  }

  zoomBy(delta: number) { this.map.easeTo({ zoom: this.map.getZoom() + delta, duration: this.settings.reducedMotion ? 0 : 300 }); }
  resetNorth() { this.map.easeTo({ bearing: 0, duration: this.settings.reducedMotion ? 0 : 500 }); }
  setPitched(on: boolean) { this.map.easeTo({ pitch: on ? 58 : 0, duration: this.settings.reducedMotion ? 0 : 700 }); }
  setBearing(deg: number) { this.map.jumpTo({ bearing: deg }); }
  flyTo(lng: number, lat: number, zoom = 17) { this.map.easeTo({ center: [lng, lat], zoom, duration: this.settings.reducedMotion ? 0 : 900 }); }

  locate() {
    if (!('geolocation' in navigator)) { this.events.onLocate('unavailable'); return; }
    this.events.onLocate('locating');
    navigator.geolocation.getCurrentPosition((pos) => {
      this.me = { lng: pos.coords.longitude, lat: pos.coords.latitude, acc: Math.min(pos.coords.accuracy, 2000) };
      (this.map.getSource(ME) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [this.me.lng, this.me.lat] }, properties: { acc: this.me.acc } }] });
      this.flyTo(this.me.lng, this.me.lat, 16);
      this.events.onLocate('ok');
    }, (err) => this.events.onLocate(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'), { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 });
  }

  myPosition() { return this.me ? { lng: this.me.lng, lat: this.me.lat } : null; }

  /** Vozidla ve výřezu pro textový seznam (přístupná alternativa k mapě). */
  vehiclesInView(limit = 60): { v: VehicleState; freshness: PositionFreshness }[] {
    const b = this.map.getBounds();
    const now = Date.now();
    const out: { v: VehicleState; freshness: PositionFreshness }[] = [];
    for (const v of this.vehicles.values()) {
      if (!this.modes.has(v.route.mode) || !b.contains([v.lon, v.lat])) continue;
      const freshness = this.freshness(v, now);
      if (freshness !== 'expired') out.push({ v, freshness });
      if (out.length >= limit) break;
    }
    return out.sort((a, b2) => a.v.route.shortName.localeCompare(b2.v.route.shortName, 'cs', { numeric: true }));
  }

  resize() { this.map.resize(); }

  setViewPadding(p: { top: number; bottom: number; left: number; right: number }) { this.map.setPadding(p); }

  destroy() {
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.stopsTimer) clearTimeout(this.stopsTimer);
    if (this.loadTimer) clearTimeout(this.loadTimer);
    this.stopsAbort?.abort();
    this.map.remove();
  }
}
