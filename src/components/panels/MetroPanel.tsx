'use client';
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getJson, useVisibleInterval } from '@/lib/hooks';
import { mapApi } from '@/lib/app-state';
import { METRO_COLOR, METRO_SCHEMA, progressOnStations, schemaPoint, type MetroLineId } from '@/domain/metro';
import { angDiff } from '@/map/geometry';
import type { Envelope, MetroLineGeo, VehicleState } from '@/domain/model';
import { useT } from '@/i18n';
import TLink from '../TLink';
import { navigateWithTransition } from '@/lib/transitions';

const LINES: MetroLineId[] = ['A', 'B', 'C'];

/** Živé schéma metra: stylizované linky A, B, C a soupravy podle skutečných poloh (obnova po 5 s). */
export default function MetroPanel() {
  const t = useT();
  const router = useRouter();
  const [geo, setGeo] = useState<MetroLineGeo[] | null>(null);
  const [trains, setTrains] = useState<Envelope<VehicleState[]> | null>(null);
  const [failed, setFailed] = useState(false);
  const loadGeo = useCallback(async () => { if (geo) return; const r = await getJson<Envelope<MetroLineGeo[]>>('/api/metro'); if (r.body?.data?.length) setGeo(r.body.data); else setFailed(true); }, [geo]);
  const loadTrains = useCallback(async () => { const r = await getJson<Envelope<VehicleState[]>>('/api/vehicles?mode=metro'); if (r.body) setTrains(r.body); }, []);
  useVisibleInterval(() => { void loadGeo(); void loadTrains(); }, 5_000, []);

  // Souprava → linka, zlomkový index stanice a směr; mimo trať (> 600 m) se nezobrazí.
  const placed = useMemo(() => {
    if (!geo || !trains?.data) return [];
    const out: { v: VehicleState; line: MetroLineId; x: number; y: number; dir: 1 | -1 }[] = [];
    for (const v of trains.data) {
      const line = v.route.shortName.toUpperCase() as MetroLineId;
      const g = geo.find((l) => l.line === line);
      if (!g || !LINES.includes(line)) continue;
      const pts = g.stations.filter((s): s is { name: string; key: string | null; lat: number; lon: number } => s.lat !== null && s.lon !== null);
      if (pts.length !== g.stations.length) continue;
      const pr = progressOnStations(pts, v.lat, v.lon);
      if (!pr || pr.dist > 600) continue;
      const dir: 1 | -1 = v.bearing === null ? (v.headsign && v.headsign === pts[0]!.name ? -1 : 1) : angDiff(v.bearing, pr.segBearing) <= 90 ? 1 : -1;
      const p = schemaPoint(line, pr.index);
      out.push({ v, line, x: p.x, y: p.y, dir });
    }
    return out;
  }, [geo, trains]);

  const openTrain = (id: string) => navigateWithTransition(() => { router.push('/'); setTimeout(() => mapApi.controller?.select(id, { fly: true, follow: true }), 400); });
  const counts = LINES.map((l) => placed.filter((p) => p.line === l).length);
  const drawn = new Set<string>();
  const status = trains?.meta.status;

  return (
    <>
      <h1>{t('metro_title')}</h1>
      <div className="meta-line">
        {status === 'live' && <span className="pill pill-live"><span className="pulse" aria-hidden />{t('pill_live')}</span>}
        {status === 'demo' && <span className="pill pill-demo">{t('pill_demo')}</span>}
        {(status === 'stale' || status === 'error' || status === 'unavailable') && <span className="pill pill-stale">{t('pill_stale')}</span>}
        <span>{LINES.map((l, i) => `${l} ${counts[i]}`).join(' · ')} {t('metro_trains')}</span>
      </div>
      {failed && <div className="notice"><span>{t('metro_noStations')}</span></div>}
      {geo && placed.length === 0 && <p className="hint">{t('metro_noTrains')}</p>}
      <div className="metro-wrap">
        <svg viewBox="-6 -60 396 670" className="metro-svg" role="img" aria-label={t('metro_title')}>
          {LINES.map((l) => <polyline key={l} points={METRO_SCHEMA[l].map((s) => `${s.x},${s.y}`).join(' ')} fill="none" stroke={METRO_COLOR[l]} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />)}
          {LINES.map((l) => METRO_SCHEMA[l].map((s, i) => {
            const key = geo?.find((g) => g.line === l)?.stations[i]?.key ?? null;
            const label = labelFor(l, i, s, drawn);
            const dot = <circle cx={s.x} cy={s.y} r={s.transfer ? 6.5 : 4} className={s.transfer ? 'metro-transfer' : 'metro-station'} stroke={s.transfer ? undefined : METRO_COLOR[l]} />;
            return key ? <TLink key={`${l}${i}`} href={`/odjezdy?zastavka=${encodeURIComponent(key)}`} aria-label={s.name}>{dot}{label}</TLink> : <g key={`${l}${i}`}>{dot}{label}</g>;
          }))}
          {placed.map(({ v, line, x, y, dir }) => (
            <g key={v.id} className="metro-train" style={{ transform: `translate(${x + dir * 7}px, ${y}px)` }} onClick={() => openTrain(v.id)} role="button" aria-label={`${t('mode_metro')} ${line} ${t('direction', { h: v.headsign ?? '' })}`}>
              <circle r={9} className="metro-train-halo" stroke={METRO_COLOR[line]} />
              <circle r={5.5} fill={METRO_COLOR[line]} stroke="#fff" strokeWidth={2} />
            </g>
          ))}
        </svg>
      </div>
      <p className="footer-note">{t('metro_note')}</p>
    </>
  );
}

/**
 * Popisek stanice: na vodorovných úsecích šikmo (jinak by se názvy překrývaly), jinak vedle stanice;
 * přestupní stanice se popíše jen jednou.
 */
function labelFor(l: MetroLineId, i: number, s: { name: string; x: number; y: number }, drawn: Set<string>) {
  if (drawn.has(s.name)) return null;
  drawn.add(s.name);
  const st = METRO_SCHEMA[l];
  const prev = st[i - 1], next = st[i + 1];
  const horizontal = (prev && Math.abs(prev.y - s.y) < 2) || (next && Math.abs(next.y - s.y) < 2);
  if (horizontal) return <text x={s.x + 5} y={s.y - 8} transform={`rotate(-48 ${s.x + 5} ${s.y - 8})`} className="metro-label">{s.name}</text>;
  const right = s.x < 300;
  return <text x={s.x + (right ? 9 : -9)} y={s.y + 3} textAnchor={right ? 'start' : 'end'} className="metro-label">{s.name}</text>;
}
