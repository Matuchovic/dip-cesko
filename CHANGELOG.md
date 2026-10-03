# Changelog

## 0.17.0 – 2026-10-03
- Vlastní 3D ikony místo všech emoji: 49 barevných vektorových ikon (doprava, stav jízdy, upozornění, rodina, památky) s leskem, stínem a jemnou animací; malé ikony v textu jsou statické, karty v seznamech se rozhýbou pod prstem/kurzorem, při omezení pohybu stojí.
  - Nahrazeno všude: průvodce (všech 10 kroků), Památky (druhy i doprava u zastávek), Domů/Práce, pruh novinek (výluky i tipy) a jeho detail, rodičovská kontrola (role, souhlas, časová osa, SOS, předvolby, posuvník, tlačítko pod novinkami), QR skener.
  - Ověřovací obrázky při spárování jsou 4 z 32 vlastních ikon (dříve emoji); spojení z 0.16.0 se přepočítají automaticky, takže dál sedí.
  - Texty upozornění bez emoji (druh dopravy slovem: „Tramvaj 22 · za 5 min · …“) – na zamčené obrazovce by je vykreslil telefon cizím stylem.
  - Hlídače: unit test prohledá celý kód, texty všech jazyků, servisní pracovníka a manifest; e2e test projde všechny sekce, pruh novinek, celý průvodce a rodičovskou kontrolu z obou stran a hledá emoji ve vykresleném textu i popiscích.

## 0.16.0 – 2026-10-03
- Rodičovská kontrola (nová stránka /rodina a tlačítko pod novinkami):
  - Spárování osobně: rodič ukáže QR kód (s logem) a jednorázový 6místný kód (platí 10 min); dítě ho naskenuje fotoaparátem přímo v aplikaci nebo opíše. Dítě si přečte, co rodič uvidí a co ne, a samo potvrdí souhlas. Oba telefony ukážou stejné 4 ověřovací obrázky.
  - Šifrování jen v telefonech: každé zařízení má vlastní klíč (ECDH P-256, nejde vyexportovat), pro každé spojení se odvodí klíč AES-GCM. Server zprávy jen přeposílá a nepřečte je; QR kód nese otisk klíče rodiče, takže podvržený klíč dítě pozná. Upozornění se dešifrují až v telefonu.
  - Dítě: přednastavené cíle Do školy / Domů, výběr spoje ze zastávky, potvrzení přejetím „Jedu“, „Jsem v cíli“, SOS jen po podržení (s polohou v tu chvíli, pokud je povolená), vypínač sdílení stále na očích.
  - Rodič: živý stav dítěte, dojezd do cíle z tabule cílové zastávky, zpoždění, časová osa, červené SOS s mapou, zrušení spojení. Automatická upozornění ze serveru: zpoždění (při změně o 2+ min), dojezd do cílové zastávky, nepotvrzený příchod do 10 min, zrušený spoj.
  - Server zná jen veřejné údaje o spoji (linka, zastávky, čas), ne jména ani polohu; údaje o jízdě se mažou nejpozději po 4 h. Tajemství jen jako otisky, limity pokusů na kódy, nejvýš 6 dětí na rodiče a 4 rodiče na dítě; spojení může kdykoli zrušit kterákoli strana.
- Fotoaparát je povolen jen pro tuto aplikaci (skener QR kódu).

## 0.15.1 – 2026-10-03
- Průvodce opravdu přes celou obrazovku: obecný rámeček fokusu mu přidával zaoblené rohy s modrým okrajem (dole byly vidět modré rohy).

## 0.15.0 – 2026-10-03
- Nový úvodní průvodce: 10 kroků, každý jedna funkce – jazyk, živá mapa (barvy zpoždění), odjezdy a rady, zvonek a připomínky (s přehráním zvonku), spojení, památky, pruh novinek, ovládání panelu a aktualizace, nastavení na 3 klepnutí (plocha, upozornění, poloha), Domů a Do práce. Animace přesně ukazují, kam klepnout (pulzující kroužek), plynulé 3D přechody, konfety z čísel linek. Mobil: celá obrazovka, listování přejetím prstem. Počítač: dvousloupcové okno, šipky ← → a Esc. Klepnutím na proužek nahoře skočíš na libovolný krok.
- Rychlost: 3D knihovna (three.js) se stahuje až po prvním vykreslení mapy jako samostatný balík; průvodce se stahuje, jen když se má ukázat; během tažení mapou se štítky vozidel obnovují méně často (plynulejší pohyb); obrázky loga a ikon ve WebP (průvodce dřív stahoval 475 kB PNG); dlouhé seznamy karet se vykreslují až při posunu k nim; na telefonech levnější efekty karet.
- Hlavička na počítači: pod logem je vidět popis „najdi si spoj, kdykoliv, kdekoliv“.

