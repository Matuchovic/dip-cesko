import { plain } from '@/server/plain';
import { InviteInput, createInvite, familyEnv, findInvite, limited } from '@/server/family';
import { bad, body, clientIp, notConfigured, slow } from '../_util';

export const dynamic = 'force-dynamic';

/** Rodič vytvoří jednorázovou pozvánku (QR + 6místný kód, platí 10 minut). */
export async function POST(req: Request) {
  const env = familyEnv();
  if (!env) return notConfigured();
  if (await limited(env.kv, `inv:${clientIp(req)}`, 8, 3600)) return slow();
  const parsed = InviteInput.safeParse(await body(req));
  if (!parsed.success) return bad();
  return plain(await createInvite(env.kv, parsed.data));
}

/** Dítě podle kódu nebo id z QR zjistí veřejný klíč rodiče (nic tajného se nevrací). Hádání kódu je omezené. */
export async function GET(req: Request) {
  const env = familyEnv();
  if (!env) return notConfigured();
  const sp = new URL(req.url).searchParams;
  const code = sp.get('code'), id = sp.get('id');
  if (code && !/^\d{6}$/.test(code)) return bad();
  if (id && !/^[0-9a-f-]{36}$/.test(id)) return bad();
  if (!code && !id) return bad();
  if (await limited(env.kv, `${code ? 'code' : 'id'}:${clientIp(req)}`, code ? 10 : 30, 600)) return slow();
  const inv = await findInvite(env.kv, code ? { code } : { id: id! });
  return inv ? plain({ inviteId: inv.id, pub: inv.parentPub }) : plain({ error: 'not_found' }, { status: 404 });
}
