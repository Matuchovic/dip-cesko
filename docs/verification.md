# Výsledky ověření (1. 10. 2026, verze 0.1.0)

**Prostředí:** Linux, Node 22, Playwright 1.56 s Chromium 141 (headless, WebGL přes SwiftShader = softwarové vykreslování). Bez přístupu k mapovým dlaždicím, Golemio API a data.pid.cz, proto E2E běží v ukázkovém režimu (`DEMO_DATA=1`) se záložním stylem mapy bez geografie. Telefony jsou emulované (viewport, dotyk, DPR 2), nejde o test na skutečném zařízení. WebKit a Firefox nebyly k dispozici.

| Kontrola | Výsledek |
|---|---|
| TypeScript strict (`tsc --noEmit`) | 0 chyb |
| ESLint (Next core-web-vitals + TypeScript + pravidla React Compileru) | 0 chyb, 0 varování |
| Unit testy (Vitest) | 53 / 53 |
| Produkční build (Next.js 16.3.8, Turbopack, standalone) | OK |
| E2E (Playwright, Chromium) | 11 / 11. V posledním plném běhu jednou vypršel test 390 px při zavírání kontextu (pomalé softwarové vykreslení); samostatné opakování prošlo za 32 s. |

## Co testy ověřují
- **Natočení PNG:** S/V/J/Z při natočení mapy 0°, 45°, 90°, 180°, 270°, 315°, 359° (model) a 0°, 90°, 225° (skutečné vykreslení – hodnoty `icon-rotate` + snímky). Výřezy `rotace-zoom-*` potvrzují, že čelo tramvaje míří ve směru jízdy a štítek ho nezakrývá. Přechod 359° → 1° nejkratší cestou.
- **Pohyb:** interpolace jen mezi měřeními, žádná extrapolace, ignorování pozdních dat, skok GPS bez animace, směr z pohybu jen při ≥ 12 m, omezené animace, odebrání vozidel po přepnutí zdroje.
- **Data:** nula ≠ neznámé zpoždění (Golemio `is_available`), zrušené spoje, pořadí souřadnic, deduplikace, jmenné prostory ID, GTFS časy přes 24:00 a změny času 29. 3. a 25. 10. 2026, bez klíče žádná vymyšlená data, při výpadku poslední data jako „zastaralá“.
- **Síť:** allowlist hostitelů (SSRF), timeout, zrušení, opakování po 5xx, 429 bez opakování s Retry-After, limit velikosti, single-flight cache, token bucket.
- **Scénáře E2E:** mapa a detail vozidla na 360/390/768/1440 px, výběr klepnutím mimo střed vozidla, odjezdy (klávesnice, nula vs. neznámé, zrušený spoj), uložení oblíbené zastávky, spojení (validace + „plánovač není připojen“), výpadek připojení a návrat, validace API, bezpečnostní hlavičky, chráněná diagnostika (401 bez tokenu / se špatným tokenem).

Snímky: `docs/screenshots/` (mapa-*, detail-*, odjezdy-*, spojeni-1440, rotace-mapa-*, rotace-zoom-*).

## Vady nalezené a opravené během ověření
- ESLint 10 je nekompatibilní s eslint-plugin-react v eslint-config-next 16.3.8 → použit ESLint 9.39.5.
- MapLibre 6 odvozuje URL workeru z `import.meta.url`, což po sestavení nefungovalo → worker se servíruje z `/maplibre/` a nastavuje `setWorkerUrl()`.
- Mobil: ovládání mapy překrývalo hlavičku při vysunutém listu a vybrané vozidlo mohlo zůstat pod listem → odsazení mapy podle panelů, zoom tlačítka na mobilu skrytá (gesta).
- Výpadek sítě se neprojevil ve stavu dat; „Živě“ se nyní nezobrazí, když obnova selže nebo jsou data starší než 60 s.
- Štítek linky zakrýval čelo vozidla při velkém přiblížení → posun podle natočení vozidla na obrazovce.
- Limit požadavků na klienta sdílel kbelík napříč trasami s různými limity → oddělené kbelíky.
- Build zahrnoval do serverového balíku celý projekt kvůli čtení souboru zastávek → cílené čtení.

## Neověřeno
- Živé Golemio API (tvar odpovědí – `npm run verify:golemio`), skutečný podklad OpenFreeMap, živý seznam zastávek a RSS PID, OpenTripPlanner.
- Web Vitals (LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1) a 60 fps – cíle nejsou změřené; čísla ze softwarového vykreslování by nebyla vypovídající.
- Offline mezipaměť service workeru (emulace offline v Chromiu se na service worker nevztahuje; E2E ověřuje chování aplikace bez něj).
- WebKit, Firefox, skutečné telefony.
- MapLibre 6 v konzoli informuje, že štítky vznikají až při prvním vykreslení (`styleimagemissing`); funkční, přechod na `setMissingStyleImageResolver` je další krok.
