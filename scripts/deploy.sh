#!/usr/bin/env bash
# Doprava — Celé Česko: nasazení jedním příkazem (stejný postup jako HHsecurity / MatuchaDev).
#
#   bash ~/Downloads/deploy-doprava.sh [cesta/k/doprava-cesko-X.Y.Z.tar]
#
# Naklonuje repozitář do /tmp, nahradí jeho obsah balíkem, spustí kontroly (typy, lint, testy)
# a build, udělá commit + tag verze a pushne. Když cokoli selže, nic se nepushne.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Matuchovic/doprava-cesko.git}"
VERSION="0.1.0"
TAR="${1:-$HOME/Downloads/doprava-cesko-$VERSION.tar}"
WORK="/tmp/doprava-deploy"
MSG_TITLE="$VERSION: první verze Doprava — Celé Česko"
MSG_BODY="- Mapa (MapLibre + OpenFreeMap) s vozidly PID: PNG shora natáčené podle směru jízdy, úrovně detailu, výběr i na telefonu
- Odjezdy (nula vs. neznámé zpoždění, zrušené spoje), spojení přes OpenTripPlanner, oblíbené, jízdenky, nastavení, stav dat
- Serverová vrstva: sdílená cache, timeouty, limit Golemio 20/8 s, při výpadku poslední data se stářím
- PWA s offline režimem, přístupnost, bezpečnostní hlavičky, unit + E2E testy"

step() { printf '\n\033[1;35m▸ %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }
trap 'fail "Skript se zastavil (řádek $LINENO) – nic se nepushlo."' ERR

step "Kontrola balíku a nástrojů"
[ -f "$TAR" ] || fail "Balík nenalezen: $TAR"
tar -xOf "$TAR" ./package.json 2>/dev/null | grep -q '"name": "doprava-cesko"' || fail "Soubor $TAR není balík projektu doprava-cesko."
command -v git >/dev/null || fail "Chybí git."
command -v node >/dev/null || fail "Chybí Node.js (potřeba verze 20.9 nebo novější)."
node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>20||(a===20&&b>=9)?0:1)' || fail "Node.js $(node -v) je starý – potřeba 20.9+."

step "Klonuji $REPO_URL"
rm -rf "$WORK"
git clone --quiet "$REPO_URL" "$WORK" || fail "Repozitář nejde naklonovat. Vytvoř ho na https://github.com/new (název doprava-cesko, prázdný, bez README) nebo spusť s REPO_URL=…"
cd "$WORK"

step "Nahrazuji obsah repozitáře balíkem"
find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
tar -xf "$TAR" -C .

step "Instalace závislostí (npm ci)"
npm ci --no-audit --no-fund

step "Kontroly: typy, lint, unit testy"
npm run check

step "Produkční build"
npm run build

step "Commit a tag v$VERSION"
git add -A
if git diff --cached --quiet; then printf '\nŽádné změny oproti GitHubu – není co nasadit.\n'; exit 0; fi
git commit -q -m "$MSG_TITLE" -m "$MSG_BODY"
if git rev-parse -q --verify "refs/tags/v$VERSION" >/dev/null; then echo "Tag v$VERSION už existuje – přeskakuji."; else git tag -a "v$VERSION" -m "Verze $VERSION"; fi

step "Push"
git branch -M main
git push -u origin main --follow-tags

printf '\n\033[1;32m✓ Hotovo – verze %s je na GitHubu.\033[0m Vercel nasadí sám, pokud je repozitář napojený.\n' "$VERSION"
echo "Na Vercelu jednou nastav: GOLEMIO_API_KEY (živá data), případně OTP_GRAPHQL_URL a ADMIN_TOKEN. DEMO_DATA v produkci nenastavuj."
