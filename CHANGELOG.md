# Changelog

## [0.1.0] – 2026-10-01

### Přidáno
- Mapa na MapLibre GL 6 s podkladem OpenFreeMap (skutečná geografie OSM), záložní zjednodušený styl při výpadku podkladu.
- Vozidla: PNG přímo shora (tramvaj, vlak) natáčená podle skutečného směru jízdy, natočení mapy započtené právě jednou (`icon-rotation-alignment: map`), v nakloněné mapě ploché značky. Úrovně detailu: shluky → body → sprity od přiblížení 15,5; vozidla bez spritu nebo bez směru jako značky.
- Animace jen mezi důvěryhodnými měřeními, žádná extrapolace, ignorování pozdních dat, skoky GPS bez animace, směr z údaje zdroje nebo ze spolehlivého pohybu.
- Odjezdy (vyhledávání zastávek bez diakritiky, filtr nástupišť, nula ≠ neznámé zpoždění, zrušené spoje), Spojení (OpenTripPlanner GTFS GraphQL, stav „nepřipojen“), Oblíbené, Jízdenky (oficiální kanály, stav integrace), Nastavení, Stav dat.
- Server: sdílená cache se slučováním požadavků, timeouty, omezené opakování, limit Golemio, poslední data se stářím při výpadku, allowlist hostitelů, strukturované logy, chráněná diagnostika.
- PWA (manifest, ikony, service worker, offline s označením stáří), přístupnost, bezpečnostní hlavičky.
- Testy: 53 unit testů, E2E (Playwright, Chromium) se snímky 360/390/768/1440 px.
- Nasazovací skript `scripts/deploy.sh`.
