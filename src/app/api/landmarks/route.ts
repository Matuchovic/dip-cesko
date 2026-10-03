import { allowClient } from '@/server/rateLimit';
import { badRequest, tooMany } from '@/server/respond';
import { plain } from '@/server/plain';
import { landmarks } from '@/server/landmarks';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Památky Prahy s nejbližšími zastávkami a linkami. set=top (nejznámější) | all (všechny kulturní památky). */
export async function GET(req: Request) {
  if (!allowClient(req, 60)) return tooMany();
  const sp = new URL(req.url).searchParams;
  const set = sp.get('set') === 'all' ? 'all' : 'top';
  const q = (sp.get('q') ?? '').slice(0, 60);
  const offset = Math.min(10_000, Math.max(0, Math.floor(Number(sp.get('offset') ?? 0)) || 0));
  const limit = Math.min(60, Math.max(1, Math.floor(Number(sp.get('limit') ?? 30)) || 30));
  const latS = sp.get('lat'), lonS = sp.get('lon');
  const lat = latS === null ? null : Number(latS), lon = lonS === null ? null : Number(lonS);
  if ((lat !== null && !(lat > 48 && lat < 51.2)) || (lon !== null && !(lon > 12 && lon < 19)) || (lat === null) !== (lon === null)) return badRequest('Neplatná poloha.');
  const r = await landmarks({ set, q, offset, limit, lat, lon, en: sp.get('lang') === 'en' });
  return plain(r, { maxAge: lat === null ? 300 : 0 });
}
