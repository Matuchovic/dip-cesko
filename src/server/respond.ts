import { NextResponse } from 'next/server';
import type { Envelope, SourceMeta } from '@/domain/model';

export function json<T>(body: Envelope<T>, init?: { status?: number; maxAge?: number }) {
  const maxAge = init?.maxAge ?? 0;
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: { 'Cache-Control': maxAge > 0 ? `public, max-age=0, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}` : 'no-store' },
  });
}

export function problem(status: number, meta: SourceMeta) {
  return NextResponse.json({ data: null, meta }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function tooMany() {
  return NextResponse.json({ error: 'Příliš mnoho požadavků. Zkuste to za chvíli.' }, { status: 429, headers: { 'Retry-After': '30' } });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function makeMeta(partial: Omit<SourceMeta, 'ageSeconds'> & { ageSeconds?: number | null }, now = Date.now()): SourceMeta {
  const ts = partial.sourceTimestamp ?? partial.fetchedAt;
  const age = partial.ageSeconds ?? (ts ? Math.max(0, Math.round((now - Date.parse(ts)) / 1000)) : null);
  return { ...partial, ageSeconds: age };
}
