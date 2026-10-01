import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/server/env';
import { sharedCache } from '@/server/cache';

export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const token = serverEnv.adminToken;
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token || !given) return false;
  const a = Buffer.from(token), b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Chráněná diagnostika (vyžaduje ADMIN_TOKEN). Neobsahuje klíče ani osobní údaje. */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Nepovolený přístup' }, { status: 401 });
  const keys = ['pid:vehicles', 'pid:stops', 'pid:alerts'];
  return NextResponse.json({
    node: process.version, uptimeS: Math.round(process.uptime()), memoryMb: Math.round(process.memoryUsage().rss / 1048576),
    golemioKeyConfigured: Boolean(serverEnv.golemioKey), otpConfigured: Boolean(serverEnv.otpUrl), demo: serverEnv.demo,
    cache: Object.fromEntries(keys.map((k) => { const e = sharedCache.peek(k); return [k, e ? { ageS: Math.round((Date.now() - e.fetchedAt) / 1000), stale: e.stale } : null]; })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
