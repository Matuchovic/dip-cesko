'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { appStore, mapApi } from '@/lib/app-state';
import { useStore } from '@/lib/store';
import { useMediaQuery, useNow } from '@/lib/hooks';
import { hydrateFavorites } from '@/lib/favorites';
import { hydrateSettings, prefersReducedMotion, settingsStore } from '@/lib/settings';
import { IconClock, IconMap, IconRoute, IconSearch, IconSettings, IconStar, IconTicket } from './icons';
import { FreshnessPill } from './ui';
import { useT } from '@/i18n';
import type { MessageKey } from '@/i18n/messages';
import MapChrome from './MapChrome';
import VehicleDetail from './VehicleDetail';
import StopCard from './StopCard';

const MapView = dynamic(() => import('./MapView'), { ssr: false, loading: () => <div className="map-canvas" aria-hidden /> });

const NAV: { href: string; label: MessageKey; Icon: typeof IconMap }[] = [
  { href: '/', label: 'nav_map', Icon: IconMap },
  { href: '/spojeni', label: 'nav_plan', Icon: IconRoute },
  { href: '/odjezdy', label: 'nav_departures', Icon: IconClock },
  { href: '/oblibene', label: 'nav_favorites', Icon: IconStar },
  { href: '/jizdenky', label: 'nav_tickets', Icon: IconTicket },
];

const PEEK = 196;

