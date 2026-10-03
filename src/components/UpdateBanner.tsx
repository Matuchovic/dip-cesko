'use client';
/* eslint-disable @next/next/no-img-element -- malá ikona aplikace */
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useT } from '@/i18n';

/**
 * Aktualizace na novou verzi (podle MatuchaDev):
 * 1. Prohlížeč zná otisk sestavení, na kterém běží (zapečený při sestavení); `/api/version` vrací, co je nasazené teď.
 * 2. Ptá se 3 s po startu, pak každou minutu, a hned při návratu do aplikace nebo po obnovení signálu. Po nálezu přestane.
 * 3. Lišta ukazuje jen čísla verzí (bez popisu změn). „Aktualizovat“ → krátká obrazovka načítání → nová verze.
 * 4. Kdo lištu zavře nebo si jí nevšimne, dostane novou verzi sám při přechodu do jiné sekce – nikdy uprostřed psaní.
 */
const RUNNING = { version: process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0', build: process.env.NEXT_PUBLIC_BUILD_ID ?? 'local' };
const FIRST = 3_000, EVERY = 60_000, MIN_BOOT = 900;
const DISMISS_KEY = 'doprava.update.dismissed';

export default function UpdateBanner() {
  const t = useT();
  const pathname = usePathname();
  const [next, setNext] = useState<{ version: string; build: string } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [booting, setBooting] = useState(false);
  const found = useRef(false);
  const lastPath = useRef(pathname);

  const check = useCallback(async () => {
    if (found.current || document.visibilityState !== 'visible' || !navigator.onLine) return;
    try {
      const r = await fetch('/api/version', { cache: 'no-store' });
      if (!r.ok) return;
      const v = (await r.json()) as { version: string; build: string };
      if (v.build && v.build !== RUNNING.build) {
        found.current = true;
        setNext(v);
        try { setDismissed(sessionStorage.getItem(DISMISS_KEY) === v.build); } catch { /* bez úložiště */ }
        // ať si prohlížeč rovnou stáhne i nového servisního pracovníka
        void navigator.serviceWorker?.getRegistration().then((reg) => reg?.update()).catch(() => undefined);
      }
    } catch { /* offline – zkusí se později */ }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void check(), FIRST);
    const every = setInterval(() => void check(), EVERY);
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    window.addEventListener('focus', onVisible);
    return () => { clearTimeout(first); clearInterval(every); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', onVisible); window.removeEventListener('focus', onVisible); };
  }, [check]);

  // přechod do jiné sekce = nejlepší chvíle načíst novou verzi (nikdy při rozepsaném poli)
  useEffect(() => {
    if (pathname === lastPath.current) return;
    lastPath.current = pathname;
    const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
    if (next && !typing) window.location.reload();
  }, [pathname, next]);

  const update = async () => {
    setBooting(true);
    const t0 = Date.now();
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
      reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    } catch { /* bez servisního pracovníka */ }
    setTimeout(() => window.location.reload(), Math.max(0, MIN_BOOT - (Date.now() - t0)));
  };

  if (booting && next) {
    return (
      <div className="upd-boot" role="status" aria-live="assertive">
        <img src="/icons/icon-256.webp" alt="" width={96} height={96} className="upd-boot-logo" />
        <strong>DopravaČR</strong>
        <span>{t('upd_boot', { v: next.version })}</span>
        <span className="upd-boot-bar" aria-hidden><i /></span>
      </div>
    );
  }
  if (!next || dismissed) return null;
  return (
    <div className="upd" role="status" aria-live="polite">
      <div className="upd-island">
        <span className="upd-rim" aria-hidden />
        <img src="/icons/icon-256.webp" alt="" width={40} height={40} className="upd-icon" />
        <span className="upd-text">
          <strong>{t('upd_title')}</strong>
          <span className="upd-ver">{RUNNING.version} → {next.version}</span>
        </span>
        <button type="button" className="upd-go" onClick={() => void update()}>{t('upd_btn')}</button>
        <button type="button" className="upd-x" aria-label={t('upd_later')} onClick={() => { setDismissed(true); try { sessionStorage.setItem(DISMISS_KEY, next.build); } catch { /* bez úložiště */ } }}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
        </button>
      </div>
    </div>
  );
}
