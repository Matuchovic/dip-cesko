import 'server-only';
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Departure } from '@/domain/model';
import { isAllowedPushEndpoint, pushConfig, qstash, sender, type PushConfig } from './push';

/**
 * Rodičovská kontrola – serverová část.
 *
 * Zásady:
 * - Server nezná jména ani polohu: zprávy mezi rodičem a dítětem jsou šifrované v telefonech (ECDH P-256 → AES-GCM),
 *   server je jen přeposílá (a Web Push je navíc šifruje cestou).
 * - Server zná jen veřejné údaje o spoji, kterým dítě jede (linka, zastávky, čas), aby mohl hlídat zpoždění a příjezd.
 *   Tyto údaje se samy mažou nejpozději 4 hodiny po nastoupení.
 * - Všechna tajemství se ukládají jen jako SHA-256 otisk, kódy pro spárování jsou jednorázové a platí 10 minut.
 */
const INVITE_TTL = 10 * 60;
const STATE_TTL = 12 * 3600;
const TRIP_TTL = 4 * 3600;
const MAX_CHILDREN_PER_PARENT = 6;
const MAX_PARENTS_PER_CHILD = 4;

const b64u = z.string().regex(/^[A-Za-z0-9_-]+$/);
export const PushSub = z.object({ endpoint: z.string().url().max(800), keys: z.object({ p256dh: b64u.min(80).max(120), auth: b64u.min(16).max(40) }) });
const PubKey = b64u.min(80).max(100); // nekomprimovaný veřejný klíč P-256 (65 B) v base64url
const Token = z.string().regex(/^[A-Za-z0-9_-]{40,64}$/);
const Uuid = z.string().regex(/^[0-9a-f-]{36}$/);

export const InviteInput = z.object({ pub: PubKey, sub: PushSub.nullable().optional() });
export const JoinInput = z.object({ inviteId: Uuid, pub: PubKey, sub: PushSub.nullable().optional() });
export const TripPublic = z.object({
  line: z.string().regex(/^[A-Za-z0-9]{1,6}$/), mode: z.string().max(12), headsign: z.string().max(80),
  from: z.string().min(1).max(80), fromName: z.string().max(80), to: z.string().max(80).nullable(), toName: z.string().max(80).nullable(),
  scheduledAt: z.string().datetime({ offset: true }), tripId: z.string().max(120).nullable(),
});
export const EventInput = z.object({
  linkId: Uuid, token: Token,
  kind: z.enum(['hello', 'board', 'arrive', 'sos', 'pause', 'resume', 'end']),
  ct: b64u.max(6000), iv: b64u.min(16).max(24),
  trip: TripPublic.optional(),
});
export type TripPub = z.infer<typeof TripPublic>;

