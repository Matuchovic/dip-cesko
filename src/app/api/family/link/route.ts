import { plain } from '@/server/plain';
import { authLink, familyEnv, familySender } from '@/server/family';
import { bad, notConfigured } from '../_util';

export const dynamic = 'force-dynamic';

/** Zrušení spojení – kdokoli z obou stran, kdykoli. Smaže se všechno, druhá strana dostane zprávu. */
export async function DELETE(req: Request) {
  const env = familyEnv();
  if (!env) return notConfigured();
  const sp = new URL(req.url).searchParams;
  const linkId = sp.get('linkId') ?? '', token = sp.get('token') ?? '';
  if (!/^[0-9a-f-]{36}$/.test(linkId) || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) return bad();
  const auth = await authLink(env.kv, linkId, token);
  if (!auth) return plain({ ok: true }); // už neexistuje
  await env.kv.del(`fam:link:${linkId}`);
  await env.kv.del(`fam:state:${linkId}`);
  const other = auth.role === 'parent' ? auth.link.childSub : auth.link.parentSub;
  await familySender(env)(other, { type: 'unlink', linkId }).catch(() => undefined);
  return plain({ ok: true });
}
