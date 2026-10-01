import { angDiff, bearingDeg, D2R, distM, lerp, type LngLat } from './geometry';

/** Druh dopravní cesty z mapových dat (OpenMapTiles: transportation). */
export type TrackKind = 'tram' | 'rail' | 'road';

export interface Snap { seg: number; t: number; point: LngLat; dist: number; segBearing: number }

const axisDiff = (a: number, b: number) => { const d = angDiff(a, b); return Math.min(d, 180 - d); };

class MinHeap {
  private ids: number[] = [];
  private fs: number[] = [];
  get size() { return this.ids.length; }
  push(id: number, f: number) {
    this.ids.push(id); this.fs.push(f);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.fs[p]! <= this.fs[i]!) break;
      this.swap(i, p); i = p;
    }
  }
  pop(): { id: number; f: number } | null {
    if (!this.ids.length) return null;
    const top = { id: this.ids[0]!, f: this.fs[0]! };
    const lastId = this.ids.pop()!, lastF = this.fs.pop()!;
    if (this.ids.length) {
      this.ids[0] = lastId; this.fs[0] = lastF;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.ids.length && this.fs[l]! < this.fs[m]!) m = l;
        if (r < this.ids.length && this.fs[r]! < this.fs[m]!) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.ids[a], this.ids[b]] = [this.ids[b]!, this.ids[a]!];
    [this.fs[a], this.fs[b]] = [this.fs[b]!, this.fs[a]!];
  }
}

/**
 * Síť kolejí / silnic z geometrie mapového podkladu. Uzly na hranicích dlaždic se slučují (mřížka 0,5 m),
 * úseky jsou v prostorovém indexu. Umí: nejbližší bod na trati, cestu po trati (A*) a průchod zpět o danou délku.
 */
export class TrackNetwork {
  private lng: number[] = [];
  private lat: number[] = [];
  private adj: number[][] = [];
  private segA: number[] = [];
  private segB: number[] = [];
  private grid = new Map<number, number[]>();
  private keys = new Map<string, number>();
  private readonly kx: number;
  private readonly ky = 111_195;

  constructor(lines: readonly (readonly LngLat[])[], refLat: number, private readonly cell = 40) {
    this.kx = 111_195 * Math.cos(refLat * D2R);
    for (const line of lines) {
      let prev = -1;
      for (const p of line) {
        const n = this.node(p);
        if (prev >= 0 && prev !== n) this.addSeg(prev, n);
        prev = n;
      }
    }
  }

  get segments(): number { return this.segA.length; }

  private node(p: LngLat): number {
    const key = `${Math.round(p.lng * this.kx * 2)}:${Math.round(p.lat * this.ky * 2)}`;
    let n = this.keys.get(key);
    if (n === undefined) { n = this.lng.length; this.lng.push(p.lng); this.lat.push(p.lat); this.adj.push([]); this.keys.set(key, n); }
    return n;
  }

  private pt(n: number): LngLat { return { lng: this.lng[n]!, lat: this.lat[n]! }; }
  private cellKey(x: number, y: number) { return x * 1_000_003 + y; }

