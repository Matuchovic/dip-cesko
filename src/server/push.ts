import 'server-only';
import webpush from 'web-push';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Departure } from '@/domain/model';

/**
 * Upozornění na blížící se spoj (Web Push):
 * – uložení hlídání: Upstash Redis (REST), naplánování: Upstash QStash (zpožděná zpráva přesně na čas),
 * – při doručení QStash se znovu ověří živý odjezd: zpožděný spoj se přeplánuje, včasný se oznámí, zrušený nahlásí.
 * Bez nastavených proměnných prostředí je funkce vypnutá (aplikace to uživateli řekne).
 */
export interface PushConfig {
  vapidPublic: string; vapidPrivate: string; subject: string;
  redisUrl: string; redisToken: string;
  qstashUrl: string; qstashToken: string; signCurrent: string; signNext: string;
  baseUrl: string;
}
export function pushConfig(env: NodeJS.ProcessEnv = process.env): PushConfig | null {
  const redisUrl = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL ?? '';
  const redisToken = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN ?? '';
  const baseUrl = env.APP_URL ?? (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  const c = {
    vapidPublic: env.VAPID_PUBLIC_KEY ?? '', vapidPrivate: env.VAPID_PRIVATE_KEY ?? '', subject: env.VAPID_SUBJECT ?? (baseUrl || 'mailto:upozorneni@dopravacr.invalid'),
    redisUrl, redisToken, qstashUrl: (env.QSTASH_URL ?? 'https://qstash.upstash.io').replace(/\/+$/, ''), qstashToken: env.QSTASH_TOKEN ?? '',
    signCurrent: env.QSTASH_CURRENT_SIGNING_KEY ?? '', signNext: env.QSTASH_NEXT_SIGNING_KEY ?? '', baseUrl: baseUrl.replace(/\/+$/, ''),
  };
  return Object.values(c).every((v) => typeof v === 'string' && v.length > 0) && /^https:\/\//.test(c.redisUrl) && /^https:\/\//.test(c.baseUrl) ? c : null;
}

// ---------- ověřování vstupů ----------
/** Push služby prohlížečů – server posílá jen sem (žádné libovolné URL = žádné SSRF). */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^([a-z0-9-]+\.)*push\.apple\.com$/, /^([a-z0-9-]+\.)*notify\.windows\.com$/, /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/];
export function isAllowedPushEndpoint(endpoint: string): boolean {
  try { const u = new URL(endpoint); return u.protocol === 'https:' && !u.port && PUSH_HOSTS.some((r) => r.test(u.hostname)); } catch { return false; }
}
const b64u = z.string().regex(/^[A-Za-z0-9_-]+={0,2}$/);
export const WatchInput = z.object({
  subscription: z.object({ endpoint: z.string().url().max(800), keys: z.object({ p256dh: b64u.min(80).max(120), auth: b64u.min(16).max(40) }) }),
  stop: z.string().min(1).max(80), stopName: z.string().min(1).max(80),
  line: z.string().regex(/^[A-Za-z0-9]{1,6}$/), headsign: z.string().max(80).nullable(),
  mode: z.enum(['tram', 'metro', 'bus', 'trolleybus', 'train', 'ferry', 'funicular', 'other']).default('bus'),
  scheduledAt: z.string().datetime({ offset: true }), leadMin: z.union([z.literal(2), z.literal(5), z.literal(10)]),
  lang: z.enum(['cs', 'en']).default('cs'),
});
export type WatchRequest = z.infer<typeof WatchInput>;
export interface Watch extends WatchRequest { id: string; tokenHash: string; createdAt: string; reschedules: number }

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export const hashToken = sha;
export function newWatch(req: WatchRequest): { watch: Watch; token: string } {
  const token = randomBytes(24).toString('base64url');
  return { token, watch: { ...req, id: randomUUID(), tokenHash: sha(token), createdAt: new Date().toISOString(), reschedules: 0 } };
}
export function tokenMatches(w: Watch, token: string): boolean {
  const a = Buffer.from(w.tokenHash, 'hex'), b = Buffer.from(sha(token), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- podpis zpráv z QStash (JWT HS256) ----------
const b64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function verifyQstashSignature(jwt: string | null, rawBody: string, keys: string[], url: string | null, nowS = Math.floor(Date.now() / 1000)): boolean {
  if (!jwt) return false;
  const parts = jwt.split('.');
  if (parts.length !== 3) return false;
  const [h, p, sig] = parts as [string, string, string];
  const okSig = keys.filter(Boolean).some((k) => {
    const expect = Buffer.from(b64url(createHmac('sha256', k).update(`${h}.${p}`).digest()));
    const got = Buffer.from(sig.replace(/=+$/, ''));
    return expect.length === got.length && timingSafeEqual(expect, got);
  });
  if (!okSig) return false;
  try {
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as { iss?: string; sub?: string; exp?: number; nbf?: number; body?: string };
    if (claims.iss !== 'Upstash') return false;
    if (typeof claims.exp === 'number' && claims.exp < nowS - 30) return false;
    if (typeof claims.nbf === 'number' && claims.nbf > nowS + 30) return false;
    if (url && claims.sub && claims.sub !== url) return false;
    const bodyHash = b64url(createHash('sha256').update(rawBody).digest());
    return (claims.body ?? '').replace(/=+$/, '') === bodyHash;
  } catch { return false; }
}

// ---------- texty upozornění ----------
const EMOJI: Record<string, string> = { tram: '🚋', metro: '🚇', bus: '🚌', trolleybus: '🚎', train: '🚆', ferry: '⛴️', funicular: '🚠', other: '🚏' };
const clock = (ms: number) => new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit' }).format(ms);
export interface PushMessage { title: string; body: string; url: string; tag: string; actions: { action: string; title: string; url: string }[] }

/**
 * Upozornění: to hlavní v nadpisu (telefon ho zobrazí tučně) – druh dopravy, linka, za kolik minut, kam;
 * 2. řádek kde, 3. řádek stav a co dělat. Zrušený spoj nabídne další spoj stejné linky.
 */
export function pushMessage(w: Watch, d: Departure | null, now: number, kind: 'arrival' | 'canceled', next: Departure | null = null): PushMessage {
  const en = w.lang === 'en';
  const mode = d?.route.mode ?? w.mode ?? 'bus';
  const emoji = EMOJI[mode] ?? EMOJI.other!;
  const dest = w.headsign ?? w.stopName;
  const deps = `/odjezdy?zastavka=${encodeURIComponent(w.stop)}`;
  const line = `/linka?l=${encodeURIComponent(w.line)}&m=${encodeURIComponent(mode)}`;
  const tag = `watch-${w.id}`;
  if (kind === 'canceled') {
    const at = clock(Date.parse(w.scheduledAt));
    const nm = next ? Math.max(0, Math.round((Date.parse(next.predictedAt ?? next.scheduledAt ?? '') - now) / 60_000)) : null;
    return {
      title: en ? `❌ ${w.line} · ${dest} is cancelled` : `❌ ${w.line} · ${dest} nepojede`,
      body: (en ? `The ${at} departure is cancelled.` : `Spoj v ${at} je zrušený.`) + (nm !== null ? (en ? `\n➡️ Next ${w.line} in ${nm} min.` : `\n➡️ Další ${w.line} jede za ${nm} min.`) : ''),
      url: deps, tag, actions: [{ action: 'deps', title: en ? 'Next departure' : 'Ukázat další spoj', url: deps }],
    };
  }
  const dep = d ? Date.parse(d.predictedAt ?? d.scheduledAt ?? w.scheduledAt) : Date.parse(w.scheduledAt);
  const min = Math.max(0, Math.round((dep - now) / 60_000));
  const when = min <= 0 ? (en ? 'now' : 'teď') : (en ? `in ${min} min` : `za ${min} min`);
  const plat = d?.platform ? (en ? `, stop ${d.platform}` : `, nástupiště ${d.platform}`) : '';
  const late = d && d.delay.kind === 'known' && d.delay.seconds >= 60 ? Math.round(d.delay.seconds / 60) : 0;
  const status = late ? (en ? `⏱️ ${late} min late` : `⏱️ ${late} min zpoždění`) : d?.delay.kind === 'known' ? (en ? '✅ on time' : '✅ jede včas') : (en ? '🕒 per timetable' : '🕒 podle jízdního řádu');
  const hurry = min <= 3 ? (en ? ' · 🏃 leave now' : ' · 🏃 vyraz hned') : '';
  return {
    title: `${emoji} ${w.line} · ${when} · ${dest}`,
    body: `📍 ${w.stopName}${plat}\n${status}${hurry}`,
    url: deps, tag,
    actions: [{ action: 'line', title: en ? 'Where is it' : 'Kde je spoj', url: line }, { action: 'deps', title: en ? 'Departures' : 'Odjezdy', url: deps }],
  };
}

// ---------- vlastní logika doručení (oddělená od sítě kvůli testům) ----------
export interface FireDeps {
  load(id: string): Promise<Watch | null>; save(w: Watch, ttlS: number): Promise<void>; remove(id: string): Promise<void>;
  departures(stop: string): Promise<Departure[]>; publish(id: string, delayS: number): Promise<void>;
  send(w: Watch, msg: PushMessage): Promise<'ok' | 'gone' | 'error'>; now(): number;
}
export async function fireWatch(id: string, deps: FireDeps): Promise<'missing' | 'rescheduled' | 'sent' | 'canceled' | 'gone' | 'expired'> {
  const w = await deps.load(id);
  if (!w) return 'missing';
  const now = deps.now(), sched = Date.parse(w.scheduledAt), leadS = w.leadMin * 60;
  const list = await deps.departures(w.stop).catch(() => [] as Departure[]);
  const d = list.find((x) => x.route.shortName === w.line && (!w.headsign || x.headsign === w.headsign) && Math.abs(Date.parse(x.scheduledAt ?? '') - sched) <= 120_000) ?? null;
  if (d?.isCanceled) {
    const next = list.filter((x) => x !== d && !x.isCanceled && x.route.shortName === w.line && (!w.headsign || x.headsign === w.headsign) && Date.parse(x.predictedAt ?? x.scheduledAt ?? '') > now)
      .sort((a, b) => Date.parse(a.predictedAt ?? a.scheduledAt ?? '') - Date.parse(b.predictedAt ?? b.scheduledAt ?? ''))[0] ?? null;
    const r = await deps.send(w, pushMessage(w, d, now, 'canceled', next));
    await deps.remove(id);
    return r === 'gone' ? 'gone' : 'canceled';
  }
  if (!d) {
    // spoj už v tabuli není: buď odjel, nebo ještě není vidět – zkusit znovu nejvýš párkrát
    if (now > sched + 120_000 || w.reschedules >= 6) { await deps.remove(id); return 'expired'; }
    await deps.publish(id, 60); await deps.save({ ...w, reschedules: w.reschedules + 1 }, ttlFor(w, now)); return 'rescheduled';
  }
  const untilS = (Date.parse(d.predictedAt ?? d.scheduledAt ?? w.scheduledAt) - now) / 1000;
  if (untilS > leadS + 45 && w.reschedules < 10) {
    // zpoždění: upozornit až v pravou chvíli
    await deps.publish(id, Math.round(untilS - leadS)); await deps.save({ ...w, reschedules: w.reschedules + 1 }, ttlFor(w, now)); return 'rescheduled';
  }
  const r = await deps.send(w, pushMessage(w, d, now, 'arrival'));
  await deps.remove(id);
  return r === 'gone' ? 'gone' : 'sent';
}
export const ttlFor = (w: Watch, now: number) => Math.max(600, Math.min(6 * 3600, Math.round((Date.parse(w.scheduledAt) - now) / 1000) + 3600));

// ---------- napojení na Upstash a Web Push ----------
export function redis(cfg: PushConfig) {
  const call = async (cmd: (string | number)[]) => {
    const r = await fetch(cfg.redisUrl, { method: 'POST', headers: { Authorization: `Bearer ${cfg.redisToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd), signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`Redis ${r.status}`);
    return ((await r.json()) as { result: unknown }).result;
  };
  return {
    async load(id: string) { const v = await call(['GET', `pw:${id}`]); return typeof v === 'string' ? (JSON.parse(v) as Watch) : null; },
    async save(w: Watch, ttlS: number) { await call(['SET', `pw:${w.id}`, JSON.stringify(w), 'EX', ttlS]); },
    async remove(id: string) { await call(['DEL', `pw:${id}`]); },
    /** Nejvýš 10 aktivních hlídání na jedno zařízení (ochrana proti zneužití). */
    async countFor(endpoint: string, ttlS: number) { const k = `pc:${sha(endpoint).slice(0, 32)}`; const n = Number(await call(['INCR', k])); await call(['EXPIRE', k, ttlS]); return n; },
  };
}
export function qstash(cfg: PushConfig) {
  return async (id: string, delayS: number) => {
    const dest = `${cfg.baseUrl}/api/push/fire`;
    const r = await fetch(`${cfg.qstashUrl}/v2/publish/${dest}`, {
      method: 'POST', body: JSON.stringify({ id }), signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${cfg.qstashToken}`, 'Content-Type': 'application/json', 'Upstash-Delay': `${Math.max(0, Math.round(delayS))}s`, 'Upstash-Retries': '2' },
    });
    if (!r.ok) throw new Error(`QStash ${r.status}`);
  };
}
export function sender(cfg: PushConfig) {
  webpush.setVapidDetails(cfg.subject, cfg.vapidPublic, cfg.vapidPrivate);
  return async (w: Watch, msg: PushMessage): Promise<'ok' | 'gone' | 'error'> => {
    if (!isAllowedPushEndpoint(w.subscription.endpoint)) return 'gone';
    try {
      await webpush.sendNotification(w.subscription, JSON.stringify(msg), { TTL: 600, urgency: 'high', topic: msg.tag.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, '') });
      return 'ok';
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      return code === 404 || code === 410 ? 'gone' : 'error';
    }
  };
}
