import { MercatorCoordinate, type Map as MlMap, type CustomLayerInterface, type CustomRenderMethodInput } from 'maplibre-gl';
import { Camera, Color, DirectionalLight, DynamicDrawUsage, HemisphereLight, InstancedMesh, Matrix4, Object3D, Scene, Vector3, WebGLRenderer } from 'three';
import { buildVehicleModel, type VehicleModel } from './vehicle-models';
import { MODEL_ZOOM, VEHICLE_DIMENSIONS, modelRotationY, vehicleModelScale, type ModelMode } from './vehicle-presentation';

export interface ModelVehicle { id: string; mode: ModelMode; lng: number; lat: number; bearing: number; stale: boolean }
interface Batch { model: VehicleModel; meshes: InstancedMesh[]; capacity: number }

/** One shared MapLibre WebGL context; geometry/materials shared through instancing per category. */
export class VehicleLayer implements CustomLayerInterface {
  readonly id = 'dop-vehicles-3d';
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;
  private map: MlMap | null = null;
  private renderer: WebGLRenderer | null = null;
  private scene = new Scene();
  private camera = new Camera();
  private batches = new Map<ModelMode, Batch>();
  private vehicles: ModelVehicle[] = [];
  private origin = MercatorCoordinate.fromLngLat([14.4205, 50.0815]);
  private transform = new Matrix4();
  private object = new Object3D();
  private dirty = true;
  private lastZoom = NaN;
  enabled = true;
  private tintLive = new Color(0xffffff);
  private tintStale = new Color(0x8c93a2);

  onAdd(map: MlMap, gl: WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.scene.add(new HemisphereLight(0xe6f1ff, 0x6b586e, 2.1));
    const sun = new DirectionalLight(0xfff3dd, 2.3);
    sun.position.set(-80, 120, -50); this.scene.add(sun);
    const fill = new DirectionalLight(0xc0d6ff, 0.9);
    fill.position.set(70, 50, 90); this.scene.add(fill);
    this.dirty = true;
  }

