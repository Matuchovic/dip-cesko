import { allowClient } from '@/server/rateLimit';
import { badRequest, tooMany } from '@/server/respond';
import { plain as json } from '@/server/plain';
import { WatchInput, isAllowedPushEndpoint, newWatch, pushConfig, qstash, redis, tokenMatches, ttlFor } from '@/server/push';

export const dynamic = 'force-dynamic';
const MAX_BODY = 4096;

/** Nastaví upozornění na konkrétní odjezd; vrací id a tajný token pro zrušení. */
export async function POST(req: Request) {
  if (!allowClient(req, 20)) return tooMany();
  const cfg = pushConfig();
  if (!cfg) return json({ error: 'not_configured' }, { status: 503 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return badRequest('Příliš velký požadavek.');
  let parsed;
  try { parsed = WatchInput.safeParse(JSON.parse(raw)); } catch { return badRequest('Neplatný požadavek.'); }
  if (!parsed.success) return badRequest('Neplatný požadavek.');
  const body = parsed.data;
  if (!isAllowedPushEndpoint(body.subscription.endpoint)) return badRequest('Nepodporovaná služba upozornění.');
  const now = Date.now(), dep = Date.parse(body.scheduledAt);
  if (dep < now - 60_000 || dep > now + 3 * 3600_000) return badRequest('Odjezd je mimo povolené okno.');
  const db = redis(cfg);
  const { watch, token } = newWatch(body);
  const ttl = ttlFor(watch, now);
  try {
    if ((await db.countFor(body.subscription.endpoint, ttl)) > 10) return json({ error: 'too_many_watches' }, { status: 429 });
    await db.save(watch, ttl);
    await qstash(cfg)(watch.id, Math.max(0, (dep - body.leadMin * 60_000 - now) / 1000));
  } catch {
    return json({ error: 'upstream' }, { status: 502 });
  }
  return json({ id: watch.id, token, notifyAt: new Date(Math.max(now, dep - body.leadMin * 60_000)).toISOString() });
}

/** Zruší upozornění (jen s tokenem, který dostal ten, kdo ho nastavil). */
export async function DELETE(req: Request) {
  if (!allowClient(req, 30)) return tooMany();
  const cfg = pushConfig();
  if (!cfg) return json({ error: 'not_configured' }, { status: 503 });
  const sp = new URL(req.url).searchParams;
  const id = sp.get('id') ?? '', token = sp.get('token') ?? '';
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return badRequest('Neplatný požadavek.');
  const db = redis(cfg);
  try {
    const w = await db.load(id);
    if (w && tokenMatches(w, token)) await db.remove(id);
  } catch { return json({ error: 'upstream' }, { status: 502 }); }
  return json({ ok: true });
}