## 0.14.0 – 2026-10-03
- Aktualizace jako na MatuchaDev: aplikace zná otisk svého sestavení (na Vercelu hash commitu) a porovnává ho s /api/version – 3 s po startu, každou minutu, při návratu do aplikace a po obnovení signálu; po nálezu přestane. Dole vyjede skleněný ostrov s obíhajícím světlem „Nová verze X“ a „stará → nová“ (jen čísla verzí), tlačítko Aktualizovat (krátká obrazovka načítání s logem) a křížek. Kdo lištu zavře nebo ji přehlédne, dostane novou verzi sám při přechodu do jiné sekce – nikdy během psaní. Servisní pracovník přijímá pokyn k převzetí.
- Karty ve 3D podle MatuchaDev: skleněná obruba kolem desky, pětivrstvý stín s modrou září, náklon za kurzorem s posouvajícím se leskem (na dotyku jemné zamáčknutí), tmavý režim, bez animací při omezení pohybu.

## 0.13.0 – 2026-10-03
- Nová sekce Památky místo Jízdenek v menu: 66 nejznámějších památek hned (i bez sítě), „V okolí“ seřazené podle vzdálenosti a „Všechny“ – všechny kulturní památky Prahy z Wikidat. U každé nejbližší metro, tramvaj a autobus s linkami a minutami chůze, tlačítka „Na mapě“ a „Cesta sem“ (plánovač s vyplněným cílem), hledání s křížkem. Jízdenky zůstávají dostupné odkazem.
- Pruh novinek je pod menu až u spodního okraje; menu sedí hned nad ním. Když je okno iPhonu kratší než obrazovka (chyba iOS u aplikací na ploše), nepřidává se navíc bezpečný okraj a místo pod oknem má barvu pruhu – žádné prázdné místo. Oprava výšky okna se zkouší i hned po spuštění.

## 0.12.0 – 2026-10-03
- Běžící pruh nad spodní lištou: při mimořádnostech PID tmavý „PROVOZ“, jinak „NOVINKY“ s tipy; jede zprava doleva, prstem se zastaví, klepnutím detail (s křížkem), křížkem se schová do příštího spuštění; na počítači pod mapou.
- Správná čeština „vyraž hned“ / „Vyraž za … min“ (upozornění, rada u odjezdu, Tvoje místa).
- iPhone: chybné dorovnání výšky z 0.11.0 (schovávalo popisky spodní lišty) nahrazeno opravou známé chyby WebKitu – po zavření klávesnice zůstávalo okno menší a dole vznikl prázdný pruh; teď se výška po zavření klávesnice i po návratu do aplikace obnoví.

## 0.11.0 – 2026-10-03
- Upozornění podle schváleného návrhu: smajlík druhu dopravy, v tučném nadpisu linka, za kolik minut a kam; pod tím kde (nástupiště) a stav (✅ včas / ⏱️ zpoždění / 🏃 vyraz hned); zrušený spoj (❌) nabídne další; na Androidu tlačítka „Kde je spoj“ a „Odjezdy“.
- Tramvajový zvonek: když upozornění přijde při otevřené aplikaci, zazní dvojí „cink“ (zvuk se odemkne prvním dotykem).
- Šipka pro schování panelu je přímo v úchytu – už se nepřekrývá s křížkem karty zastávky; klepnutí panel schová / vysune.
- Křížek všude: každá obrazovka má vpravo nahoře křížek zpět na mapu, pole hledání má křížek pro smazání, nabídka zvonku i průvodce se dají zavřít křížkem.
- iPhone: odstraněn prázdný pruh pod spodní lištou (aplikace na ploše s průhledným stavovým řádkem hlásí menší výšku okna – dorovnává se).

## 0.10.0 – 2026-10-03
- Upozornění na blížící se spoj (Web Push): zvonek u odjezdu → 2, 5 nebo 10 min předem; funguje i se zavřenou aplikací. Server hlídání uloží (Upstash Redis), QStash ho probudí přesně v pravou chvíli, server znovu ověří živý odjezd – zpožděný spoj přeplánuje, zrušený nahlásí. Klepnutí na upozornění otevře odjezdy zastávky.
- Bezpečnost upozornění: odesílání jen na push služby prohlížečů (žádné SSRF), podpis QStash (HS256, aktuální i příští klíč, kontrola těla a platnosti), tajný token pro zrušení (uložen jen jako hash), nejvýš 10 hlídání na zařízení, limity požadavků, data se samy mažou po odjezdu.
- Aplikace přes celou obrazovku: na iPhonu mapa i pod stavovým řádkem (s jemným ztmavením pro čitelnost), na Androidu stavový řádek v barvě mapy; klávesnice zmenšuje obsah místo překrytí.
- Psaní bez přiblížení stránky: pole mají na dotykových zařízeních písmo aspoň 16 px.
- Panel jde schovat dolů: tažením dolů nebo tlačítkem se šipkou; schovaný ukazuje jen název zastávky, klepnutím se vrátí.