  setVehicles(vehicles: ModelVehicle[]) {
    this.vehicles = vehicles.filter((v) => Number.isFinite(v.lng) && Number.isFinite(v.lat) && Number.isFinite(v.bearing));
    this.dirty = true;
    this.map?.triggerRepaint();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) for (const b of this.batches.values()) for (const mesh of b.meshes) mesh.count = 0;
    this.dirty = true;
    this.map?.triggerRepaint();
  }

  private batch(mode: ModelMode, count: number): Batch {
    const existing = this.batches.get(mode);
    if (existing && existing.capacity >= count) return existing;
    const model = existing?.model ?? buildVehicleModel(mode);
    if (existing) for (const mesh of existing.meshes) { this.scene.remove(mesh); mesh.dispose(); }
    const capacity = Math.max(16, 2 ** Math.ceil(Math.log2(Math.max(1, count))));
    const meshes = model.parts.map(({ geometry, material }, i) => {
      const mesh = new InstancedMesh(geometry, material, capacity);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false; // Mercator matrix lives in projectionMatrix; controller culls the viewport.
      mesh.renderOrder = i === 0 ? -1 : 0;
      mesh.count = 0;
      this.scene.add(mesh);
      return mesh;
    });
    const next = { model, meshes, capacity };
    this.batches.set(mode, next);
    return next;
  }

  private updateInstances(zoom: number) {
    if (!this.map) return;
    const centre = this.map.getCenter();
    this.origin = MercatorCoordinate.fromLngLat(centre);
    const unit = this.origin.meterInMercatorCoordinateUnits();
    const byMode = new Map<ModelMode, ModelVehicle[]>();
    for (const v of this.vehicles) {
      const group = byMode.get(v.mode) ?? []; group.push(v); byMode.set(v.mode, group);
    }
    for (const b of this.batches.values()) for (const mesh of b.meshes) mesh.count = 0;
    for (const [mode, list] of byMode) {
      const b = this.batch(mode, list.length);
      for (let i = 0; i < list.length; i++) {
        const v = list[i]!;
        const p = MercatorCoordinate.fromLngLat([v.lng, v.lat]);
        const scale = vehicleModelScale(mode, v.lat, zoom) * p.meterInMercatorCoordinateUnits() / unit;
        this.object.position.set((p.x - this.origin.x) / unit, 0, (p.y - this.origin.y) / unit);
        this.object.rotation.set(0, modelRotationY(v.bearing), 0);
        this.object.scale.setScalar(scale); this.object.updateMatrix();
        for (const mesh of b.meshes) {
          mesh.setMatrixAt(i, this.object.matrix);
          mesh.setColorAt(i, v.stale ? this.tintStale : this.tintLive);
        }
      }
      for (const mesh of b.meshes) { mesh.count = list.length; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
    }
    // Three: X east, Y up, Z south -> Mercator: X east, Y south, Z up.
    this.transform.set(unit, 0, 0, this.origin.x, 0, 0, unit, this.origin.y, 0, unit, 0, 0, 0, 0, 0, 1);
    this.lastZoom = zoom;
    this.dirty = false;
  }

  render(_gl: WebGL2RenderingContext, args: CustomRenderMethodInput) {
    if (!this.map || !this.renderer || !this.enabled || this.map.getZoom() < MODEL_ZOOM) return;
    try {
      if (this.dirty || this.map.getZoom() !== this.lastZoom) this.updateInstances(this.map.getZoom());
      if (!this.vehicles.length) return;
      this.camera.projectionMatrix.fromArray(args.defaultProjectionData.mainMatrix).multiply(this.transform);
      this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
      this.renderer.resetState();
    } catch (e) {
      this.dirty = false;
      console.warn('3D vozidla: vykreslení selhalo', e);
    }
    // No perpetual triggerRepaint loop: the controller repaints only when data/camera changes.
  }

  /** Ray / oriented model bounds, including roof and nose: a hit anywhere selects the vehicle. */
  pick(x: number, y: number, radius: number): string | null {
    if (!this.map || !this.enabled || this.map.getZoom() < MODEL_ZOOM || !this.vehicles.length) return null;
    const { width, height } = this.map.getCanvas().getBoundingClientRect();
    if (!width || !height) return null;
    const start = new Vector3(x / width * 2 - 1, 1 - y / height * 2, -1).applyMatrix4(this.camera.projectionMatrixInverse);
    const end = new Vector3(x / width * 2 - 1, 1 - y / height * 2, 1).applyMatrix4(this.camera.projectionMatrixInverse);
    const unit = this.origin.meterInMercatorCoordinateUnits();
    let best: string | null = null, bestT = Infinity;
    for (const v of this.vehicles) {
      const p = MercatorCoordinate.fromLngLat([v.lng, v.lat]);
      const spec = VEHICLE_DIMENSIONS[v.mode];
      const scale = vehicleModelScale(v.mode, v.lat, this.map.getZoom()) * p.meterInMercatorCoordinateUnits() / unit;
      this.object.position.set((p.x - this.origin.x) / unit, 0, (p.y - this.origin.y) / unit);
      this.object.rotation.set(0, modelRotationY(v.bearing), 0); this.object.scale.setScalar(scale); this.object.updateMatrix();
      const inv = this.object.matrix.clone().invert();
      const a = start.clone().applyMatrix4(inv), dir = end.clone().applyMatrix4(inv).sub(a);
      const margin = Math.min(2.5, radius * 0.1);
      const mins = [-spec.width / 2 - margin, 0, -spec.length / 2 - margin];
      const maxs = [spec.width / 2 + margin, spec.height + 1.3, spec.length / 2 + margin];
      let low = 0, high = 1;
      for (let axis = 0; axis < 3; axis++) {
        const pos = a.getComponent(axis), d = dir.getComponent(axis);
        if (Math.abs(d) < 1e-10) { if (pos < mins[axis]! || pos > maxs[axis]!) { high = -1; break; } continue; }
        const t0 = (mins[axis]! - pos) / d, t1 = (maxs[axis]! - pos) / d;
        low = Math.max(low, Math.min(t0, t1)); high = Math.min(high, Math.max(t0, t1));
      }
      if (low <= high && low < bestT) { bestT = low; best = v.id; }
    }
    return best;
  }

  /** Read-only diagnostics for the demo harness and regression tests. */
  diagnostics() {
    const active = this.enabled && (this.map?.getZoom() ?? 0) >= MODEL_ZOOM && this.vehicles.length > 0;
    return { enabled: this.enabled, vehicles: this.vehicles.length, instances: active ? [...this.batches.values()].reduce((n, b) => n + (b.meshes[1]?.count ?? 0), 0) : 0,
      meshes: [...this.batches.values()].reduce((n, b) => n + b.meshes.length, 0), drawCalls: active ? this.renderer?.info.render.calls ?? 0 : 0 };
  }

  onRemove() {
    for (const b of this.batches.values()) { b.meshes.forEach((m) => m.dispose()); b.model.dispose(); }
    this.batches.clear(); this.scene.clear(); this.renderer?.dispose(); this.renderer = null; this.map = null;
  }
}
