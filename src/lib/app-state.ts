'use client';
import type { PositionFreshness } from '@/domain/freshness';
import { MODES, type Mode, type SourceMeta, type StopPoint, type VehicleState } from '@/domain/model';
import type { MapController } from '@/map/controller';
import { createStore } from './store';

export interface AppState {
  mapReady: boolean;
  mapFailed: boolean;
  basemap: 'loading' | 'ok' | 'fallback';
  selected: VehicleState | null;
  selectedFreshness: PositionFreshness;
  follow: boolean;
  stop: StopPoint | null;
  modes: Mode[];
  feedMeta: SourceMeta | null;
  feedError: string | null;
  feedOffline: boolean;
  feedReceivedAt: number | null;
  feedCount: number;
  bearing: number;
  pitched: boolean;
  zoom: number;
  viewKey: string;
  locate: 'idle' | 'locating' | 'ok' | 'denied' | 'unavailable';
  listOpen: boolean;
  announce: string;
}

export const appStore = createStore<AppState>({
  mapReady: false, mapFailed: false, basemap: 'loading', selected: null, selectedFreshness: 'unknown', follow: false, stop: null,
  modes: [...MODES], feedMeta: null, feedError: null, feedOffline: false, feedReceivedAt: null, feedCount: 0,
  bearing: 0, pitched: false, zoom: 13, viewKey: '', locate: 'idle', listOpen: false, announce: '',
});

/** Přístup k imperativnímu ovladači mapy mimo React strom (bez překreslování při pohybu vozidel). */
/** Poslední přijatá vozidla – pro textový seznam, i když mapu nelze vykreslit. */
export const latestVehicles: { list: VehicleState[] } = { list: [] };

export const mapApi: { controller: MapController | null } = { controller: null };