## 0.9.0 – 2026-10-03
- Úvodní průvodce při spuštění (čeština a angličtina): výběr jazyka (přepne celou aplikaci), živá mapa, odjezdy s radou, přidání na plochu (Android/počítač: systémová instalace, iPhone: návod), zapnutí upozornění (skutečná žádost o povolení a zkušební upozornění), povolení polohy, nastavení Domů a Do práce; na konci konfety z čísel linek.
- Zobrazuje se při každém spuštění; „Přeskočit“ ho zavře do příštího spuštění, „Již nezobrazovat“ natrvalo (znovu zapnout v Nastavení → Úvodní průvodce).
- Skutečné logo aplikace (PNG) s animovaným příletem a odleskem; tlačítka s výrazným najetím myší, stiskem a fokusem.

## 0.8.0 – 2026-10-03
- Nová domovská obrazovka s jasnou hierarchií: nejbližší zastávka velkým písmem, tři nejbližší odjezdy (linka, cíl, nástupiště, zpoždění, velký odpočet) a u prvního rada lidskou řečí: „Stihneš to · rezerva 2 min“, „Vyraz hned“, „Nestihneš · další za 7 min“ (podle chůze k zastávce).
- Tvoje místa: Domů a Do práce (uložené jen v zařízení) s časem odjezdu a příjezdu z plánovače; klepnutí otevře Spojení s předvyplněným cílem; pod nimi oblíbené zastávky.
- V okolí: další dvě zastávky s nejbližšími linkami; Provoz: mimořádnosti; odkaz na schéma metra.
- Panel s prostorovými okraji (světlá hrana, vrstvený stín, na mobilu podložená vrstva), výrazné nadpisy (název zastávky 32 px, sekce 24 px), čísla s pevnou šířkou.
- Čeština jednotně tykáním („Kam jedeš?“, „Vyhledej zastávku“, „teď“).
- Na mobilu je panel při otevření vyšší, aby byla vidět zastávka se všemi třemi odjezdy; metro A, B, C v barvách linek; neznámé zpoždění se nevypisuje.
- Oprava: pulzy u vozidel mimo výřez nikdy nevypršely a mapa se kvůli nim neuspala (zbytečné vybíjení baterie).

## 0.7.0 – 2026-10-03
- Nové značky vozidel místo teček (od přiblížení 12,5): pilulka s číslem linky, kroužek zpoždění (zelená včas, oranžová do 3 min, červená víc, šedá bez údaje) a klín směru jízdy.
- Pulz při každé skutečně nové poloze vozu; stopa za vozidlem (od přiblížení 14,6) ze skutečného pohybu za poslední ~3 s.
- Při oddálení shluky jako prstenec rozdělený podle druhu dopravy s počtem vozidel.
- Vybraný vůz: trasa spoje s tekoucí čárou ve směru jízdy a štítky dalších zastávek s odpočtem (z průběhu spoje Golemio, obnova 30 s).
- S omezenými animacemi se pulzy a stopy nekreslí.

## 0.6.0 – 2026-10-03
- Živé schéma metra (/metro): stylizované linky A, B, C pro mobil, všech 61 stanic, přestupy, soupravy podle skutečných poloh (obnova 5 s, plynulý pohyb), klepnutí na stanici = odjezdy, na soupravu = mapa se sledováním.
- Schéma linky (/linka): zastávky obou směrů pod sebou a všechny vozy linky v reálném čase; směr vozu podle souhlasu kurzu se směrem trasy; barva rámečku = zpoždění. Otevře se z detailu vozidla i klepnutím na číslo linky v odjezdech.
- Průběh spoje z veřejného detailu vozidla Golemio (zastávky v pořadí, tvar trasy) – nové API /api/trip a /api/metro.
- Plynulé přechody mezi obrazovkami (View Transitions): animuje se jen panel, mapa zůstává; bez podpory nebo s omezenými animacemi okamžitě.
- Bezpečnost: přísná CSP s jednorázovým nonce pro každý požadavek (src/proxy.ts) – na stránkách neběží žádný skript bez platného nonce; Cross-Origin-Opener-Policy; nové vstupy API striktně ověřené (ID vozu, linka, druh dopravy) a s limity požadavků; audit závislostí bez nálezů.

