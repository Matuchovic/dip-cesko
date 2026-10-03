'use client';
import { createStore } from '../store';
import { subscriptionForPush } from '../push';
import { famDb, type Device, type Preset, type StoredLink } from './db';
import { fingerprint, linkKey, newKeyPair, open, seal, verifyEmojis } from './crypto';

/** Rodičovská kontrola v telefonu: spárování, zašifrované zprávy, stav pro rodiče i dítě. */
export type Role = 'parent' | 'child';
export interface Trip { line: string; mode: string; headsign: string; from: string; fromName: string; to: string | null; toName: string | null; scheduledAt: string; tripId: string | null }
export interface Msg { kind: string; at: string; by: Role; data: Record<string, unknown> | null }
export interface Auto { kind: string; at: string; line: string; min?: number; stopName?: string | null }
export interface LinkView { id: string; role: Role; peerName: string; emojis: string[]; msgs: Msg[]; auto: Auto[]; paused: boolean; sosActive: boolean; trip: (Trip & { boardedAt: string; arrivedAt: string | null; confirmed: boolean; lastDelay: number | null }) | null; fetchedAt: number }
export const familyStore = createStore<{ ready: boolean; links: LinkView[]; presets: Preset[]; available: boolean }>({ ready: false, links: [], presets: [], available: true });

async function device(): Promise<Device> {
  const d = await famDb.get<Device>('keys', 'device');
  if (d) return d;
  const kp = await newKeyPair();
  const nd: Device = { id: 'device', privateKey: kp.privateKey, pub: kp.pub };
  await famDb.put('keys', nd);
  return nd;
}
const json = async <T,>(r: Response) => { if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status }); return (await r.json()) as T; };
const pushSub = async () => { const s = await subscriptionForPush(false); return typeof s === 'string' ? null : (s.toJSON() as unknown); };

export async function hydrateFamily() {
  if (typeof indexedDB === 'undefined') return;
  try {
    const [links, presets] = await Promise.all([famDb.all<StoredLink>('links'), famDb.all<Preset>('presets')]);
    // zachovat už načtený stav (jméno, zprávy) – víc míst v aplikaci volá hydrataci současně
    const prev = new Map(familyStore.get().links.map((v) => [v.id, v]));
    familyStore.set({ ready: true, presets, links: links.map((l) => {
      const old = prev.get(l.id);
      return old ? { ...old, peerName: old.peerName || l.peerName, emojis: l.emojis } : { id: l.id, role: l.role, peerName: l.peerName, emojis: l.emojis, msgs: [], auto: [], paused: false, sosActive: false, trip: null, fetchedAt: 0 };
    }) });
    void refreshAll();
  } catch { familyStore.set({ ready: true }); }
}
export const myRole = (): Role | null => familyStore.get().links[0]?.role ?? null;

