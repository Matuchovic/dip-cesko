import type { Mode } from '@/domain/model';
import { metersPerPixel } from '@/domain/geo';

export type VehicleStyle = 'models' | 'sprites' | 'markers';
export type ModelMode = 'tram' | 'train' | 'metro' | 'bus' | 'trolleybus';
export interface VehicleDimensions { length: number; width: number; height: number; cars: number; accent: number }

/** Generic category illustrations, not a claim about the actual vehicle's make or dimensions. */
export const VEHICLE_DIMENSIONS: Record<ModelMode, VehicleDimensions> = {
  tram: { length: 32, width: 2.5, height: 3.4, cars: 5, accent: 0xd6203f },
  train: { length: 72, width: 3, height: 4.2, cars: 3, accent: 0x1466cf },
  metro: { length: 96, width: 2.9, height: 3.7, cars: 5, accent: 0x7142cb },
  bus: { length: 12, width: 2.55, height: 3.1, cars: 1, accent: 0x00a4bb },
  trolleybus: { length: 18, width: 2.55, height: 3.4, cars: 2, accent: 0x218747 },
};

export const MODEL_ZOOM = 15.5;
export function hasVehicleModel(mode: Mode): mode is ModelMode { return mode in VEHICLE_DIMENSIONS; }

/** Modest enlargement at street overview; actual metre scale at close zoom. No 560 px billboard. */
export function vehicleModelScale(_mode: ModelMode, _lat: number, _zoom: number): number {
  // Vždy skutečná velikost: model se při přibližování ani oddalování nemění vůči mapě.
  void [_mode, _lat, _zoom, metersPerPixel];
  return 1;
}

/** Model coordinates: X east, Y up, -Z north. Heading is clockwise from north. */
export const modelRotationY = (bearing: number) => -bearing * Math.PI / 180;
