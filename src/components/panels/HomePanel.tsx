'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { appStore, mapApi } from '@/lib/app-state';
import { useStore } from '@/lib/store';
import { getJson, useVisibleInterval } from '@/lib/hooks';
import { favoritesStore } from '@/lib/favorites';
import { haversineM } from '@/domain/geo';
import type { Alert, Envelope, Mode, StopPoint } from '@/domain/model';
import { MODE_LABEL } from '@/domain/modes';
import { formatClock } from '@/domain/time';
import StopSearch from '../StopSearch';
import { LineBadge } from '../ui';
import { IconAlert, IconExternal, IconLocate, IconRoute } from '../icons';

interface Nearby { key: string; name: string; modes: Mode[]; distance: number; platforms: number }

export default function HomePanel() {
  const router = useRouter();
  const ready = useStore(appStore, (s) => s.mapReady);
  const locate = useStore(appStore, (s) => s.locate);
  const viewKey = useStore(appStore, (s) => s.viewKey);
  const meta = useStore(appStore, (s) => s.feedMeta);
  const favs = useStore(favoritesStore, (s) => s.items);
  const [nearby, setNearby] = useState<Nearby[] | null>(null);
  const [nearbyMsg, setNearbyMsg] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Envelope<Alert[]> | null>(null);

  const loadNearby = useCallback(async () => {
    const c = mapApi.controller;
    if (!c) return;
    const ref = c.myPosition() ?? (() => { const m = c.map.getCenter(); return { lng: m.lng, lat: m.lat }; })();
    const d = 0.006;
    const r = await getJson<Envelope<StopPoint[]>>(`/api/stops?bbox=${[ref.lng - d, ref.lat - d * 0.7, ref.lng + d, ref.lat + d * 0.7].map((n) => n.toFixed(5)).join(',')}`);
    if (!r.ok || !r.body || r.body.meta.status === 'unavailable' || r.body.meta.status === 'error') { setNearby([]); setNearbyMsg(r.body?.meta.message ?? 'Zastávky v okolí se nepodařilo načíst.'); return; }
    const groups = new Map<string, Nearby>();
    for (const p of r.body.data) {
      const dist = haversineM(ref, { lng: p.lon, lat: p.lat });
      const g = groups.get(p.groupKey);
      if (!g) groups.set(p.groupKey, { key: p.groupKey, name: p.name, modes: [...p.modes], distance: dist, platforms: 1 });
      else { g.distance = Math.min(g.distance, dist); g.platforms++; for (const m of p.modes) if (!g.modes.includes(m)) g.modes.push(m); }
    }
    setNearbyMsg(null);
    setNearby([...groups.values()].sort((a, b) => a.distance - b.distance).slice(0, 6));
  }, []);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => void loadNearby(), 450);
    return () => clearTimeout(t);
  }, [ready, locate, viewKey, loadNearby]);
  useVisibleInterval(() => { void getJson<Envelope<Alert[]>>('/api/alerts').then((r) => setAlerts(r.body)); }, 120_000, []);

  const favStops = favs.filter((f) => f.kind === 'stop').slice(0, 4);

  return (
    <>
      <h1>Kam chcete jet?</h1>
      <StopSearch label="Zastávka nebo stanice" placeholder="Např. Anděl, Můstek…" onSelect={(g) => { if (g) { mapApi.controller?.flyTo(g.lon, g.lat, 16.5); router.push(`/odjezdy?zastavka=${encodeURIComponent(g.key)}`); } }} />
      <div className="actions" style={{ marginTop: 0 }}>
        <Link className="btn btn-primary" href="/spojeni"><IconRoute size={18} />Naplánovat cestu</Link>
        <button type="button" className="btn btn-secondary" onClick={() => mapApi.controller?.locate()} disabled={!ready || locate === 'locating'}><IconLocate size={18} />{locate === 'locating' ? 'Zjišťuji polohu…' : 'Moje okolí'}</button>
      </div>

      {meta?.status === 'unavailable' && <div className="notice" style={{ marginTop: 'var(--s4)' }}><span><strong>Živé polohy vozidel nejsou připojené.</strong> {meta.message} Mapa, zastávky a mimořádnosti fungují dál.</span></div>}
      {meta?.status === 'demo' && <div className="notice notice-demo" style={{ marginTop: 'var(--s4)' }}><span><strong>Ukázkový režim.</strong> Vozidla, odjezdy a zpoždění jsou vymyšlené pro vývoj; souřadnice zastávek pocházejí z dokumentace PID.</span></div>}
      {locate === 'denied' && <div className="notice notice-warn" style={{ marginTop: 'var(--s4)' }}><span>Přístup k poloze je zamítnutý. Okolí se počítá od středu mapy.</span></div>}

      <h2>Ve vašem okolí <span className="hint">{locate === 'ok' ? 'od vaší polohy' : 'od středu mapy'}</span></h2>
      {nearby === null ? <><div className="skeleton" /><div className="skeleton" /></> : nearby.length === 0 ? (
        <div className="empty"><strong>Žádné zastávky v okolí</strong>{nearbyMsg ?? 'Posuňte mapu nebo vyhledejte zastávku.'}</div>
      ) : (
        <ul className="list">
          {nearby.map((n) => (
            <li key={n.key}>
              <Link className="row" href={`/odjezdy?zastavka=${encodeURIComponent(n.key)}`}>
                <LineBadge line={MODE_LABEL[n.modes[0] ?? 'other'].slice(0, 1)} mode={n.modes[0] ?? 'other'} />
                <span className="row-main"><span className="row-title">{n.name}</span><span className="row-sub">{n.modes.map((m) => MODE_LABEL[m]).join(' · ')} · {n.platforms} {n.platforms === 1 ? 'nástupiště' : 'nástupišť'}</span></span>
                <span className="row-side"><span className="clock">{n.distance < 1000 ? `${Math.round(n.distance / 10) * 10} m` : `${(n.distance / 1000).toFixed(1)} km`}</span></span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {favStops.length > 0 && (<>
        <h2>Oblíbené zastávky <Link href="/oblibene" className="hint">Vše</Link></h2>
        <div className="legs">{favStops.map((f) => f.kind === 'stop' && <Link key={f.key} className="chip" href={`/odjezdy?zastavka=${encodeURIComponent(f.key)}`}>{f.name}</Link>)}</div>
      </>)}

      <h2>Mimořádnosti {alerts?.meta.status === 'demo' && <span className="pill pill-demo">ukázka</span>}</h2>
      {!alerts ? <div className="skeleton" /> : alerts.data.length === 0 ? (
        <div className="empty">{alerts.meta.status === 'live' || alerts.meta.status === 'stale' ? <><strong>Žádné aktuální mimořádnosti</strong>Podle kanálu PID.</> : <><strong>Mimořádnosti nejsou dostupné</strong>{alerts.meta.message}</>}</div>
      ) : (
        <ul className="list">
          {alerts.data.slice(0, 4).map((a) => (
            <li key={a.id} className="row" style={{ alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--late)', paddingTop: 2 }}><IconAlert size={20} /></span>
              <span className="row-main"><span className="row-title" style={{ whiteSpace: 'normal' }}>{a.title}</span><span className="row-sub">{a.publishedAt ? `Zveřejněno ${formatClock(Date.parse(a.publishedAt))}` : ''}</span></span>
              {a.link && <a href={a.link} target="_blank" rel="noopener noreferrer" className="icon-btn" aria-label={`Otevřít na pid.cz: ${a.title}`}><IconExternal size={18} /></a>}
            </li>
          ))}
        </ul>
      )}
      <p className="footer-note">Mapový podklad © OpenStreetMap, OpenMapTiles, OpenFreeMap. Dopravní data: {meta?.attribution ?? 'ROPID / PID, Golemio'}.</p>
    </>
  );
}
