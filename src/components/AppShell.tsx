'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { appStore, mapApi } from '@/lib/app-state';
import { useStore } from '@/lib/store';
import { useMediaQuery, useNow } from '@/lib/hooks';
import { hydrateFavorites } from '@/lib/favorites';
import { initInstall } from '@/lib/install';
import { initOnboarding } from '@/lib/onboarding';
import { playTramBell, unlockAudio } from '@/lib/sound';
import { onboardingStore } from '@/lib/onboarding';
import NewsTicker from './NewsTicker';
import UpdateBanner from './UpdateBanner';
import { initTilt } from '@/lib/tilt';
import { hydrateSettings, prefersReducedMotion, settingsStore } from '@/lib/settings';
import { IconClock, IconLandmark, IconMap, IconRoute, IconSearch, IconSettings, IconStar } from './icons';
import { FreshnessPill } from './ui';
import { useT } from '@/i18n';
import TLink from './TLink';
import { useTransitionResolver } from '@/lib/transitions';
import type { MessageKey } from '@/i18n/messages';
import MapChrome from './MapChrome';
import VehicleDetail from './VehicleDetail';
import StopCard from './StopCard';

const MapView = dynamic(() => import('./MapView'), { ssr: false, loading: () => <div className="map-canvas" aria-hidden /> });

// Průvodce se stáhne jen tehdy, když se má ukázat – nezdržuje start aplikace.
const Onboarding = dynamic(() => import('./Onboarding'), { ssr: false });

const NAV: { href: string; label: MessageKey; Icon: typeof IconMap }[] = [
  { href: '/', label: 'nav_map', Icon: IconMap },
  { href: '/spojeni', label: 'nav_plan', Icon: IconRoute },
  { href: '/odjezdy', label: 'nav_departures', Icon: IconClock },
  { href: '/oblibene', label: 'nav_favorites', Icon: IconStar },
  { href: '/pamatky', label: 'nav_landmarks', Icon: IconLandmark },
];

const PEEK = 392; // náhled ukáže nejbližší zastávku a tři odjezdy
const COLLAPSED = 92; // schovaný panel: jen úchyt a název zastávky – mapa přes celou obrazovku

