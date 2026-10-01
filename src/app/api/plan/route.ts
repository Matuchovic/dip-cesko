import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverEnv } from '@/server/env';
import { allowClient } from '@/server/rateLimit';
import { UpstreamError } from '@/server/http';
import { log } from '@/server/log';
import { tooMany } from '@/server/respond';
import { inCzechia } from '@/domain/geo';
import { PLAN_QUERY, PlannerError, mapPlanResponse, planVariables } from '@/planning/otp';

export const dynamic = 'force-dynamic';

const Point = z.object({ lat: z.number(), lon: z.number(), label: z.string().min(1).max(120) }).refine((p) => inCzechia(p.lon, p.lat), 'Místo je mimo podporovanou oblast.');
const Body = z.object({ from: Point, to: Point, dateTime: z.string().refine((s) => Number.isFinite(Date.parse(s)), 'Neplatný čas'), arriveBy: z.boolean().default(false), wheelchair: z.boolean().default(false) });

export async function POST(req: Request) {
  if (!allowClient(req, 30)) return tooMany();
  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); } catch { return NextResponse.json({ status: 'invalid', message: 'Zkontrolujte výchozí místo, cíl a čas.' }, { status: 400 }); }
  if (!serverEnv.otpUrl) {
    return NextResponse.json({ status: 'unavailable', reason: 'not_configured', message: 'Plánovač spojení zatím není připojen. Nabídneme odjezdy ze zastávek a mapu.' }, { status: 503 });
  }
  const url = new URL(serverEnv.otpUrl);
  try {
    const res = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ query: PLAN_QUERY, variables: planVariables(body) }), signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new UpstreamError('otp', res.status, `Plánovač vrátil ${res.status}`);
    const journeys = mapPlanResponse(await res.json());
    return NextResponse.json({ status: journeys.length ? 'ok' : 'empty', journeys, fetchedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    log('error', 'planner.error', { error: err instanceof Error ? err.message : String(err) });
    if (err instanceof PlannerError) return NextResponse.json({ status: 'empty', reason: err.code, message: err.message }, { status: 200 });
    return NextResponse.json({ status: 'error', message: 'Plánovač je dočasně nedostupný. Zkuste to prosím později.' }, { status: 502 });
  }
}
