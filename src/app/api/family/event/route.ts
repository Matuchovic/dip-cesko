import { plain } from '@/server/plain';
import { EventInput, authLink, familyEnv, familySchedule, familySender, limited, recordEvent } from '@/server/family';
import { bad, body, denied, notConfigured, slow } from '../_util';

export const dynamic = 'force-dynamic';

/** Zašifrovaná zpráva od dítěte (nastoupení, v cíli, SOS, pauza) nebo pozdrav rodiče; přepošle se druhé straně. */
export async function POST(req: Request) {
  const env = familyEnv();
  if (!env) return notConfigured();
  const parsed = EventInput.safeParse(await body(req));
  if (!parsed.success) return bad();
  const e = parsed.data;
  const auth = await authLink(env.kv, e.linkId, e.token);
  if (!auth) return denied();
  if (auth.role === 'parent' && e.kind !== 'hello') return denied(); // rodič nemůže za dítě hlásit cestu
  if (await limited(env.kv, `ev:${e.linkId}`, 90, 3600)) return slow();
  await recordEvent(env.kv, auth.link, e, auth.role);
  const to = auth.role === 'child' ? auth.link.parentSub : auth.link.childSub;
  await familySender(env)(to, { type: 'ev', linkId: e.linkId, kind: e.kind, ct: e.ct, iv: e.iv }).catch(() => undefined);
  if (e.kind === 'board' && e.trip) {
    const schedule = familySchedule(env);
    const first = Math.max(30, Math.round((Date.parse(e.trip.scheduledAt) - Date.now()) / 1000) + 60);
    if (schedule) await schedule(e.linkId, Math.min(first, 900)).catch(() => undefined);
  }
  return plain({ ok: true });
}
