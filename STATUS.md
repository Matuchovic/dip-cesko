# Stav projektu — verze 0.1.0 (1. 10. 2026)

## Hotovo a ověřené v testovacím prostředí
- Mapa, vozidla (sprity, natočení, LOD, výběr, sledování, seznam vozidel jako textová alternativa), 2D/3D, sever, poloha, vrstvy, filtry.
- Odjezdy, Spojení (formulář, validace, stavy), Oblíbené, Jízdenky, Nastavení, Stav dat; mobilní spodní list a desktopový panel.
- Serverová vrstva, adaptéry PID/Golemio a OTP (ověřené na fixturách), ukázkový režim, PWA, bezpečnostní hlavičky, chráněná diagnostika.
- Kontroly: typy, lint, 53 unit testů, produkční build, E2E – výsledky v `docs/verification.md`.

## Hotovo, ale neověřené proti živým službám (nedostupné z testovacího prostředí)
- **Golemio API** (polohy, odjezdové tabule): schémata jsou tolerantní, ale přesný tvar odpovědí ověří až `npm run verify:golemio` s vaším klíčem. Neověřen je i formát parametru `aswIds[]` a jednotka `speed`.
- **Mapový podklad OpenFreeMap**: v testech se použil záložní styl bez geografie; skutečný podklad je potřeba zkontrolovat v prohlížeči.
- **Seznam zastávek a RSS PID**: kód a fixtury z oficiální dokumentace; živé stažení neproběhlo.
- **OpenTripPlanner**: dotaz podle GTFS GraphQL schématu OTP 2.7 (`planConnection`), ověřit introspekcí na vaší instanci.

## Chybí / vyžaduje externí přístup nebo další práci
- Klíč Golemio (zdarma) – bez něj aplikace poctivě ukazuje „Živá data nepřipojena“.
- Instance OpenTripPlanneru s GTFS PID + OSM (Java 21, samostatný server) – bez ní plánovač ukazuje „není připojen“.
- Trasy a zastávky konkrétního spoje v detailu vozidla (potřeba GTFS shapes/stop_times) a přichycení k trati; segmenty souprav jsou připravené v manifestu, ale zatím se nevykreslují.
- Vyhledávání adres (geokodér), účty a synchronizace oblíbených, upozornění na cestu, prodej jízdenek (vyžaduje smluvní integraci).
- Další regiony mimo PID (adaptér podle `TransitProvider`).
- Testy ve WebKitu a Firefoxu a na skutečných zařízeních; měření Web Vitals v provozu.