export default function AppShell({ children, styleUrl, demo }: { children: ReactNode; styleUrl: string; demo: boolean }) {
  const pathname = usePathname();
  const t = useT();
  useTransitionResolver();
  const isMapRoute = pathname === '/' || pathname.startsWith('/test/');
  const mobile = useMediaQuery('(max-width: 899px)');
  const selected = useStore(appStore, (s) => s.selected);
  const stop = useStore(appStore, (s) => s.stop);
  const meta = useStore(appStore, (s) => s.feedMeta);
  const onbOpen = useStore(onboardingStore, (s) => s.open);
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
    initInstall();
    initOnboarding();
    const stopTilt = initTilt();
    // zvuk smí hrát až po interakci: odemknout prvním dotykem
    const unlock = () => { unlockAudio(); window.removeEventListener('pointerdown', unlock); };
    window.addEventListener('pointerdown', unlock);
    // upozornění na spoj přišlo, když je aplikace otevřená → tramvajový zvonek
    const onMsg = (e: MessageEvent) => { if ((e.data as { type?: string } | null)?.type === 'dopravacr-alert') playTramBell(); };
    navigator.serviceWorker?.addEventListener('message', onMsg);
    // iPhone (aplikace na ploše): po prvním otevření klávesnice WebKit zmenší okno a už ho nevrátí → dole prázdný pruh.
    // Oprava: po zavření klávesnice krátce přepnout zobrazení celoobrazovkového prvku, WebKit pak výšku přepočítá.
    const iosApp = /iphone|ipad|ipod/i.test(navigator.userAgent) && (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let maxVH = window.innerHeight;
    const onResize = () => { maxVH = Math.max(maxVH, window.innerHeight); };
    // Okno kratší než obrazovka (známá chyba iOS u aplikací na ploše): spodní kousek pod oknem nejde vykreslit,
    // proto tam nepřidávat ještě bezpečný okraj – lišta a pruh novinek sednou až dolů.
    const markShort = () => {
      const portrait = window.innerWidth < window.innerHeight;
      document.documentElement.toggleAttribute('data-vp-short', iosApp && portrait && window.screen.height - window.innerHeight > 20);
    };
    const heal = () => {
      const full = window.innerWidth < window.innerHeight ? Math.max(maxVH, window.screen.height) : maxVH;
      if (!iosApp || full - window.innerHeight <= 4) { markShort(); return; }
      const el = document.querySelector<HTMLElement>('.app');
      if (!el) return;
      el.style.display = 'none';
      void el.offsetHeight; // synchronní přepočet rozvržení
      el.style.display = '';
      requestAnimationFrame(markShort);
    };
    const onFocusOut = (e: FocusEvent) => { if ((e.target as HTMLElement | null)?.matches?.('input, textarea, select')) setTimeout(heal, 160); };
    window.addEventListener('resize', () => { onResize(); markShort(); });
    setTimeout(heal, 400); // i hned po spuštění
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(heal, 200); });
    const apply = () => { document.documentElement.dataset.motion = prefersReducedMotion(settingsStore.get()) ? 'reduce' : 'full'; };
    apply();
    const unsub = settingsStore.subscribe(apply);
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    return () => { unsub(); stopTilt(); };
  }, []);

  // Při výběru vozidla nebo zastávky se panel na mobilu vysune (úprava stavu při renderu, bez efektu).
  const focusKey = mobile ? (selected?.id ?? stop?.id ?? null) : null;
  const [lastFocusKey, setLastFocusKey] = useState<string | null>(null);
  if (focusKey !== lastFocusKey) {
    setLastFocusKey(focusKey);
    if (focusKey && typeof window !== 'undefined') setSheetH((h) => Math.max(h, Math.round(window.innerHeight * 0.52)));
  }

  const onPointerDown = (e: React.PointerEvent) => { drag.current = { y: e.clientY, h: sheetH }; (e.target as HTMLElement).setPointerCapture(e.pointerId); sheetRef.current?.setAttribute('data-dragging', 'true'); };
  const onPointerMove = (e: React.PointerEvent) => { if (drag.current) setSheetH(Math.max(COLLAPSED, Math.min(window.innerHeight - 140, drag.current.h + drag.current.y - e.clientY))); };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const moved = Math.abs(e.clientY - drag.current.y);
    drag.current = null;
    sheetRef.current?.setAttribute('data-dragging', 'false');
    const vh = window.innerHeight;
    const snaps = [COLLAPSED, PEEK, Math.round(vh * 0.52), vh - 150];
    // klepnutí: schovaný → náhled → půl → zpět náhled
    // klepnutí na úchyt: schovaný → vysunout, jinak schovat (šipka ukazuje směr)
    if (moved < 6) { setSheetH((h) => (h <= COLLAPSED + 10 ? PEEK : COLLAPSED)); return; }
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
    <div className="app" style={{ '--sheet-h': `${sheetH}px`, '--sheet-peek': `${sheetMode ? Math.min(sheetH, PEEK) : 0}px` } as React.CSSProperties}>
      <a className="skip-link" href="#main">{t('skip')}</a>
      <header className="topbar">
        <Link href="/" className="brand" aria-label={t('brandAria')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <span className="brand-stack"><span className="brand-imgs"><img className="brand-logo light" src="/brand/logo.webp" alt={t('appName')} width={146} height={40} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-logo dark" src="/brand/logo-dark.webp" alt="" width={146} height={40} /></span><span className="brand-tag">{t('appTagline')}</span></span>
        </Link>
        <nav className="nav" aria-label={t('navMain')}>
          {NAV.map(({ href, label, Icon }) => <TLink key={href} href={href} aria-current={pathname === href ? 'page' : undefined}><Icon size={18} />{t(label)}</TLink>)}
        </nav>
        <div className="topbar-right">
          <FreshnessPill meta={meta} error={feedError} offline={offline} now={now} />
          <Link href="/nastaveni" className="icon-btn" aria-label={t('nav_settings')} aria-current={pathname === '/nastaveni' ? 'page' : undefined}><IconSettings size={20} /></Link>
        </div>
      </header>

      <div className="map-layer" role="region" aria-label={t('mapRegion')}>
        <MapView styleUrl={styleUrl} demo={demo} />
      </div>
      <div className="status-scrim" aria-hidden />
      <MapChrome mobile={mobile} />
      {onbOpen && <Onboarding />}

      <div className="m-header">
        <Link href="/odjezdy" className="m-search"><IconSearch size={20} />{t('searchPrompt')}</Link>
        <Link href="/nastaveni" className="icon-btn" aria-label={t('nav_settings')} style={{ width: 48, height: 48, boxShadow: 'var(--shadow-md)' }}><IconSettings size={20} /></Link>
      </div>

      <main id="main" ref={sheetRef} data-collapsed={sheetMode && sheetH <= COLLAPSED + 10 ? 'true' : undefined} className={`panel ${sheetMode ? 'sheet-host' : 'page-host'}`} aria-label={isMapRoute ? t('panelMap') : t('panelContent')} tabIndex={-1}
        onFocus={(e) => { if (sheetMode && (e.target as HTMLElement).tagName === 'INPUT') setSheetH(Math.round(window.innerHeight - 150)); }}>
        {sheetMode && (
          <button type="button" className={`sheet-handle${sheetH <= COLLAPSED + 10 ? ' up' : ''}`} aria-expanded={sheetH > COLLAPSED + 10}
            aria-label={sheetH <= COLLAPSED + 10 ? t('sheetExpand') : t('sheetHide')}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
            <span className="grip" />
            <svg className="chev" width="16" height="16" viewBox="0 0 24 24" aria-hidden><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}
        {!sheetMode && !isMapRoute && (
          <TLink href="/" className="panel-close" aria-label={t('closeToMap')}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg></TLink>
        )}
        <div className="panel-scroll">{panelContent}</div>
      </main>

      {!mobile && isMapRoute && (selected || stop) && (
        <section className="floating-card desktop-only" aria-label={selected ? t('vehicleDetail') : t('stopDetail')}>
          <div style={{ padding: 'var(--s4)' }}>{selected ? <VehicleDetail /> : <StopCard />}</div>
        </section>
      )}

      <NewsTicker />
      <UpdateBanner />
      <nav className="tabbar" aria-label={t('navMain')}>
        {NAV.map(({ href, label, Icon }) => <TLink key={href} href={href} aria-current={pathname === href ? 'page' : undefined}><Icon size={22} />{t(label)}</TLink>)}
      </nav>
      <div className="sr-only" aria-live="polite" role="status">{announce}</div>
    </div>
  );
}
