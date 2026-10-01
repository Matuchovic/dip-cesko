/** Token bucket – ochrana limitu zdroje (Golemio: 20 požadavků / 8 s na klíč) i našeho API proti zahlcení. */
export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(private readonly capacity: number, private readonly refillPerMs: number, private readonly now: () => number = Date.now) {
    this.tokens = capacity;
    this.last = now();
  }
  take(cost = 1): boolean {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + (t - this.last) * this.refillPerMs);
    this.last = t;
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}

const g = globalThis as unknown as { __golemioBucket?: TokenBucket; __clientBuckets?: Map<string, TokenBucket> };
/** Rezerva pod limitem 20/8 s pro souběh instancí. */
export const golemioBucket: TokenBucket = g.__golemioBucket ?? (g.__golemioBucket = new TokenBucket(16, 16 / 8000));

const clientBuckets: Map<string, TokenBucket> = g.__clientBuckets ?? (g.__clientBuckets = new Map());

/** Omezení na klienta (IP z proxy hlavičky). Vrací false, pokud klient překročil limit. */
export function allowClient(req: Request, perMinute = 120): boolean {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
  const key = `${ip}|${perMinute}`;
  let b = clientBuckets.get(key);
  if (!b) {
    if (clientBuckets.size > 5000) clientBuckets.clear();
    b = new TokenBucket(perMinute, perMinute / 60000);
    clientBuckets.set(key, b);
  }
  return b.take();
}