export interface Invite { id: string; code: string; parentPub: string; parentSub: z.infer<typeof PushSub> | null; parentTokenHash: string; joined?: { linkId: string; childPub: string } }
export interface Link { id: string; parentPub: string; childPub: string; parentTokenHash: string; childTokenHash: string; parentSub: z.infer<typeof PushSub> | null; childSub: z.infer<typeof PushSub> | null; createdAt: string }
export interface Ev { kind: string; ct: string; iv: string; at: string; by: 'parent' | 'child' }
export interface Auto { kind: 'delay' | 'arrived' | 'noconfirm' | 'canceled' | 'departed'; at: string; line: string; min?: number; eta?: string | null; stopName?: string | null }
export interface State { events: Ev[]; auto: Auto[]; paused: boolean; trip: (TripPub & { boardedAt: string; lastDelay: number | null; arrivedAt: string | null; confirmed: boolean }) | null }

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
export function sameHash(hash: string, token: string): boolean {
  const a = Buffer.from(hash, 'hex'), b = Buffer.from(sha(token), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- úložiště: Upstash Redis (REST); lokálně a v testech paměť procesu ----------
export interface Kv { get<T>(k: string): Promise<T | null>; set(k: string, v: unknown, ttlS: number): Promise<void>; del(k: string): Promise<void>; incr(k: string, ttlS: number): Promise<number> }
const mem = new Map<string, { v: string; until: number }>();
function memoryKv(): Kv {
  const alive = (k: string) => { const e = mem.get(k); if (e && e.until < Date.now()) { mem.delete(k); return null; } return e ?? null; };
  return {
    async get<T>(k: string) { const e = alive(k); return e ? (JSON.parse(e.v) as T) : null; },
    async set(k, v, ttlS) { mem.set(k, { v: JSON.stringify(v), until: Date.now() + ttlS * 1000 }); },
    async del(k) { mem.delete(k); },
    async incr(k, ttlS) { const e = alive(k); const n = (e ? Number(JSON.parse(e.v)) : 0) + 1; mem.set(k, { v: JSON.stringify(n), until: e?.until ?? Date.now() + ttlS * 1000 }); return n; },
  };
}
function redisKv(url: string, token: string): Kv {
  const call = async (cmd: (string | number)[]) => {
    const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd), signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`Redis ${r.status}`);
    return ((await r.json()) as { result: unknown }).result;
  };
  return {
    async get<T>(k: string) { const v = await call(['GET', k]); return typeof v === 'string' ? (JSON.parse(v) as T) : null; },
    async set(k, v, ttlS) { await call(['SET', k, JSON.stringify(v), 'EX', ttlS]); },
    async del(k) { await call(['DEL', k]); },
    async incr(k, ttlS) { const n = Number(await call(['INCR', k])); if (n === 1) await call(['EXPIRE', k, ttlS]); return n; },
  };
}
export interface FamilyEnv { kv: Kv; push: PushConfig | null }
export function familyEnv(env: NodeJS.ProcessEnv = process.env): FamilyEnv | null {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL, token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token && /^https:\/\//.test(url)) return { kv: redisKv(url, token), push: pushConfig(env) };
  // Bez Redisu jen mimo Vercel (lokální vývoj, testy) – na serverless by paměť mezi instancemi nefungovala.
  if (env.VERCEL === '1') return null;
  return { kv: memoryKv(), push: pushConfig(env) };
}

/** Jednoduchý limit pokusů (např. hádání kódu): nejvýš `max` za `windowS` na klíč. */
export async function limited(kv: Kv, key: string, max: number, windowS: number): Promise<boolean> {
  return (await kv.incr(`fam:rl:${key}`, windowS)) > max;
}

// ---------- spárování ----------
export async function createInvite(kv: Kv, input: z.infer<typeof InviteInput>) {
  const id = randomUUID(), parentToken = secret();
  let code = '';
  for (let i = 0; i < 6; i++) { // unikátní 6místný kód (kolize jsou vzácné, ale ošetřené)
    code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    if (!(await kv.get(`fam:code:${code}`))) break;
  }
  const inv: Invite = { id, code, parentPub: input.pub, parentSub: input.sub ?? null, parentTokenHash: sha(parentToken) };
  await kv.set(`fam:inv:${id}`, inv, INVITE_TTL);
  await kv.set(`fam:code:${code}`, id, INVITE_TTL);
  return { inviteId: id, code, token: parentToken, expiresAt: new Date(Date.now() + INVITE_TTL * 1000).toISOString() };
}
export async function findInvite(kv: Kv, by: { id?: string; code?: string }): Promise<Invite | null> {
  const id = by.id ?? (by.code ? await kv.get<string>(`fam:code:${by.code}`) : null);
  if (!id) return null;
  const inv = await kv.get<Invite>(`fam:inv:${id}`);
  return inv && !inv.joined ? inv : null;
}
export async function joinInvite(kv: Kv, input: z.infer<typeof JoinInput>) {
  const inv = await kv.get<Invite>(`fam:inv:${input.inviteId}`);
  if (!inv || inv.joined) return null; // jednorázové
  if (input.pub === inv.parentPub) return null;
  if ((await kv.incr(`fam:pc:${sha(inv.parentPub)}`, 400 * 24 * 3600)) > MAX_CHILDREN_PER_PARENT) return null;
  if ((await kv.incr(`fam:cc:${sha(input.pub)}`, 400 * 24 * 3600)) > MAX_PARENTS_PER_CHILD) return null;
  const childToken = secret();
  const link: Link = { id: randomUUID(), parentPub: inv.parentPub, childPub: input.pub, parentTokenHash: inv.parentTokenHash, childTokenHash: sha(childToken), parentSub: inv.parentSub, childSub: input.sub ?? null, createdAt: new Date().toISOString() };
  await kv.set(`fam:link:${link.id}`, link, 400 * 24 * 3600);
  await kv.set(`fam:inv:${inv.id}`, { ...inv, joined: { linkId: link.id, childPub: input.pub } }, 120); // rodič si výsledek vyzvedne do 2 min
  await kv.del(`fam:code:${inv.code}`);
  return { linkId: link.id, token: childToken, link };
}
export async function inviteStatus(kv: Kv, id: string, token: string) {
  const inv = await kv.get<Invite>(`fam:inv:${id}`);
  if (!inv || !sameHash(inv.parentTokenHash, token)) return null;
  return inv.joined ? { joined: true as const, linkId: inv.joined.linkId, childPub: inv.joined.childPub } : { joined: false as const };
}

