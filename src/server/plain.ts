import 'server-only';
/** Prostá JSON odpověď (pro API upozornění, které nevrací obálku s metadaty zdroje). */
export function plain(body: unknown, init: { status?: number; maxAge?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': init.maxAge ? `public, max-age=${init.maxAge}` : 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
