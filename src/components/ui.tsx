'use client';
import type { Delay, Mode, SourceMeta } from '@/domain/model';
import { describeDelay } from '@/domain/delay';
import { MODE_COLOR, MODE_LABEL } from '@/domain/modes';
import { formatAge } from '@/domain/time';
import { FEED_LIVE_MAX_S } from '@/domain/freshness';

export function LineBadge({ line, mode, large, stale }: { line: string; mode: Mode; large?: boolean; stale?: boolean }) {
  return <span className={`line-badge${large ? ' lg' : ''}`} style={{ background: stale ? '#8D8A9C' : MODE_COLOR[mode] }} aria-label={`${MODE_LABEL[mode]} ${line}`}>{line}</span>;
}

export function DelayLabel({ delay }: { delay: Delay }) {
  const d = describeDelay(delay);
  return <span className={`delay delay-${d.tone}`} title={d.label}>{d.tone === 'unknown' ? 'bez údaje' : d.tone === 'ok' ? 'včas' : d.short + ' min'}<span className="sr-only">{`, ${d.label}`}</span></span>;
}

/** Stav aktuálnosti dat – „Živě“ jen při skutečně čerstvých datech ze zdroje. */
export function FreshnessPill({ meta, error, offline, now }: { meta: SourceMeta | null; error?: string | null; offline?: boolean; now: number }) {
  if (offline) return <span className="pill pill-stale" role="status">Offline · poslední známá data</span>;
  if (!meta) return <span className="pill pill-off">Načítání dat…</span>;
  const age = meta.sourceTimestamp ? Math.max(0, (now - Date.parse(meta.sourceTimestamp)) / 1000) : meta.ageSeconds;
  const tooOld = age !== null && age > FEED_LIVE_MAX_S;
  switch (meta.status) {
    case 'demo': return <span className="pill pill-demo" title={meta.message}>Ukázková data{error ? ' · obnova selhala' : ''}</span>;
    case 'live':
      if (error || tooOld) return <span className="pill pill-stale" title={error ?? undefined}>Zastaralá data{age !== null ? ` · ${formatAge(age)}` : ''}</span>;
      return <span className="pill pill-live" title={`Zdroj: ${meta.source}`}><span className="pulse" aria-hidden />Živě</span>;
    case 'stale': return <span className="pill pill-stale" title={meta.message}>Zastaralá data{age !== null ? ` · ${formatAge(age)}` : ''}</span>;
    case 'unavailable': return <span className="pill pill-off" title={meta.message}>Živá data nepřipojena</span>;
    default: return <span className="pill pill-error" title={meta.message}>Data nedostupná</span>;
  }
}
