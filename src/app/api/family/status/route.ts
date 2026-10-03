import { plain } from '@/server/plain';
import { familyEnv, inviteStatus } from '@/server/family';
import { bad, denied, notConfigured } from '../_util';

export const dynamic = 'force-dynamic';

/** Rodič čeká, až se dítě připojí (vrací veřejný klíč dítěte, jen se správným tokenem). */
export async function GET(req: Request) {
  const env = familyEnv();
  if (!env) return notConfigured();
  const sp = new URL(req.url).searchParams;
  const id = sp.get('id') ?? '', token = sp.get('token') ?? '';
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) return bad();
  const r = await inviteStatus(env.kv, id, token);
  return r ? plain(r) : denied();
}
