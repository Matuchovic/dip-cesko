import {
  BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute, MeshBasicMaterial,
  MeshStandardMaterial, PlaneGeometry, Vector3, Quaternion, DataTexture, RGBAFormat, LinearFilter,
  type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VEHICLE_DIMENSIONS, type ModelMode } from './vehicle-presentation';

export interface ModelPart { geometry: BufferGeometry; material: Material }
export interface VehicleModel { parts: ModelPart[]; dispose(): void }
type Finish = 'paint' | 'accent' | 'glass' | 'metal' | 'dark' | 'light' | 'tail';

/** All parts are real, closed meshes in metres; they can be viewed from any camera angle. */
export function buildVehicleModel(mode: ModelMode): VehicleModel {
  const spec = VEHICLE_DIMENSIONS[mode];
  const railway = mode === 'train' || mode === 'metro';
  const road = mode === 'bus' || mode === 'trolleybus';
  const pieces = new Map<Finish, BufferGeometry[]>();
  const finishes: Record<Finish, MeshStandardMaterial> = {
    paint: new MeshStandardMaterial({ color: 0xf0f3f6, roughness: 0.32, metalness: 0.25 }),
    accent: new MeshStandardMaterial({ color: spec.accent, roughness: 0.28, metalness: 0.25 }),
    glass: new MeshStandardMaterial({ color: 0x183e52, roughness: 0.16, metalness: 0.55, emissive: 0x07131c, emissiveIntensity: 0.3 }),
    metal: new MeshStandardMaterial({ color: 0x92a1ad, roughness: 0.42, metalness: 0.65 }),
    dark: new MeshStandardMaterial({ color: 0x182431, roughness: 0.72, metalness: 0.12 }),
    light: new MeshStandardMaterial({ color: 0xfff4d3, emissive: 0xffeac1, emissiveIntensity: 1.2 }),
    tail: new MeshStandardMaterial({ color: 0xed2540, emissive: 0xea172a, emissiveIntensity: 0.6 }),
  };
  function part(finish: Finish, geometry: BufferGeometry, x = 0, y = 0, z = 0) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    g.deleteAttribute('uv');
    g.translate(x, y, z);
    const list = pieces.get(finish) ?? [];
    list.push(g); pieces.set(finish, list);
  }
  function box(finish: Finish, w: number, h: number, l: number, x: number, y: number, z: number, radius = 0) {
    const g = radius > 0 ? new RoundedBoxGeometry(w, h, l, 1, Math.min(radius, w / 3, h / 3, l / 3)) : new BoxGeometry(w, h, l);
    part(finish, g, x, y, z);
  }
  function rod(a: Vector3, b: Vector3, radius = 0.035, finish: Finish = 'dark') {
    const dir = b.clone().sub(a);
    const g = new CylinderGeometry(radius, radius, dir.length(), 6);
    g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize()));
    const mid = a.clone().add(b).multiplyScalar(0.5);
    part(finish, g, mid.x, mid.y, mid.z);
  }
  function face(finish: Finish, vertices: number[]) {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    g.computeVertexNormals(); part(finish, g);
  }
  const width = spec.width;
  const base = railway ? 0.72 : 0.48;
  const roof = spec.height - (mode === 'tram' || mode === 'trolleybus' ? 0.38 : 0.24);
  const gap = railway ? 0.65 : spec.cars > 1 ? 0.4 : 0;
  const carLen = (spec.length - gap * (spec.cars - 1)) / spec.cars;

  for (let i = 0; i < spec.cars; i++) {
    const z = -spec.length / 2 + carLen / 2 + i * (carLen + gap);
    const front = i === 0, rear = i === spec.cars - 1;
    const nose = mode === 'train' && (front || rear) ? 2.1 : !road && (front || rear) ? 0.75 : 0;
    const bodyStart = z - carLen / 2 + (front ? nose : 0);
    const bodyEnd = z + carLen / 2 - (rear ? nose : 0);
    const bodyMid = (bodyStart + bodyEnd) / 2;
    const bodyLen = bodyEnd - bodyStart;

    box('paint', width, roof - base, bodyLen, 0, (roof + base) / 2, bodyMid, 0.15);
    box('dark', width * 0.83, 0.3, carLen - 0.25, 0, base - 0.1, z, 0.05);
    box('accent', width + 0.025, railway ? 0.8 : 0.58, bodyLen - 0.09, 0, base + 0.38, bodyMid, 0.06);
    box('accent', width + 0.025, 0.075, bodyLen - 0.12, 0, roof - 0.19, bodyMid);
    box('paint', width * 0.95, 0.18, bodyLen - 0.14, 0, roof + 0.03, bodyMid, 0.07);

    // Recessed blue windows, white pillars, split doors and a thin sill on both sides.
    const windowH = railway ? 1.06 : 1.02;
    const windowY = roof - 0.89;
    const count = Math.max(2, Math.floor(bodyLen / 1.6));
    const step = (bodyLen - 0.55) / count;
    for (const side of [-1, 1]) {
      for (let k = 0; k < count; k++) {
        const wz = bodyStart + 0.275 + step * (k + 0.5);
        const door = k === Math.floor(count * 0.6);
        const h = door ? roof - base - 0.4 : windowH;
        const wy = door ? (roof + base) / 2 - 0.03 : windowY;
        box('dark', 0.035, h + 0.11, step * 0.9, side * (width / 2 + 0.014), wy, wz, 0.015);
        box('glass', 0.042, h, step * 0.79, side * (width / 2 + 0.034), wy, wz, 0.018);
        if (door) {
          box('metal', 0.045, h, 0.027, side * (width / 2 + 0.06), wy, wz);
          box('metal', 0.05, 0.18, 0.045, side * (width / 2 + 0.062), base + 1.03, wz - 0.13);
        } else {
          box('metal', 0.045, 0.035, step * 0.78, side * (width / 2 + 0.06), windowY + windowH * 0.28, wz);
        }
      }
    }

    // Bogies / axles, wheel rims, and roof air-conditioning modules.
    for (const axleZ of [z - carLen * 0.31, z + carLen * 0.31]) {
      box('dark', width * 0.74, 0.25, railway ? 1.85 : 1.1, 0, 0.38, axleZ, 0.06);
      for (const side of [-1, 1]) {
        const wheel = new CylinderGeometry(road ? 0.41 : 0.32, road ? 0.41 : 0.32, 0.18, 12);
        wheel.rotateZ(Math.PI / 2);
        part('dark', wheel, side * width * 0.43, road ? 0.42 : 0.33, axleZ);
        const rim = new CylinderGeometry(road ? 0.22 : 0.23, road ? 0.22 : 0.23, 0.19, 12);
        rim.rotateZ(Math.PI / 2);
        part('metal', rim, side * width * 0.435, road ? 0.42 : 0.33, axleZ);
      }
    }
    const acLen = Math.min(2.5, carLen * 0.37);
    box('metal', width * 0.66, 0.15, acLen, 0, roof + 0.2, z, 0.06);
    box('dark', width * 0.5, 0.025, acLen * 0.82, 0, roof + 0.285, z, 0.01);
    for (let k = 0; k < 6; k++) box('metal', width * 0.49, 0.03, 0.055, 0, roof + 0.3, z - acLen * 0.32 + k * acLen * 0.128);

    for (const end of [-1, 1]) {
      const isCab = end === -1 ? front : rear;
      const endZ = z + end * carLen / 2;
      if (!isCab) continue;
      if (nose > 0) {
        const innerZ = endZ - end * nose;
        const noseTop = mode === 'train' ? roof - 1.15 : roof - 0.28;
        const w0 = width * (mode === 'train' ? 0.72 : 0.85);
        const low = base + 0.14;
        // Closed tapered cab, with bevelled cross-sections and an aero nose on trains.
        const ring = (w: number, hi: number, rz: number) => [
          [-w / 2 + 0.12, low, rz], [w / 2 - 0.12, low, rz], [w / 2, low + 0.14, rz],
          [w / 2, hi - 0.14, rz], [w / 2 - 0.12, hi, rz], [-w / 2 + 0.12, hi, rz],
          [-w / 2, hi - 0.14, rz], [-w / 2, low + 0.14, rz],
        ];
        const a = ring(width, roof, innerZ), b = ring(w0, noseTop, endZ);
        const vs: number[] = [];
        const tri = (p: number[], q: number[], r: number[]) => vs.push(...p, ...q, ...r);
        for (let j = 0; j < 8; j++) {
          const k = (j + 1) % 8;
          if (end < 0) { tri(a[j]!, b[j]!, b[k]!); tri(a[j]!, b[k]!, a[k]!); }
          else { tri(a[j]!, a[k]!, b[k]!); tri(a[j]!, b[k]!, b[j]!); }
        }
        const centre = [0, (low + noseTop) / 2, endZ];
        for (let j = 0; j < 8; j++) {
          if (end < 0) tri(centre, b[(j + 1) % 8]!, b[j]!);
          else tri(centre, b[j]!, b[(j + 1) % 8]!);
        }
        face('paint', vs);
        box('accent', w0 * 0.91, 0.28, 0.035, 0, low + 0.25, endZ + end * 0.018, 0.01);
        if (mode === 'train') {
          const bottom = endZ - end * nose * 0.12, top = innerZ + end * nose * 0.12;
          const y0 = noseTop + (roof - noseTop) * 0.12 + 0.02, y1 = roof - (roof - noseTop) * 0.12 + 0.02;
          const quad = [-width * 0.34, y0, bottom, width * 0.34, y0, bottom, width * 0.4, y1, top, -width * 0.4, y1, top];
          face('glass', end > 0 ? [...quad.slice(0, 9), ...quad.slice(0, 3), ...quad.slice(6, 12)] : [...quad.slice(6, 12), ...quad.slice(0, 3), ...quad.slice(6, 9), ...quad.slice(0, 6)]);
        } else {
          box('dark', w0 * 0.89, 1.18, 0.04, 0, noseTop - 0.72, endZ + end * 0.022, 0.1);
          box('glass', w0 * 0.8, 1.04, 0.045, 0, noseTop - 0.71, endZ + end * 0.044, 0.1);
        }
      } else {
        box('dark', width * 0.92, 1.42, 0.04, 0, roof - 0.97, endZ + end * 0.018, 0.07);
        box('glass', width * 0.84, 1.25, 0.044, 0, roof - 0.96, endZ + end * 0.04, 0.07);
      }
      for (const side of [-1, 1]) {
        const lightY = base + (mode === 'train' ? 0.58 : 0.34);
        box(end < 0 ? 'light' : 'tail', width * 0.17, 0.09, 0.035, side * width * 0.27, lightY, endZ + end * 0.049, 0.018);
      }
    }

    if (i < spec.cars - 1) {
      const jointZ = z + carLen / 2 + gap / 2;
      box('dark', width * 0.87, roof - base - 0.2, gap + 0.07, 0, (roof + base) / 2 - 0.03, jointZ, 0.04);
      for (let rib = 0; rib < 6; rib++) box('metal', width * 0.9, roof - base - 0.18, 0.023, 0, (roof + base) / 2 - 0.03, jointZ - gap * 0.42 + rib * gap * 0.168, 0.01);
    }
  }

  // Raised pantograph: unmistakeable volume even in a direct overhead view.
  if (mode === 'tram' || mode === 'train') {
    const pz = -spec.length * 0.18, py = roof + 0.17;
    box('metal', 0.8, 0.08, 1.5, 0, py, pz, 0.04);
    for (const side of [-1, 1]) {
      const x = side * 0.25;
      rod(new Vector3(x, py, pz + 0.6), new Vector3(x, py + 0.75, pz - 0.35));
      rod(new Vector3(x, py + 0.75, pz - 0.35), new Vector3(x, py + 1.35, pz + 0.15));
    }
    box('dark', 1.45, 0.055, 0.09, 0, py + 1.35, pz + 0.15, 0.015);
  }
  if (mode === 'trolleybus') for (const side of [-1, 1]) rod(new Vector3(side * 0.4, roof + 0.15, 0), new Vector3(side * 0.65, roof + 1.6, 4.5), 0.04);

  const parts: ModelPart[] = [];
  for (const [finish, list] of pieces) {
    const merged = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    if (!merged) throw new Error(`Cannot build ${mode}/${finish}`);
    merged.computeBoundingBox();
    parts.push({ geometry: merged, material: finishes[finish] });
  }
  // Soft contact shadow, anchored to the ground. No per-vehicle shadow-map passes.
  const w = 32, h = 128, rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = Math.max(0, Math.abs((x + 0.5) / w * 2 - 1) - 0.45) / 0.5;
    const dy = Math.max(0, Math.abs((y + 0.5) / h * 2 - 1) - 0.86) / 0.12;
    rgba[(y * w + x) * 4 + 3] = Math.round(65 * Math.exp(-3 * (dx * dx + dy * dy)));
  }
  const texture = new DataTexture(rgba, w, h, RGBAFormat);
  texture.magFilter = LinearFilter; texture.minFilter = LinearFilter; texture.needsUpdate = true;
  const shadow = new PlaneGeometry(width * 2.2, spec.length + 2.5);
  shadow.rotateX(-Math.PI / 2); shadow.translate(0.25, 0.045, 0.25);
  const shadowMaterial = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
  parts.unshift({ geometry: shadow, material: shadowMaterial });
  return { parts, dispose() { parts.forEach((p) => p.geometry.dispose()); Object.values(finishes).forEach((m) => m.dispose()); shadowMaterial.dispose(); texture.dispose(); } };
}
