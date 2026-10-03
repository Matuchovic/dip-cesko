import { allowClient } from '@/server/rateLimit';
import { badRequest, json, tooMany } from '@/server/respond';
import { transit } from '@/server/transit';

export const dynamic = 'force-dynamic';
const ID_RE = /^(pid|demo):vehicle:[A-Za-z0-9_.:-]{1,64}$/;

/** Průběh spoje vybraného vozu (zastávky v pořadí, tvar trasy) – pro schéma linky. */
export async function GET(req: Request) {
  if (!allowClient(req, 60)) return tooMany();
  const id = new URL(req.url).searchParams.get('vehicle') ?? '';
  if (!ID_RE.test(id)) return badRequest('Neplatné ID vozu.');
  const res = await transit().trip(id);
  return json(res, { maxAge: res.data ? 10 : 0 });
}
