interface Entry { value: unknown; fetchedAt: number; expiresAt: number; staleUntil: number }

export interface CacheResult<T> { value: T; fetchedAt: number; stale: boolean; error: string | null }

/**
 * Sdílená serverová cache se slučováním souběžných požadavků (single-flight).
 * Při výpadku zdroje vrací poslední úspěšná data označená jako zastaralá – v rámci limitu staleMs.
 * Pozn.: paměť je per-instance; pro více instancí doporučeno sdílené úložiště (viz docs/operations.md).
 */
export class SharedCache {
  private entries = new Map<string, Entry>();
  private inflight = new Map<string, Promise<unknown>>();

  constructor(private readonly now: () => number = Date.now, private readonly maxEntries = 500) {}

  peek<T>(key: string): CacheResult<T> | null {
    const e = this.entries.get(key);
    return e ? { value: e.value as T, fetchedAt: e.fetchedAt, stale: this.now() >= e.expiresAt, error: null } : null;
  }

  async get<T>(key: string, opts: { ttlMs: number; staleMs: number; canFetch?: () => boolean }, loader: () => Promise<T>): Promise<CacheResult<T>> {
    const t = this.now();
    const e = this.entries.get(key);
    if (e && t < e.expiresAt) return { value: e.value as T, fetchedAt: e.fetchedAt, stale: false, error: null };
    if (opts.canFetch && !opts.canFetch()) {
      if (e && t < e.staleUntil) return { value: e.value as T, fetchedAt: e.fetchedAt, stale: true, error: 'rate_limited' };
      throw new Error('rate_limited');
    }
    try {
      let p = this.inflight.get(key) as Promise<T> | undefined;
      if (!p) {
        p = loader();
        this.inflight.set(key, p);
        p.finally(() => this.inflight.delete(key)).catch(() => undefined);
      }
      const value = await p;
      const now = this.now();
      this.entries.set(key, { value, fetchedAt: now, expiresAt: now + opts.ttlMs, staleUntil: now + opts.ttlMs + opts.staleMs });
      if (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value as string);
      return { value, fetchedAt: now, stale: false, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (e && this.now() < e.staleUntil) return { value: e.value as T, fetchedAt: e.fetchedAt, stale: true, error: message };
      throw err;
    }
  }
}

const g = globalThis as unknown as { __dopravaCache?: SharedCache };
export const sharedCache: SharedCache = g.__dopravaCache ?? (g.__dopravaCache = new SharedCache());
