'use client';
import type { Departure } from '@/domain/model';
import type { DepartureGroup } from '@/domain/departures';
import { departureMs } from '@/domain/departures';
import { formatClock, minutesUntil } from '@/domain/time';
import { useT } from '@/i18n';
import { DelayLabel, LineBadge } from './ui';
import TLink from './TLink';
import { IconWheelchair } from './icons';

/** Přehled po linkách: každá linka a směr s nejbližšími odjezdy (minuty i přesný čas). */
export function DepartureGroups({ groups, now, label }: { groups: DepartureGroup[]; now: number; label?: string }) {
  const t = useT();
  return (
    <ul className="list dep-groups" aria-label={label}>
      {groups.map((g) => {
        const first = g.items[0];
        return (
          <li key={g.key} className="row dep-group">
            <TLink href={`/linka?l=${encodeURIComponent(g.route.shortName)}&m=${g.route.mode}`} aria-label={t('line_open')} className="badge-link"><LineBadge line={g.route.shortName} mode={g.route.mode} /></TLink>
            <span className="row-main">
              <span className="row-title">{g.headsign}</span>
              <span className="row-sub">{g.platforms.length ? g.platforms.map((p) => t('platformShort', { p })).join(', ') : t('platformUnknown')}{first && <> · <DelayLabel delay={first.delay} /></>}</span>
            </span>
            <span className="dep-times">
              {g.items.map((d, i) => {
                const ms = departureMs(d);
                const mins = Number.isFinite(ms) ? minutesUntil(ms, now) : null;
                const big = d.isCanceled ? '—' : mins === null ? '?' : mins <= 0 ? (d.isAtStop ? t('atStop') : t('now')) : String(mins);
                return (
                  <span key={d.id} className={`dep-time${i === 0 ? ' first' : ''}${d.isCanceled ? ' canceled' : ''}`} title={d.isCanceled ? t('canceled') : undefined}>
                    <b>{big}{mins !== null && mins > 0 && !d.isCanceled && <small> {t('min')}</small>}</b>
                    <i>{Number.isFinite(ms) ? formatClock(ms) : ''}</i>
                    {d.isCanceled && <span className="sr-only">{t('canceled')}</span>}
                  </span>
                );
              })}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Chronologický seznam odjezdů. */
export function DepartureTimeline({ deps, now, label }: { deps: Departure[]; now: number; label?: string }) {
  const t = useT();
  return (
    <ul className="list" aria-label={label}>
      {deps.map((d) => {
        const ms = departureMs(d);
        const sched = d.scheduledAt ? Date.parse(d.scheduledAt) : null;
        const mins = Number.isFinite(ms) ? minutesUntil(ms, now) : null;
        return (
          <li key={d.id} className={`row${d.isCanceled ? ' canceled' : ''}`}>
            <LineBadge line={d.route.shortName} mode={d.route.mode} />
            <span className="row-main">
              <span className="row-title">{d.headsign}</span>
              <span className="row-sub">{d.platform ? t('platform', { p: d.platform }) : t('platformUnknown')}{d.wheelchair && <> · <IconWheelchair size={13} /><span className="sr-only">{t('dep_wheelchair')}</span></>}{d.isCanceled ? ` · ${t('dep_canceledUpper')}` : ''}</span>
            </span>
            <span className="row-side">
              <span className="mins">{d.isCanceled ? '—' : mins === null ? '?' : mins <= 0 ? (d.isAtStop ? t('atStop') : '<1') : mins}{!d.isCanceled && mins !== null && mins > 0 && <small>{t('min')}</small>}</span>
              <span className="clock">{sched ? formatClock(sched) : ''}{d.predictedAt && sched && Math.abs(Date.parse(d.predictedAt) - sched) >= 60_000 ? ` → ${formatClock(Date.parse(d.predictedAt))}` : ''}</span>
              <DelayLabel delay={d.delay} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