// ---------- rodič: pozvánka ----------
export interface InviteView { inviteId: string; code: string; token: string; expiresAt: string; qr: string }
export async function createInvite(): Promise<InviteView> {
  const d = await device();
  const r = await json<{ inviteId: string; code: string; token: string; expiresAt: string }>(await fetch('/api/family/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pub: d.pub, sub: await pushSub().catch(() => null) }) }));
  const qr = `${location.origin}/rodina#p=${r.inviteId}.${await fingerprint(d.pub)}`;
  return { ...r, qr };
}
/** Čeká na připojení dítěte; po připojení odvodí klíč a uloží spojení. */
export async function pollInvite(inv: InviteView, myName: string, lang: 'cs' | 'en'): Promise<StoredLink | null> {
  const r = await json<{ joined: boolean; linkId?: string; childPub?: string }>(await fetch(`/api/family/status?id=${inv.inviteId}&token=${encodeURIComponent(inv.token)}`, { cache: 'no-store' }));
  if (!r.joined || !r.linkId || !r.childPub) return null;
  const d = await device();
  const link: StoredLink = { id: r.linkId, role: 'parent', token: inv.token, peerPub: r.childPub, key: await linkKey(d.privateKey, r.childPub, r.linkId), peerName: '', myName, emojis: await verifyEmojis(d.pub, r.childPub), lang, createdAt: new Date().toISOString() };
  await famDb.put('links', link);
  await send(link, 'hello', { name: myName });
  await hydrateFamily();
  return link;
}

// ---------- dítě: připojení ----------
export interface Pending { inviteId: string; parentPub: string; emojis: string[] }
export async function lookup(by: { code?: string; qr?: string }): Promise<Pending> {
  let id = '', fp = '';
  if (by.qr) { const m = /#p=([0-9a-f-]{36})\.([A-Za-z0-9_-]{22})/.exec(by.qr); if (!m) throw Object.assign(new Error('bad'), { status: 400 }); id = m[1]!; fp = m[2]!; }
  const r = await json<{ inviteId: string; pub: string }>(await fetch(by.code ? `/api/family/invite?code=${by.code}` : `/api/family/invite?id=${id}`, { cache: 'no-store' }));
  if (fp && (await fingerprint(r.pub)) !== fp) throw Object.assign(new Error('fingerprint'), { status: 409 }); // podvržený klíč
  const d = await device();
  return { inviteId: r.inviteId, parentPub: r.pub, emojis: await verifyEmojis(d.pub, r.pub) };
}
export async function join(p: Pending, myName: string, lang: 'cs' | 'en'): Promise<StoredLink> {
  const d = await device();
  const r = await json<{ linkId: string; token: string }>(await fetch('/api/family/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inviteId: p.inviteId, pub: d.pub, sub: await pushSub().catch(() => null) }) }));
  const link: StoredLink = { id: r.linkId, role: 'child', token: r.token, peerPub: p.parentPub, key: await linkKey(d.privateKey, p.parentPub, r.linkId), peerName: '', myName, emojis: p.emojis, lang, createdAt: new Date().toISOString() };
  await famDb.put('links', link);
  await send(link, 'hello', { name: myName });
  await hydrateFamily();
  return link;
}

// ---------- zprávy ----------
async function send(link: StoredLink, kind: string, data: Record<string, unknown>, trip?: Trip) {
  const box = await seal(link.key, { ...data, at: new Date().toISOString() });
  await json(await fetch('/api/family/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ linkId: link.id, token: link.token, kind, ...box, ...(trip ? { trip } : {}) }) }));
}
export async function childSend(kind: 'board' | 'arrive' | 'sos' | 'pause' | 'resume' | 'end', data: Record<string, unknown>, trip?: Trip) {
  const links = (await famDb.all<StoredLink>('links')).filter((l) => l.role === 'child');
  await Promise.all(links.map((l) => send(l, kind, data, trip)));
  await refreshAll();
}
export async function refresh(linkId: string) {
  const l = await famDb.get<StoredLink>('links', linkId);
  if (!l) return;
  const r = await fetch(`/api/family/state?linkId=${l.id}&token=${encodeURIComponent(l.token)}`, { cache: 'no-store' });
  if (r.status === 403) { await famDb.del('links', l.id); await hydrateFamily(); return; } // druhá strana spojení zrušila
  if (!r.ok) return;
  const s = (await r.json()) as { events: { kind: string; ct: string; iv: string; at: string; by: Role }[]; auto: Auto[]; paused: boolean; trip: LinkView['trip'] };
  const msgs: Msg[] = await Promise.all(s.events.map(async (e) => ({ kind: e.kind, at: e.at, by: e.by, data: await open<Record<string, unknown>>(l.key, e.ct, e.iv) })));
  const hello = msgs.find((m) => m.kind === 'hello' && m.by !== l.role);
  const peerName = typeof hello?.data?.name === 'string' ? String(hello.data.name).slice(0, 40) : l.peerName;
  if (peerName !== l.peerName) await famDb.put('links', { ...l, peerName } as StoredLink);
  familyStore.set({ links: familyStore.get().links.map((v) => (v.id === l.id ? { ...v, peerName, msgs, auto: s.auto, paused: s.paused, trip: s.trip, fetchedAt: Date.now(), sosActive: msgs.some((m) => m.kind === 'sos' && Date.now() - Date.parse(m.at) < 30 * 60_000) } : v)) });
}
export async function refreshAll() { await Promise.all(familyStore.get().links.map((l) => refresh(l.id).catch(() => undefined))); }
export async function unlink(linkId: string) {
  const l = await famDb.get<StoredLink>('links', linkId);
  if (l) await fetch(`/api/family/link?linkId=${l.id}&token=${encodeURIComponent(l.token)}`, { method: 'DELETE' }).catch(() => undefined);
  await famDb.del('links', linkId);
  await hydrateFamily();
}
export async function savePreset(p: Preset) { await famDb.put('presets', p); familyStore.set({ presets: [...familyStore.get().presets.filter((x) => x.id !== p.id), p] }); }
