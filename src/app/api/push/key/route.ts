import { pushConfig } from '@/server/push';
import { plain as json } from '@/server/plain';

export const dynamic = 'force-dynamic';
/** Veřejný klíč VAPID pro přihlášení k upozorněním (bez nastavení serveru 503). */
export async function GET() {
  const cfg = pushConfig();
  return cfg ? json({ publicKey: cfg.vapidPublic }, { maxAge: 3600 }) : json({ error: 'not_configured' }, { status: 503 });
}
