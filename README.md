# Doprava — Celé Česko

Dopravní webová aplikace pro Česko: živá mapa vozidel, odjezdy, spojení, oblíbené a stav dat. Postavená na Next.js 16, React 19, TypeScriptu (strict) a MapLibre GL 6. První integrace je PID (Praha a Středočeský kraj), architektura je připravená na další systémy.

> **Stav:** verze 0.1.0 – funkční základ. Co je hotové, co je neověřené proti živým službám a co chybí: [STATUS.md](STATUS.md). Výsledky kontrol: [docs/verification.md](docs/verification.md).

## Rychlý start

Potřeba Node.js 20.9+ (testováno na 22) a npm.

```bash
npm ci
cp .env.example .env.local   # doplňte GOLEMIO_API_KEY – zdarma na https://api.golemio.cz/api-keys
npm run dev                  # http://localhost:3000
```

Bez klíče aplikace běží dál: mapa, zastávky, mimořádnosti a jízdenky fungují, polohy vozidel a odjezdy poctivě ukážou „Živá data nepřipojena“. Nic se nevymýšlí.

Ukázkový režim jen pro vývoj a testy: `DEMO_DATA=1 npm run dev` (vše označeno „Ukázková data“, testovací stránka natočení `/test/rotace`).

## Produkční běh

```bash
npm run build
npm run prepare:standalone
PORT=3000 node .next/standalone/server.js
```

Na Vercelu stačí napojit GitHub repozitář a nastavit proměnné prostředí.

## Nasazení jedním příkazem

```bash
bash ~/Downloads/deploy-doprava.sh
```

Skript (`scripts/deploy.sh`) naklonuje repozitář do `/tmp`, nahradí obsah balíkem `~/Downloads/doprava-cesko-0.1.0.tar`, spustí `npm ci`, kontroly (typy, lint, testy) a build, udělá commit, tag verze a push. Když cokoli selže, nic se nepushne. Jiný repozitář: `REPO_URL=https://github.com/…/….git bash deploy-doprava.sh`.

## Kontroly

| Příkaz | Co dělá |
|---|---|
| `npm run check` | typy + ESLint + 53 unit testů |
| `npm run build` | produkční build (zkopíruje i worker MapLibre) |
| `npm run test:e2e` | Playwright (Chromium) proti standalone buildu v ukázkovém režimu; snímky do `docs/screenshots/`. Poprvé `npx playwright install chromium`. |

## Proměnné prostředí

| Proměnná | Význam |
|---|---|
| `GOLEMIO_API_KEY` | klíč Golemio pro polohy a odjezdy PID (jen server) |
| `MAP_STYLE_URL` | mapový styl, výchozí OpenFreeMap Liberty |
| `MAP_EXTRA_ORIGINS` | další domény mapového podkladu pro CSP (při buildu) |
| `OTP_GRAPHQL_URL` | OpenTripPlanner 2.x, např. `http://localhost:8080/otp/gtfs/v1` |
| `DEMO_DATA` | `1` = ukázková data (nikdy v produkci) |
| `ADMIN_TOKEN` | přístup k `/api/admin/health` |

## Další skripty

`npm run assets` (PNG → varianty + manifest), `npm run icons` (ikony PWA), `npm run import:stops` (seznam zastávek PID do `data/pid/`), `npm run verify:golemio` (ověří tvar živých odpovědí Golemio s vaším klíčem).

## Struktura

```
src/app          obrazovky (Mapa, Spojení, Odjezdy, Oblíbené, Jízdenky, Nastavení, Stav) a API
src/components   rozhraní (panel, spodní list, detail vozidla, vyhledávání zastávek…)
src/map          MapLibre: vrstvy, úrovně detailu, sprity, animace, načítání poloh
src/domain       typované modely, ID se jmenným prostorem, čas (Europe/Prague, GTFS > 24:00), úhly
src/providers    adaptéry: PID/Golemio, seznam zastávek, RSS; ukázková data
src/planning     OpenTripPlanner (GTFS GraphQL)
src/server       sdílená cache, bezpečné požadavky, limity, logy
src/config       manifest grafiky vozidel
docs             zdroje dat, grafika, provoz, ověření, snímky
```

## Data a licence

Mapa © přispěvatelé OpenStreetMap, OpenMapTiles, OpenFreeMap. Doprava: ROPID / PID (CC BY 4.0), Golemio API (Operátor ICT). Písmo Plus Jakarta Sans (OFL) je hostované lokálně. Podrobnosti: [docs/data-sources.md](docs/data-sources.md), [docs/assets.md](docs/assets.md), [docs/operations.md](docs/operations.md).


## Upozornění na blížící se spoj (Web Push)

Funkce je bez nastavení vypnutá (aplikace u zvonku napíše, že upozornění nejsou na serveru zapnutá). Zapnutí:

1. **Upstash (zdarma) přes Vercel:** projekt → *Storage* / *Marketplace* → přidat **Upstash for Redis** a **Upstash QStash**. Do projektu se samy doplní proměnné `KV_REST_API_URL`, `KV_REST_API_TOKEN` (nebo `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) a `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` (případně `QSTASH_URL` pro region).
2. **Klíče VAPID** (jednou, lokálně): `npx web-push generate-vapid-keys` a do Vercelu přidat `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` a `VAPID_SUBJECT` (např. `mailto:tvuj@email.cz`).
3. Adresa aplikace pro zpětné volání se bere z `VERCEL_PROJECT_PRODUCTION_URL`; jinou lze nastavit proměnnou `APP_URL`.
4. Nasadit znovu (Redeploy).

Jak to funguje: zvonek → prohlížeč vytvoří push odběr → `POST /api/push/watch` uloží hlídání do Redisu (TTL do odjezdu) a naplánuje zprávu v QStash na čas „odjezd − zvolený předstih“ → QStash zavolá `POST /api/push/fire` (ověřený podpis) → server zkontroluje živé odjezdy: zpožděný spoj přeplánuje, včasný oznámí, zrušený nahlásí → service worker zobrazí upozornění. Na iPhonu fungují upozornění jen v aplikaci přidané na plochu (iOS 16.4+).
