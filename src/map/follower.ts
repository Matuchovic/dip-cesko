import type { Mode, PositionState, VehicleState } from '@/domain/model';
import { VehicleAnimator } from './animator';
import { angDiff, bearingDeg, concat, D2R, distM, offsetM, pointAlong, polyLength, projectOnPolyline, slice, tail, type LngLat } from './geometry';
import type { TrackKind, TrackNetwork } from './tracks';

export const KIND_BY_MODE: Partial<Record<Mode, TrackKind>> = { tram: 'tram', train: 'rail', metro: 'subway', bus: 'road', trolleybus: 'road' };
const SNAP_RADIUS: Record<TrackKind, number> = { tram: 28, rail: 45, road: 30, subway: 60 };
/** Plynulý přechod na novou předpověď (bez skoků). */
const BLEND_MS = 1200;
/** Nejdéle dopočítávaná doba od posledního měření (data chodí po 3 s, delší odhad by se rozcházel s realitou). */
const MAX_PREDICT_S = 20;
/** Rozestup vozidel ve frontě na zastávce (m). */
const QUEUE_GAP_M = 4;

interface Follow {
  trail: LngLat[]; blend: LngLat[]; blendLen: number; blendStart: number; blendDur: number;
  forward: LngLat[]; dStart: number; tm: number; v: number; stopAt: number;
  E: LngLat; dir: number; onTrack: boolean;
}

/** Zobrazovaný stav: čelo vozidla, směr, osa karoserie (od zadního konce k čelu) a dopočtená doba od měření. */
export interface BodySample { front: LngLat; bearing: number | null; body: LngLat[]; onTrack: boolean; measuredAt: number; jumped: boolean; predictedS: number }

const ease = (k: number) => k * k * (3 - 2 * k);

/**
 * Vozidla v reálném čase na trati: každé měření se přichytí na kolej (u autobusů silnici), vozidlo pak
 * pokračuje PO TRATI rychlostí z dat (nebo z posledních dvou měření) až do další zastávky nebo 45 s.
 * Nové měření se napojí plynule; je-li zobrazené vozidlo napřed, počká – nikdy necouvá kvůli šumu.
 */
export class TrackFollower {
  readonly animator: VehicleAnimator;
  private follows = new Map<string, Follow>();
  private meta = new Map<string, { speed: number | null; state: PositionState }>();
  private stops: LngLat[] = [];
  /** Fronty na zastávkách: klíč zastávky+směru → vozidlo → vzdálenost k zastávce (m). Vozidla se tak nepřekrývají. */
  private queues = new Map<string, Map<string, number>>();
  private queueOf = new Map<string, string>();

  constructor(private readonly bodyLength: (mode: Mode) => number, animator?: VehicleAnimator) {
    this.animator = animator ?? new VehicleAnimator();
  }

  /** Zastávky ve výřezu: předpověď na nich zastaví. */
  setStops(stops: LngLat[]) { this.stops = stops; }

  update(list: VehicleState[], receivedAt: number, now: number, net: (k: TrackKind) => TrackNetwork | null): void {
    const before = new Map<string, BodySample>();
    for (const v of list) { const s = this.sample(v.id, now); if (s) before.set(v.id, s); }
    this.animator.ingest(list, receivedAt, now);
    const present = new Set<string>(list.map((v) => v.id));
    for (const id of [...this.follows.keys()]) if (!present.has(id)) this.follows.delete(id);
    for (const id of [...this.meta.keys()]) if (!present.has(id)) { this.meta.delete(id); this.leaveQueue(id); }
    for (const v of list) {
      this.meta.set(v.id, { speed: v.speedMps, state: v.positionState });
      this.place(v.id, v.route.mode, now, net, before.get(v.id) ?? null, false);
    }
  }

  resnap(now: number, net: (k: TrackKind) => TrackNetwork | null): void {
    for (const id of this.animator.ids()) {
      if (this.follows.has(id)) continue;
      const mode = this.animator.mode(id);
      if (mode) this.place(id, mode, now, net, null, true);
    }
  }

  private leaveQueue(id: string) {
    const k = this.queueOf.get(id);
    if (!k) return;
    const q = this.queues.get(k);
    q?.delete(id);
    if (q && !q.size) this.queues.delete(k);
    this.queueOf.delete(id);
  }

  private dp(f: Follow, t: number): number {
    return Math.min(f.stopAt, f.v * Math.min(MAX_PREDICT_S, Math.max(0, (t - f.tm) / 1000)));
  }

