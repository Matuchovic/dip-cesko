'use client';
import type { Delay, Mode, SourceMeta } from '@/domain/model';
import { MODE_COLOR } from '@/domain/modes';
import { FEED_LIVE_MAX_S } from '@/domain/freshness';
import { delayTexts, modeName, useT } from '@/i18n';

export function LineBadge({ line, mode, large, stale }: { line: string; mode: Mode; large?: boolean; stale?: boolean }) {
  const t = useT();
  return <span className={`line-badge${large ? ' lg' : ''}`} style={{ background: stale ? '#8D8A9C' : MODE_COLOR[mode] }} aria-label={`${modeName(t, mode)} ${line}`}>{line}</span>;
}

export function DelayLabel({ delay }: { delay: Delay }) {
  const t = useT();
  const d = delayTexts(t, delay);
  return <span className={`delay delay-${d.tone}`} title={d.label}>{d.short}<span className="sr-only">{`, ${d.label}`}</span></span>;
}

/** Stav aktuálnosti dat – „Živě“ jen při skutečně čerstvých datech ze zdroje. */
export function FreshnessPill({ meta, error, offline, now }: { meta: SourceMeta | null; error?: string | null; offline?: boolean; now: number }) {
  const t = useT();
  if (offline) return <span className="pill pill-stale" role="status">{t('pill_offline')}</span>;
  if (!meta) return <span className="pill pill-off">{t('pill_loading')}</span>;
  const age = meta.sourceTimestamp ? Math.max(0, (now - Date.parse(meta.sourceTimestamp)) / 1000) : meta.ageSeconds;
  const tooOld = age !== null && age > FEED_LIVE_MAX_S;
  const ago = age !== null ? ` · ${t('ago', { s: age })}` : '';
  switch (meta.status) {
    case 'demo': return <span className="pill pill-demo" title={meta.message}>{t('pill_demo')}{error ? ` · ${t('pill_refreshFailed')}` : ''}</span>;
    case 'live':
      if (error || tooOld) return <span className="pill pill-stale" title={error ?? undefined}>{t('pill_stale')}{ago}</span>;
      return <span className="pill pill-live" title={meta.source}><span className="pulse" aria-hidden />{t('pill_live')}</span>;
    case 'stale': return <span className="pill pill-stale" title={meta.message}>{t('pill_stale')}{ago}</span>;
    case 'unavailable': return <span className="pill pill-off" title={meta.message}>{t('pill_unavailable')}</span>;
    default: return <span className="pill pill-error" title={meta.message}>{t('pill_error')}</span>;
  }
}
