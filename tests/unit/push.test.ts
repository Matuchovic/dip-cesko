import { describe, expect, it } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { fireWatch, isAllowedPushEndpoint, pushMessage, verifyQstashSignature, WatchInput, newWatch, tokenMatches, type FireDeps, type Watch } from '@/server/push';
import { knownDelay, type Departure } from '@/domain/model';

const b64u = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (key: string, body: string, claims: Record<string, unknown>) => {
  const h = b64u(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const p = b64u(Buffer.from(JSON.stringify({ iss: 'Upstash', body: b64u(createHash('sha256').update(body).digest()), ...claims })));
  return `${h}.${p}.${b64u(createHmac('sha256', key).update(`${h}.${p}`).digest())}`;
};

describe('upozornění: bezpečnost', () => {
  it('podpis QStash: platný projde, cizí klíč / změněné tělo / prošlý ne; funguje i příští klíč', () => {
    const now = 1_800_000_000, body = '{"id":"x"}', url = 'https://app.example/api/push/fire';
    const ok = jwt('cur', body, { sub: url, exp: now + 300, nbf: now - 5 });
    expect(verifyQstashSignature(ok, body, ['cur', 'next'], url, now)).toBe(true);
    expect(verifyQstashSignature(jwt('next', body, { sub: url, exp: now + 300 }), body, ['cur', 'next'], url, now)).toBe(true);
    expect(verifyQstashSignature(jwt('evil', body, { sub: url, exp: now + 300 }), body, ['cur', 'next'], url, now)).toBe(false);
    expect(verifyQstashSignature(ok, '{"id":"y"}', ['cur'], url, now)).toBe(false);
    expect(verifyQstashSignature(jwt('cur', body, { sub: url, exp: now - 600 }), body, ['cur'], url, now)).toBe(false);
    expect(verifyQstashSignature(jwt('cur', body, { sub: 'https://jinde.example/x', exp: now + 300 }), body, ['cur'], url, now)).toBe(false);
    expect(verifyQstashSignature(null, body, ['cur'], url, now)).toBe(false);
  });
  it('posílá jen na push služby prohlížečů (žádné libovolné URL)', () => {
    for (const ok of ['https://fcm.googleapis.com/fcm/send/abc', 'https://web.push.apple.com/QK', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://db5p.notify.windows.com/w/?token=1']) expect(isAllowedPushEndpoint(ok)).toBe(true);
    for (const bad of ['http://fcm.googleapis.com/x', 'https://169.254.169.254/latest', 'https://evil.com/fcm.googleapis.com', 'https://fcm.googleapis.com:8443/x', 'nonsense']) expect(isAllowedPushEndpoint(bad)).toBe(false);
  });
  it('vstup se striktně ověřuje; zrušení jen se správným tokenem', () => {
    const base = { subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } }, stop: 'pid:Anděl', stopName: 'Anděl', line: '9', headsign: 'Spojovací', scheduledAt: '2026-10-03T10:00:00+02:00', leadMin: 5 };
    expect(WatchInput.safeParse(base).success).toBe(true);
    expect(WatchInput.safeParse({ ...base, line: '<script>' }).success).toBe(false);
    expect(WatchInput.safeParse({ ...base, leadMin: 7 }).success).toBe(false);
    const { watch, token } = newWatch(WatchInput.parse(base));
    expect(tokenMatches(watch, token)).toBe(true);
    expect(tokenMatches(watch, token + 'x')).toBe(false);
  });
});

describe('upozornění: chytré doručení', () => {
  const T0 = Date.parse('2026-10-03T10:00:00+02:00');
  const w = (over: Partial<Watch> = {}): Watch => ({ id: '00000000-0000-4000-8000-000000000001', tokenHash: 'x', createdAt: '', reschedules: 0, subscription: { endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'p', auth: 'a' } },
    stop: 'pid:Anděl', stopName: 'Anděl', line: '9', headsign: 'Spojovací', scheduledAt: new Date(T0).toISOString(), leadMin: 5, lang: 'cs', ...over });
  const dep = (delayS: number, canceled = false): Departure => ({ route: { shortName: '9', mode: 'tram' }, headsign: 'Spojovací', scheduledAt: new Date(T0).toISOString(), predictedAt: new Date(T0 + delayS * 1000).toISOString(),
    delay: knownDelay(delayS), platform: 'A', isCanceled: canceled } as unknown as Departure);
  const deps = (watch: Watch | null, list: Departure[], now: number) => {
    const log: string[] = [];
    const d: FireDeps = { load: async () => watch, save: async () => { log.push('save'); }, remove: async () => { log.push('remove'); }, departures: async () => list,
      publish: async (_id, s) => { log.push(`publish:${s}`); }, send: async (_w, m) => { log.push(`send:${m.body}`); return 'ok'; }, now: () => now };
    return { d, log };
  };
  it('včas: 5 min před odjezdem pošle upozornění a hlídání smaže', async () => {
    const { d, log } = deps(w(), [dep(0)], T0 - 5 * 60_000);
    expect(await fireWatch('id', d)).toBe('sent');
    expect(log).toEqual(['send:Odjíždí za 5 min z Anděl · nást. A', 'remove']);
  });
  it('zpoždění 4 min: přeplánuje se přesně na nový čas (žádné předčasné upozornění)', async () => {
    const { d, log } = deps(w(), [dep(240)], T0 - 5 * 60_000);
    expect(await fireWatch('id', d)).toBe('rescheduled');
    expect(log[0]).toBe('publish:240');
  });
  it('zrušený spoj nahlásí; chybějící hlídání nic nedělá', async () => {
    const a = deps(w(), [dep(0, true)], T0 - 5 * 60_000);
    expect(await fireWatch('id', a.d)).toBe('canceled');
    expect(a.log[0]).toContain('zrušený');
    expect(await fireWatch('id', deps(null, [], T0).d)).toBe('missing');
  });
  it('anglický text s nástupištěm a zpožděním', () => {
    const m = pushMessage(w({ lang: 'en' }), dep(120), T0 - 3 * 60_000, 'arrival');
    expect(m.title).toBe('9 → Spojovací');
    expect(m.body).toBe('Leaves in 5 min from Anděl · stop A · 2 min late');
    expect(m.url).toBe('/odjezdy?zastavka=pid%3AAnd%C4%9Bl');
  });
});
