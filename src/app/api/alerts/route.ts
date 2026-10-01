import { transit } from '@/server/transit';
import { allowClient } from '@/server/rateLimit';
import { json, tooMany } from '@/server/respond';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!allowClient(req)) return tooMany();
  return json(await transit().alerts(), { maxAge: 60 });
}
