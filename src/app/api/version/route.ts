export const dynamic = 'force-dynamic';

/** Co je právě nasazené. Prohlížeč to porovná se svým zapečeným otiskem – rozdíl znamená novou verzi. */
export function GET() {
  return new Response(JSON.stringify({ version: process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0', build: process.env.NEXT_PUBLIC_BUILD_ID ?? 'local' }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' },
  });
}
