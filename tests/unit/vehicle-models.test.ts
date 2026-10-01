import { describe, expect, it } from 'vitest';
import { Box3, Matrix4, Vector3 } from 'three';
import { buildVehicleModel } from '@/map/vehicle-models';
import { VEHICLE_DIMENSIONS, modelRotationY, vehicleModelScale } from '@/map/vehicle-presentation';

describe('skutečná geometrie vozidel', () => {
  for (const mode of ['tram', 'train', 'metro', 'bus', 'trolleybus'] as const) {
    it(`${mode}: prostorový objem, konečné vrcholy, sloučené materiály`, () => {
      const model = buildVehicleModel(mode);
      const bounds = new Box3();
      for (const { geometry } of model.parts) {
        geometry.computeBoundingBox(); bounds.union(geometry.boundingBox!);
        for (const p of geometry.attributes.position!.array) expect(Number.isFinite(p)).toBe(true);
      }
      const size = bounds.getSize(new Vector3());
      expect(size.x).toBeGreaterThan(VEHICLE_DIMENSIONS[mode].width);
      expect(size.y).toBeGreaterThan(2.5); // a flat PNG plane would fail
      expect(size.z).toBeGreaterThanOrEqual(VEHICLE_DIMENSIONS[mode].length);
      expect(model.parts.length).toBeLessThanOrEqual(8); // batched per material, not hundreds of meshes
      model.dispose();
    });
  }
  it('příď míří S/V/J/Z v geografických osách; úhel mapy není součástí směru vozidla', () => {
    for (const [heading, expected] of [[0, [0, 0, -1]], [90, [1, 0, 0]], [180, [0, 0, 1]], [270, [-1, 0, 0]]] as const) {
      const front = new Vector3(0, 0, -1).applyMatrix4(new Matrix4().makeRotationY(modelRotationY(heading)));
      expect(front.x).toBeCloseTo(expected[0]); expect(front.y).toBeCloseTo(expected[1]); expect(front.z).toBeCloseTo(expected[2]);
    }
  });
  it('modely mají při každém přiblížení skutečnou velikost (bez zvětšování při oddálení)', () => {
    for (const z of [15.5, 17, 19, 21]) expect(vehicleModelScale('tram', 50.08, z)).toBe(1);
  });
});
