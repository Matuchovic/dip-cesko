# Grafika vozidel a manifest

Originály jsou beze změny v `assets/source/`. `npm run assets` (skript `scripts/build-assets.mjs`) je analyzuje a zapíše `src/config/vehicle-assets.json`. Mapový kód čte jen manifest – výměna grafiky nevyžaduje změnu kódu.

## Analýza dodaných PNG
| Asset | Pohled | Zdroj | Viditelná oblast (alfa ≥ 16) | Čelo | Orientační délka | Segmenty |
|---|---|---|---|---|---|---|
| tram-top-redwhite | přímo shora | 1024×1536 | 166×1490 @ 430,15 | nahoru (ověřeno: tmavé zasklení nahoře) | 22,4 m (šířka 2,5 m) | 4 články, 3 klouby |
| train-top-bluewhite | přímo shora | 887×1774 | 147×1740 @ 370,18 | nahoru dle dodavatele (obousměrná jednotka) | 35,5 m (šířka 3,0 m) | 3 vozy |
| tram-oblique-redwhite (+alt) | šikmý nadhled | 1536×1024 | 1494×963 | — | — | jen detail |
| tram-oblique-bluewhite | šikmý nadhled | 1536×1024 | 1508×1001 | — | — | jen detail |
| train-oblique-bluewhite | šikmý nadhled | 1774×887 | 1733×790 | — | — | jen detail |

- Průhlednost se posuzuje jen podle alfa kanálu; černá (okna, technika) se nikdy neodstraňuje.
- Mapové varianty jsou oříznuté na viditelnou oblast (velké průhledné okraje nezmenšují vozidlo) a zmenšené Lanczosem; `pixelRatio` 2.
- Kontrola hran na světlém i tmavém podkladu: `docs/assets-preview/*.light.png` a `*.dark.png`.

## Pravidla vykreslení
- `icon-rotate = směr jízdy − frontDirectionDeg`, `icon-rotation-alignment: map` – MapLibre sám odečte natočení mapy (započteno právě jednou). Testy: `tests/unit/angles-geo-time.test.ts`, E2E `natočení PNG`.
- `icon-pitch-alignment: map`: v nakloněné mapě leží PNG naplocho na terénu – je to plochá značka, ne 3D model.
- Kotva ve středu viditelné oblasti; poloha a natočení nemění střed (ověřeno ve výřezech `docs/screenshots/rotace-zoom-*`).
- Velikost podle fyzické délky a měřítka mapy (Web Mercator, zeměpisná šířka), minimum 34 px a maximum 560 px na obrazovce; sprity od přiblížení 15,5, níž body a shluky.
- Bez spritu (autobus, trolejbus, metro, přívoz, lanovka) nebo bez známého směru → kruhová značka kategorie (žádné zavádějící natočení).
- Šikmé obrázky jen v detailu s popiskem „Ilustrační vyobrazení – obecné vozidlo kategorie“. Konkrétní typ vozu se neurčuje bez spolehlivých dat.

## Budoucí rozšíření
- **Šikmé sprity na mapě** vyžadují sadu směrových pohledů (např. 16 po 22,5°) se stejnou výškou kamery, výběr pohledu podle `směr − natočení mapy` a pouze pro odpovídající sklon mapy. Jeden šikmý obrázek nelze otáčením převést na směrové pohledy. Pole `directionalVariants` je v manifestu připravené.
- **Segmenty souprav** (`segments` v manifestu) pro věrné průjezdy oblouky: vyžadují tvar trasy (GTFS shapes) a přichycení polohy k trati.

## Výměna PNG
1. Nový soubor do `assets/source/`, záznam do `SOURCES` v `scripts/build-assets.mjs` (id, kategorie, pohled, deklarované čelo, šířka pro odhad délky).
2. `npm run assets`, zkontrolovat `docs/assets-preview/`.
3. `npm test` (test manifestu ověří soubory, kotvu, čelo a velikosti).
