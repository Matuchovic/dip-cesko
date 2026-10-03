import { transit } from '@/server/transit';
import { allowClient } from '@/server/rateLimit';
import { json, tooMany, badRequest } from '@/server/respond';
import { parseBBox } from '@/domain/geo';
import { serverEnv } from '@/server/env';
import { demoRotationVehicles } from '@/providers/demo/provider';

import { MODES } from '@/domain/model';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: Request) {
  if (!allowClient(req)) return tooMany();
  const sp = new URL(req.url).searchParams;
  if (sp.get('scenario') === 'rotation' && serverEnv.demo) {
    return json({ data: demoRotationVehicles(Date.now()), meta: { provider: 'demo', source: 'demo:rotation', status: 'demo', fetchedAt: new Date().toISOString(), sourceTimestamp: new Date().toISOString(), ageSeconds: 0, attribution: 'Ukázková data – test natočení' } });
  }
  const raw = sp.get('bbox');
  const bbox = parseBBox(raw);
  if (raw && !bbox) return badRequest('Neplatný výřez mapy.');
  // Volitelný filtr jedné linky (schéma linky, metro): striktně ověřené hodnoty.
  const line = sp.get('line'), mode = sp.get('mode');
  if ((line && !/^[A-Za-z0-9]{1,6}$/.test(line)) || (mode && !(MODES as readonly string[]).includes(mode))) return badRequest('Neplatný filtr linky.');
  const res = await transit().vehicles(bbox);
  if (line || mode) res.data = res.data.filter((v) => (!line || v.route.shortName === line) && (!mode || v.route.mode === mode));
  return json(res, { maxAge: res.meta.status === 'live' ? 3 : 0 });
}
