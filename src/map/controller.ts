import { Map as MlMap, setWorkerUrl, type GeoJSONSource, type MapGeoJSONFeature, type ExpressionSpecification, type FilterSpecification, type LayerSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { classifyPositionAge, type PositionFreshness } from '@/domain/freshness';
import { MODES, type Mode, type StopPoint, type VehicleState } from '@/domain/model';
import { MODE_COLOR } from '@/domain/modes';
import { metersPerPixel } from '@/domain/geo';
import { manifest, mapAssetFor, spriteSizeStops, type VehicleAsset } from './assets';
import { badgeImage, clusterImage, donutImage, etaImage, headingImage, pillImage, stopLabelImage } from './images';
import { describeDelay } from '@/domain/delay';
import { TrackFollower } from './follower';
import { TrackNetwork, type TrackKind } from './tracks';
import { buildExtrusions, buildPieces, DEFAULT_SHAPES, type VehicleShape } from './vehicle3d';
import { bearingDeg, D2R, offsetM, pointAlong, polyLength, type LngLat } from './geometry';
import { ArticulatedLayer, ARTICULATED_ASSETS, roofHeight, type ArticulatedVehicle } from './articulated-layer';
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

const LIVE = 'dop-live', PIECES = 'dop-pieces', V3D = 'dop-3d', OV = 'dop-overview', STOPS = 'dop-stops', ME = 'dop-me', PULSE = 'dop-pulse', TRAIL = 'dop-trail', ROUTE = 'dop-route', ROUTE_STOPS = 'dop-route-stops';
const CLUSTER_MODES: Mode[] = ['tram', 'bus', 'metro', 'trolleybus', 'train', 'ferry', 'funicular', 'other'];
const DASH_STEPS: number[][] = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];
const SPRITE_ZOOM = 15.5, LIVE_ZOOM = 12.5, MODEL_ZOOM = 15, PITCH_3D = 20, DETAIL_3D_MAX = 90;
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
export const FALLBACK_STYLE_URL = '/map/offline-style.json';
/** Worker MapLibre servírovaný z /public (viz scripts/copy-maplibre-worker.mjs). */
const WORKER_URL = '/maplibre/maplibre-gl-worker.mjs';
const PRAGUE: [number, number] = [14.4205, 50.0815];
/** Světlé pastelové fasády a jemně cihlové střechy (vyladěno náhledem; tmavé a syté barvy působily levně). */
const FACADE_PALETTE = ['#F1E9DA', '#EADFC8', '#F0DDD3', '#E4E6E9', '#EDE4D3', '#F3EBCF', '#F5F1EA', '#E9E1D6'];
const ROOF_PALETTE = ['#DCC2B4', '#D6BBAC', '#D2C6BC', '#CFCAC4', '#D9B9A6'];
const HIDDEN_BASEMAP_LAYERS = ['poi_r7', 'poi_r20', 'poi_transit'];
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
  private artLayer = new ArticulatedLayer(manifest.assets);
  private vehicles = new Map<string, VehicleState>();
  private modes = new Set<Mode>(MODES);
  private selectedId: string | null = null;
  private follow = false;
  private raf = 0;
  private lastPush = 0;
  private lastLiveData = 0;
  private pulsesShown = false;
  private lastMeasured = new Map<string, string | null>();
  private pulses = new Map<string, number>();
  private history = new Map<string, { t: number; lng: number; lat: number }[]>();
  private route: { id: string; timer: ReturnType<typeof setInterval> | null; step: number; lastStep: number; hasData: boolean } | null = null;
  private warnedFrame = false;
  private liveDirty = true;
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
    if (!this.map.getLayer(this.artLayer.id)) this.map.addLayer(this.artLayer, 'dop-badge');
    this.modelLayer.setEnabled(this.settings.vehicleStyle === 'models');
    this.artLayer.setEnabled(this.settings.vehicleStyle === 'models');
    this.styleBuildings();
    this.addSubwayLines();
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
    // exponenciální interpolace (základ 2) = přesně skutečná velikost i mezi zastaveními zoomu
    const parts: unknown[] = ['interpolate', ['exponential', 2], ['zoom']];
    tr.forEach(([z, size], i) => parts.push(z, ['match', ['get', 'asset'], ...(train ? [train.id, tn[i]?.[1] ?? size] : []), size]));
    return parts as ExpressionSpecification;
  }

  private addLayers() {
    const m = this.map;
    for (const [id, cluster] of [[STOPS, false], [OV, true], [LIVE, false], [PIECES, false], [V3D, false], [ME, false], [PULSE, false], [TRAIL, false], [ROUTE, false], [ROUTE_STOPS, false]] as const) {
      if (!m.getSource(id)) m.addSource(id, cluster ? { type: 'geojson', data: EMPTY, cluster: true, clusterMaxZoom: 12, clusterRadius: 52,
        clusterProperties: Object.fromEntries(CLUSTER_MODES.map((md) => [md, ['+', ['case', ['==', ['get', 'mode'], md], 1, 0]]])) } : { type: 'geojson', data: EMPTY });
    }
    const layers: LayerSpecification[] = [
      { id: 'dop-stops-dot', type: 'circle', source: STOPS, minzoom: 14.5, layout: { visibility: this.settings.showStops ? 'visible' : 'none' },
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 14.5, 3, 18, 6.5], 'circle-color': '#FFFFFF', 'circle-stroke-color': modeColor, 'circle-stroke-width': 2.2, 'circle-pitch-alignment': 'map' } },
      { id: 'dop-stops-label', type: 'symbol', source: STOPS, minzoom: 16.8, layout: { visibility: this.settings.showStops ? 'visible' : 'none', 'icon-image': ['get', 'label'], 'icon-anchor': 'left', 'icon-offset': [7, 0], 'icon-allow-overlap': false, 'symbol-sort-key': ['get', 'rank'] } },
      { id: 'dop-me-acc', type: 'circle', source: ME, paint: { 'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 10, ['/', ['get', 'acc'], 120], 20, ['/', ['get', 'acc'], 0.12]], 'circle-color': '#2F7BFF', 'circle-opacity': 0.12, 'circle-pitch-alignment': 'map' } },
      { id: 'dop-me', type: 'circle', source: ME, paint: { 'circle-radius': 7, 'circle-color': '#2F7BFF', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3 } },
      { id: 'dop-ov-dot', type: 'circle', source: OV, maxzoom: LIVE_ZOOM, filter: ['!', ['has', 'point_count']],
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2.5, 12.5, 5], 'circle-color': modeColor, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 1.2, 'circle-opacity': freshOpacity, 'circle-stroke-opacity': freshOpacity } },
      { id: 'dop-ov-cluster', type: 'symbol', source: OV, maxzoom: LIVE_ZOOM, filter: ['has', 'point_count'], layout: { 'icon-image': ['concat', 'd', ...CLUSTER_MODES.flatMap((md) => ['|', ['to-string', ['get', md]]])] as unknown as ExpressionSpecification, 'icon-allow-overlap': true } },
      { id: 'dop-halo', type: 'circle', source: LIVE, minzoom: LIVE_ZOOM, filter: ['==', ['get', 'id'], ''],
        paint: { 'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 12.5, 14, 16, 26, 19, 110, 21, 380], 'circle-color': '#2F6FB5', 'circle-opacity': 0.14, 'circle-stroke-color': '#2F6FB5', 'circle-stroke-width': 2, 'circle-stroke-opacity': 0.55, 'circle-pitch-alignment': 'map' } },
      { id: ROUTE, type: 'line', source: ROUTE, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 5, 17, 10], 'line-opacity': 0.28 } },
      { id: 'dop-route-flow', type: 'line', source: ROUTE, layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2.5, 17, 4], 'line-opacity': 0.9, 'line-dasharray': [0, 4, 3] } },
      { id: 'dop-trail', type: 'line', source: TRAIL, minzoom: 14.6, layout: { 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-opacity': ['get', 'a'], 'line-width': ['get', 'w'] } },
      { id: 'dop-pulse', type: 'circle', source: PULSE, minzoom: LIVE_ZOOM, paint: { 'circle-radius': ['get', 'r'], 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': ['get', 'sw'], 'circle-stroke-opacity': ['get', 'a'], 'circle-pitch-alignment': 'map' } },
      { id: 'dop-dir', type: 'symbol', source: LIVE, minzoom: LIVE_ZOOM, maxzoom: SPRITE_ZOOM, filter: ['has', 'brg'],
        layout: { 'icon-image': ['concat', 'h|', ['get', 'mode']], 'icon-size': ['interpolate', ['linear'], ['zoom'], 12.5, 0.7, 15.5, 0.9], 'icon-rotate': ['get', 'brg'], 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true },
        paint: { 'icon-opacity': freshOpacity } },
      { id: 'dop-dot', type: 'symbol', source: LIVE, minzoom: LIVE_ZOOM, maxzoom: SPRITE_ZOOM,
        layout: { 'icon-image': ['get', 'pill'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 12.5, 0.72, 14, 0.9, 15.5, 1], 'icon-allow-overlap': true, 'icon-ignore-placement': true,
          'icon-rotation-alignment': 'viewport', 'icon-pitch-alignment': 'viewport', 'symbol-sort-key': ['get', 'sort'] },
        paint: { 'icon-opacity': freshOpacity } },
      { id: ROUTE_STOPS, type: 'symbol', source: ROUTE_STOPS, minzoom: 13.5, layout: { 'icon-image': ['get', 'chip'], 'icon-size': 1, 'icon-anchor': 'left', 'icon-offset': [14, 0], 'icon-allow-overlap': true, 'icon-ignore-placement': true } },
      { id: 'dop-marker', type: 'circle', source: LIVE, minzoom: SPRITE_ZOOM, filter: ['==', ['get', 'sprite'], false],
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 15.5, 8, 19, 12], 'circle-color': modeColor, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2.5, 'circle-opacity': freshOpacity, 'circle-pitch-alignment': 'map' } },
      { id: 'dop-pieces', type: 'symbol', source: PIECES, minzoom: SPRITE_ZOOM,
        layout: { 'icon-image': ['get', 'icon'], 'icon-size': this.spriteSizeExpr(), 'icon-rotate': ['get', 'rot'], 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map',
          'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-anchor': 'center', 'symbol-sort-key': ['get', 'sort'] },
        paint: { 'icon-opacity': freshOpacity } },
      { id: 'dop-3d', type: 'fill-extrusion', source: V3D, minzoom: MODEL_ZOOM, layout: { visibility: 'none' },
        paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-opacity': 1, 'fill-extrusion-vertical-gradient': true } },
      { id: 'dop-badge', type: 'symbol', source: LIVE, minzoom: SPRITE_ZOOM,
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
      else if (kind === 'p' && a && b !== undefined) { const [, , , tone, st] = id.split('|'); this.map.addImage(id, pillImage(b, a as Mode, tone ?? 'unknown', (st as 'live' | 'stale' | 'selected') ?? 'live'), { pixelRatio: 2 }); }
      else if (kind === 'h' && a) this.map.addImage(id, headingImage(a as Mode), { pixelRatio: 1 });
      else if (kind === 'd') { const parts = id.split('|').slice(1).map(Number); this.map.addImage(id, donutImage(Object.fromEntries(CLUSTER_MODES.map((md, i) => [md, parts[i] ?? 0]))), { pixelRatio: 2 }); }
      else if (kind === 'e' && a) { const [, name, eta, color] = id.split('|'); this.map.addImage(id, etaImage(name ?? '', eta ?? '', color ?? '#2F6FB5'), { pixelRatio: 2 }); }
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
    // síť se staví z načtených dlaždic jen v klidu (ne při každém posunu) – plynulost na mobilu
    if (c && (c.version === this.netVersion || now - c.at < 2500 || (this.map.isMoving() && c.net))) return c.net;
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
    if (this.settings.vehicleStyle === 'models' && hasVehicleModel(mode) && !this.articulatedAsset(mode)) return VEHICLE_DIMENSIONS[mode].length;
    const a = mapAssetFor(mode);
    return a?.physical?.lengthM ?? DEFAULT_SHAPES[mode].lengthM;
  }

  /** Tramvaj a vlak: 3D souprava z dodané grafiky (střecha z PNG shora), po částech podél koleje. */
  private articulatedAsset(mode: Mode): VehicleAsset | null {
    const a = mapAssetFor(mode);
    return a && ARTICULATED_ASSETS.includes(a.id) && a.pieces?.length && a.physical ? a : null;
  }

  private articulated(id: string, art: VehicleAsset, body: LngLat[], len: number, mid: LngLat, heading: number, mpp: number, stale: boolean): ArticulatedVehicle {
    const L = art.physical!.lengthM, W = art.physical!.widthM;
    // Skutečná velikost při každém přiblížení (žádné zvětšování při oddálení).
    const scale = 1;
    void mpp;
    let b = body;
    if (scale > 1.001 || len < L * 0.9) {
      const r = heading * D2R, half = (L * scale) / 2;
      b = [offsetM(mid, -Math.sin(r) * half, -Math.cos(r) * half), offsetM(mid, Math.sin(r) * half, Math.cos(r) * half)];
    }
    const bl = polyLength(b), Ls = L * scale;
    const at = (f: number) => pointAlong(b, Math.max(0, bl - f * Ls)).p;
    const pieces = art.pieces!;
    const sections = pieces.map((pc) => { const F = at(pc.fromFront), R = at(pc.toFront); return { lng: (F.lng + R.lng) / 2, lat: (F.lat + R.lat) / 2, bearing: bearingDeg(R, F) }; });
    const joints = pieces.slice(0, -1).map((pc) => { const P = at(pc.toFront), A = at(Math.max(0, pc.toFront - 0.02)), B = at(Math.min(1, pc.toFront + 0.02)); return { lng: P.lng, lat: P.lat, bearing: bearingDeg(B, A) }; });
    return { id, assetId: art.id, stale, scale, sections, joints, center: { lng: mid.lng, lat: mid.lat, bearing: heading }, length: L, width: W };
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
    this.vehicles = new Map(list.map((v) => [v.id, v])); this.liveDirty = true;
    const nowP = Date.now();
    for (const v of list) {
      const prev = this.lastMeasured.get(v.id);
      if (prev !== undefined && prev !== v.measuredAt) this.pulses.set(v.id, nowP);
      this.lastMeasured.set(v.id, v.measuredAt);
    }
    if (this.lastMeasured.size > list.length * 2 + 200) { const keep = new Set<string>(list.map((v) => v.id)); for (const k of [...this.lastMeasured.keys()]) if (!keep.has(k)) { this.lastMeasured.delete(k); this.history.delete(k); } }
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
    const animating = this.follower.animator.isAnimating(now) || this.follower.isMoving(now) || this.pulses.size > 0 || this.route?.hasData === true;
    if (this.route?.hasData && now - this.route.lastStep > 70 && this.map.getLayer('dop-route-flow')) {
      this.route.step = (this.route.step + 1) % DASH_STEPS.length; this.route.lastStep = now;
      this.map.setPaintProperty('dop-route-flow', 'line-dasharray', DASH_STEPS[this.route.step]);
    }
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
    const trails: Feature[] = [], pulses: Feature[] = [];
    const arts: ArticulatedVehicle[] = [];
    const center = this.map.getCenter();
    const live: Feature[] = [], pieces: Feature[] = [], solids: Feature[] = [];
    const visible: { id: string; d: number }[] = [];
    for (const [id, v] of this.vehicles) {
      if (!this.modes.has(v.route.mode)) continue;
      if (v.lon < b.getWest() - padLng || v.lon > b.getEast() + padLng || v.lat < b.getSouth() - padLat || v.lat > b.getNorth() + padLat) continue;
      visible.push({ id, d: (v.lon - center.lng) ** 2 + (v.lat - center.lat) ** 2 });
    }
    visible.sort((a, c) => a.d - c.d);
    visible.forEach(({ id }, rank) => { try {
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
      if (!Number.isFinite(mid.lng) || !Number.isFinite(mid.lat)) return;
      const hasBody = s.bearing !== null && len > 0.5;
      const sprite = Boolean(asset && hasBody && asset.pieces?.length && this.map.hasImage(`${asset.id}#0`));
      const mode = v.route.mode;
      const model = style === 'models' && hasBody && zoom >= MODEL3D_ZOOM && hasVehicleModel(mode);
      const art = model ? this.articulatedAsset(mode) : null;
      if (model && hasVehicleModel(mode)) {
        const b = s.body;
        const heading = len > 1 ? bearingDeg(b[0]!, b[b.length - 1]!) : (s.bearing as number);
        if (art) arts.push(this.articulated(id, art, b, len, mid, heading, mpp, stale));
        else models.push({ id, mode, lng: mid.lng, lat: mid.lat, bearing: heading, stale });
      }
      const shape = this.shapeFor(v, asset, stale, sel, rank < DETAIL_3D_MAX);
      const state = sel ? 'selected' : stale ? 'stale' : 'live';
      let off = zoom < SPRITE_ZOOM ? 9 : 15;
      if (hasBody && zoom >= SPRITE_ZOOM) {
        const dims = model && hasVehicleModel(mode) ? (art?.physical ? { length: art.physical.lengthM, width: art.physical.widthM, height: roofHeight(art.id) } : VEHICLE_DIMENSIONS[mode]) : null;
        const L = dims?.length ?? shape.lengthM, W = dims?.width ?? shape.widthM, H = dims?.height ?? 3.6;
        const f = 1;
        const lenPx = (L / mpp) * f, widPx = (W / mpp) * f;
        const th = ((s.bearing as number) - mapBearing) * D2R;
        off = (Math.abs(Math.cos(th)) * lenPx * pitchK + Math.abs(Math.sin(th)) * widPx) / 2 + 7 + (model || this.pitchedMode ? ((H / mpp) * f) * Math.sin(pitch * D2R) : 0);
        off = Math.min(off, 320);
      }
      const hist = this.history.get(id) ?? [];
      const lastH = hist[hist.length - 1];
      if (!lastH || (now - lastH.t > 110 && (Math.abs(lastH.lng - mid.lng) + Math.abs(lastH.lat - mid.lat)) > 4e-6)) { hist.push({ t: now, lng: mid.lng, lat: mid.lat }); while (hist.length > 26 || (hist[0] && now - hist[0].t > 3200)) hist.shift(); this.history.set(id, hist); }
      if (zoom >= 14.6 && hist.length > 2 && !this.settings.reducedMotion) for (let i = 1; i < hist.length; i++) {
        const k = i / hist.length;
        trails.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[hist[i - 1]!.lng, hist[i - 1]!.lat], [hist[i]!.lng, hist[i]!.lat]] }, properties: { color: MODE_COLOR[v.route.mode], a: Math.round(k * 55) / 100 * (stale ? 0.4 : 1), w: 1 + k * 5 } });
      }
      const pt = this.pulses.get(id);
      if (pt !== undefined && !this.settings.reducedMotion) {
        const k = (now - pt) / 1400;
        if (k >= 1) this.pulses.delete(id);
        else pulses.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [mid.lng, mid.lat] }, properties: { r: 9 + k * 26, a: Math.round((1 - k) * 60) / 100, sw: 2.5 * (1 - k) + 0.5, color: MODE_COLOR[v.route.mode] } });
      }
      live.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [mid.lng, mid.lat] }, properties: {
        id, mode: v.route.mode, sprite: sprite || model, has3d: style === 'sprites' && HAS_3D.has(v.route.mode) && hasBody, fresh: stale ? 'stale' : 'live',
        badge: `b|${v.route.mode}|${safe(v.route.shortName)}|${state}`, sort: sel ? 1000 : stale ? 1 : 10, off: [0, -Math.round(off)],
        pill: `p|${v.route.mode}|${safe(v.route.shortName)}|${stale ? 'unknown' : describeDelay(v.delay).tone === 'late' && v.delay.kind === 'known' && v.delay.seconds < 180 ? 'warn' : describeDelay(v.delay).tone}|${state}`,
        ...(s.bearing !== null ? { brg: Math.round(s.bearing) } : {}),
      } });
      if (sprite && asset && !this.pitchedMode && zoom >= SPRITE_ZOOM) pieces.push(...buildPieces(s.body, shape, asset.id, { fresh: stale ? 'stale' : 'live', sort: sel ? 1000 : 10 }));
      if (want3d && hasBody && HAS_3D.has(v.route.mode)) solids.push(...buildExtrusions(s.body, shape));
    } catch (e) { if (!this.warnedFrame) { this.warnedFrame = true; console.warn('Vozidlo nelze vykreslit', id, e); } } });
    // štítky a body: nejvýš 10× za sekundu (3D modely se posouvají v každém snímku) – méně práce pro mapu
    if (now - this.lastLiveData >= 100 || this.liveDirty) {
      (this.map.getSource(LIVE) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: live });
      (this.map.getSource(TRAIL) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: trails });
      this.lastLiveData = now; this.liveDirty = false;
    }
    if (pulses.length || this.pulsesShown) { (this.map.getSource(PULSE) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: pulses }); this.pulsesShown = pulses.length > 0; }
    this.modelLayer.setVehicles(style === 'models' ? models : []);
    this.artLayer.setVehicles(style === 'models' ? arts : []);
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

  /** Trasa vybraného vozu s tekoucí čárou a odpočty do dalších zastávek (z průběhu spoje, obnova po 30 s). */
  private async loadRoute(id: string) {
    try {
      const res = await fetch(`/api/trip?vehicle=${encodeURIComponent(id)}`);
      const body = res.ok ? (await res.json()) as { data: { mode: Mode; lastStopSeq: number | null; delay: { kind: string; seconds?: number }; stops: { seq: number; name: string; lat: number; lon: number; arrival: string | null; arrivalRt: string | null }[]; shape: [number, number][] } | null } : null;
      if (!this.route || this.route.id !== id || !body?.data) return;
      const d = body.data, color = MODE_COLOR[d.mode];
      const coords = d.shape.length >= 2 ? d.shape : d.stops.map((st) => [st.lon, st.lat] as [number, number]);
      (this.map.getSource(ROUTE) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { color } }] });
      const now = Date.now(), delay = d.delay.kind === 'known' ? (d.delay.seconds ?? 0) * 1000 : 0;
      const when = (raw: string | null, rt: boolean): number | null => {
        if (!raw) return null;
        if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(raw)) { const [h, m, sec] = raw.split(':').map(Number); const t = new Date(); t.setHours(h ?? 0, m ?? 0, sec ?? 0, 0); return t.getTime() + (rt ? 0 : delay); }
        const t = Date.parse(raw); return Number.isFinite(t) ? t + (rt ? 0 : delay) : null;
      };
      const chips = d.stops.filter((st) => d.lastStopSeq === null || st.seq > d.lastStopSeq).slice(0, 8).flatMap((st) => {
        const t = when(st.arrivalRt, true) ?? when(st.arrival, false);
        if (t === null) return [];
        const min = Math.round((t - now) / 60_000);
        const eta = min <= 0 ? '< 1 min' : `${min} min`;
        return [{ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [st.lon, st.lat] }, properties: { chip: `e|${st.name.replace(/\|/g, '/')}|${eta}|${color}` } }];
      });
      (this.map.getSource(ROUTE_STOPS) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: chips });
      this.route.hasData = true;
      this.kick();
    } catch { /* průběh spoje je doplněk – bez něj výběr funguje dál */ }
  }

  private clearRoute() {
    if (this.route?.timer) clearInterval(this.route.timer);
    this.route = null;
    for (const src of [ROUTE, ROUTE_STOPS]) (this.map.getSource(src) as GeoJSONSource | undefined)?.setData(EMPTY);
  }

  select(id: string | null, opts: { fly?: boolean; follow?: boolean } = {}) {
    if (this.route?.id !== id) {
      this.clearRoute();
      if (id && this.ready) { this.route = { id, timer: setInterval(() => void this.loadRoute(id), 30_000), step: 0, lastStep: 0, hasData: false }; void this.loadRoute(id); }
    }
    this.selectedId = id;
    this.liveDirty = true;
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
    const onModel = this.settings.vehicleStyle === 'models' && (this.artLayer.pick(x, y, 10) ?? this.modelLayer.pick(x, y, 10)) !== null;
    this.map.getCanvas().style.cursor = onModel || this.pick(x, y) ? 'pointer' : '';
  }

  private async handleClick(x: number, y: number) {
    if (this.settings.vehicleStyle === 'models') {
      const r = this.coarse ? 26 : 14;
      const hit = this.artLayer.pick(x, y, r) ?? this.modelLayer.pick(x, y, r);
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
      this.follower.setStops((body.data ?? []).map((p) => ({ lng: p.lon, lat: p.lat })));
      const features: Feature[] = (body.data ?? []).map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        properties: { mode: p.modes[0] ?? 'other', label: `s|${p.name.replace(/\|/g, '/')}|${p.platform ?? ''}`, rank: p.modes[0] === 'metro' ? 0 : p.modes[0] === 'train' ? 1 : 2, json: JSON.stringify(p) } }));
      (this.map.getSource(STOPS) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
    } catch { /* přerušeno nebo nedostupné */ }
  }

  setModes(modes: Mode[]) { this.modes = new Set(modes); this.liveDirty = true; this.pushOverview(); this.lastPush = 0; this.last3d = 0; this.kick(); }

  setSettings(s: MapSettings) {
    const prev = this.settings;
    this.settings = s;
    this.follower.animator.setReducedMotion(s.reducedMotion);
    if (!this.ready) return;
    this.modelLayer.setEnabled(s.vehicleStyle === 'models');
    this.artLayer.setEnabled(s.vehicleStyle === 'models');
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
    // Barvy z OSM (building:colour) se nepoužívají: vedly k černým a sytě modrým blokům.
    const facade = ['case', ['>', h, 40], '#DCE3EA', pick(FACADE_PALETTE)] as unknown as ExpressionSpecification;
    const roof = ['case', ['>', h, 40], '#D3D8DD', pick(ROOF_PALETTE)] as unknown as ExpressionSpecification;
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
            paint: { 'fill-extrusion-color': roof, 'fill-extrusion-base': h, 'fill-extrusion-height': ['+', h, 0.4], 'fill-extrusion-opacity': 1 } } as LayerSpecification, before);
        }
      } catch { /* jiný styl bez atributů OpenMapTiles */ }
    });
    try { this.map.setLight({ anchor: 'viewport', position: [1.15, 210, 30], color: '#ffffff', intensity: 0.25 }); } catch { /* volitelné */ }
    // Klidnější podklad: drobné body zájmu a duplicitní značky zastávek (máme vlastní) skrýt.
    for (const id of HIDDEN_BASEMAP_LAYERS) if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', 'none');
    try { this.map.setSky({ 'sky-color': '#BCD8F5', 'horizon-color': '#EAF1F7', 'fog-color': '#EEF2F5', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.9 }); } catch { /* volitelné */ }
  }

  /** Trasy metra z mapových dat (pod zemí, v podkladu jinak nejsou vidět) – soupravy metra jedou po nich. */
  private addSubwayLines() {
    const src = this.transportSource();
    if (!src?.layer || this.map.getLayer('dop-subway')) return;
    try {
      this.map.addLayer({ id: 'dop-subway', type: 'line', source: src.id, 'source-layer': src.layer, minzoom: 11, filter: ['==', ['get', 'subclass'], 'subway'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#2F6FB5', 'line-opacity': 0.5, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.2, 17, 4], 'line-dasharray': [2, 1.6] } } as LayerSpecification, 'dop-stops-dot');
    } catch { /* styl bez vrstvy transportation */ }
  }

  modelDiagnostics() {
    const m = this.modelLayer.diagnostics(), a = this.artLayer.diagnostics();
    return { ...m, instances: m.instances + a.instances, meshes: m.meshes + a.meshes, drawCalls: m.drawCalls + a.drawCalls };
  }

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
  /** Diagnostika: kolik vozidel jakého druhu tento prohlížeč právě dostal. */
  countsByMode(): Partial<Record<Mode, number>> { const out: Partial<Record<Mode, number>> = {}; for (const v of this.vehicles.values()) out[v.route.mode] = (out[v.route.mode] ?? 0) + 1; return out; }
  /** Kolik sekund od posledního měření je poloha dopočtená po trati (0 = přímo měření). */
  predictedSeconds(id: string): number { return this.follower.sample(id, Date.now())?.predictedS ?? 0; }

  /** Pro testy a diagnostiku: kolik vozidel je právě navázaných na trať. */
  trackStats() { let on = 0, all = 0; for (const id of this.vehicles.keys()) { all++; if (this.follower.isOnTrack(id)) on++; } return { on, all }; }

  resize() { this.map.resize(); }
  setViewPadding(p: { top: number; bottom: number; left: number; right: number }) { this.map.setPadding(p); }

  destroy() {
    this.destroyed = true;
    if (this.route?.timer) clearInterval(this.route.timer);
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.stopsTimer) clearTimeout(this.stopsTimer);
    if (this.loadTimer) clearTimeout(this.loadTimer);
    this.stopsAbort?.abort();
    this.map.remove();
  }
}