// ---------- oprávnění k propojení ----------
export async function authLink(kv: Kv, linkId: string, token: string): Promise<{ link: Link; role: 'parent' | 'child' } | null> {
  const link = await kv.get<Link>(`fam:link:${linkId}`);
  if (!link) return null;
  if (sameHash(link.parentTokenHash, token)) return { link, role: 'parent' };
  if (sameHash(link.childTokenHash, token)) return { link, role: 'child' };
  return null;
}
export async function loadState(kv: Kv, linkId: string): Promise<State> {
  return (await kv.get<State>(`fam:state:${linkId}`)) ?? { events: [], auto: [], paused: false, trip: null };
}
export async function saveState(kv: Kv, linkId: string, s: State) { await kv.set(`fam:state:${linkId}`, s, STATE_TTL); }

/** Událost od dítěte: uloží se zašifrovaná, u nastoupení i veřejné údaje o spoji kvůli hlídání. */
export async function recordEvent(kv: Kv, link: Link, e: z.infer<typeof EventInput>, by: 'parent' | 'child', now = new Date()) {
  const s = await loadState(kv, link.id);
  s.events = [{ kind: e.kind, ct: e.ct, iv: e.iv, at: now.toISOString(), by }, ...s.events].slice(0, 20);
  if (by === 'parent') { await saveState(kv, link.id, s); return s; } // rodič posílá jen pozdrav (své jméno)
  if (e.kind === 'board' && e.trip) { s.trip = { ...e.trip, boardedAt: now.toISOString(), lastDelay: null, arrivedAt: null, confirmed: false }; s.auto = []; }
  if (e.kind === 'arrive' && s.trip) s.trip.confirmed = true;
  if (e.kind === 'end') s.trip = null;
  if (e.kind === 'pause') s.paused = true;
  if (e.kind === 'resume') s.paused = false;
  if (s.trip && Date.parse(s.trip.boardedAt) < now.getTime() - TRIP_TTL * 1000) s.trip = null; // nic se nedrží déle než 4 h
  await saveState(kv, link.id, s);
  return s;
}

// ---------- hlídání spoje (QStash budí /api/family/check) ----------
export interface CheckDeps { departures(stop: string): Promise<Departure[]>; now(): number }
const depTime = (d: Departure) => Date.parse(d.predictedAt ?? d.scheduledAt ?? '');
const findTrip = (list: Departure[], t: TripPub) => list.find((d) => (t.tripId && d.tripId === t.tripId) || (d.route.shortName === t.line && d.headsign === t.headsign && Math.abs(Date.parse(d.scheduledAt ?? '') - Date.parse(t.scheduledAt)) <= 120_000)) ?? null;