export default function AppShell({ children, styleUrl, demo }: { children: ReactNode; styleUrl: string; demo: boolean }) {
  const pathname = usePathname();
  const t = useT();
  const isMapRoute = pathname === '/' || pathname.startsWith('/test/');
  const mobile = useMediaQuery('(max-width: 899px)');
  const selected = useStore(appStore, (s) => s.selected);
  const stop = useStore(appStore, (s) => s.stop);
  const meta = useStore(appStore, (s) => s.feedMeta);
  const feedError = useStore(appStore, (s) => s.feedError);
  const offline = useStore(appStore, (s) => s.feedOffline);
  const announce = useStore(appStore, (s) => s.announce);
  const now = useNow(5000);
  const [sheetH, setSheetH] = useState(PEEK);
  const drag = useRef<{ y: number; h: number } | null>(null);
  const sheetRef = useRef<HTMLElement>(null);

  useEffect(() => {
    hydrateSettings();
    hydrateFavorites();
    const apply = () => { document.documentElement.dataset.motion = prefersReducedMotion(settingsStore.get()) ? 'reduce' : 'full'; };
    apply();
    const unsub = settingsStore.subscribe(apply);
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    return unsub;
  }, []);

  // Při výběru vozidla nebo zastávky se panel na mobilu vysune (úprava stavu při renderu, bez efektu).
  const focusKey = mobile ? (selected?.id ?? stop?.id ?? null) : null;
  const [lastFocusKey, setLastFocusKey] = useState<string | null>(null);
  if (focusKey !== lastFocusKey) {
    setLastFocusKey(focusKey);
    if (focusKey && typeof window !== 'undefined') setSheetH((h) => Math.max(h, Math.round(window.innerHeight * 0.52)));
  }

  const onPointerDown = (e: React.PointerEvent) => { drag.current = { y: e.clientY, h: sheetH }; (e.target as HTMLElement).setPointerCapture(e.pointerId); sheetRef.current?.setAttribute('data-dragging', 'true'); };
  const onPointerMove = (e: React.PointerEvent) => { if (drag.current) setSheetH(Math.max(120, Math.min(window.innerHeight - 140, drag.current.h + drag.current.y - e.clientY))); };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const moved = Math.abs(e.clientY - drag.current.y);
    drag.current = null;
    sheetRef.current?.setAttribute('data-dragging', 'false');
    const vh = window.innerHeight;
    const snaps = [PEEK, Math.round(vh * 0.52), vh - 150];
    if (moved < 6) { setSheetH((h) => (h <= PEEK + 10 ? snaps[1]! : PEEK)); return; }
    setSheetH((h) => snaps.reduce((a, b) => (Math.abs(b - h) < Math.abs(a - h) ? b : a)));
  };

  const sheetMode = mobile && isMapRoute;
  const mapReady = useStore(appStore, (s) => s.mapReady);
  const hasFocus = Boolean(selected || stop);
  // Odsazení mapy podle panelů: vybrané vozidlo nebo zastávka nezůstane schované pod panelem či listem.
  useEffect(() => {
    const c = mapApi.controller;
    if (!c || drag.current) return;
    const vh = window.innerHeight;
    c.setViewPadding(mobile
      ? { top: 120, bottom: sheetMode ? Math.min(sheetH, Math.round(vh * 0.6)) : 0, left: 0, right: 0 }
      : { top: 72, bottom: 16, left: 420, right: isMapRoute && hasFocus ? 500 : 80 });
  }, [mobile, sheetMode, sheetH, isMapRoute, hasFocus, mapReady]);
  const panelContent = sheetMode && selected ? <VehicleDetail /> : sheetMode && stop ? <StopCard /> : children;

  return (
    <div className="app" style={{ '--sheet-h': `${sheetH}px`, '--sheet-peek': `${sheetMode ? Math.min(sheetH, 260) : 0}px` } as React.CSSProperties}>
      <a className="skip-link" href="#main">{t('skip')}</a>
      <header className="topbar">
        <Link href="/" className="brand" aria-label={t('brandAria')}>
          <span className="brand-mark"><IconMap size={20} /></span>
          <span className="brand-name">{t('appName')}<small>{t('appTagline')}</small></span>
        </Link>
        <nav className="nav" aria-label={t('navMain')}>
          {NAV.map(({ href, label, Icon }) => <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}><Icon size={18} />{t(label)}</Link>)}
        </nav>
        <div className="topbar-right">
          <FreshnessPill meta={meta} error={feedError} offline={offline} now={now} />
          <Link href="/nastaveni" className="icon-btn" aria-label={t('nav_settings')} aria-current={pathname === '/nastaveni' ? 'page' : undefined}><IconSettings size={20} /></Link>
        </div>
      </header>

      <div className="map-layer" role="region" aria-label={t('mapRegion')}>
        <MapView styleUrl={styleUrl} demo={demo} />
      </div>
      <MapChrome mobile={mobile} />

      <div className="m-header">
        <Link href="/odjezdy" className="m-search"><IconSearch size={20} />{t('searchPrompt')}</Link>
        <Link href="/nastaveni" className="icon-btn" aria-label={t('nav_settings')} style={{ width: 48, height: 48, boxShadow: 'var(--shadow-md)' }}><IconSettings size={20} /></Link>
      </div>

      <main id="main" ref={sheetRef} className={`panel ${sheetMode ? 'sheet-host' : 'page-host'}`} aria-label={isMapRoute ? t('panelMap') : t('panelContent')} tabIndex={-1}
        onFocus={(e) => { if (sheetMode && (e.target as HTMLElement).tagName === 'INPUT') setSheetH(Math.round(window.innerHeight - 150)); }}>
        {sheetMode && (
          <button type="button" className="sheet-handle" aria-label={sheetH > PEEK + 10 ? t('sheetCollapse') : t('sheetExpand')} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
            <span />
          </button>
        )}
        <div className="panel-scroll">{panelContent}</div>
      </main>

      {!mobile && isMapRoute && (selected || stop) && (
        <section className="floating-card desktop-only" aria-label={selected ? t('vehicleDetail') : t('stopDetail')}>
          <div style={{ padding: 'var(--s4)' }}>{selected ? <VehicleDetail /> : <StopCard />}</div>
        </section>
      )}

      <nav className="tabbar" aria-label={t('navMain')}>
        {NAV.map(({ href, label, Icon }) => <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}><Icon size={22} />{t(label)}</Link>)}
      </nav>
      <div className="sr-only" aria-live="polite" role="status">{announce}</div>
    </div>
  );
}
