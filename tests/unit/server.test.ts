import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SharedCache } from '@/server/cache';
import { TokenBucket } from '@/server/rateLimit';
import { fetchJson, fetchText, UpstreamError } from '@/server/http';

describe('sdílená cache', () => {
  it('slučuje souběžné požadavky (single-flight) a drží TTL', async () => {
    let t = 0;
    const c = new SharedCache(() => t);
    const loader = vi.fn(async () => { await new Promise((r) => setTimeout(r, 5)); return 42; });
    const [a, b] = await Promise.all([c.get('k', { ttlMs: 1000, staleMs: 5000 }, loader), c.get('k', { ttlMs: 1000, staleMs: 5000 }, loader)]);
    expect(a.value).toBe(42); expect(b.value).toBe(42); expect(loader).toHaveBeenCalledTimes(1);
    t = 500; await c.get('k', { ttlMs: 1000, staleMs: 5000 }, loader); expect(loader).toHaveBeenCalledTimes(1);
    t = 1500; await c.get('k', { ttlMs: 1000, staleMs: 5000 }, loader); expect(loader).toHaveBeenCalledTimes(2);
  });
  it('při výpadku vrátí poslední data označená jako zastaralá – jen v limitu', async () => {
    let t = 0;
    const c = new SharedCache(() => t);
    await c.get('k', { ttlMs: 1000, staleMs: 5000 }, async () => 'ok');
    t = 2000;
    const r = await c.get('k', { ttlMs: 1000, staleMs: 5000 }, async () => { throw new Error('výpadek'); });
    expect(r).toMatchObject({ value: 'ok', stale: true, error: 'výpadek', fetchedAt: 0 });
    t = 7000;
    await expect(c.get('k', { ttlMs: 1000, staleMs: 5000 }, async () => { throw new Error('výpadek'); })).rejects.toThrow('výpadek');
  });
  it('při vyčerpaném limitu zdroje nevolá zdroj', async () => {
    let t = 0;
    const c = new SharedCache(() => t);
    await c.get('k', { ttlMs: 1000, staleMs: 5000 }, async () => 1);
    t = 1500;
    const loader = vi.fn(async () => 2);
    expect(await c.get('k', { ttlMs: 1000, staleMs: 5000, canFetch: () => false }, loader)).toMatchObject({ value: 1, stale: true, error: 'rate_limited' });
    expect(loader).not.toHaveBeenCalled();
    await expect(c.get('jiny', { ttlMs: 1000, staleMs: 5000, canFetch: () => false }, loader)).rejects.toThrow('rate_limited');
  });
  it('token bucket omezí počet požadavků a postupně doplňuje', () => {
    let t = 0;
    const b = new TokenBucket(2, 2 / 8000, () => t);
    expect(b.take()).toBe(true); expect(b.take()).toBe(true); expect(b.take()).toBe(false);
    t = 4000; expect(b.take()).toBe(true); expect(b.take()).toBe(false);
  });
});

describe('serverové požadavky na zdroje', () => {
  const policy = { provider: 'test', allowHosts: ['api.golemio.cz'] };
  const hang = (_u: unknown, init?: RequestInit) => new Promise<Response>((_r, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))));
  beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('odmítne nepovolené hostitele a protokol (SSRF)', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    await expect(fetchText('https://169.254.169.254/latest', policy)).rejects.toBeInstanceOf(UpstreamError);
    await expect(fetchText('http://api.golemio.cz/v2', policy)).rejects.toThrow('Nepovolený protokol');
    expect(f).not.toHaveBeenCalled();
  });
  it('po chybě 5xx opakuje a uspěje', async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response('x', { status: 503 })).mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', f);
    await expect(fetchJson('https://api.golemio.cz/v2/x', { ...policy, retries: 2 })).resolves.toEqual({ ok: true });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('429 neopakuje a předá Retry-After; 4xx neopakuje', async () => {
    const f = vi.fn().mockResolvedValue(new Response('', { status: 429, headers: { 'retry-after': '8' } }));
    vi.stubGlobal('fetch', f);
    const err = await fetchText('https://api.golemio.cz/v2/x', { ...policy, retries: 2 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).status).toBe(429);
    expect((err as UpstreamError).retryAfterS).toBe(8);
    expect(f).toHaveBeenCalledTimes(1);
    const g = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    vi.stubGlobal('fetch', g);
    await expect(fetchText('https://api.golemio.cz/v2/x', { ...policy, retries: 2 })).rejects.toThrow('401');
    expect(g).toHaveBeenCalledTimes(1);
  });
  it('timeout požadavek zruší', async () => {
    vi.stubGlobal('fetch', vi.fn(hang));
    await expect(fetchText('https://api.golemio.cz/v2/x', { ...policy, retries: 0, timeoutMs: 30 })).rejects.toBeInstanceOf(UpstreamError);
  });
  it('zrušení zvenčí ukončí i opakování', async () => {
    const ctrl = new AbortController();
    const f = vi.fn(hang);
    vi.stubGlobal('fetch', f);
    setTimeout(() => ctrl.abort(), 20);
    await expect(fetchText('https://api.golemio.cz/v2/x', { ...policy, retries: 3, timeoutMs: 5000, signal: ctrl.signal })).rejects.toBeInstanceOf(UpstreamError);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('odmítne příliš velkou odpověď', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x'.repeat(2000), { status: 200 })));
    await expect(fetchText('https://api.golemio.cz/v2/x', { ...policy, retries: 0, maxBytes: 1000 })).rejects.toThrow('příliš velká');
  });
});
