'use client';
import { useEffect, useMemo, useState } from 'react';
import { getJson, useVisibleInterval } from '@/lib/hooks';
import type { Alert, Envelope } from '@/domain/model';
import { useT } from '@/i18n';
import type { MessageKey } from '@/i18n/messages';
import E3, { type E3Name } from './icons/E3';

interface Item { id: string; icon: E3Name; text: string; title: string; detail: string; link: string | null }
const TIPS: MessageKey[] = ['tick_tip5', 'tick_tip1', 'tick_tip2', 'tick_tip3'];
const TIP_ICONS: E3Name[] = ['family', 'bell', 'metro', 'home'];
const HIDE_KEY = 'doprava.ticker.hidden';
type Phase = 'live' | 'news';
// délka jedné fáze (testy si ji můžou zkrátit přes window.__tickerMs)
const phaseMs = () => (typeof window !== 'undefined' && Number((window as unknown as { __tickerMs?: number }).__tickerMs)) || 10_000;

/**
 * Pruh nad spodní lištou se každých 10 s plynule (rozmazáním) přepíná: PROVOZ (mimořádnosti PID, nebo „bez omezení“)
 * a NOVINKY (tipy). Jede zprava doleva, prstem se zastaví, klepnutím se otevře detail – během čtení se nepřepíná.
 */
export default function NewsTicker() {
  const t = useT();
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [open, setOpen] = useState<Item | null>(null);
  const [hold, setHold] = useState(false);
  const [phase, setPhase] = useState<Phase>('live');
  // čte se jen v prohlížeči; pruh se stejně vykreslí až po načtení mimořádností, takže nevznikne rozdíl proti serveru
  const [hidden, setHidden] = useState(() => { try { return typeof window !== 'undefined' && sessionStorage.getItem(HIDE_KEY) === '1'; } catch { return false; } });
  useVisibleInterval(() => { void getJson<Envelope<Alert[]>>('/api/alerts').then((r) => setAlerts(r.body?.data ?? [])); }, 120_000, []);

  const paused = hold || open !== null;
  useEffect(() => {
    if (paused || hidden || alerts === null) return;
    const id = setTimeout(() => setPhase((p) => (p === 'live' ? 'news' : 'live')), phaseMs());
    return () => clearTimeout(id);
  }, [phase, paused, hidden, alerts]);
  const layers = useMemo(() => {
    const live: Item[] = alerts && alerts.length
      ? alerts.slice(0, 8).map((a) => ({ id: String(a.id), icon: 'works' as E3Name, text: a.title, title: a.title, detail: a.summary, link: a.link }))
      : [{ id: 'calm', icon: 'check', text: t('tick_tip4'), title: t('tick_tip4'), detail: t('tick_tip4_d'), link: null }];
    const news: Item[] = TIPS.map((k, i) => ({ id: k, icon: TIP_ICONS[i]!, text: t(k), title: t(k), detail: t(`${k}_d` as MessageKey), link: null }));
    return { live, news };
  }, [alerts, t]);
  if (hidden || alerts === null) return null;
  const calm = !alerts.length;
  // rychlost podle délky textu (~55 px/s), aby se dalo pohodlně číst
  const dur = (items: Item[]) => Math.max(14, Math.round(items.reduce((n, i) => n + i.text.length, 0) * 0.16));

  return (
    <div className={`ticker phase-${phase}`} role="region" aria-label={t('tick_aria')}>
      {(['live', 'news'] as const).map((ph) => {
        const items = layers[ph], on = ph === phase;
        return (
          <div key={ph} className={`ticker-layer ${ph}${on ? ' on' : ''}${ph === 'live' && calm ? ' calm-live' : ''}`} aria-hidden={on ? undefined : true} inert={!on}>
            <div className="ticker-content">
              <span className="ticker-label"><span className="ticker-dot" aria-hidden />{ph === 'live' ? t('tick_live') : t('tick_news')}</span>
              <div className={`ticker-viewport${hold ? ' hold' : ''}`} onPointerDown={() => setHold(true)} onPointerUp={() => setHold(false)} onPointerLeave={() => setHold(false)}>
                <div className="ticker-track" style={{ animationDuration: `${dur(items)}s` }}>
                  {[0, 1].map((copy) => items.map((it) => (
                    <button key={`${copy}-${it.id}`} type="button" className="ticker-item" tabIndex={copy || !on ? -1 : 0} aria-hidden={copy ? true : undefined} onClick={() => setOpen(it)}><E3 name={it.icon} size={17} /> {it.text}</button>
                  )))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <button type="button" className="ticker-x" aria-label={t('tick_hide')} onClick={() => { setHidden(true); try { sessionStorage.setItem(HIDE_KEY, '1'); } catch { /* bez úložiště */ } }}>×</button>
      {open && (
        <div className="ticker-detail" role="dialog" aria-label={open.title}>
          <button type="button" className="ticker-detail-x" aria-label={t('close')} onClick={() => setOpen(null)}>×</button>
          <strong><E3 name={open.icon} size={30} /> {open.title}</strong>
          {open.detail && <p>{open.detail}</p>}
          {open.link && <a href={open.link} target="_blank" rel="noopener noreferrer">{t('more')} <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden><path d="M3 9 9 3M4 3h5v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></a>}
        </div>
      )}
    </div>
  );
}
