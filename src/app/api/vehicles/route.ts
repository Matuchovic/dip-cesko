import { transit } from '@/server/transit';
import { allowClient } from '@/server/rateLimit';
import { json, tooMany, badRequest } from '@/server/respond';
import { parseBBox } from '@/domain/geo';
import { serverEnv } from '@/server/env';
import { demoRotationVehicles } from '@/providers/demo/provider';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!allowClient(req)) return tooMany();
  const sp = new URL(req.url).searchParams;
  if (sp.get('scenario') === 'rotation' && serverEnv.demo) {
    return json({ data: demoRotationVehicles(Date.now()), meta: { provider: 'demo', source: 'demo:rotation', status: 'demo', fetchedAt: new Date().toISOString(), sourceTimestamp: new Date().toISOString(), ageSeconds: 0, attribution: 'Ukázková data – test natočení' } });
  }
  const raw = sp.get('bbox');
  const bbox = parseBBox(raw);
  if (raw && !bbox) return badRequest('Neplatný výřez mapy.');
  const res = await transit().vehicles(bbox);
  return json(res, { maxAge: res.meta.status === 'live' ? 5 : 0 });
}
