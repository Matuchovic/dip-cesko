# Changelog

## 0.3.1 – 2026-10-01
- 3D budovy: světlé pastelové fasády a jemně cihlové střechy místo tmavých stěn a sytých střech; bez barev z OSM (černé a modré bloky); měkčí světlo.
- Klidnější podklad: skryté drobné body zájmu a duplicitní značky zastávek z podkladu.

## 0.3.0 – 2026-10-01
- Skutečné 3D modely vozidel (Three.js ve společném WebGL kontextu MapLibre; tramvaj, vlak, metro, autobus, trolejbus) – převzaté z úpravy „OPRAVA-3D“ a napojené na naše navázání na trať: model stojí na koleji a míří podél ní.
- Výběr kliknutím přímo do 3D karoserie; volba 3D modely / PNG shora / značky (Vrstvy mapy, Nastavení), jednorázová migrace uložených nastavení na 3D.
- Barevné 3D budovy: barva z OSM (building:colour, materiál), jinak paleta fasád; výškové budovy sklo; samostatné střechy (tašky, plech), světlo a obloha.
- Metro se přichytává na koleje metra z OSM (pokud zdroj polohy metra poskytne).
- Vyhledávání spojení bez vlastního serveru: veřejné API Transitous (MOTIS 2) s automatickou volbou verze API, krátkou cache a uvedením zdroje; záložní odkaz do Google Map. Vlastní OTP (OTP_GRAPHQL_URL) má dál přednost, PLANNER=off plánovač vypne.
- Sledování vozidla dokončí přiblížení a smyčka se zastaví, když vozidlo stojí.

## 0.2.0 – 2026-10-01
- Vozidla navázaná na trať z mapových dat (OSM: tramvajové koleje, železnice, silnice); mezi měřeními jízda po trati (A*), směr podle koleje.
- Kloubové soupravy po částech (tramvaj 4, vlak 3) – projíždějí oblouky.
- 3D vozidla v nakloněném pohledu (fill-extrusion: barevné pruhy, okna, čelo, klouby, pantograf); „Sledovat ve 3D“.
- Odjezdy po linkách („v kolik co jede“): metro, tramvaje, trolejbusy, autobusy, vlaky; záložky druhů dopravy, přepínač linky/čas; živé odjezdy v detailu zastávky.
- 7 jazyků (cs, en, de, ar – RTL, es, it, uk), automatický výběr podle prohlížeče, volba v Nastavení, popisky mapy v jazyce.
- Výchozí světlý vzhled, čitelnější štítky nad mapou.

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