/** Vyhodnotí stav jízdy; vrátí nové automatické zprávy pro rodiče a za kolik sekund se podívat znovu (null = konec). */
export async function checkTrip(s: State, deps: CheckDeps): Promise<{ auto: Auto[]; next: number | null }> {
  const t = s.trip;
  if (!t || s.paused) return { auto: [], next: null };
  const now = deps.now(), at = new Date(now).toISOString(), out: Auto[] = [];
  if (now - Date.parse(t.boardedAt) > TRIP_TTL * 1000) return { auto: [], next: null };
  // 1) zpoždění na výchozí zastávce (dokud spoj neodjel)
  const origin = findTrip(await deps.departures(t.from).catch(() => []), t);
  if (origin?.isCanceled) return { auto: [{ kind: 'canceled', at, line: t.line, stopName: t.fromName }], next: null };
  const delayMin = origin && origin.delay.kind === 'known' ? Math.round(origin.delay.seconds / 60) : null;
  if (delayMin !== null && (t.lastDelay === null ? delayMin >= 2 : Math.abs(delayMin - t.lastDelay) >= 2)) { out.push({ kind: 'delay', at, line: t.line, min: delayMin }); t.lastDelay = delayMin; }
  // 2) příjezd do cílové zastávky (stejný spoj v tabuli cílové zastávky)
  if (t.to && !t.arrivedAt) {
    const dest = findTrip(await deps.departures(t.to).catch(() => []), t);
    const eta = dest ? depTime(dest) : NaN;
    if (Number.isFinite(eta) && eta <= now + 30_000) { t.arrivedAt = at; out.push({ kind: 'arrived', at, line: t.line, stopName: t.toName }); }
    else if (!dest && now > Date.parse(t.scheduledAt) + 60 * 60_000) return { auto: out, next: null };
    else if (Number.isFinite(eta)) return { auto: out, next: Math.max(60, Math.min(180, Math.round((eta - now) / 1000 / 2))) };
    else return { auto: out, next: 120 };
  }
  // 3) dojel, ale nepotvrdil „Jsem v cíli“ do 10 minut → připomenout rodiči (jednou)
  if (t.arrivedAt && !t.confirmed) {
    const since = now - Date.parse(t.arrivedAt);
    if (since >= 10 * 60_000) { if (!s.auto.some((a) => a.kind === 'noconfirm')) out.push({ kind: 'noconfirm', at, line: t.line, stopName: t.toName }); return { auto: out, next: null }; }
    return { auto: out, next: Math.round((10 * 60_000 - since) / 1000) + 5 };
  }
  return { auto: out, next: t.to ? null : 300 };
}

// ---------- doručení upozornění ----------
export function familySender(env: FamilyEnv) {
  const send = env.push ? sender(env.push) : null;
  return async (sub: Link['parentSub'], payload: Record<string, unknown>) => {
    if (!send || !sub || !isAllowedPushEndpoint(sub.endpoint)) return 'skipped' as const;
    // Web Push: obsah je šifrovaný pro konkrétní zařízení; servisní pracovník ho dál dešifruje klíčem rodiny.
    return send({ subscription: sub } as never, { title: 'DopravaČR', body: '', url: '/rodina', mapUrl: '/rodina', tag: `fam-${String(payload.linkId ?? '')}`, actions: [], fam: payload } as never);
  };
}
export function familySchedule(env: FamilyEnv) {
  if (!env.push) return null;
  const pub = qstash(env.push);
  // QStash zavolá /api/push/fire s id „fam:<linkId>“ – stejný ověřený podpis jako u upozornění na spoj
  return (linkId: string, delayS: number) => pub(`fam:${linkId}`, delayS);
}

/** Jedna kontrola jízdy (z QStash): vyhodnotí, uloží, pošle rodiči upozornění a naplánuje další kontrolu. */
export async function runFamilyCheck(env: FamilyEnv, linkId: string, departures: CheckDeps['departures']) {
  const link = await env.kv.get<Link>(`fam:link:${linkId}`);
  if (!link) return 'missing';
  const s = await loadState(env.kv, linkId);
  const r = await checkTrip(s, { departures, now: () => Date.now() });
  if (r.auto.length) {
    s.auto = [...r.auto, ...s.auto].slice(0, 10);
    const send = familySender(env);
    for (const a of r.auto) await send(link.parentSub, { type: 'auto', linkId, ...a });
  }
  await saveState(env.kv, linkId, s);
  const schedule = familySchedule(env);
  if (r.next !== null && schedule) await schedule(linkId, r.next);
  return r.auto.length ? 'notified' : 'checked';
}
