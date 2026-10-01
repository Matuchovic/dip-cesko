import { Map as MlMap, setWorkerUrl, type GeoJSONSource, type MapGeoJSONFeature, type ExpressionSpecification, type FilterSpecification, type LayerSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { classifyPositionAge, type PositionFreshness } from '@/domain/freshness';
import { MODES, type Mode, type StopPoint, type VehicleState } from '@/domain/model';
import { MODE_COLOR } from '@/domain/modes';
import { metersPerPixel } from '@/domain/geo';
import { manifest, mapAssetFor, spriteSizeStops, type VehicleAsset } from './assets';
import { badgeImage, clusterImage, stopLabelImage } from './images';
import { TrackFollower } from './follower';
import { TrackNetwork, type TrackKind } from './tracks';
import { buildExtrusions, buildPieces, DEFAULT_SHAPES, type VehicleShape } from './vehicle3d';
import { bearingDeg, D2R, pointAlong, polyLength, type LngLat } from './geometry';
import { VehicleLayer, type ModelVehicle } from './vehicle-layer';
import { hasVehicleModel, MODEL_ZOOM as MODEL3D_ZOOM, VEHICLE_DIMENSIONS, type VehicleStyle } from './vehicle-presentation';

export interface MapSettings { vehicleStyle: VehicleStyle; buildings3d: boolean; showStops: boolean; reducedMotion: boolean }
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

const LIVE = 'dop-live', PIECES = 'dop-pieces', V3D = 'dop-3d', OV = 'dop-overview', STOPS = 'dop-stops', ME = 'dop-me';
const SPRITE_ZOOM = 15.5, LIVE_ZOOM = 12.5, MODEL_ZOOM = 15, PITCH_3D = 20, DETAIL_3D_MAX = 90;
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
export const FALLBACK_STYLE_URL = '/map/offline-style.json';
/** Worker MapLibre servírovaný z /public (viz scripts/copy-maplibre-worker.mjs). */
const WORKER_URL = '/maplibre/maplibre-gl-worker.mjs';
const PRAGUE: [number, number] = [14.4205, 50.0815];
const ROOF_PALETTE = ['#A65A3F', '#9A4E37', '#B0674A', '#6B6E73', '#5E6167'];
const FACADE_PALETTE = ['#E9DFCB', '#DCCBA9', '#E5D3BC', '#D3CDC3', '#E8CFB8', '#CDBFAE', '#EFE6D2', '#D9C3A0'];
const GLASS_PALETTE = ['#9DB0C0', '#A9B8C4', '#8FA2B4'];
const ROAD_CLASSES = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'busway', 'bus_guideway']);
const RAIL_SUBCLASSES = new Set(['rail', 'light_rail', 'narrow_gauge', 'preserved', 'funicular']);

const modeColor = ['match', ['get', 'mode'], ...MODES.flatMap((m) => [m, MODE_COLOR[m]]), MODE_COLOR.other] as unknown as ExpressionSpecification;
const freshOpacity: ExpressionSpecification = ['match', ['get', 'fresh'], 'live', 1, 0.5];
const safe = (s: string) => s.replace(/\|/g, '/').slice(0, 8);
const HAS_3D = new Set<Mode>(['tram', 'train', 'bus', 'trolleybus', 'ferry']);

export class MapController {
  readonly map: MlMap;
  private follower: TrackFollower;
  private modelLayer = new VehicleLayer();
  private vehicles = new Map<string, VehicleState>();
  private modes = new Set<Mode>(MODES);
  private selectedId: string | null = null;
  private follow = false;
  private raf = 0;
  private lastPush = 0;
  private last3d = 0;
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
  private pitchedMode = false;
  private lang = 'cs';
  private nets = new Map<TrackKind, { net: TrackNetwork | null; at: number; version: number }>();
  private netVersion = 0;
  private transport: { id: string; layer?: string } | null | undefined;

