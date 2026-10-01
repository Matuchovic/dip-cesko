import { transit } from '@/server/transit';
import { allowClient } from '@/server/rateLimit';
import { json, tooMany, badRequest } from '@/server/respond';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!allowClient(req)) return tooMany();
  const sp = new URL(req.url).searchParams;
  const stop = (sp.get('stop') ?? '').trim();
  const limit = Math.min(60, Math.max(5, Number(sp.get('limit') ?? 30) || 30));
  if (!stop || stop.length > 120 || /[\u0000-\u001f]/.test(stop)) return badRequest('Chybí nebo je neplatná zastávka.');
  return json(await transit().departures(stop, limit), { maxAge: 10 });
}
