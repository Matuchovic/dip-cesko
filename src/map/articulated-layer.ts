import { MercatorCoordinate, type CustomLayerInterface, type CustomRenderMethodInput, type Map as MlMap } from 'maplibre-gl';
import {
  AmbientLight, BoxGeometry, Camera, CanvasTexture, Color, DataTexture, DirectionalLight, DynamicDrawUsage, HemisphereLight, InstancedMesh, Matrix4,
  MeshStandardMaterial, Object3D, RGBAFormat, Scene, SRGBColorSpace, TextureLoader, Vector3, WebGLRenderer, type Texture,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { VehicleAsset } from './assets';

/** Vzhled podle dodaných ilustrací: bílá karoserie, černý pás oken, barevný spodek a čelo. */
interface Livery { base: number; roof: number; accent: string; glass: string; body: string; bidirectional: boolean }
const LIVERY: Record<string, Livery> = {
  'tram-top-redwhite': { base: 0.32, roof: 3.3, accent: '#C8102E', glass: '#14171C', body: '#F3F4F6', bidirectional: false },
  'train-top-bluewhite': { base: 0.55, roof: 4.05, accent: '#1F4FB5', glass: '#14171C', body: '#F2F3F5', bidirectional: true },
};
export const ARTICULATED_ASSETS = Object.keys(LIVERY);
export const roofHeight = (assetId: string) => LIVERY[assetId]?.roof ?? 3.4;

export interface SectionPlacement { lng: number; lat: number; bearing: number }
export interface ArticulatedVehicle {
  id: string; assetId: string; stale: boolean; scale: number;
  /** Části od čela k zádi (střed a směr každé části). */
  sections: SectionPlacement[];
  joints: SectionPlacement[];
  /** Pro výběr kliknutím: střed a směr celé soupravy. */
  center: SectionPlacement; length: number; width: number;
}

const PX = 48; // pixelů textury na metr
const hasCanvas = () => typeof document !== 'undefined';

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, fallback: string): Texture {
  if (!hasCanvas()) {
    const c = new Color(fallback);
    const t = new DataTexture(new Uint8Array([c.r * 255, c.g * 255, c.b * 255, 255]), 1, 1, RGBAFormat);
    t.needsUpdate = true;
    return t;
  }
  const cv = document.createElement('canvas');
  cv.width = Math.max(4, Math.round(w)); cv.height = Math.max(4, Math.round(h));
  draw(cv.getContext('2d')!);
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Bok části: bílá karoserie, barevný spodek, pás tmavých oken se sloupky, dveře; u čela barevný lem a okno kabiny. */
function sideTexture(l: Livery, len: number, frontCab: boolean, rearCab: boolean, mirrored: boolean): Texture {
  const H = l.roof - l.base;
  return canvasTexture(len * PX, H * PX, (c) => {
    const W = c.canvas.width, Hp = c.canvas.height, m = (v: number) => v * PX;
    if (mirrored) { c.translate(W, 0); c.scale(-1, 1); } // čelo je vždy vpravo v nezrcadleném plátně
    const y = (fromBase: number) => Hp - m(fromBase);
    c.fillStyle = l.body; c.fillRect(0, 0, W, Hp);
    c.fillStyle = l.accent; c.fillRect(0, y(0.62), W, m(0.62));
    c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(0, y(0.66), W, m(0.04));
    const wb = 1.02, wt = H - 0.62;
    c.fillStyle = l.glass; c.fillRect(0, y(wt), W, m(wt - wb));
    const g = c.createLinearGradient(0, y(wt), 0, y(wb));
    g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(255,255,255,0.02)');
    c.fillStyle = g; c.fillRect(0, y(wt), W, m(wt - wb));
    c.fillStyle = l.body;
    for (let x = m(1.4); x < W - m(0.4); x += m(1.55)) c.fillRect(x, y(wt), m(0.11), m(wt - wb));
    // dveře uprostřed části: tmavé sklo až k podlaze, světlý rám
    const dw = m(1.3), dx = W / 2 - dw / 2;
    c.fillStyle = '#D9DCE0'; c.fillRect(dx - m(0.07), y(wt + 0.05), dw + m(0.14), m(wt + 0.05 - 0.08));
    c.fillStyle = l.glass; c.fillRect(dx, y(wt), dw, m(wt - 0.1));
    c.fillStyle = '#D9DCE0'; c.fillRect(W / 2 - m(0.03), y(wt), m(0.06), m(wt - 0.1));
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 0, W, m(0.06));
    const cab = (atRight: boolean) => {
      // barevný klín od čela šikmo dozadu k oknům
      const X = (v: number) => (atRight ? W - m(v) : m(v));
      c.fillStyle = l.accent;
      c.beginPath(); c.moveTo(X(0), y(0)); c.lineTo(X(0), y(H)); c.lineTo(X(1.0), y(H)); c.lineTo(X(2.9), y(wb)); c.lineTo(X(2.9), y(0)); c.closePath(); c.fill();
      const x0 = atRight ? W - m(1.5) : 0;
      c.fillStyle = l.accent; c.fillRect(x0, y(wb + 0.02), m(1.5), m(wb + 0.02));
      c.fillStyle = l.glass; c.fillRect(atRight ? W - m(1.1) : 0, y(H - 0.35), m(1.1), m(H - 0.35 - wb));
      c.fillStyle = l.accent; c.fillRect(atRight ? W - m(1.6) : m(1.5), y(H - 0.35), m(0.1), m(H - 0.35 - wb));
    };
    if (frontCab) cab(true);
    if (rearCab) cab(false);
  }, l.body);
}

