'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { appStore, latestVehicles, mapApi } from '@/lib/app-state';
import { prefersReducedMotion, settingsStore } from '@/lib/settings';
import type { MapSettings } from '@/map/controller';
import { useI18n } from '@/i18n';


function webglAvailable(): boolean {
  try { const c = document.createElement('canvas'); return Boolean(c.getContext('webgl2') ?? c.getContext('webgl')); } catch { return false; }
}

function mapSettings(): MapSettings {
  const s = settingsStore.get();
  return { vehicleStyle: s.vehicleStyle, buildings3d: s.buildings3d, showStops: s.showStops, reducedMotion: prefersReducedMotion(s) };
}

export default function MapView({ styleUrl, demo }: { styleUrl: string; demo: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const rotation = demo && pathname.startsWith('/test/rotace');
  const { locale, t } = useI18n();
  const lang = useRef({ locale, t });
  useEffect(() => { lang.current = { locale, t }; mapApi.controller?.setLanguage(locale); }, [locale, t]);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      const [{ MapController }, { VehicleFeed }] = await Promise.all([import('@/map/controller'), import('@/map/feed')]);
      if (disposed || !el.current) return;
      // Písmo pro štítky kreslené do canvasu (bez čekání déle než 1,5 s).
      await Promise.race([document.fonts?.load('800 26px "Plus Jakarta Sans"'), new Promise((r) => setTimeout(r, 1500))]).catch(() => undefined);
      if (disposed || !el.current) return;
      let controller: InstanceType<typeof MapController> | null = null;
      if (webglAvailable()) {
        try {
          controller = new MapController(el.current, styleUrl, mapSettings(), {
            onReady: () => appStore.set({ mapReady: true }),
            onSelect: (v, f) => appStore.set({ selected: v, selectedFreshness: f }),
            onStop: (p) => appStore.set({ stop: p }),
            onCamera: (c) => appStore.set({ bearing: Math.round(c.bearing), pitched: c.pitch > 5, zoom: Math.round(c.zoom * 10) / 10, viewKey: `${c.lng.toFixed(3)},${c.lat.toFixed(3)}` }),
            onFollow: (follow) => appStore.set({ follow }),
            onBasemap: (basemap) => appStore.set({ basemap }),
            onLocate: (locate) => appStore.set({ locate }),
            onRender: (ok) => appStore.set({ mapFailed: !ok }),
          });
        } catch { controller = null; }
      }
      if (!controller) appStore.set({ mapFailed: true });
      controller?.setLanguage(lang.current.locale);
      mapApi.controller = controller;

      const feed = new VehicleFeed({
        onData: (env, receivedAt, fromCache) => {
          latestVehicles.list = env.data;
          controller?.ingest(env.data, receivedAt);
          appStore.set({ feedMeta: env.meta, feedError: fromCache ? lang.current.t('pill_offline') : null, feedOffline: fromCache, feedReceivedAt: receivedAt, feedCount: env.data.length });
        },
        onError: (message, offline) => appStore.set({ feedError: message, feedOffline: offline }),
      }, 10_000, rotation ? '?scenario=rotation' : '');
      feed.start();
      if (demo) (window as unknown as { __doprava?: unknown }).__doprava = { controller, map: controller?.map ?? null, feed };

      const unsubSettings = settingsStore.subscribe(() => controller?.setSettings(mapSettings()));
      let lastModes = appStore.get().modes;
      const unsubModes = appStore.subscribe(() => { const m = appStore.get().modes; if (m !== lastModes) { lastModes = m; controller?.setModes(m); } });
      const ro = new ResizeObserver(() => controller?.resize());
      ro.observe(el.current);
      cleanup = () => { feed.stop(); unsubSettings(); unsubModes(); ro.disconnect(); controller?.destroy(); mapApi.controller = null; appStore.set({ mapReady: false }); };
    })();
    return () => { disposed = true; cleanup?.(); };
  }, [styleUrl, demo, rotation]);

  return <div ref={el} className="map-canvas" data-testid="map" />;
}
