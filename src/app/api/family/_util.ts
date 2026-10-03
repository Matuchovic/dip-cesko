import 'server-only';
import { plain } from '@/server/plain';

export const notConfigured = () => plain({ error: 'not_configured' }, { status: 503 });
export const bad = (msg = 'Neplatný požadavek.') => plain({ error: msg }, { status: 400 });
export const denied = () => plain({ error: 'forbidden' }, { status: 403 });
export const slow = () => plain({ error: 'too_many' }, { status: 429 });
export const clientIp = (req: Request) => (req.headers.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || req.headers.get('x-real-ip') || 'local';
export async function body(req: Request, max = 8192): Promise<unknown | null> {
  const raw = await req.text();
  if (raw.length > max) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
