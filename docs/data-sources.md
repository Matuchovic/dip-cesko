# Datové zdroje (ověřeno 1. 10. 2026)

| Zdroj | Poskytovatel | Území | Jízdní řády | Polohy | Zpoždění | Mimořádnosti | Licence | Limity | Aktualizace | Stav integrace |
|---|---|---|---|---|---|---|---|---|---|---|
| PID GTFS `data.pid.cz/PID_GTFS.zip` | ROPID | Praha + Středočeský kraj | ano (14 dní, vlaky celý GVD; noční časy až 30:00) | — | — | — | CC BY 4.0, „preview“ bez záruky | — | denně cca 4:00–4:30 | Vstup pro OpenTripPlanner (mimo web) |
| Seznam zastávek PID `data.pid.cz/stops/json/stops.json` | ROPID | dtto | — | — | — | — | CC BY 4.0 | — | denně | **Integrováno** (hledání, zastávky v mapě, odjezdy); import `npm run import:stops` |
| Golemio `/v2/vehiclepositions` | Operátor ICT | PID | — | ano | ano | — | podmínky Golemio API (ověřte před provozem) | 20 požadavků / 8 s na klíč (`X-Access-Token`) | online | **Implementováno**, vyžaduje klíč; tvar odpovědi ověřte `npm run verify:golemio` |
| Golemio `/v2/pid/departureboards` | Operátor ICT | PID | — | — | ano (`delay.is_available`) | infotexty | dtto | dtto | online | **Implementováno**, vyžaduje klíč; parametr `aswIds[]` neověřen |
| RSS mimořádnosti `pid.cz/feed/rss-mimoradnosti` | ROPID | PID | — | — | — | ano | CC BY 4.0 (obsah webu) | — | průběžně | **Integrováno** (prostý text, odkazy jen na pid.cz) |
| OpenFreeMap `tiles.openfreemap.org/styles/liberty` | OpenFreeMap | svět | mapa (OSM) | — | — | — | data OSM (ODbL), uvedení zdroje povinné – MapLibre ho zobrazí sám | bez limitů, služba „as is“ | — | **Integrováno**, v testech nedostupné |
| OpenTripPlanner 2.7+ `/otp/gtfs/v1` | vlastní provoz | dle GTFS | plánování | — | ano s GTFS-RT | — | OTP: LGPL | dle serveru | po importu GTFS | **Adaptér hotový**, instance chybí |
| Další IDS (IDS JMK, DÚK, IDOL, IDSOK…) a CIS JŘ | různí | ČR | GTFS/CIS (dle zdroje) | jen některé | jen některé | — | dle zdroje | — | — | **Neintegrováno** – nový adaptér podle `src/providers/types.ts` |

## Pravidla aktuálnosti (UI)
- **Živě**: nejnovější měření polohy ve zdroji je mladší než 60 s a poslední obnova uspěla.
- **Poloha vozidla**: živá ≤ 90 s, zastaralá ≤ 300 s (poloprůhledná, šedý štítek), starší se nezobrazí.
- **Zastaralá data**: server vrací poslední úspěšná data (polohy max. 3 min, odjezdy 5 min) se stavem „stale“ a stářím.
- **Ukázková data**: jen při `DEMO_DATA=1`, vždy označena; v produkci se nic nevymýšlí.

## Ověření živých dat (u vás)
```bash
GOLEMIO_API_KEY=... npm run verify:golemio
```
Vypíše, která pole adaptér ve skutečné odpovědi našel. Chybějící pole upravte v `src/providers/pid/golemio.ts`.
