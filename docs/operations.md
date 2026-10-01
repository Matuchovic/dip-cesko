# Provoz

## Architektura běhu
- **Web (Next.js, Node 20.9+)**: krátké požadavky – stránky a API (`/api/vehicles`, `/api/departures`, `/api/stops`, `/api/alerts`, `/api/plan`). Klíče jen na serveru.
- **Sdílená cache** v paměti instance (single-flight, TTL, zastaralá data při výpadku): polohy 10 s (stale 3 min), odjezdy 15 s (5 min), zastávky 12 h (7 dní), mimořádnosti 2 min (1 h). Při více instancích (Vercel) má každá vlastní cache a limit Golemio 20/8 s se dělí – pro větší provoz doporučeno jedno sdílené úložiště (např. Redis) nebo samostatný sběrač, který plní cache.
- **Import zastávek**: `npm run import:stops` (cron denně po 5:00). Nová verze se ověří a atomicky nahradí; předchozí zůstane jako `data/pid/stops.prev.json`. Bez importu server stahuje seznam přímo.
- **OpenTripPlanner**: samostatný server (Java 21, OTP 2.7+), graf z PID GTFS + výřezu OSM (Geofabrik). Paměť závisí na území – změřte; pro srovnání Digitransit spouští Finsko s `-Xmx10g`. Graf sestavujte denně po vydání GTFS, nový graf nasaďte vedle starého a přepněte až po kontrole. Endpoint nastavte v `OTP_GRAPHQL_URL` (…/otp/gtfs/v1).

## Pozorovatelnost
- Logy jsou JSON řádky (`upstream.ok`, `upstream.fail`, `golemio.vehicles.invalid`, `planner.error`…), bez klíčů a bez polohy uživatelů.
- `/api/status` – veřejný hrubý stav zdrojů. `/api/admin/health` – chráněná diagnostika (`Authorization: Bearer $ADMIN_TOKEN`).
- Rozlišení výpadků: poskytovatel (status zdroje, `upstream.fail`), import (stáří `generatedAt` zastávek), plánovač (`/api/plan` 502/503), vykreslení v prohlížeči (hláška o záložní mapě, obrazovka Stav dat).

## Nasazení a návrat
- `scripts/deploy.sh`: klon repozitáře → obsah z balíku → `npm ci` → kontroly → build → commit + tag → push. Při chybě se nic nepushne.
- Návrat na předchozí verzi: na Vercelu „Promote“ předchozího nasazení, nebo `git revert` a push; samostatný server: spustit předchozí `.next/standalone`.
- Rychlé vypnutí zdroje: odebrat `GOLEMIO_API_KEY` → aplikace ukáže „Živá data nepřipojena“; změna mapy `MAP_STYLE_URL` (nové domény do `MAP_EXTRA_ORIGINS` kvůli CSP, vyžaduje build).

## Přidání poskytovatele
1. Adaptér v `src/providers/<id>/` podle `TransitProvider`, ID v jmenném prostoru `<id>:…`.
2. Schémata zod s limity, test na reálných vzorcích dat, kontrola konzistence (souřadnice v ČR, unikátní ID, časy).
3. Registrace v `src/server/transit.ts`, záznam v `docs/data-sources.md`.

## Nákladové faktory (ceny ověřte před výběrem placené služby)
Výpočetní čas a paměť instancí webu, přenos dat (polohy se obnovují po 10 s na klienta), server OTP (RAM pro graf), mapový podklad (veřejný OpenFreeMap bez záruky; pro SLA vlastní hosting dlaždic nebo placený poskytovatel).