  constructor(container: HTMLElement, private styleUrl: string, private settings: MapSettings, private events: MapEvents) {
    this.follower = new TrackFollower((mode) => this.lengthFor(mode));
    this.follower.animator.setReducedMotion(settings.reducedMotion);
    setWorkerUrl(WORKER_URL);
    this.map = new MlMap({
      container, style: styleUrl, center: PRAGUE, zoom: 13.2, pitch: 0, bearing: 0, maxZoom: 20.5, minZoom: 6, maxPitch: 70,
      maxBounds: [[11.2, 48.1], [19.6, 51.6]], attributionControl: { compact: true }, dragRotate: true, pitchWithRotate: true,
      cooperativeGestures: false, fadeDuration: 150,
    });
    this.map.on('load', () => this.onStyleLoad());
    this.map.on('error', (e) => { if (!this.ready && !this.usedFallback && /style|fetch|load/i.test(String(e.error?.message ?? ''))) this.useFallbackStyle(); });
    this.loadTimer = setTimeout(() => { if (!this.ready) this.useFallbackStyle(); }, 12_000);
    this.map.on('styleimagemissing', (e) => this.provideImage(e.id));
    this.map.on('click', (e) => void this.handleClick(e.point.x, e.point.y));
    this.map.on('mousemove', (e) => this.hover(e.point.x, e.point.y));
    this.map.on('move', () => { this.emitCamera(); this.onViewChange(); });
    this.map.on('moveend', () => { this.netVersion++; this.scheduleStops(); this.lastPush = 0; this.resnapVisible(); this.kick(); });
    this.map.on('sourcedata', (e) => { if (e.isSourceLoaded && e.sourceId !== LIVE && e.sourceId !== PIECES && e.sourceId !== V3D) this.netVersion++; });
    this.map.on('dragstart', () => this.setFollow(false));
    this.map.on('webglcontextlost', () => this.events.onRender(false));
    this.map.on('webglcontextrestored', () => { this.events.onRender(true); this.lastPush = 0; this.kick(); });
  }

  // ---------- styl a vrstvy ----------
  private useFallbackStyle() {
    if (this.usedFallback || this.destroyed || this.styleUrl === FALLBACK_STYLE_URL) return;
    this.usedFallback = true;
    this.events.onBasemap('fallback');
    this.map.setStyle(FALLBACK_STYLE_URL);
    this.map.once('style.load', () => void this.onStyleLoad());
  }

  private async onStyleLoad() {
    if (this.destroyed) return;
    if (this.loadTimer) clearTimeout(this.loadTimer);
    this.transport = undefined;
    await this.addVehicleImages();
    this.addLayers();
    try { this.map.setProjection({ type: 'mercator' }); } catch { /* styl bez projekce */ }
    if (!this.map.getLayer(this.modelLayer.id)) this.map.addLayer(this.modelLayer, 'dop-badge');
    this.modelLayer.setEnabled(this.settings.vehicleStyle === 'models');
    this.styleBuildings();
    this.applyBuildings();
    this.applyLabels();
    this.ready = true;
    this.applyPitchMode(true);
    if (!this.usedFallback) this.events.onBasemap('ok');
    this.events.onReady();
    this.pushOverview();
    this.kick();
    this.scheduleStops();
    this.emitCamera();
  }

  private async addVehicleImages() {
    for (const a of manifest.assets) {
      if (a.view !== 'top-down') continue;
      for (const pc of a.pieces ?? []) {
        const id = `${a.id}#${pc.index}`;
        if (this.map.hasImage(id)) continue;
        try { const img = await this.map.loadImage(pc.file); if (!this.map.hasImage(id)) this.map.addImage(id, img.data, { pixelRatio: pc.pixelRatio }); } catch { /* chybějící část → náhradní značka */ }
      }
    }
  }