  private addSeg(a: number, b: number) {
    const na = this.adj[a]!, nb = this.adj[b]!;
    if (na.includes(b)) return;
    na.push(b); nb.push(a);
    const s = this.segA.length;
    this.segA.push(a); this.segB.push(b);
    const x0 = Math.floor((Math.min(this.lng[a]!, this.lng[b]!) * this.kx) / this.cell), x1 = Math.floor((Math.max(this.lng[a]!, this.lng[b]!) * this.kx) / this.cell);
    const y0 = Math.floor((Math.min(this.lat[a]!, this.lat[b]!) * this.ky) / this.cell), y1 = Math.floor((Math.max(this.lat[a]!, this.lat[b]!) * this.ky) / this.cell);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const k = this.cellKey(x, y);
      const list = this.grid.get(k);
      if (list) list.push(s); else this.grid.set(k, [s]);
    }
  }

  /**
   * Nejbližší bod na trati do vzdálenosti maxDist. Se známým směrem jízdy penalizuje příčné úseky
   * a kolej vlevo od vozidla (pravostranný provoz) – pomáhá u souběžných kolejí opačných směrů.
   */
  nearest(p: LngLat, maxDist: number, heading: number | null = null): Snap | null {
    const px = p.lng * this.kx, py = p.lat * this.ky;
    const cx = Math.floor(px / this.cell), cy = Math.floor(py / this.cell), r = Math.ceil(maxDist / this.cell);
    const seen = new Set<number>();
    let best: Snap | null = null, bestScore = Infinity;
    const hx = heading === null ? 0 : Math.sin(heading * D2R), hy = heading === null ? 0 : Math.cos(heading * D2R);
    for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) {
      for (const s of this.grid.get(this.cellKey(x, y)) ?? []) {
        if (seen.has(s)) continue;
        seen.add(s);
        const a = this.segA[s]!, b = this.segB[s]!;
        const ax = this.lng[a]! * this.kx, ay = this.lat[a]! * this.ky, dx = this.lng[b]! * this.kx - ax, dy = this.lat[b]! * this.ky - ay;
        const l2 = dx * dx + dy * dy;
        const t = l2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
        const qx = ax + t * dx, qy = ay + t * dy;
        const d = Math.hypot(px - qx, py - qy);
        if (d > maxDist) continue;
        const segBearing = ((Math.atan2(dx, dy) / D2R) + 360) % 360;
        let score = d;
        if (heading !== null) {
          if (axisDiff(heading, segBearing) > 50) score += 12;
          if (hx * (qy - py) - hy * (qx - px) > 0.5) score += 2.5;
        }
        if (score < bestScore) { bestScore = score; best = { seg: s, t, point: { lng: qx / this.kx, lat: qy / this.ky }, dist: d, segBearing }; }
      }
    }
    return best;
  }

  /** Nejkratší cesta po trati mezi dvěma body (A*), omezená délkou; null = trať nespojitá. */
  path(A: Snap, B: Snap, maxLen: number): LngLat[] | null {
    if (A.seg === B.seg) return [A.point, B.point];
    const goal = new Map<number, number>([[this.segA[B.seg]!, distM(this.pt(this.segA[B.seg]!), B.point)], [this.segB[B.seg]!, distM(this.pt(this.segB[B.seg]!), B.point)]]);
    const g = new Map<number, number>();
    const prev = new Map<number, number>();
    const heap = new MinHeap();
    const h = (n: number) => distM(this.pt(n), B.point);
    for (const n of [this.segA[A.seg]!, this.segB[A.seg]!]) {
      const c = distM(A.point, this.pt(n));
      if (c < (g.get(n) ?? Infinity)) { g.set(n, c); prev.set(n, -1); heap.push(n, c + h(n)); }
    }
    let bestTotal = Infinity, bestEnd = -1, expansions = 0;
    for (let item = heap.pop(); item; item = heap.pop()) {
      if (item.f >= bestTotal || ++expansions > 6000) break;
      const n = item.id, gn = g.get(n)!;
      if (item.f > gn + h(n) + 1e-6) continue;
      const gc = goal.get(n);
      if (gc !== undefined && gn + gc < bestTotal) { bestTotal = gn + gc; bestEnd = n; }
      for (const m of this.adj[n]!) {
        const c = gn + distM(this.pt(n), this.pt(m));
        if (c > maxLen || c >= (g.get(m) ?? Infinity)) continue;
        g.set(m, c); prev.set(m, n); heap.push(m, c + h(m));
      }
    }
    if (bestEnd < 0) return null;
    const nodes: number[] = [];
    for (let n = bestEnd; n !== -1; n = prev.get(n) ?? -1) nodes.push(n);
    nodes.reverse();
    return [A.point, ...nodes.map((n) => this.pt(n)), B.point];
  }

  /** Průchod po trati z bodu ve směru `heading` o délku `length` (na výhybkách nejpřímější pokračování). */
  walk(from: Snap, heading: number, length: number): LngLat[] {
    const a = this.segA[from.seg]!, b = this.segB[from.seg]!;
    const towardB = angDiff(heading, from.segBearing) <= 90;
    let cur = towardB ? b : a, prevN = towardB ? a : b;
    const out: LngLat[] = [from.point];
    let acc = distM(from.point, this.pt(cur));
    if (acc >= length) return [from.point, lerp(from.point, this.pt(cur), acc > 0 ? length / acc : 0)];
    out.push(this.pt(cur));
    for (let guard = 0; guard < 2000; guard++) {
      const inB = bearingDeg(this.pt(prevN), this.pt(cur));
      let next = -1, bestTurn = Infinity;
      for (const m of this.adj[cur]!) {
        if (m === prevN) continue;
        const turn = angDiff(inB, bearingDeg(this.pt(cur), this.pt(m)));
        if (turn < bestTurn) { bestTurn = turn; next = m; }
      }
      if (next < 0 || bestTurn > 75) break;
      const seg = distM(this.pt(cur), this.pt(next));
      if (acc + seg >= length) { out.push(lerp(this.pt(cur), this.pt(next), seg > 0 ? (length - acc) / seg : 0)); return out; }
      acc += seg; out.push(this.pt(next)); prevN = cur; cur = next;
    }
    return out;
  }
}