  private place(id: string, mode: Mode, now: number, net: (k: TrackKind) => TrackNetwork | null, prev: BodySample | null, force: boolean) {
    const target = this.animator.target(id);
    const raw = this.animator.sample(id, now);
    if (!target || !raw) return;
    const f = this.follows.get(id);
    if (f && f.tm === target.measuredAt && !force) return;
    const kind = KIND_BY_MODE[mode];
    const network = kind ? net(kind) : null;
    if (!kind || !network) { this.follows.delete(id); return; }
    const L = this.bodyLength(mode);
    const hint = target.bearing ?? prev?.bearing ?? null;
    const E = network.nearest({ lng: target.lng, lat: target.lat }, SNAP_RADIUS[kind], hint);
    if (!E) { this.follows.delete(id); return; }
    const tm = target.measuredAt;
    let dir = hint ?? E.segBearing;
    // rychlost: z dat, jinak z ujeté vzdálenosti po trati mezi měřeními (vyhlazeně)
    let v = f?.v ?? 0;
    if (f && !raw.jumped) {
      const dt = (tm - f.tm) / 1000;
      const P = network.nearest(f.E, 6, f.dir);
      const path = P && dt >= 2 && dt <= 120 ? network.path(P, E, 25 * dt + 60) : null;
      if (path) {
        const len = polyLength(path);
        const vNew = Math.min(25, len / dt);
        v = f.v > 0 ? 0.6 * vNew + 0.4 * f.v : vNew;
        if (len > 5) dir = bearingDeg(path[Math.max(0, path.length - 2)]!, path[path.length - 1]!);
      }
    }
    const m = this.meta.get(id);
    if (m?.speed !== null && m?.speed !== undefined) v = m.speed;
    if (m?.state === 'at_stop' || m?.state === 'before_track' || m?.state === 'canceled') v = 0;
    const forward = network.walk(E, dir, Math.min(1500, Math.max(60, v * MAX_PREDICT_S + 40)));
    const forwardLen = polyLength(forward);
    // nejbližší zastávka před vozidlem (nebo ta, na které právě stojí) – předpověď na ní skončí, za vozidly ve frontě
    let stopAt = forwardLen, stopKey: string | null = null, stopDist = 0;
    for (const s of this.stops) {
      if (Math.abs(s.lat - E.point.lat) > 0.015 || Math.abs(s.lng - E.point.lng) > 0.025) continue;
      const pr = projectOnPolyline(forward, s);
      if (pr.dist > 18) continue;
      const along = pr.along <= 0.5 && distM(E.point, s) < 20 ? 0 : pr.along; // stojí na ní
      if (along < 0 || (along > 0 && along < 12) || along - 4 >= stopAt) continue;
      stopAt = Math.max(0, along - 4);
      stopKey = `${kind}:${s.lng.toFixed(5)},${s.lat.toFixed(5)}:${Math.round(((dir % 360) + 360) % 360 / 60) % 6}`;
      stopDist = along;
    }
    this.leaveQueue(id);
    if (stopKey) {
      const q = this.queues.get(stopKey) ?? new Map<string, number>();
      let ahead = 0;
      for (const [other, d] of q) if (other !== id && d <= stopDist) ahead++;
      q.set(id, stopDist); this.queues.set(stopKey, q); this.queueOf.set(id, stopKey);
      stopAt = Math.max(0, stopAt - ahead * (L + QUEUE_GAP_M));
    }
    if (v <= 0) stopAt = 0;
    const base = { forward, tm, v, stopAt: Math.max(0, stopAt), E: E.point, dir };
    if (!f || !prev || !prev.onTrack || raw.jumped || force) {
      const trail = network.walk(E, (dir + 180) % 360, L + 25).reverse();
      this.follows.set(id, { ...base, trail, blend: [E.point], blendLen: 0, blendStart: now, blendDur: 0, dStart: 0, onTrack: true });
      return;
    }
    const D = prev.front;
    const trail = tail(prev.body, L + 40);
    const draft: Follow = { ...base, trail, blend: [D], blendLen: 0, blendStart: now, blendDur: 0, dStart: 0, onTrack: true };
    const onFwd = projectOnPolyline(forward, D);
    if (onFwd.dist < 3 && onFwd.along >= this.dp(draft, now)) {
      // zobrazené vozidlo je napřed před novou předpovědí → počká na místě (žádné couvání)
      this.follows.set(id, { ...draft, dStart: onFwd.along });
      return;
    }
    const dB = Math.max(this.dp(draft, now + BLEND_MS), onFwd.dist < 3 ? onFwd.along : 0);
    const Pb = pointAlong(forward, dB).p;
    const S = network.nearest(D, 8, prev.bearing), T = network.nearest(Pb, 2, dir);
    const straight = distM(D, Pb);
    const path = S && T ? network.path(S, T, Math.max(straight * 3, straight + 250)) : null;
    const blend = path ?? [D, Pb];
    this.follows.set(id, { ...draft, blend, blendLen: polyLength(blend), blendDur: BLEND_MS, dStart: dB, onTrack: path !== null });
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
      return { front, bearing: b, body: [rear, front], onTrack: false, measuredAt: raw.measuredAt, jumped: raw.jumped, predictedS: 0 };
    }
    let front: LngLat, bearing: number | null, travelled: LngLat[];
    if (f.blendDur > 0 && now < f.blendStart + f.blendDur) {
      const d = ease(Math.max(0, (now - f.blendStart) / f.blendDur)) * f.blendLen;
      const at = pointAlong(f.blend, d);
      front = at.p; bearing = at.bearing;
      travelled = concat(f.trail, slice(f.blend, 0, d));
    } else {
      const s = Math.max(f.dStart, this.dp(f, now));
      const at = pointAlong(f.forward, s);
      front = at.p; bearing = at.bearing;
      travelled = concat(concat(f.trail, f.blend), slice(f.forward, f.dStart, s));
    }
    const body = tail(travelled, L);
    const bodyBearing = body.length >= 2 ? bearingDeg(body[body.length - 2]!, body[body.length - 1]!) : null;
    const predicting = f.v > 0.3 && this.dp(f, now) > f.dStart + 1;
    return { front, bearing: bearing ?? bodyBearing ?? f.dir, body, onTrack: f.onTrack, measuredAt: raw.measuredAt, jumped: raw.jumped,
      predictedS: predicting ? Math.round(Math.min(MAX_PREDICT_S, (now - f.tm) / 1000)) : 0 };
  }

  /** Jede-li některé vozidlo (přechod nebo předpověď), animační smyčka běží dál. */
  isMoving(now: number): boolean {
    for (const f of this.follows.values()) {
      if (f.blendDur > 0 && now < f.blendStart + f.blendDur) return true;
      if (f.v > 0.3 && (now - f.tm) / 1000 < MAX_PREDICT_S && this.dp(f, now) < f.stopAt) return true;
    }
    return false;
  }

  isOnTrack(id: string): boolean { return this.follows.get(id)?.onTrack ?? false; }
}

export { angDiff };
