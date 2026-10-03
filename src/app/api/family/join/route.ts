import { plain } from '@/server/plain';
import { JoinInput, familyEnv, familySender, joinInvite, limited } from '@/server/family';
import { bad, body, clientIp, notConfigured, slow } from '../_util';

export const dynamic = 'force-dynamic';

/** Dítě po souhlasu potvrdí spárování; pozvánka se tím spotřebuje. */
export async function POST(req: Request) {
  const env = familyEnv();
  if (!env) return notConfigured();
  if (await limited(env.kv, `join:${clientIp(req)}`, 10, 600)) return slow();
  const parsed = JoinInput.safeParse(await body(req));
  if (!parsed.success) return bad();
  const r = await joinInvite(env.kv, parsed.data);
  if (!r) return plain({ error: 'expired' }, { status: 410 });
  await familySender(env)(r.link.parentSub, { type: 'joined', linkId: r.linkId }).catch(() => undefined);
  return plain({ linkId: r.linkId, token: r.token });
}
