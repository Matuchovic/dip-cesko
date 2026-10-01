'use client';
import { appStore, mapApi } from '@/lib/app-state';
import { useStore } from '@/lib/store';
import { useNow } from '@/lib/hooks';
import { favoritesStore, isFavorite, toggleFavorite } from '@/lib/favorites';
import { describeDelay } from '@/domain/delay';
import { classifyPositionAge } from '@/domain/freshness';
import { MODE_LABEL } from '@/domain/modes';
import { formatAge, formatClockSeconds } from '@/domain/time';
import { detailAssetFor, detailVariant } from '@/map/assets';
import { DelayLabel, LineBadge } from './ui';
import { IconClose, IconFollow, IconStar, IconWheelchair } from './icons';

const yesNo = (v: boolean | null) => (v === null ? 'neuvedeno' : v ? 'ano' : 'ne');

export default function VehicleDetail() {
  const v = useStore(appStore, (s) => s.selected);
  const follow = useStore(appStore, (s) => s.follow);
  const meta = useStore(appStore, (s) => s.feedMeta);
  const favs = useStore(favoritesStore, (s) => s.items);
  const now = useNow(1000);
  if (!v) return null;
  const asset = detailAssetFor(v.route.mode);
  const img = asset ? detailVariant(asset) : null;
  const measured = v.measuredAt ? Date.parse(v.measuredAt) : null;
  const age = measured ? Math.max(0, (now - measured) / 1000) : null;
  const freshness = classifyPositionAge(age);
  const isDemo = meta?.status === 'demo';
  const lineKey = `${v.route.mode}:${v.route.shortName}`;
  const fav = isFavorite(favs, 'line', lineKey);
  const freshLabel = isDemo ? 'Ukázková poloha' : freshness === 'live' ? 'Živá poloha' : freshness === 'stale' ? 'Poloha není aktuální' : freshness === 'expired' ? 'Poloha zastaralá' : 'Stáří polohy neznámé';

  return (
    <article aria-labelledby="vd-title">
      {img && (
        <div className="vehicle-hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.file} alt="" width={img.width} height={img.height} decoding="async" />
          <span className="caption">Ilustrační vyobrazení – obecné vozidlo kategorie {MODE_LABEL[v.route.mode].toLowerCase()}</span>
        </div>
      )}
      <div className="detail-head">
        <LineBadge line={v.route.shortName} mode={v.route.mode} large />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div id="vd-title" className="detail-title">{v.headsign ? `směr ${v.headsign}` : `${MODE_LABEL[v.route.mode]} ${v.route.shortName}`}</div>
          <div className="detail-sub">{MODE_LABEL[v.route.mode]} {v.route.shortName}{v.registration ? ` · vůz ${v.registration}` : ''}</div>
        </div>
        <button type="button" className="icon-btn" aria-label="Zavřít detail vozidla" onClick={() => { mapApi.controller?.select(null); appStore.set({ selected: null }); }}><IconClose /></button>
      </div>

      <div className="meta-line" style={{ marginTop: 'var(--s3)' }}>
        <span className={`pill ${isDemo ? 'pill-demo' : freshness === 'live' ? 'pill-live' : 'pill-stale'}`}>{freshness === 'live' && !isDemo && <span className="pulse" aria-hidden />}{freshLabel}</span>
        <DelayLabel delay={v.delay} />
        {v.isCanceled && <span className="pill pill-error">Spoj zrušen</span>}
      </div>

      <dl className="kv">
        <dt>Zpoždění</dt><dd>{describeDelay(v.delay).label}</dd>
        <dt>Poloha změřena</dt><dd>{measured ? `${formatClockSeconds(measured)} (${formatAge(age ?? 0)})` : 'zdroj neuvádí čas měření'}</dd>
        <dt>Směr jízdy</dt><dd>{v.bearing === null ? 'neznámý – zobrazena značka bez natočení' : `${Math.round(v.bearing)}° ${v.bearingSource === 'derived' ? '(odvozeno z pohybu)' : '(ze zdroje)'}`}</dd>
        {v.lastStopName && <><dt>Poslední zastávka</dt><dd>{v.lastStopName}</dd></>}
        {v.nextStopName && <><dt>Další zastávka</dt><dd>{v.nextStopName}</dd></>}
        {v.vehicleTypeLabel && <><dt>Typ vozidla</dt><dd>{v.vehicleTypeLabel}</dd></>}
        <dt><span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><IconWheelchair size={15} />Bezbariérové</span></dt><dd>{yesNo(v.wheelchair)}</dd>
        <dt>Klimatizace</dt><dd>{yesNo(v.airConditioned)}</dd>
      </dl>

      <div className="actions">
        <button type="button" className="btn btn-primary" aria-pressed={follow} onClick={() => { if (follow) mapApi.controller?.setFollow(false); else mapApi.controller?.select(v.id, { fly: true, follow: true }); }}>
          <IconFollow size={18} />{follow ? 'Přestat sledovat' : 'Sledovat na mapě'}
        </button>
        <button type="button" className="btn btn-secondary" aria-pressed={fav} onClick={() => toggleFavorite({ kind: 'line', key: lineKey, line: v.route.shortName, mode: v.route.mode, headsign: v.headsign, savedAt: new Date().toISOString() })}>
          <IconStar size={18} filled={fav} />{fav ? 'Linka uložena' : 'Uložit linku'}
        </button>
      </div>
      <p className="footer-note">Zdroj: {meta?.attribution ?? '—'}. Mezi měřeními se poloha na mapě plynule dopočítává; za poslední měření se neodhaduje.</p>
    </article>
  );
}
