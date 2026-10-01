import { NextResponse } from 'next/server';
import { serverEnv } from '@/server/env';
import { sharedCache } from '@/server/cache';

export const dynamic = 'force-dynamic';

/** Veřejný, hrubý přehled stavu zdrojů – bez tajných údajů a interních detailů. */
export async function GET() {
  const age = (key: string) => { const e = sharedCache.peek(key); return e ? Math.round((Date.now() - e.fetchedAt) / 1000) : null; };
  return NextResponse.json({
    mode: serverEnv.demo ? 'demo' : 'live',
    sources: [
      { id: 'pid-vehicles', name: 'Polohy vozidel PID (Golemio)', configured: serverEnv.demo || Boolean(serverEnv.golemioKey), lastSuccessAgeS: age('pid:vehicles') },
      { id: 'pid-stops', name: 'Seznam zastávek PID', configured: true, lastSuccessAgeS: age('pid:stops') },
      { id: 'pid-alerts', name: 'Mimořádnosti PID (RSS)', configured: true, lastSuccessAgeS: age('pid:alerts') },
      { id: 'planner', name: 'Plánovač spojení (Transitous / OpenTripPlanner)', configured: Boolean(serverEnv.otpUrl) || (!serverEnv.demo && process.env.PLANNER !== 'off'), lastSuccessAgeS: null },
      { id: 'map', name: 'Mapový podklad', configured: true, lastSuccessAgeS: null },
    ],
    vehiclesByMode: (() => { const e = sharedCache.peek('pid:vehicles') as { value?: { vehicles?: { route: { mode: string } }[] } } | null | undefined; const out: Record<string, number> = {}; for (const v of e?.value?.vehicles ?? []) out[v.route.mode] = (out[v.route.mode] ?? 0) + 1; return out; })(),
    time: new Date().toISOString(),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
