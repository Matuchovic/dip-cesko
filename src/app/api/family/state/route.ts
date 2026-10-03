import { plain } from '@/server/plain';
import { authLink, familyEnv, loadState } from '@/server/family';
import { bad, denied, notConfigured } from '../_util';

export const dynamic = 'force-dynamic';

/** Aktuální stav spojení: zašifrované zprávy, automatická upozornění a veřejné údaje o právě jetém spoji. */
export async function GET(req: Request) {
  const env = familyEnv();
  if (!env) return notConfigured();
  const sp = new URL(req.url).searchParams;
  const linkId = sp.get('linkId') ?? '', token = sp.get('token') ?? '';
  if (!/^[0-9a-f-]{36}$/.test(linkId) || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) return bad();
  const auth = await authLink(env.kv, linkId, token);
  if (!auth) return denied();
  return plain({ role: auth.role, ...(await loadState(env.kv, linkId)) });
}
