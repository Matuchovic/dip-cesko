'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getJson, useVisibleInterval } from '@/lib/hooks';
import type { Alert, Envelope } from '@/domain/model';
import { useT } from '@/i18n';
import type { MessageKey } from '@/i18n/messages';

interface Item { id: string; text: string; title: string; detail: string; link: string | null }
const TIPS: MessageKey[] = ['tick_tip1', 'tick_tip2', 'tick_tip3', 'tick_tip4'];
const HIDE_KEY = 'doprava.ticker.hidden';

/**
 * Běžící pruh nad spodní lištou: při mimořádnostech PID (tmavý „Provoz“), jinak tipy („Novinky“).
 * Jede zprava doleva, prstem se zastaví, klepnutím se otevře detail; křížkem se schová do příštího spuštění.
 */
export default function NewsTicker() {
  const t = useT();
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [open, setOpen] = useState<Item | null>(null);
  const [hold, setHold] = useState(false);
  // čte se jen v prohlížeči; pruh se stejně vykreslí až po načtení mimořádností, takže nevznikne rozdíl proti serveru
  const [hidden, setHidden] = useState(() => { try { return typeof window !== 'undefined' && sessionStorage.getItem(HIDE_KEY) === '1'; } catch { return false; } });
  useVisibleInterval(() => { void getJson<Envelope<Alert[]>>('/api/alerts').then((r) => setAlerts(r.body?.data ?? [])); }, 120_000, []);

  const live = (alerts?.length ?? 0) > 0;
  const ref = useRef<HTMLDivElement>(null);
  // pod oknem aplikace (spodní okraj iPhonu) ať je stejná barva jako pruh – bez rušivého pruhu jiné barvy
  useEffect(() => {
    const root = document.documentElement;
    const bg = ref.current ? getComputedStyle(ref.current).backgroundColor : '';
    root.style.backgroundColor = bg;
    return () => { root.style.backgroundColor = ''; };
  }, [live, hidden, alerts]);
  const items: Item[] = useMemo(() => live
    ? alerts!.slice(0, 8).map((a) => ({ id: String(a.id), text: `🚧 ${a.title}`, title: a.title, detail: a.summary, link: a.link }))
    : TIPS.map((k) => ({ id: k, text: t(k), title: t(k), detail: t(`${k}_d` as MessageKey), link: null })), [alerts, live, t]);
  // rychlost podle délky textu (~55 px/s), aby se dalo pohodlně číst
  const duration = Math.max(18, Math.round(items.reduce((n, i) => n + i.text.length, 0) * 0.16));
  if (hidden || alerts === null) return null;

  return (
    <div ref={ref} className={`ticker${live ? '' : ' calm'}`} role="region" aria-label={t('tick_aria')}>
      <span className="ticker-label"><span className="ticker-dot" aria-hidden />{live ? t('tick_live') : t('tick_news')}</span>
      <div className={`ticker-viewport${hold ? ' hold' : ''}`} onPointerDown={() => setHold(true)} onPointerUp={() => setHold(false)} onPointerLeave={() => setHold(false)}>
        <div className="ticker-track" style={{ animationDuration: `${duration}s` }}>
          {[0, 1].map((copy) => items.map((it) => (
            <button key={`${copy}-${it.id}`} type="button" className="ticker-item" tabIndex={copy ? -1 : 0} aria-hidden={copy ? true : undefined} onClick={() => setOpen(it)}>{it.text}</button>
          )))}
        </div>
      </div>
      <button type="button" className="ticker-x" aria-label={t('tick_hide')} onClick={() => { setHidden(true); try { sessionStorage.setItem(HIDE_KEY, '1'); } catch { /* bez úložiště */ } }}>×</button>
      {open && (
        <div className="ticker-detail" role="dialog" aria-label={open.title}>
          <button type="button" className="ticker-detail-x" aria-label={t('close')} onClick={() => setOpen(null)}>×</button>
          <strong>{open.title}</strong>
          {open.detail && <p>{open.detail}</p>}
          {open.link && <a href={open.link} target="_blank" rel="noopener noreferrer">{t('more')} ↗</a>}
        </div>
      )}
    </div>
  );
}