/** Čelo kabiny: barevný rám, velké tmavé čelní okno, světla. */
function cabTexture(l: Livery, width: number): Texture {
  const H = l.roof - l.base;
  return canvasTexture(width * PX * 2, H * PX * 2, (c) => {
    const W = c.canvas.width, Hp = c.canvas.height;
    c.fillStyle = l.accent; c.fillRect(0, 0, W, Hp);
    c.fillStyle = l.glass; c.fillRect(W * 0.07, Hp * 0.08, W * 0.86, Hp * 0.5);
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(W * 0.07, Hp * 0.08, W * 0.86, Hp * 0.08);
    c.fillStyle = '#1B1E22'; c.fillRect(W * 0.3, Hp * 0.86, W * 0.4, Hp * 0.1);
    c.fillStyle = '#FFF6DA';
    for (const x of [0.1, 0.78]) c.fillRect(W * x, Hp * 0.7, W * 0.12, Hp * 0.06);
  }, l.accent);
}

interface Kit { sections: InstancedMesh[]; joints: InstancedMesh; pantos: InstancedMesh; materials: MeshStandardMaterial[]; textures: Texture[]; capacity: number }

/** Souprava po částech: každá část má střechu z dodaného PNG (pohled shora) a dopočtený bok a čelo. */
export class ArticulatedLayer implements CustomLayerInterface {
  readonly id = 'dop-articulated-3d';
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;
  private map: MlMap | null = null;
  private renderer: WebGLRenderer | null = null;
  private scene = new Scene();
  private camera = new Camera();
  private kits = new Map<string, Kit>();
  private vehicles: ArticulatedVehicle[] = [];
  private origin = MercatorCoordinate.fromLngLat([14.4205, 50.0815]);
  private transform = new Matrix4();
  private obj = new Object3D();
  private dirty = true;
  private loader = new TextureLoader();
  private live = new Color(0xffffff);
  private stale = new Color(0x9aa0aa);
  enabled = true;

  constructor(private readonly assets: VehicleAsset[]) {}

  onAdd(map: MlMap, gl: WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    // Světlé boky jako na ilustraci: silné rozptýlené světlo, mírné směrové stínování.
    this.scene.add(new HemisphereLight(0xf4f7ff, 0x8a8590, 2.4));
    this.scene.add(new AmbientLight(0xffffff, 0.9));
    const sun = new DirectionalLight(0xfff4e2, 1.5);
    sun.position.set(-60, 120, -40);
    this.scene.add(sun);
    const fill = new DirectionalLight(0xe2ebff, 1.0);
    fill.position.set(70, 80, 90);
    this.scene.add(fill);
  }

