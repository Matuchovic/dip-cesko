import { lerpAngle, normalizeDeg } from '@/domain/angles';
import { haversineM, initialBearingDeg, lerpLngLat } from '@/domain/geo';
import type { Mode, VehicleState } from '@/domain/model';

/** Naměřený vzorek: poloha, čas měření u zdroje a čas přijetí – oddělené od zobrazované polohy. */
export interface Sample { lng: number; lat: number; bearing: number | null; measuredAt: number; receivedAt: number }
interface Track {
  from: { lng: number; lat: number; bearing: number | null };
  target: Sample;
  startedAt: number;
  duration: number;
  bearingSource: 'provider' | 'derived' | null;
  jumped: boolean;
  mode: Mode;
}
export interface DisplayState { lng: number; lat: number; bearing: number | null; measuredAt: number; receivedAt: number; jumped: boolean; bearingSource: 'provider' | 'derived' | null }

const MAX_SPEED_MPS: Record<Mode, number> = { tram: 30, metro: 45, train: 75, bus: 40, trolleybus: 30, ferry: 15, funicular: 15, other: 60 };

export interface AnimatorOptions { maxAnimMs: number; minAnimMs: number; minMoveForBearingM: number; reducedMotion: boolean }

/**
 * Interpoluje zobrazovanou polohu MEZI důvěryhodnými měřeními. Za poslední měření neextrapoluje,
 * zpožděná/starší data ignoruje a nepravděpodobné skoky GPS zobrazí bez animace (jako skok).
 */
export class VehicleAnimator {
  private tracks = new Map<string, Track>();
  constructor(private opts: AnimatorOptions = { maxAnimMs: 12_000, minAnimMs: 800, minMoveForBearingM: 12, reducedMotion: false }) {}

  setReducedMotion(v: boolean) { this.opts = { ...this.opts, reducedMotion: v }; }

  ingest(vehicles: VehicleState[], receivedAt: number, now = receivedAt): void {
    const present = new Set<string>();
    for (const v of vehicles) {
      present.add(v.id);
      const measuredAt = v.measuredAt ? Date.parse(v.measuredAt) : receivedAt;
      const sample: Sample = { lng: v.lon, lat: v.lat, bearing: v.bearing, measuredAt, receivedAt };
      const t = this.tracks.get(v.id);
      if (!t) {
        this.tracks.set(v.id, { from: { lng: v.lon, lat: v.lat, bearing: v.bearing }, target: sample, startedAt: now, duration: 0, bearingSource: v.bearingSource, jumped: false, mode: v.route.mode });
        continue;
      }
      if (measuredAt <= t.target.measuredAt) continue; // pozdě doručená nebo opakovaná data
      const cur = this.sample(v.id, now)!;
      const dist = haversineM(cur, sample);
      const dtS = Math.max(1, (measuredAt - t.target.measuredAt) / 1000);
      const jumped = dist > 5000 || dist / dtS > MAX_SPEED_MPS[v.route.mode];
      let bearing = v.bearing;
      let source = v.bearingSource;
      if (bearing === null) {
        const moved = haversineM(t.target, sample);
        if (moved >= this.opts.minMoveForBearingM && !jumped) { bearing = initialBearingDeg(t.target, sample); source = 'derived'; }
        else { bearing = t.target.bearing; source = t.bearingSource; }
      }
      sample.bearing = bearing;
      const duration = this.opts.reducedMotion || jumped ? 0 : Math.min(this.opts.maxAnimMs, Math.max(this.opts.minAnimMs, measuredAt - t.target.measuredAt));
      this.tracks.set(v.id, { from: jumped ? { lng: sample.lng, lat: sample.lat, bearing } : { lng: cur.lng, lat: cur.lat, bearing: cur.bearing }, target: sample, startedAt: now, duration, bearingSource: source, jumped, mode: v.route.mode });
    }
    for (const id of [...this.tracks.keys()]) if (!present.has(id)) this.tracks.delete(id);
  }

  sample(id: string, now: number): DisplayState | null {
    const t = this.tracks.get(id);
    if (!t) return null;
    const k = t.duration <= 0 ? 1 : Math.min(1, Math.max(0, (now - t.startedAt) / t.duration));
    const p = k >= 1 ? { lng: t.target.lng, lat: t.target.lat } : lerpLngLat(t.from, t.target, k);
    const b0 = t.from.bearing, b1 = t.target.bearing;
    const bearing = b1 === null ? b0 : b0 === null || k >= 1 ? b1 : lerpAngle(b0, b1, k);
    return { lng: p.lng, lat: p.lat, bearing: bearing === null ? null : normalizeDeg(bearing), measuredAt: t.target.measuredAt, receivedAt: t.target.receivedAt, jumped: t.jumped, bearingSource: t.bearingSource };
  }

  isAnimating(now: number): boolean {
    for (const t of this.tracks.values()) if (t.duration > 0 && now - t.startedAt < t.duration) return true;
    return false;
  }

  /** Poslední přijaté měření (cíl animace) – pro navázání na koleje. */
  target(id: string): Sample | null { return this.tracks.get(id)?.target ?? null; }
  duration(id: string): number { return this.tracks.get(id)?.duration ?? 0; }
  mode(id: string): Mode | null { return this.tracks.get(id)?.mode ?? null; }

  ids(): IterableIterator<string> { return this.tracks.keys(); }
  get size(): number { return this.tracks.size; }
}
