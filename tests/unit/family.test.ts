import { describe, expect, it } from 'vitest';
import { fingerprint, linkKey, newKeyPair, open, seal, verifyEmojis } from '@/lib/family/crypto';
import { authLink, checkTrip, createInvite, familyEnv, findInvite, inviteStatus, joinInvite, recordEvent, type State } from '@/server/family';
import type { Departure } from '@/domain/model';

describe('rodičovská kontrola: šifrování v telefonech', () => {
  it('oba telefony odvodí stejný klíč, zprávu přečte jen druhá strana a změnu pozná', async () => {
    const a = await newKeyPair(), b = await newKeyPair();
    const ka = await linkKey(a.privateKey, b.pub, 'link-1'), kb = await linkKey(b.privateKey, a.pub, 'link-1');
    const box = await seal(ka, { line: '22', toName: 'ZŠ Vinohrady' });
    expect(await open(kb, box.ct, box.iv)).toEqual({ line: '22', toName: 'ZŠ Vinohrady' });
    const evil = await newKeyPair(); const ke = await linkKey(evil.privateKey, a.pub, 'link-1');
    expect(await open(ke, box.ct, box.iv)).toBeNull(); // cizí klíč
    const tampered = box.ct.slice(0, -2) + (box.ct.endsWith('A') ? 'BB' : 'AA');
    expect(await open(kb, tampered, box.iv)).toBeNull(); // pozměněná zpráva
    expect(await open(await linkKey(b.privateKey, a.pub, 'link-2'), box.ct, box.iv)).toBeNull(); // jiné spojení
  });
  it('ověřovací obrázky jsou na obou stranách stejné; otisk klíče je stabilní', async () => {
    const a = await newKeyPair(), b = await newKeyPair();
    const e1 = await verifyEmojis(a.pub, b.pub), e2 = await verifyEmojis(b.pub, a.pub);
    expect(e1).toEqual(e2); expect(e1).toHaveLength(4);
    expect(await fingerprint(a.pub)).toBe(await fingerprint(a.pub));
    expect(await fingerprint(a.pub)).not.toBe(await fingerprint(b.pub));
  });
});

describe('rodičovská kontrola: server', () => {
  const env = familyEnv({} as NodeJS.ProcessEnv)!; // bez Redisu → paměť (lokálně)
  it('pozvánka je jednorázová, stav vidí jen rodič se svým tokenem, role se rozliší', async () => {
    const p = await newKeyPair(), c = await newKeyPair();
    const inv = await createInvite(env.kv, { pub: p.pub, sub: null });
    expect(inv.code).toMatch(/^\d{6}$/);
    expect((await findInvite(env.kv, { code: inv.code }))?.parentPub).toBe(p.pub);
    const j = await joinInvite(env.kv, { inviteId: inv.inviteId, pub: c.pub, sub: null });
    expect(j?.linkId).toBeTruthy();
    expect(await joinInvite(env.kv, { inviteId: inv.inviteId, pub: c.pub, sub: null })).toBeNull(); // podruhé už ne
    expect(await findInvite(env.kv, { code: inv.code })).toBeNull();
    expect(await inviteStatus(env.kv, inv.inviteId, 'x'.repeat(43))).toBeNull();
    expect(await inviteStatus(env.kv, inv.inviteId, inv.token)).toMatchObject({ joined: true, childPub: c.pub });
    expect((await authLink(env.kv, j!.linkId, inv.token))?.role).toBe('parent');
    expect((await authLink(env.kv, j!.linkId, j!.token))?.role).toBe('child');
    expect(await authLink(env.kv, j!.linkId, 'y'.repeat(43))).toBeNull();
  });

  const T0 = Date.parse('2026-10-03T07:42:00+02:00');
  const dep = (delayS: number, at: number, canceled = false): Departure => ({ id: 'd', route: { shortName: '22', mode: 'tram' }, tripId: 'pid:trip:1', headsign: 'Bílá Hora', platform: 'A', stopName: 'x',
    scheduledAt: new Date(at).toISOString(), predictedAt: new Date(at + delayS * 1000).toISOString(), delay: { kind: 'known', seconds: delayS }, isCanceled: canceled, isAtStop: false, wheelchair: null, airConditioned: null } as unknown as Departure);
  const state = (): State => ({ events: [], auto: [], paused: false, trip: { line: '22', mode: 'tram', headsign: 'Bílá Hora', from: 'pid:A', fromName: 'Národní třída', to: 'pid:B', toName: 'Vinohradská', scheduledAt: new Date(T0).toISOString(), tripId: 'pid:trip:1', boardedAt: new Date(T0).toISOString(), lastDelay: null, arrivedAt: null, confirmed: false } });
  it('hlídání: zpoždění, příjezd do cíle, chybějící potvrzení, zrušený spoj, pauza', async () => {
    let s = state();
    const deps = (o: Departure[], d: Departure[]) => async (stop: string) => (stop === 'pid:A' ? o : d);
    let r = await checkTrip(s, { departures: deps([dep(180, T0)], [dep(180, T0 + 9 * 60_000)]), now: () => T0 + 60_000 });
    expect(r.auto.map((a) => a.kind)).toEqual(['delay']); expect(r.auto[0]!.min).toBe(3); expect(r.next).toBeGreaterThan(0);
    r = await checkTrip(s, { departures: deps([dep(240, T0)], [dep(240, T0 + 9 * 60_000)]), now: () => T0 + 120_000 });
    expect(r.auto).toEqual([]); // změna o 1 min se nehlásí
    r = await checkTrip(s, { departures: deps([], [dep(180, T0 + 9 * 60_000)]), now: () => T0 + 12 * 60_000 + 10_000 });
    expect(r.auto.map((a) => a.kind)).toEqual(['arrived']);
    r = await checkTrip(s, { departures: deps([], []), now: () => T0 + 23 * 60_000 });
    expect(r.auto.map((a) => a.kind)).toEqual(['noconfirm']); expect(r.next).toBeNull();
    s = state();
    expect((await checkTrip(s, { departures: deps([dep(0, T0, true)], []), now: () => T0 })).auto[0]!.kind).toBe('canceled');
    s = state(); s.paused = true;
    expect(await checkTrip(s, { departures: deps([dep(600, T0)], []), now: () => T0 })).toEqual({ auto: [], next: null });
  });
  it('rodič nemůže hlásit cestu za dítě; nastoupení uloží jen veřejné údaje o spoji', async () => {
    const p = await newKeyPair(), c = await newKeyPair();
    const inv = await createInvite(env.kv, { pub: p.pub, sub: null });
    const j = (await joinInvite(env.kv, { inviteId: inv.inviteId, pub: c.pub, sub: null }))!;
    const link = (await authLink(env.kv, j.linkId, j.token))!.link;
    const s = await recordEvent(env.kv, link, { linkId: j.linkId, token: j.token, kind: 'board', ct: 'AAAAAAAAAAAAAAAAAAAAAA', iv: 'AAAAAAAAAAAAAAAA', trip: { line: '22', mode: 'tram', headsign: 'X', from: 'pid:A', fromName: 'A', to: null, toName: null, scheduledAt: new Date().toISOString(), tripId: null } }, 'child');
    expect(s.trip?.line).toBe('22');
    expect(JSON.stringify(s)).not.toMatch(/Anička|lat|lon/);
  });
});