  private kit(assetId: string, count: number): Kit | null {
    const asset = this.assets.find((a) => a.id === assetId);
    const l = LIVERY[assetId];
    if (!asset?.pieces?.length || !asset.physical || !l) return null;
    const existing = this.kits.get(assetId);
    if (existing && existing.capacity >= count) return existing;
    if (existing) for (const m of [...existing.sections, existing.joints, existing.pantos]) { this.scene.remove(m); m.dispose(); }
    const capacity = Math.max(8, 2 ** Math.ceil(Math.log2(Math.max(1, count))));
    const L = asset.physical.lengthM, W = asset.physical.widthM, H = l.roof - l.base;
    const reuse = existing ? { materials: existing.materials, textures: existing.textures } : null;
    const materials: MeshStandardMaterial[] = reuse?.materials ?? [];
    const textures: Texture[] = reuse?.textures ?? [];
    const mat = (opts: ConstructorParameters<typeof MeshStandardMaterial>[0]) => { const m = new MeshStandardMaterial({ roughness: 0.62, metalness: 0, ...opts }); materials.push(m); return m; };
    const tex = (t: Texture) => { textures.push(t); return t; };
    const dark = mat({ color: 0x23262b, roughness: 0.8 });
    const n = asset.pieces.length;
    const sections = asset.pieces.map((pc, i) => {
      const len = (pc.toFront - pc.fromFront) * L;
      const front = i === 0, rear = i === n - 1 && l.bidirectional;
      const geo = new BoxGeometry(W, H, len);
      geo.translate(0, l.base + H / 2, 0);
      // Skloněné a mírně zúžené čelo kabiny (jednoduchá geometrie – zaoblení se neosvědčilo, lámalo stínování).
      const pos = geo.getAttribute('position');
      for (let vi = 0; vi < pos.count; vi++) {
        const z = pos.getZ(vi), yv = pos.getY(vi), x = pos.getX(vi);
        const atFront = front && z <= -len / 2 + 1e-3, atRear = rear && z >= len / 2 - 1e-3;
        if (!atFront && !atRear) continue;
        const top = yv >= l.base + H - 1e-3;
        pos.setXYZ(vi, x * (top ? 0.88 : 0.96), yv, z + (top ? (atFront ? 0.85 : -0.85) : 0));
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      const roof = tex(this.loader.load(pc.file, () => this.map?.triggerRepaint()));
      roof.colorSpace = SRGBColorSpace; roof.anisotropy = 8;
      const sideRight = mat({ map: tex(sideTexture(l, len, front, rear, false)) });
      const sideLeft = mat({ map: tex(sideTexture(l, len, front, rear, true)) });
      const cab = front || rear ? mat({ map: tex(cabTexture(l, W)) }) : dark;
      // pořadí ploch BoxGeometry: +X, −X, +Y (střecha), −Y, +Z (zadní konec), −Z (čelo)
      const mesh = new InstancedMesh(geo, [sideRight, sideLeft, mat({ map: roof, roughness: 0.6 }), dark, rear ? cab : dark, front ? cab : dark], capacity);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.scene.add(mesh);
      return mesh;
    });
    const panto = (() => {
      const pc0 = asset.pieces![0]!, len0 = (pc0.toFront - pc0.fromFront) * L, top = l.base + H, z0 = -len0 / 2 + len0 * 0.6;
      const parts: BoxGeometry[] = [];
      const add = (g: BoxGeometry, x: number, y: number, z: number, rx = 0) => { if (rx) g.rotateX(rx); g.translate(x, y, z); parts.push(g); };
      add(new BoxGeometry(1.1, 0.12, 1.0), 0, top + 0.06, z0);                       // základna
      add(new BoxGeometry(0.07, 0.07, 1.25), 0, top + 0.42, z0 - 0.35, -0.62);       // spodní rameno
      add(new BoxGeometry(0.07, 0.07, 1.25), 0, top + 0.95, z0 - 0.35, 0.62);        // horní rameno
      add(new BoxGeometry(1.7, 0.05, 0.1), 0, top + 1.26, z0 - 0.05);                // sběrač
      const g = mergeGeometries(parts);
      parts.forEach((x) => x.dispose());
      return g;
    })();
    const pantos = new InstancedMesh(panto, mat({ color: 0x2b2e33, roughness: 0.5, metalness: 0.4 }), capacity);
    pantos.instanceMatrix.setUsage(DynamicDrawUsage); pantos.frustumCulled = false; pantos.count = 0; this.scene.add(pantos);
    const jgeo = new BoxGeometry(W * 0.9, H - 0.25, 0.75);
    jgeo.translate(0, l.base + (H - 0.25) / 2, 0);
    const joints = new InstancedMesh(jgeo, dark, capacity * Math.max(1, n - 1));
    joints.instanceMatrix.setUsage(DynamicDrawUsage);
    joints.frustumCulled = false;
    joints.count = 0;
    this.scene.add(joints);
    const k = { sections, joints, pantos, materials, textures, capacity };
    this.kits.set(assetId, k);
    return k;
  }

  setVehicles(list: ArticulatedVehicle[]) { this.vehicles = list; this.dirty = true; this.map?.triggerRepaint(); }
  setEnabled(on: boolean) { this.enabled = on; this.dirty = true; this.map?.triggerRepaint(); }

  private place(p: SectionPlacement, scale: number, unit: number) {
    const m = MercatorCoordinate.fromLngLat([p.lng, p.lat]);
    this.obj.position.set((m.x - this.origin.x) / unit, 0, (m.y - this.origin.y) / unit);
    this.obj.rotation.set(0, (-p.bearing * Math.PI) / 180, 0);
    this.obj.scale.setScalar((scale * m.meterInMercatorCoordinateUnits()) / unit);
    this.obj.updateMatrix();
    return this.obj.matrix;
  }

  private update() {
    if (!this.map) return;
    this.origin = MercatorCoordinate.fromLngLat(this.map.getCenter());
    const unit = this.origin.meterInMercatorCoordinateUnits();
    for (const k of this.kits.values()) { for (const s of k.sections) s.count = 0; k.joints.count = 0; k.pantos.count = 0; }
    if (this.enabled) {
      const byAsset = new Map<string, ArticulatedVehicle[]>();
      for (const v of this.vehicles) { const g = byAsset.get(v.assetId) ?? []; g.push(v); byAsset.set(v.assetId, g); }
      for (const [assetId, list] of byAsset) {
        const k = this.kit(assetId, list.length);
        if (!k) continue;
        let j = 0;
        list.forEach((v, i) => {
          v.sections.forEach((s, si) => {
            const mesh = k.sections[si];
            if (!mesh) return;
            const mx = this.place(s, v.scale, unit);
            mesh.setMatrixAt(i, mx);
            mesh.setColorAt(i, v.stale ? this.stale : this.live);
            if (si === 0) k.pantos.setMatrixAt(i, mx);
          });
          for (const jt of v.joints) if (j < k.joints.instanceMatrix.count) { k.joints.setMatrixAt(j, this.place(jt, v.scale, unit)); k.joints.setColorAt(j++, v.stale ? this.stale : this.live); }
        });
        for (const s of k.sections) { s.count = list.length; s.instanceMatrix.needsUpdate = true; if (s.instanceColor) s.instanceColor.needsUpdate = true; }
        k.pantos.count = list.length; k.pantos.instanceMatrix.needsUpdate = true;
        k.joints.count = j; k.joints.instanceMatrix.needsUpdate = true; if (k.joints.instanceColor) k.joints.instanceColor.needsUpdate = true;
      }
    }
    this.transform.set(unit, 0, 0, this.origin.x, 0, 0, unit, this.origin.y, 0, unit, 0, 0, 0, 0, 0, 1);
    this.dirty = false;
  }

  render(_gl: WebGL2RenderingContext, args: CustomRenderMethodInput) {
    if (!this.map || !this.renderer || !this.enabled || !this.vehicles.length) return;
    if (this.dirty) this.update();
    this.camera.projectionMatrix.fromArray(args.defaultProjectionData.mainMatrix).multiply(this.transform);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.renderer.resetState();
  }

  /** Paprsek proti obálce soupravy (střed, směr, délka) – zásah kamkoli do karoserie vybere vozidlo. */
  pick(x: number, y: number, radius: number): string | null {
    if (!this.map || !this.enabled || !this.vehicles.length) return null;
    const { width, height } = this.map.getCanvas().getBoundingClientRect();
    if (!width || !height) return null;
    const nx = (x / width) * 2 - 1, ny = 1 - (y / height) * 2;
    const a0 = new Vector3(nx, ny, -1).applyMatrix4(this.camera.projectionMatrixInverse);
    const b0 = new Vector3(nx, ny, 1).applyMatrix4(this.camera.projectionMatrixInverse);
    const unit = this.origin.meterInMercatorCoordinateUnits();
    let best: string | null = null, bestT = Infinity;
    for (const v of this.vehicles) {
      const inv = this.place(v.center, v.scale, unit).clone().invert();
      const a = a0.clone().applyMatrix4(inv), d = b0.clone().applyMatrix4(inv).sub(a);
      const mg = Math.min(2.5, radius * 0.1);
      const mins = [-v.width / 2 - mg, 0, -v.length / 2 - mg], maxs = [v.width / 2 + mg, roofHeight(v.assetId) + 1, v.length / 2 + mg];
      let lo = 0, hi = 1;
      for (let ax = 0; ax < 3; ax++) {
        const p = a.getComponent(ax), dd = d.getComponent(ax);
        if (Math.abs(dd) < 1e-10) { if (p < mins[ax]! || p > maxs[ax]!) { hi = -1; break; } continue; }
        const t0 = (mins[ax]! - p) / dd, t1 = (maxs[ax]! - p) / dd;
        lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
      }
      if (lo <= hi && lo < bestT) { bestT = lo; best = v.id; }
    }
    return best;
  }

  diagnostics() {
    const instances = this.enabled ? this.vehicles.length : 0;
    let meshes = 0;
    for (const k of this.kits.values()) meshes += k.sections.length + 1;
    return { instances, meshes, drawCalls: instances ? this.renderer?.info.render.calls ?? 0 : 0 };
  }

  onRemove() {
    for (const k of this.kits.values()) { for (const m of [...k.sections, k.joints, k.pantos]) { m.geometry.dispose(); m.dispose(); } k.materials.forEach((m) => m.dispose()); k.textures.forEach((t) => t.dispose()); }
    this.kits.clear(); this.scene.clear(); this.renderer?.dispose(); this.renderer = null; this.map = null;
  }
}
