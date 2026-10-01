'use client';
import { appStore, mapApi } from '@/lib/app-state';
import { useStore } from '@/lib/store';
import { useNow } from '@/lib/hooks';
import { favoritesStore, isFavorite, toggleFavorite } from '@/lib/favorites';
import { classifyPositionAge } from '@/domain/freshness';
import { formatClockSeconds } from '@/domain/time';
import { detailAssetFor, detailVariant } from '@/map/assets';
import { delayTexts, modeName, useT } from '@/i18n';
import { DelayLabel, LineBadge } from './ui';
import { IconClose, IconFollow, IconStar, IconWheelchair } from './icons';

export default function VehicleDetail() {
  const t = useT();
  const v = useStore(appStore, (s) => s.selected);
  const follow = useStore(appStore, (s) => s.follow);
  const meta = useStore(appStore, (s) => s.feedMeta);
  const favs = useStore(favoritesStore, (s) => s.items);
  const now = useNow(1000);
  if (!v) return null;
  const yesNo = (x: boolean | null) => (x === null ? t('notStated') : x ? t('yes') : t('no'));
  const asset = detailAssetFor(v.route.mode);
  const img = asset ? detailVariant(asset) : null;
  const measured = v.measuredAt ? Date.parse(v.measuredAt) : null;
  const age = measured ? Math.max(0, (now - measured) / 1000) : null;
  const freshness = classifyPositionAge(age);
  const isDemo = meta?.status === 'demo';
  const lineKey = `${v.route.mode}:${v.route.shortName}`;
  const fav = isFavorite(favs, 'line', lineKey);
  const mode = modeName(t, v.route.mode);
  const onTrack = mapApi.controller?.isOnTrack(v.id) ?? false;
  const predicted = mapApi.controller?.predictedSeconds(v.id) ?? 0;
  const freshLabel = isDemo ? t('fresh_demo') : freshness === 'live' ? t('fresh_live') : freshness === 'stale' ? t('fresh_stale') : freshness === 'expired' ? t('fresh_expired') : t('fresh_unknown');

  return (
    <article aria-labelledby="vd-title">
      {img && (
        <div className="vehicle-hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.file} alt="" width={img.width} height={img.height} decoding="async" />
          <span className="caption">{t('illustration', { mode })}</span>
        </div>
      )}
      <div className="detail-head">
        <LineBadge line={v.route.shortName} mode={v.route.mode} large />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div id="vd-title" className="detail-title">{v.headsign ? t('direction', { h: v.headsign }) : `${mode} ${v.route.shortName}`}</div>
          <div className="detail-sub">{mode} {v.route.shortName}{v.registration ? ` · ${t('vd_vehicleNo', { r: v.registration })}` : ''}</div>
        </div>
        <button type="button" className="icon-btn" aria-label={t('vd_close')} onClick={() => { mapApi.controller?.select(null); appStore.set({ selected: null }); }}><IconClose /></button>
      </div>

      <div className="meta-line" style={{ marginTop: 'var(--s3)' }}>
        <span className={`pill ${isDemo ? 'pill-demo' : freshness === 'live' ? 'pill-live' : 'pill-stale'}`}>{freshness === 'live' && !isDemo && <span className="pulse" aria-hidden />}{freshLabel}</span>
        <DelayLabel delay={v.delay} />
        {v.isCanceled && <span className="pill pill-error">{t('vd_canceled')}</span>}
      </div>

      <dl className="kv">
        <dt>{t('kv_delay')}</dt><dd>{delayTexts(t, v.delay).label}</dd>
        <dt>{t('kv_measured')}</dt><dd>{measured ? `${formatClockSeconds(measured)} (${t('ago', { s: age ?? 0 })})` : t('kv_noTime')}</dd>
        <dt>{t('kv_heading')}</dt><dd>{v.bearing === null ? t('kv_headingUnknown') : `${Math.round(v.bearing)}° ${v.bearingSource === 'derived' ? t('kv_derived') : t('kv_fromSource')}`}</dd>
        <dt>{t('kv_track')}</dt><dd>{onTrack ? t('track_on') : t('track_off')}{predicted > 2 ? ` · ${t('kv_predicted', { s: predicted })}` : ''}</dd>
        {v.lastStopName && <><dt>{t('kv_lastStop')}</dt><dd>{v.lastStopName}</dd></>}
        {v.nextStopName && <><dt>{t('kv_nextStop')}</dt><dd>{v.nextStopName}</dd></>}
        {v.vehicleTypeLabel && <><dt>{t('kv_type')}</dt><dd>{v.vehicleTypeLabel}</dd></>}
        <dt><span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><IconWheelchair size={15} />{t('kv_wheelchair')}</span></dt><dd>{yesNo(v.wheelchair)}</dd>
        <dt>{t('kv_ac')}</dt><dd>{yesNo(v.airConditioned)}</dd>
      </dl>

      <div className="actions">
        <button type="button" className="btn btn-primary" aria-pressed={follow} onClick={() => { if (follow) mapApi.controller?.setFollow(false); else mapApi.controller?.select(v.id, { fly: true, follow: true }); }}>
          <IconFollow size={18} />{follow ? t('unfollow') : t('follow')}
        </button>
        <button type="button" className="btn btn-secondary" aria-pressed={fav} onClick={() => toggleFavorite({ kind: 'line', key: lineKey, line: v.route.shortName, mode: v.route.mode, headsign: v.headsign, savedAt: new Date().toISOString() })}>
          <IconStar size={18} filled={fav} />{fav ? t('lineSaved') : t('saveLine')}
        </button>
      </div>
      <p className="footer-note">{meta?.attribution ?? '—'}. {t('vd_note')}</p>
    </article>
  );
}