  private spriteSizeExpr(): ExpressionSpecification {
    const lat = this.map.getCenter().lat;
    const tram = mapAssetFor('tram'), train = mapAssetFor('train');
    const tr = tram ? spriteSizeStops(tram, lat) : [], tn = train ? spriteSizeStops(train, lat) : [];
    if (!tr.length) return ['literal', 0.5] as unknown as ExpressionSpecification;
    const parts: unknown[] = ['interpolate', ['linear'], ['zoom']];
    tr.forEach(([z, size], i) => parts.push(z, ['match', ['get', 'asset'], ...(train ? [train.id, tn[i]?.[1] ?? size] : []), size]));
    return parts as ExpressionSpecification;
  }

  private addLayers() {
    const m = this.map;
    for (const [id, cluster] of [[STOPS, false], [OV, true], [LIVE, false], [PIECES, false], [V3D, false], [ME, false]] as const) {
      if (!m.getSource(id)) m.addSource(id, cluster ? { type: 'geojson', data: EMPTY, cluster: true, clusterMaxZoom: 12, clusterRadius: 46 } : { type: 'geojson', data: EMPTY });
    }
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
        paint: { 'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 12.5, 14, 16, 26, 19, 110, 21, 380], 'circle-color': '#7B4DFF', 'circle-opacity': 0.14, 'circle-stroke-color': '#7B4DFF', 'circle-stroke-width': 2, 'circle-stroke-opacity': 0.55, 'circle-pitch-alignment': 'map' } },
      { id: 'dop-dot', type: 'circle', source: LIVE, minzoom: LIVE_ZOOM, maxzoom: SPRITE_ZOOM,
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12.5, 5, 15.5, 7.5], 'circle-color': modeColor, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 1.6, 'circle-opacity': freshOpacity, 'circle-stroke-opacity': freshOpacity } },
      { id: 'dop-marker', type: 'circle', source: LIVE, minzoom: SPRITE_ZOOM, filter: ['==', ['get', 'sprite'], false],
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 15.5, 8, 19, 12], 'circle-color': modeColor, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2.5, 'circle-opacity': freshOpacity, 'circle-pitch-alignment': 'map' } },
      { id: 'dop-pieces', type: 'symbol', source: PIECES, minzoom: SPRITE_ZOOM,
        layout: { 'icon-image': ['get', 'icon'], 'icon-size': this.spriteSizeExpr(), 'icon-rotate': ['get', 'rot'], 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map',
          'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-anchor': 'center', 'symbol-sort-key': ['get', 'sort'] },
        paint: { 'icon-opacity': freshOpacity } },
      { id: 'dop-3d', type: 'fill-extrusion', source: V3D, minzoom: MODEL_ZOOM, layout: { visibility: 'none' },
        paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-opacity': 1, 'fill-extrusion-vertical-gradient': true } },
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

  /** Popisky podkladové mapy v jazyce aplikace (OpenMapTiles name:xx, jinak místní název). */
  setLanguage(lang: string) { this.lang = lang; if (this.ready) this.applyLabels(); }

  private applyLabels() {
    const field = (this.lang === 'ar'
      ? ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']]
      : ['coalesce', ['get', `name:${this.lang}`], ['get', 'name:latin'], ['get', 'name']]) as unknown as ExpressionSpecification;
    for (const l of this.map.getStyle().layers ?? []) {
      if (l.type !== 'symbol' || l.id.startsWith('dop-')) continue;
      const tf = this.map.getLayoutProperty(l.id, 'text-field');
      if (!tf) continue;
      const js = JSON.stringify(tf);
      if (!/name/.test(js) || /ref|housenumber|ele/.test(js)) continue;
      try { this.map.setLayoutProperty(l.id, 'text-field', field); } catch { /* vrstva bez textu */ }
    }
  }

  // ---------- trať z mapových dat ----------
  private transportSource(): { id: string; layer?: string } | null {
    if (this.transport !== undefined) return this.transport;
    const layer = (this.map.getStyle().layers ?? []).find((l) => 'source-layer' in l && l['source-layer'] === 'transportation' && 'source' in l);
    this.transport = layer && 'source' in layer && typeof layer.source === 'string' ? { id: layer.source, layer: 'transportation' } : this.map.getSource('demo-tracks') ? { id: 'demo-tracks' } : null;
    return this.transport;
  }

  private getNet = (kind: TrackKind): TrackNetwork | null => {
    if (!this.ready || this.map.getZoom() < 13) return null;
    const c = this.nets.get(kind), now = Date.now();
    if (c && (c.version === this.netVersion || now - c.at < 1500)) return c.net;
    const net = this.buildNet(kind);
    this.nets.set(kind, { net, at: now, version: this.netVersion });
    return net;
  };

  private buildNet(kind: TrackKind): TrackNetwork | null {
    const src = this.transportSource();
    if (!src) return null;
    let feats: ReturnType<MlMap['querySourceFeatures']>;
    try { feats = this.map.querySourceFeatures(src.id, src.layer ? { sourceLayer: src.layer } : undefined); } catch { return null; }
    const lines: LngLat[][] = [];
    for (const f of feats) {
      const p = f.properties ?? {};
      const sub = String(p.subclass ?? ''), cls = String(p.class ?? '');
      const ok = kind === 'tram' ? sub === 'tram' : kind === 'subway' ? sub === 'subway' : kind === 'rail' ? RAIL_SUBCLASSES.has(sub) || (cls === 'rail' && !sub) : ROAD_CLASSES.has(cls);
      if (!ok) continue;
      const g = f.geometry;
      if (g.type === 'LineString') lines.push(g.coordinates.map((c) => ({ lng: c[0]!, lat: c[1]! })));
      else if (g.type === 'MultiLineString') for (const part of g.coordinates) lines.push(part.map((c) => ({ lng: c[0]!, lat: c[1]! })));
    }
    return lines.length ? new TrackNetwork(lines, this.map.getCenter().lat) : null;
  }

  private resnapVisible() {
    if (!this.ready || this.map.getZoom() < 13) return;
    this.follower.resnap(Date.now(), this.getNet);
  }

  private lengthFor(mode: Mode): number {
    if (this.settings.vehicleStyle === 'models' && hasVehicleModel(mode)) return VEHICLE_DIMENSIONS[mode].length;
    const a = mapAssetFor(mode);
    return a?.physical?.lengthM ?? DEFAULT_SHAPES[mode].lengthM;
  }

  private shapeFor(v: VehicleState, asset: VehicleAsset | null, stale: boolean, sel: boolean, detail: boolean): VehicleShape {
    const d = DEFAULT_SHAPES[v.route.mode];
    return {
      id: v.id, mode: v.route.mode, lengthM: asset?.physical?.lengthM ?? d.lengthM, widthM: asset?.physical?.widthM ?? d.widthM,
      pieces: asset?.pieces?.map((p) => ({ fromFront: p.fromFront, toFront: p.toFront })) ?? d.pieces,
      bidirectional: v.route.mode === 'train' ? true : d.bidirectional, stale, selected: sel, detail,
    };
  }

  // ---------- data a vykreslení ----------
  /** Nová dávka dat ze serveru: oddělená od animace, React se nepřekresluje. */
  ingest(list: VehicleState[], receivedAt: number) {
    this.vehicles = new Map(list.map((v) => [v.id, v]));
    this.follower.update(list, receivedAt, Date.now(), this.getNet);
    if (this.selectedId && !this.vehicles.has(this.selectedId)) { this.selectedId = null; this.applySelectionFilter(); this.setFollow(false); this.events.onSelect(null, 'expired'); }
    this.pushOverview();
    this.emitSelected();
    this.lastPush = 0;
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

  private kick() { if (!this.raf && !this.destroyed) this.raf = requestAnimationFrame(this.frame); }

  private frame = () => {
    this.raf = 0;
    if (!this.ready || this.destroyed) return;
    const now = Date.now();
    const z = this.map.getZoom();
    const animating = this.follower.animator.isAnimating(now);
    const minGap = this.settings.reducedMotion ? 1000 : 33;
    if (z >= LIVE_ZOOM - 0.3 && now - this.lastPush >= minGap) { this.pushLive(now); this.lastPush = now; }
    const following = this.follow && this.selectedId ? this.followStep(now) : false;
    if (now - this.lastSelEmit > 1000) this.emitSelected();
    if (animating || following) this.raf = requestAnimationFrame(this.frame);
  };

  private pushLive(now: number) {
    const b = this.map.getBounds();
    const padLng = (b.getEast() - b.getWest()) * 0.25, padLat = (b.getNorth() - b.getSouth()) * 0.25;
    const zoom = this.map.getZoom(), mapBearing = this.map.getBearing(), pitch = this.map.getPitch();
    const mpp = metersPerPixel(this.map.getCenter().lat, zoom);
    const pitchK = Math.cos(pitch * D2R);
    const style = this.settings.vehicleStyle;
    const want3d = style === 'sprites' && this.pitchedMode && zoom >= MODEL_ZOOM && now - this.last3d >= (this.settings.reducedMotion ? 1000 : 90);
    const models: ModelVehicle[] = [];
    const center = this.map.getCenter();
    const live: Feature[] = [], pieces: Feature[] = [], solids: Feature[] = [];
    const visible: { id: string; d: number }[] = [];
    for (const [id, v] of this.vehicles) {
      if (!this.modes.has(v.route.mode)) continue;
      if (v.lon < b.getWest() - padLng || v.lon > b.getEast() + padLng || v.lat < b.getSouth() - padLat || v.lat > b.getNorth() + padLat) continue;
      visible.push({ id, d: (v.lon - center.lng) ** 2 + (v.lat - center.lat) ** 2 });
    }
    visible.sort((a, c) => a.d - c.d);
    visible.forEach(({ id }, rank) => {
      const v = this.vehicles.get(id)!;
      const s = this.follower.sample(id, now);
      if (!s) return;
      const fresh = this.freshness(v, now);
      if (fresh === 'expired' && id !== this.selectedId) return;
      const sel = id === this.selectedId;
      const stale = fresh !== 'live';
      const asset = this.settings.vehicleStyle === 'sprites' ? mapAssetFor(v.route.mode) : null;
      const len = polyLength(s.body);
      const mid = s.body.length >= 2 && len > 0.5 ? pointAlong(s.body, len / 2).p : s.front;
      const hasBody = s.bearing !== null && len > 0.5;
      const sprite = Boolean(asset && hasBody && asset.pieces?.length && this.map.hasImage(`${asset.id}#0`));
      const mode = v.route.mode;
      const model = style === 'models' && hasBody && zoom >= MODEL3D_ZOOM && hasVehicleModel(mode);
      if (model && hasVehicleModel(mode)) {
        const b = s.body;
        const heading = len > 1 ? bearingDeg(b[0]!, b[b.length - 1]!) : (s.bearing as number);
        models.push({ id, mode, lng: mid.lng, lat: mid.lat, bearing: heading, stale });
      }
      const shape = this.shapeFor(v, asset, stale, sel, rank < DETAIL_3D_MAX);
      const state = sel ? 'selected' : stale ? 'stale' : 'live';
      let off = zoom < SPRITE_ZOOM ? 9 : 15;
      if (hasBody && zoom >= SPRITE_ZOOM) {
        const dims = model && hasVehicleModel(mode) ? VEHICLE_DIMENSIONS[mode] : null;
        const L = dims?.length ?? shape.lengthM, W = dims?.width ?? shape.widthM, H = dims?.height ?? 3.6;
        const f = dims ? Math.min(340, Math.max(44, L / mpp)) / (L / mpp) : 1;
        const lenPx = (L / mpp) * f, widPx = (W / mpp) * f;
        const th = ((s.bearing as number) - mapBearing) * D2R;
        off = (Math.abs(Math.cos(th)) * lenPx * pitchK + Math.abs(Math.sin(th)) * widPx) / 2 + 7 + (model || this.pitchedMode ? ((H / mpp) * f) * Math.sin(pitch * D2R) : 0);
        off = Math.min(off, 320);
      }
      live.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [mid.lng, mid.lat] }, properties: {
        id, mode: v.route.mode, sprite: sprite || model, has3d: style === 'sprites' && HAS_3D.has(v.route.mode) && hasBody, fresh: stale ? 'stale' : 'live',
        badge: `b|${v.route.mode}|${safe(v.route.shortName)}|${state}`, sort: sel ? 1000 : stale ? 1 : 10, off: [0, -Math.round(off)],
      } });
      if (sprite && asset && !this.pitchedMode && zoom >= SPRITE_ZOOM) pieces.push(...buildPieces(s.body, shape, asset.id, { fresh: stale ? 'stale' : 'live', sort: sel ? 1000 : 10 }));
      if (want3d && hasBody && HAS_3D.has(v.route.mode)) solids.push(...buildExtrusions(s.body, shape));
    });
    (this.map.getSource(LIVE) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: live });
    this.modelLayer.setVehicles(style === 'models' ? models : []);
    if (!this.pitchedMode || zoom < SPRITE_ZOOM) (this.map.getSource(PIECES) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: pieces });
    if (want3d) { (this.map.getSource(V3D) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: solids }); this.last3d = now; }
  }

  /** Kamera plynule drží vybrané vozidlo; true = ještě se pohybuje (jinak smyčka usne do dalších dat). */
  private followStep(now: number): boolean {
    const s = this.selectedId ? this.follower.sample(this.selectedId, now) : null;
    if (!s) return false;
    if (this.map.isMoving()) return true;
    const len = polyLength(s.body);
    const t = s.body.length >= 2 && len > 0.5 ? pointAlong(s.body, len / 2).p : s.front;
    const c = this.map.getCenter();
    const a = this.map.project([t.lng, t.lat]), b = this.map.project([c.lng, c.lat]);
    if (Math.hypot(a.x - b.x, a.y - b.y) < 0.75) return false;
    const k = this.settings.reducedMotion ? 1 : 0.12;
    this.map.jumpTo({ center: [c.lng + (t.lng - c.lng) * k, c.lat + (t.lat - c.lat) * k] });
    return true;
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

  /** Při otáčení a naklápění se přepočítá posun štítků a přepne 2D sprity ↔ 3D vozidla. */
  private onViewChange() {
    const b = this.map.getBearing(), p = this.map.getPitch();
    if (Math.abs(b - this.viewAngles.bearing) > 1 || Math.abs(p - this.viewAngles.pitch) > 1) { this.viewAngles = { bearing: b, pitch: p }; this.applyPitchMode(false); this.kick(); }
  }

  private applyPitchMode(force: boolean) {
    if (!this.ready) return;
    const pitched = this.map.getPitch() >= PITCH_3D;
    if (pitched === this.pitchedMode && !force) return;
    this.pitchedMode = pitched;
    this.map.setLayoutProperty('dop-3d', 'visibility', pitched ? 'visible' : 'none');
    this.map.setLayoutProperty('dop-pieces', 'visibility', pitched ? 'none' : 'visible');
    this.map.setFilter('dop-marker', (pitched ? ['all', ['==', ['get', 'sprite'], false], ['==', ['get', 'has3d'], false]] : ['==', ['get', 'sprite'], false]) as FilterSpecification);
    this.last3d = 0;
    this.lastPush = 0;
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
      const s = this.follower.sample(v.id, Date.now());
      const p = s?.front ?? { lng: v.lon, lat: v.lat };
      this.map.easeTo({ center: [p.lng, p.lat], zoom: Math.max(this.map.getZoom(), opts.follow ? 17.8 : 16.6), pitch: opts.follow ? Math.max(this.map.getPitch(), 55) : this.map.getPitch(), duration: this.settings.reducedMotion ? 0 : 1100 });
    }
    this.setFollow(Boolean(v && opts.follow));
    this.lastPush = 0;
    this.last3d = 0;
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
    const layers = ['dop-3d', 'dop-pieces', 'dop-marker', 'dop-dot', 'dop-badge', 'dop-ov-cluster', 'dop-ov-dot', 'dop-stops-dot'].filter((l) => this.map.getLayer(l));
    const feats = this.map.queryRenderedFeatures([[x - r, y - r], [x + r, y + r]], { layers });
    let best: MapGeoJSONFeature | null = null, bestD = Infinity;
    for (const f of feats) {
      let px: { x: number; y: number };
      if (f.geometry.type === 'Point') px = this.map.project(f.geometry.coordinates as [number, number]);
      else if (f.layer.id === 'dop-3d') px = { x, y };
      else continue;
      const prio = f.layer.id.startsWith('dop-stops') ? 400 : f.layer.id === 'dop-ov-cluster' ? 200 : 0;
      const dist = Math.hypot(px.x - x, px.y - y) + prio;
      if (dist < bestD) { bestD = dist; best = f; }
    }
    return best;
  }

  private hover(x: number, y: number) {
    if (this.coarse) return;
    const onModel = this.settings.vehicleStyle === 'models' && this.modelLayer.pick(x, y, 10) !== null;
    this.map.getCanvas().style.cursor = onModel || this.pick(x, y) ? 'pointer' : '';
  }

  private async handleClick(x: number, y: number) {
    if (this.settings.vehicleStyle === 'models') {
      const hit = this.modelLayer.pick(x, y, this.coarse ? 26 : 14);
      if (hit) { this.events.onStop(null); this.select(hit); return; }
    }
    const f = this.pick(x, y);
    if (!f) { if (this.selectedId) this.select(null); this.events.onStop(null); return; }
    if (f.layer.id === 'dop-ov-cluster') {
      const src = this.map.getSource(OV) as GeoJSONSource;
      const zoom = await src.getClusterExpansionZoom(Number(f.properties?.cluster_id));
      this.map.easeTo({ center: (f.geometry as unknown as { coordinates: [number, number] }).coordinates, zoom: Math.min(zoom + 0.5, 17), duration: this.settings.reducedMotion ? 0 : 600 });
      return;
    }
    if (f.layer.id === 'dop-stops-dot') {
      const raw = f.properties?.json;
      if (typeof raw === 'string') { this.select(null); this.events.onStop(JSON.parse(raw) as StopPoint); }
      return;
    }
    const id = String(f.properties?.vid ?? f.properties?.id ?? '');
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

  setModes(modes: Mode[]) { this.modes = new Set(modes); this.pushOverview(); this.lastPush = 0; this.last3d = 0; this.kick(); }

  setSettings(s: MapSettings) {
    const prev = this.settings;
    this.settings = s;
    this.follower.animator.setReducedMotion(s.reducedMotion);
    if (!this.ready) return;
    this.modelLayer.setEnabled(s.vehicleStyle === 'models');
    if (prev.vehicleStyle !== s.vehicleStyle) {
      for (const id of [PIECES, V3D]) (this.map.getSource(id) as GeoJSONSource | undefined)?.setData(EMPTY);
      this.applyPitchMode(true);
    }
    if (prev.buildings3d !== s.buildings3d) this.applyBuildings();
    if (prev.showStops !== s.showStops) for (const l of ['dop-stops-dot', 'dop-stops-label']) if (this.map.getLayer(l)) this.map.setLayoutProperty(l, 'visibility', s.showStops ? 'visible' : 'none');
    if (s.showStops) this.scheduleStops();
    this.lastPush = 0;
    this.last3d = 0;
    this.kick();
  }

  private applyBuildings() {
    for (const l of this.map.getStyle().layers ?? []) if (l.type === 'fill-extrusion' && (!l.id.startsWith('dop-') || l.id === 'dop-roofs')) this.map.setLayoutProperty(l.id, 'visibility', this.settings.buildings3d ? 'visible' : 'none');
  }

  /**
   * Barevné 3D budovy: barva z OSM (building:colour / materiál), jinak pražská paleta fasád,
   * výškové budovy sklo; samostatná vrstva střech (tašky / plech), světlo a obloha pro naklonění.
   */
  private styleBuildings() {
    const layers = this.map.getStyle().layers ?? [];
    const h: ExpressionSpecification = ['to-number', ['get', 'render_height'], 0];
    const hash = ['abs', ['+', ['to-number', ['id'], 0], ['round', ['*', h, 7]], ['round', ['*', ['to-number', ['get', 'render_min_height'], 0], 3]]]];
    const pick = (list: string[]) => ['match', ['%', hash, list.length], ...list.slice(0, -1).flatMap((c, i) => [i, c]), list[list.length - 1]];
    const facade = ['coalesce', ['get', 'colour'], ['case', ['>', h, 45], pick(GLASS_PALETTE), pick(FACADE_PALETTE)]] as unknown as ExpressionSpecification;
    const roof = ['case', ['>', h, 30], pick(ROOF_PALETTE.slice(3)), pick(ROOF_PALETTE)] as unknown as ExpressionSpecification;
    layers.forEach((l, i) => {
      if (l.type !== 'fill-extrusion' || l.id.startsWith('dop-') || !('source-layer' in l) || l['source-layer'] !== 'building') return;
      try {
        this.map.setPaintProperty(l.id, 'fill-extrusion-color', facade);
        this.map.setPaintProperty(l.id, 'fill-extrusion-opacity', 1);
        this.map.setPaintProperty(l.id, 'fill-extrusion-vertical-gradient', true);
        if (!this.map.getLayer('dop-roofs')) {
          const before = layers.slice(i + 1).find((x) => this.map.getLayer(x.id))?.id;
          this.map.addLayer({ id: 'dop-roofs', type: 'fill-extrusion', source: l.source, 'source-layer': 'building', minzoom: l.minzoom ?? 14,
            ...(l.filter ? { filter: l.filter } : {}),
            paint: { 'fill-extrusion-color': roof, 'fill-extrusion-base': h, 'fill-extrusion-height': ['+', h, 0.6], 'fill-extrusion-opacity': 1 } } as LayerSpecification, before);
        }
      } catch { /* jiný styl bez atributů OpenMapTiles */ }
    });
    try { this.map.setLight({ anchor: 'map', position: [1.4, 210, 40], color: '#ffffff', intensity: 0.42 }); } catch { /* volitelné */ }
    try { this.map.setSky({ 'sky-color': '#BCD8F5', 'horizon-color': '#EAF1F7', 'fog-color': '#EEF2F5', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.9 }); } catch { /* volitelné */ }
  }

  modelDiagnostics() { return this.modelLayer.diagnostics(); }

  zoomBy(delta: number) { this.map.easeTo({ zoom: this.map.getZoom() + delta, duration: this.settings.reducedMotion ? 0 : 300 }); }
  resetNorth() { this.map.easeTo({ bearing: 0, duration: this.settings.reducedMotion ? 0 : 500 }); }
  setPitched(on: boolean) { this.map.easeTo({ pitch: on ? 58 : 0, zoom: on ? Math.max(this.map.getZoom(), 16) : this.map.getZoom(), duration: this.settings.reducedMotion ? 0 : 800 }); }
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
    return out.sort((a, c) => a.v.route.shortName.localeCompare(c.v.route.shortName, 'cs', { numeric: true }));
  }

  isOnTrack(id: string): boolean { return this.follower.isOnTrack(id); }

  /** Pro testy a diagnostiku: kolik vozidel je právě navázaných na trať. */
  trackStats() { let on = 0, all = 0; for (const id of this.vehicles.keys()) { all++; if (this.follower.isOnTrack(id)) on++; } return { on, all }; }

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