## 0.5.3 – 2026-10-02
- Tramvaje zpět na mapě: tramvaj a autobus se stejným číslem vozu (např. 8566) se už nepřepisují (klíč obsahuje druh dopravy, shodně s plným zdrojem); co v lehkém zdroji chybí, doplní plný zdroj (obnova po 10 s, poloha max. 2 min stará).
- Odolnost: vadná data jednoho vozidla už nezastaví vykreslení ostatních (3D vrstvy i smyčka mapy); ochrana proti neplatným číslům v dopočtu polohy.
- Stav dat ukazuje počty vozidel podle druhu na serveru i v tomto prohlížeči (pro rychlou diagnostiku).

## 0.5.2 – 2026-10-02
- Polohy vozidel z lehkého veřejného endpointu Golemio (/v2/public/vehiclepositions, celé PID ~70 kB) – rychlé i ve špičce; plný endpoint (10 000 vozidel, jednotky MB) se načítá jen na pozadí po 30 s kvůli směru, číslu vozu a zastávkám a slouží jako záloha. Ráno ve špičce se plný dotaz nestihl a mapa zůstala prázdná.
- Chyba zdroje už nesmaže vozidla z mapy; nový pokus nejpozději za 15 s.
- Serverové funkce běží ve Frankfurtu (blíž Golemiu v Praze), trasa poloh smí běžet až 30 s.

## 0.5.1 – 2026-10-02
- Obrázky vozidel (PNG shora) se při velkém přiblížení už nerozpadají na části: velikost obrázku je vždy skutečná (dříve omezená na 560 px), interpolace přesně odpovídá zoomu.

## 0.5.0 – 2026-10-02
- Nová značka DopravaČR: logo v hlavičce (světlá i tmavá varianta), na mobilu v panelu se sloganem v jazyce aplikace; barvy celé aplikace podle ikony (námořnická a ocelová modrá, světlé sklo).
- Favicon (16/32/48 px), ikony PWA „any“ i „maskable“, ikona pro iPhone, manifest se zkratkami (Odjezdy, Spojení), tlačítko „Nainstalovat aplikaci“ v Nastavení (iPhone: návod).
- Vozidla se nepřekrývají: na zastávce se řadí do fronty za sebou (dříve se při dopočtu sjela do jednoho bodu); dopočet polohy nejvýš 20 s.
- Plynulost: síť kolejí se přepočítává jen v klidu mapy, štítky se obnovují nejvýš 10× za sekundu, 3D modely v každém snímku.
- Odjezdy fungují i pro stanice metra: dotaz podle GTFS id nástupišť; nepodporovaná kombinace aswIds + includeMetroTrains se už neposílá; při chybě se zkusí ASW id a pak přesný název uzlu (s metrem a vlaky). Chyba zdroje se zobrazuje jako „Data nedostupná“, ne „nepřipojena“.

## 0.4.0 – 2026-10-01
- Reálný čas: polohy se obnovují každé 3 s (v ulicích jen pro výřez mapy, server drží data 3 s); mezi měřeními vozidlo jede po trati naměřenou rychlostí až k další zastávce (nejvýše 45 s), nové měření se napojí plynule a vozidlo nikdy necouvá kvůli zpoždění dat; dopočtená poloha je v detailu označená.
- Skutečná velikost 3D vozidel při každém přiblížení (dříve se při oddálení zvětšovala).
- Tramvaj blíž ilustraci: červený klín na boku kabiny, prostorový pantograf.
- Metro: Golemio posílá i polohy souprav metra – po zrušení limitu 100 vozidel se zobrazují a přichytávají na koleje metra; v Stavu dat je počet vozidel podle druhu.
- Odjezdy se obnovují každých 10 s.

## 0.4.0 – 2026-10-01
- Reálný čas: obnova poloh každé 3 s (jen výřez mapy, po posunu hned), serverová cache 3 s; vozidlo se po měření plynule dorovná a jede dál po trati odhadnutou rychlostí (nejvýše 20 s za posledním měřením), nikdy necouvá.
- Vozidla mají při každém přiblížení skutečnou velikost (dříve se při oddálení zvětšovala).
- Metro: polohy souprav z Golemia (kolejové obvody DPP) se zobrazují po trasách metra; trasy metra jsou vidět na mapě.

## 0.3.2 – 2026-10-01
- 3D tramvaj a vlak podle dodaných ilustrací: střecha přímo z dodané grafiky shora, bílá karoserie, černý pás oken se sloupky a dveřmi, barevný spodek a skloněné čelo kabiny se světly.
- Souprava je složená z částí podle grafiky (tramvaj 4, vlak 3) s měchy mezi nimi a v obloucích se ohýbá podél koleje.
- Světlejší osvětlení boků vozidel.
- Na mapě jsou všechna vozidla: Golemio vracelo bez parametru jen prvních 100 vozidel – nyní až 10 000 včetně vozů čekajících na výjezd; dokončené spoje se nezobrazují.

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
