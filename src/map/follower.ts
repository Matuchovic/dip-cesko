import type { Mode, VehicleState } from '@/domain/model';
import { VehicleAnimator } from './animator';
import { angDiff, bearingDeg, concat, D2R, distM, offsetM, pointAlong, polyLength, slice, tail, type LngLat } from './geometry';
import type { TrackKind, TrackNetwork } from './tracks';

export const KIND_BY_MODE: Partial<Record<Mode, TrackKind>> = { tram: 'tram', train: 'rail', metro: 'subway', bus: 'road', trolleybus: 'road' };
const SNAP_RADIUS: Record<TrackKind, number> = { tram: 28, rail: 45, road: 30, subway: 60 };

interface Follow { path: LngLat[]; len: number; startedAt: number; duration: number; trail: LngLat[]; measuredAt: number; bearing: number | null; onTrack: boolean }

/** Zobrazovaný stav: čelo vozidla, směr a osa karoserie (od zadního konce k čelu). */
export interface BodySample { front: LngLat; bearing: number | null; body: LngLat[]; onTrack: boolean; measuredAt: number; jumped: boolean }

/**
 * Navázání vozidel na trať: každé nové měření se přichytí na nejbližší kolej (u autobusů silnici)
 * a vozidlo se mezi měřeními pohybuje PO TRATI (cesta A*), ne vzdušnou čarou. Karoserie sleduje
 * trať i za čelem, takže kloubové soupravy projíždějí oblouky. Bez dat o trati platí původní chování.
 */
export class TrackFollower {
  readonly animator: VehicleAnimator;
  private follows = new Map<string, Follow>();

  constructor(private readonly bodyLength: (mode: Mode) => number, animator?: VehicleAnimator) {
    this.animator = animator ?? new VehicleAnimator();
  }

  update(list: VehicleState[], receivedAt: number, now: number, net: (k: TrackKind) => TrackNetwork | null): void {
    const before = new Map<string, BodySample>();
    for (const v of list) { const s = this.sample(v.id, now); if (s) before.set(v.id, s); }
    this.animator.ingest(list, receivedAt, now);
    const present = new Set<string>(list.map((v) => v.id));
    for (const id of [...this.follows.keys()]) if (!present.has(id)) this.follows.delete(id);
    for (const v of list) this.place(v.id, v.route.mode, now, net, before.get(v.id) ?? null, false);
  }

  /** Po načtení nových dlaždic přichytí vozidla, která zatím trať neměla. */
  resnap(now: number, net: (k: TrackKind) => TrackNetwork | null): void {
    for (const id of this.animator.ids()) {
      if (this.follows.has(id)) continue;
      const mode = this.animator.mode(id);
      if (mode) this.place(id, mode, now, net, null, true);
    }
  }

  private place(id: string, mode: Mode, now: number, net: (k: TrackKind) => TrackNetwork | null, prev: BodySample | null, force: boolean) {
    const target = this.animator.target(id);
    const raw = this.animator.sample(id, now);
    if (!target || !raw) return;
    const f = this.follows.get(id);
    if (f && f.measuredAt === target.measuredAt && !force) return;
    const kind = KIND_BY_MODE[mode];
    const network = kind ? net(kind) : null;
    if (!kind || !network) { this.follows.delete(id); return; }
    const L = this.bodyLength(mode);
    const hint = target.bearing ?? prev?.bearing ?? null;
    const E = network.nearest({ lng: target.lng, lat: target.lat }, SNAP_RADIUS[kind], hint);
    if (!E) { this.follows.delete(id); return; }
    if (!f || !prev || !prev.onTrack || raw.jumped || force) {
      const dir = hint ?? E.segBearing;
      const trail = network.walk(E, (dir + 180) % 360, L + 25).reverse();
      const bearing = trail.length >= 2 ? bearingDeg(trail[trail.length - 2]!, trail[trail.length - 1]!) : dir;
      this.follows.set(id, { path: [E.point], len: 0, startedAt: now, duration: 0, trail, measuredAt: target.measuredAt, bearing, onTrack: true });
      return;
    }
    const S = network.nearest(prev.front, 8, prev.bearing);
    const straight = distM(prev.front, E.point);
    let path = S ? network.path(S, E, Math.max(straight * 3, straight + 250)) : null;
    if (path && path.length >= 2 && prev.bearing !== null && straight < 20 && angDiff(bearingDeg(path[0]!, path[path.length - 1]!), prev.bearing) > 100) {
      path = [prev.front]; // malý posun proti směru jízdy = šum GPS, vozidlo zůstane stát
    }
    const used = path ?? [prev.front, E.point];
    this.follows.set(id, { path: used, len: polyLength(used), startedAt: now, duration: this.animator.duration(id), trail: tail(prev.body, L + 40),
      measuredAt: target.measuredAt, bearing: prev.bearing, onTrack: path !== null });
  }

  sample(id: string, now: number): BodySample | null {
    const raw = this.animator.sample(id, now);
    if (!raw) return null;
    const L = this.bodyLength(this.animator.mode(id) ?? 'other');
    const f = this.follows.get(id);
    if (!f) {
      const front = { lng: raw.lng, lat: raw.lat };
      const b = raw.bearing;
      const rear = b === null ? front : offsetM(front, -Math.sin(b * D2R) * L, -Math.cos(b * D2R) * L);
      return { front, bearing: b, body: [rear, front], onTrack: false, measuredAt: raw.measuredAt, jumped: raw.jumped };
    }
    const k = f.duration <= 0 ? 1 : Math.min(1, Math.max(0, (now - f.startedAt) / f.duration));
    const d = k * f.len;
    const at = pointAlong(f.path, d);
    const travelled = f.len > 0 ? slice(f.path, 0, d) : [f.path[0]!];
    const body = tail(concat(f.trail, travelled), L);
    const bodyBearing = body.length >= 2 ? bearingDeg(body[body.length - 2]!, body[body.length - 1]!) : null;
    return { front: at.p, bearing: at.bearing ?? bodyBearing ?? f.bearing, body, onTrack: f.onTrack, measuredAt: raw.measuredAt, jumped: raw.jumped };
  }

  isOnTrack(id: string): boolean { return this.follows.get(id)?.onTrack ?? false; }
}
