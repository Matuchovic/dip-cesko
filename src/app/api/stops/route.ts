import { transit } from '@/server/transit';
import { allowClient } from '@/server/rateLimit';
import { json, tooMany, badRequest } from '@/server/respond';
import { parseBBox } from '@/domain/geo';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!allowClient(req, 240)) return tooMany();
  const sp = new URL(req.url).searchParams;
  const bboxRaw = sp.get('bbox');
  if (bboxRaw) {
    const bbox = parseBBox(bboxRaw);
    if (!bbox || (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) > 0.05) return badRequest('Výřez je neplatný nebo příliš velký.');
    return json(await transit().stopsInView(bbox), { maxAge: 3600 });
  }
  const q = (sp.get('q') ?? '').trim().slice(0, 60);
  if (q.length < 2) return badRequest('Zadejte alespoň 2 znaky.');
  return json(await transit().searchStops(q, 8), { maxAge: 600 });
}
