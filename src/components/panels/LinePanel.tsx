'use client';
import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getJson, useVisibleInterval } from '@/lib/hooks';
import { mapApi } from '@/lib/app-state';
import { MODES, type Envelope, type Mode, type TripDetail, type VehicleState } from '@/domain/model';
import { MODE_COLOR } from '@/domain/modes';
import { describeDelay } from '@/domain/delay';
import { progressOnStations } from '@/domain/metro';
import { angDiff } from '@/map/geometry';
import { modeName, useT } from '@/i18n';
import { navigateWithTransition } from '@/lib/transitions';
import { LineBadge } from '../ui';

const ROW = 44;
const DELAY_COLOR = { unknown: '#9A98A6', ok: '#2F9E58', late: '#D33A2C', early: '#2F6FB5' } as const;

/**
 * Linka jako schéma: zastávky obou směrů pod sebou a všechny vozy linky na nich v reálném čase.
 * Směr vozu se určí podle souhlasu jeho kurzu se směrem trasy (bez hádání podle názvu cíle).
 */
export default function LinePanel() {
  const t = useT();
  const router = useRouter();
  const sp = useSearchParams();
  const line = (sp.get('l') ?? '').slice(0, 6);
  const modeParam = sp.get('m') ?? '';
  const mode = (MODES as readonly string[]).includes(modeParam) ? (modeParam as Mode) : null;
  const valid = /^[A-Za-z0-9]{1,6}$/.test(line) && mode !== null;
  const [vehicles, setVehicles] = useState<Envelope<VehicleState[]> | null>(null);
  const [dirs, setDirs] = useState<TripDetail[]>([]);
  const [tab, setTab] = useState(0);

  const load = useCallback(async () => {
    if (!valid) return;
    const r = await getJson<Envelope<VehicleState[]>>(`/api/vehicles?line=${encodeURIComponent(line)}&mode=${mode}`);
    if (!r.body) return;
    setVehicles(r.body);
    // Průběh spoje: jeden vůz pro každý směr (nejvýš 2 dotazy, výsledek se pamatuje).
    if (dirs.length >= 2) return;
    const known = [...dirs];
    for (const v of r.body.data) {
      if (known.length >= 2) break;
      if (known.some((d) => directionOf(d, v) === 1)) continue;
      const tr = await getJson<Envelope<TripDetail | null>>(`/api/trip?vehicle=${encodeURIComponent(v.id)}`);
      const d = tr.body?.data;
      if (d && d.stops.length >= 2 && !known.some((k) => k.headsign === d.headsign)) known.push(d);
    }
    if (known.length !== dirs.length) setDirs(known);
  }, [valid, line, mode, dirs]);
  useVisibleInterval(() => void load(), 5_000, [line, mode]);

  const dir = dirs[Math.min(tab, Math.max(0, dirs.length - 1))] ?? null;
  const placed = useMemo(() => {
    if (!dir || !vehicles) return [];
    const pts = dir.stops.map((s) => ({ lat: s.lat, lon: s.lon }));
    return vehicles.data.flatMap((v) => {
      if (directionOf(dir, v) !== 1) return [];
      const pr = progressOnStations(pts, v.lat, v.lon);
      return pr && pr.dist < 400 ? [{ v, y: pr.index * ROW + ROW / 2 }] : [];
    });
  }, [dir, vehicles]);

  if (!valid) return <><h1>{t('line_title')}</h1><div className="empty"><strong>{t('line_invalid')}</strong></div></>;
  const color = MODE_COLOR[mode];
  const openVehicle = (id: string) => navigateWithTransition(() => { router.push('/'); setTimeout(() => mapApi.controller?.select(id, { fly: true, follow: true }), 400); });

  return (
    <>
      <div className="detail-head">
        <LineBadge line={line} mode={mode} large />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0 }}>{t('line_title')}</h1>
          <div className="detail-sub">{modeName(t, mode)} {line} · {t('line_vehicles', { n: vehicles?.data.length ?? 0 })}</div>
        </div>
      </div>
      {dirs.length > 1 && (
        <div className="seg" role="group" aria-label={t('line_direction')} style={{ marginTop: 'var(--s3)' }}>
          {dirs.map((d, i) => <button key={i} type="button" aria-pressed={tab === i} onClick={() => setTab(i)}>→ {d.headsign ?? d.stops[d.stops.length - 1]!.name}</button>)}
        </div>
      )}
      {!vehicles ? <><div className="skeleton" /><div className="skeleton" /></>
        : vehicles.data.length === 0 ? <div className="empty"><strong>{t('line_noVehicles')}</strong>{t('line_noVehiclesText')}</div>
        : !dir ? <><div className="skeleton" /><p className="hint">{t('line_loading')}</p></>
        : (
          <div className="line-schema" style={{ height: dir.stops.length * ROW, ['--line-color' as string]: color }}>
            <div className="line-rail" />
            {dir.stops.map((s, i) => (
              <div key={s.seq} className="line-stop" style={{ top: i * ROW }}>
                <span className={`line-dot${i === 0 || i === dir.stops.length - 1 ? ' end' : ''}`} />
                <span className="line-name">{s.name}</span>
              </div>
            ))}
            {placed.map(({ v, y }) => {
              const tone = describeDelay(v.delay).tone;
              return (
                <button key={v.id} type="button" className="line-vehicle" style={{ transform: `translateY(${y - 14}px)`, borderColor: DELAY_COLOR[tone] }}
                  onClick={() => openVehicle(v.id)} aria-label={`${modeName(t, mode)} ${line} ${v.registration ? t('vd_vehicleNo', { r: v.registration }) : ''}`}>
                  <span className="line-vehicle-chevron" aria-hidden>▼</span>{v.registration ?? line}
                </button>
              );
            })}
          </div>
        )}
      <p className="footer-note">{t('line_note')}</p>
    </>
  );
}

/** 1 = vůz jede ve směru průběhu spoje, −1 = opačně, 0 = nelze rozhodnout (mimo trasu nebo bez kurzu). */
function directionOf(d: TripDetail, v: VehicleState): 1 | -1 | 0 {
  if (d.headsign && v.headsign) return d.headsign === v.headsign ? 1 : -1;
  const pr = progressOnStations(d.stops.map((s) => ({ lat: s.lat, lon: s.lon })), v.lat, v.lon);
  if (!pr || pr.dist > 400 || v.bearing === null) return 0;
  return angDiff(v.bearing, pr.segBearing) <= 90 ? 1 : -1;
}
