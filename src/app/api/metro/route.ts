import { allowClient } from '@/server/rateLimit';
import { json, tooMany } from '@/server/respond';
import { transit } from '@/server/transit';

export const dynamic = 'force-dynamic';

/** Stanice linek A, B, C v pořadí se souřadnicemi ze seznamu zastávek PID. */
export async function GET(req: Request) {
  if (!allowClient(req, 30)) return tooMany();
  const res = await transit().metro();
  return json(res, { maxAge: res.meta.status === 'live' ? 3600 : 0 });
}
