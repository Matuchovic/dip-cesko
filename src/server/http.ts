import { log } from './log';

export class UpstreamError extends Error {
  constructor(public readonly provider: string, public readonly status: number | null, message: string, public readonly retryAfterS: number | null = null) {
    super(message);
    this.name = 'UpstreamError';
  }
}

export interface FetchPolicy {
  provider: string;
  allowHosts: readonly string[];
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  maxBytes?: number;
  signal?: AbortSignal;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Serverový požadavek na známého poskytovatele: allowlist hostitelů (ochrana proti SSRF), timeout,
 * omezené opakování s exponenciálním odstupem u chyb 5xx a sítě, respektování 429 bez opakování.
 */
export async function fetchText(url: string, policy: FetchPolicy): Promise<{ text: string; status: number; headers: Headers }> {
  const u = new URL(url);
  if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') throw new UpstreamError(policy.provider, null, 'Nepovolený protokol');
  if (!policy.allowHosts.includes(u.host)) throw new UpstreamError(policy.provider, null, `Nepovolený hostitel ${u.host}`);
  const retries = policy.retries ?? 2;
  const maxBytes = policy.maxBytes ?? 20 * 1024 * 1024;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error('timeout')), policy.timeoutMs ?? 8000);
    const onAbort = () => ctrl.abort(policy.signal?.reason);
    policy.signal?.addEventListener('abort', onAbort, { once: true });
    const started = Date.now();
    try {
      const res = await fetch(u, { headers: { 'accept-encoding': 'gzip', ...policy.headers }, signal: ctrl.signal, cache: 'no-store' });
      if (res.status === 429) {
        const ra = Number(res.headers.get('retry-after'));
        throw new UpstreamError(policy.provider, 429, 'Překročen limit požadavků zdroje', Number.isFinite(ra) ? ra : null);
      }
      if (res.status >= 500) throw new UpstreamError(policy.provider, res.status, `Chyba zdroje ${res.status}`);
      if (!res.ok) throw new UpstreamError(policy.provider, res.status, `Zdroj odmítl požadavek (${res.status})`);
      const len = Number(res.headers.get('content-length'));
      if (Number.isFinite(len) && len > maxBytes) throw new UpstreamError(policy.provider, res.status, 'Odpověď je příliš velká');
      const text = await res.text();
      if (text.length > maxBytes) throw new UpstreamError(policy.provider, res.status, 'Odpověď je příliš velká');
      log('info', 'upstream.ok', { provider: policy.provider, host: u.host, path: u.pathname, ms: Date.now() - started, bytes: text.length });
      return { text, status: res.status, headers: res.headers };
    } catch (err) {
      lastErr = err;
      const retryable = !(err instanceof UpstreamError) || (err.status !== null && err.status >= 500);
      log('warn', 'upstream.fail', { provider: policy.provider, host: u.host, path: u.pathname, attempt, ms: Date.now() - started, error: err instanceof Error ? err.message : String(err) });
      if (!retryable || attempt === retries || policy.signal?.aborted) break;
      await sleep(250 * 2 ** attempt + Math.random() * 200);
    } finally {
      clearTimeout(timer);
      policy.signal?.removeEventListener('abort', onAbort);
    }
  }
  if (lastErr instanceof UpstreamError) throw lastErr;
  throw new UpstreamError(policy.provider, null, lastErr instanceof Error ? lastErr.message : 'Síťová chyba');
}

export async function fetchJson(url: string, policy: FetchPolicy): Promise<unknown> {
  const { text } = await fetchText(url, policy);
  try { return JSON.parse(text) as unknown; } catch { throw new UpstreamError(policy.provider, null, 'Neplatný JSON ze zdroje'); }
}
