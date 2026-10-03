import { plain as json } from '@/server/plain';
import { fireWatch, pushConfig, qstash, redis, sender, verifyQstashSignature } from '@/server/push';
import { transit } from '@/server/transit';
import { log } from '@/server/log';
import { familyEnv, runFamilyCheck } from '@/server/family';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Volá jen QStash (ověřený podpis): v pravou chvíli zkontroluje živý odjezd a pošle upozornění. */
export async function POST(req: Request) {
  const cfg = pushConfig();
  if (!cfg) return json({ error: 'not_configured' }, { status: 503 });
  const raw = await req.text();
  if (raw.length > 1024 || !verifyQstashSignature(req.headers.get('upstash-signature'), raw, [cfg.signCurrent, cfg.signNext], `${cfg.baseUrl}/api/push/fire`)) {
    return json({ error: 'forbidden' }, { status: 403 });
  }
  let id = '';
  try { id = String((JSON.parse(raw) as { id?: unknown }).id ?? ''); } catch { /* níže */ }
  // hlídání jízdy dítěte (rodičovská kontrola)
  const fam = /^fam:([0-9a-f-]{36})$/.exec(id);
  if (fam) {
    const env = familyEnv();
    const result = env ? await runFamilyCheck(env, fam[1]!, async (stop) => (await transit().departures(stop, 60)).data.departures).catch(() => 'error') : 'off';
    return json({ ok: true, result });
  }
  if (!/^[0-9a-f-]{36}$/.test(id)) return json({ ok: true });
  const db = redis(cfg);
  const result = await fireWatch(id, {
    load: db.load, save: db.save, remove: db.remove, publish: qstash(cfg), send: sender(cfg), now: () => Date.now(),
    departures: async (stop) => (await transit().departures(stop, 40)).data.departures,
  }).catch((e) => { log('error', 'push.fire.error', { error: e instanceof Error ? e.message : String(e) }); return 'error'; });
  log('info', 'push.fire', { result });
  return json({ ok: true, result });
}
