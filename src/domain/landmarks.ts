/**
 * Nejznámější pražské památky (ručně vybrané, okamžitě dostupné i bez sítě).
 * Úplný seznam kulturních památek se dočítá z Wikidat (viz server/landmarks.ts).
 */
export type LandmarkKind = 'castle' | 'church' | 'bridge' | 'square' | 'museum' | 'palace' | 'tower' | 'park' | 'synagogue' | 'monument' | 'theatre' | 'cemetery' | 'other';
export interface LandmarkSeed { id: string; name: string; nameEn: string; kind: LandmarkKind; area: string; lat: number; lon: number; desc: string; descEn: string }

const L = (id: string, name: string, nameEn: string, kind: LandmarkKind, area: string, lat: number, lon: number, desc: string, descEn: string): LandmarkSeed => ({ id, name, nameEn, kind, area, lat, lon, desc, descEn });

export const TOP_LANDMARKS: LandmarkSeed[] = [
  L('hrad', 'Pražský hrad', 'Prague Castle', 'castle', 'Hradčany', 50.0904, 14.4004, 'Největší hradní komplex na světě a sídlo prezidenta.', 'The world’s largest castle complex and seat of the President.'),
  L('vit', 'Katedrála sv. Víta', 'St. Vitus Cathedral', 'church', 'Hradčany', 50.0909, 14.4005, 'Gotická katedrála uvnitř hradu, místo korunovací českých králů.', 'Gothic cathedral inside the castle where Czech kings were crowned.'),
  L('zlata', 'Zlatá ulička', 'Golden Lane', 'other', 'Hradčany', 50.0920, 14.4037, 'Malebné domky vestavěné do hradeb Pražského hradu.', 'Tiny colourful houses built into the castle walls.'),
  L('karluv', 'Karlův most', 'Charles Bridge', 'bridge', 'Staré Město – Malá Strana', 50.0865, 14.4114, 'Gotický kamenný most přes Vltavu se třiceti sochami.', 'Gothic stone bridge over the Vltava lined with thirty statues.'),
  L('staromak', 'Staroměstské náměstí', 'Old Town Square', 'square', 'Staré Město', 50.0875, 14.4213, 'Srdce Starého Města s orlojem, Týnským chrámem a pomníkem Jana Husa.', 'Heart of the Old Town with the clock, Týn Church and Jan Hus memorial.'),
  L('orloj', 'Pražský orloj', 'Astronomical Clock', 'monument', 'Staré Město', 50.0870, 14.4207, 'Středověký orloj na Staroměstské radnici – každou celou hodinu apoštolové.', 'Medieval astronomical clock; the apostles appear every hour.'),
  L('tyn', 'Týnský chrám', 'Church of Our Lady before Týn', 'church', 'Staré Město', 50.0877, 14.4227, 'Dvě gotické věže, které vévodí Staroměstskému náměstí.', 'Twin Gothic spires dominating Old Town Square.'),
  L('mikulas-sm', 'Kostel sv. Mikuláše (Staré Město)', 'St. Nicholas Church (Old Town)', 'church', 'Staré Město', 50.0884, 14.4190, 'Barokní kostel K. I. Dientzenhofera na Staroměstském náměstí.', 'Baroque church by K. I. Dientzenhofer on Old Town Square.'),
  L('jakub', 'Bazilika sv. Jakuba', 'St. James Basilica', 'church', 'Staré Město', 50.0884, 14.4244, 'Barokní bazilika s jedněmi z nejlepších varhan v Praze.', 'Baroque basilica with one of Prague’s finest organs.'),
  L('klementinum', 'Klementinum', 'Clementinum', 'palace', 'Staré Město', 50.0865, 14.4163, 'Barokní areál s nádherným knihovním sálem a astronomickou věží.', 'Baroque complex with a stunning library hall and astronomical tower.'),
  L('karolinum', 'Karolinum', 'Carolinum', 'palace', 'Staré Město', 50.0862, 14.4230, 'Nejstarší budova Univerzity Karlovy.', 'The oldest building of Charles University.'),
  L('stavovske', 'Stavovské divadlo', 'Estates Theatre', 'theatre', 'Staré Město', 50.0857, 14.4236, 'Divadlo, kde měl premiéru Mozartův Don Giovanni.', 'Where Mozart’s Don Giovanni premiered.'),
  L('prasna', 'Prašná brána', 'Powder Tower', 'tower', 'Staré Město', 50.0867, 14.4274, 'Gotická brána, začátek Královské cesty.', 'Gothic gate at the start of the Royal Route.'),
  L('obecni', 'Obecní dům', 'Municipal House', 'palace', 'Staré Město', 50.0878, 14.4281, 'Secesní skvost se Smetanovou síní.', 'Art Nouveau gem with the Smetana Hall.'),
  L('anezsky', 'Anežský klášter', 'Convent of St. Agnes', 'church', 'Staré Město', 50.0922, 14.4255, 'Nejstarší gotická stavba v Praze, dnes Národní galerie.', 'Prague’s oldest Gothic building, now part of the National Gallery.'),
  L('rudolfinum', 'Rudolfinum', 'Rudolfinum', 'theatre', 'Staré Město', 50.0899, 14.4152, 'Novorenesanční koncertní dům České filharmonie.', 'Neo-Renaissance concert hall of the Czech Philharmonic.'),
  L('mostecka-sm', 'Staroměstská mostecká věž', 'Old Town Bridge Tower', 'tower', 'Staré Město', 50.0862, 14.4136, 'Gotická věž s vyhlídkou na Karlův most.', 'Gothic tower with a view of Charles Bridge.'),
  L('staronova', 'Staronová synagoga', 'Old-New Synagogue', 'synagogue', 'Josefov', 50.0903, 14.4189, 'Nejstarší činná synagoga v Evropě.', 'Europe’s oldest active synagogue.'),
  L('zid-hrbitov', 'Starý židovský hřbitov', 'Old Jewish Cemetery', 'cemetery', 'Josefov', 50.0902, 14.4171, 'Tisíce náhrobků vrstvených přes sebe, hrob rabiho Löwa.', 'Thousands of layered tombstones, including Rabbi Loew’s grave.'),
  L('spanelska', 'Španělská synagoga', 'Spanish Synagogue', 'synagogue', 'Josefov', 50.0900, 14.4213, 'Maurský interiér plný zlata a ornamentů.', 'Moorish interior full of gold and ornaments.'),
  L('mikulas-ms', 'Chrám sv. Mikuláše (Malá Strana)', 'St. Nicholas Church (Lesser Town)', 'church', 'Malá Strana', 50.0880, 14.4036, 'Vrchol pražského baroka se zelenou kopulí.', 'The peak of Prague Baroque with its green dome.'),
  L('mostecka-ms', 'Malostranská mostecká věž', 'Lesser Town Bridge Tower', 'tower', 'Malá Strana', 50.0870, 14.4060, 'Vyhlídka na Karlův most a Malou Stranu.', 'Views over Charles Bridge and the Lesser Town.'),
  L('lennon', 'Lennonova zeď', 'Lennon Wall', 'other', 'Malá Strana', 50.0862, 14.4067, 'Zeď plná graffiti a vzkazů míru.', 'Wall covered in graffiti and messages of peace.'),
  L('kampa', 'Kampa', 'Kampa Island', 'park', 'Malá Strana', 50.0846, 14.4078, 'Ostrov s parkem, Čertovkou a mlýnskými koly.', 'Island park by the Devil’s Stream and its mill wheels.'),
  L('jezulatko', 'Kostel Panny Marie Vítězné (Pražské Jezulátko)', 'Infant Jesus of Prague', 'church', 'Malá Strana', 50.0855, 14.4035, 'Poutní místo se slavnou soškou Jezulátka.', 'Pilgrimage church with the famous Infant Jesus statue.'),
  L('valdstejn', 'Valdštejnský palác a zahrada', 'Wallenstein Palace & Garden', 'palace', 'Malá Strana', 50.0895, 14.4068, 'Sídlo Senátu se zahradou plnou pávů.', 'Seat of the Senate with a garden full of peacocks.'),
  L('vrtba', 'Vrtbovská zahrada', 'Vrtba Garden', 'park', 'Malá Strana', 50.0866, 14.4039, 'Barokní terasová zahrada s výhledem na Malou Stranu.', 'Baroque terraced garden overlooking the Lesser Town.'),
  L('nerudova', 'Nerudova ulice', 'Nerudova Street', 'other', 'Malá Strana', 50.0884, 14.3988, 'Strmá ulice s domovními znameními vedoucí na hrad.', 'Steep street of house signs leading up to the castle.'),
  L('petrin', 'Petřínská rozhledna', 'Petřín Lookout Tower', 'tower', 'Malá Strana', 50.0836, 14.3950, 'Malá Eiffelovka s výhledem na celou Prahu.', 'A little Eiffel Tower with views over all of Prague.'),
  L('strahov', 'Strahovský klášter', 'Strahov Monastery', 'church', 'Hradčany', 50.0862, 14.3893, 'Premonstrátský klášter se slavnou knihovnou.', 'Premonstratensian monastery with a famous library.'),
  L('loreta', 'Loreta', 'Loreto', 'church', 'Hradčany', 50.0890, 14.3917, 'Barokní poutní místo se zvonkohrou.', 'Baroque pilgrimage site with a carillon.'),
  L('cernin', 'Černínský palác', 'Černín Palace', 'palace', 'Hradčany', 50.0882, 14.3925, 'Monumentální barokní palác, sídlo ministerstva zahraničí.', 'Monumental Baroque palace, home of the Foreign Ministry.'),
  L('schwarzenberg', 'Schwarzenberský palác', 'Schwarzenberg Palace', 'palace', 'Hradčany', 50.0889, 14.3968, 'Renesanční palác se sgrafity na Hradčanském náměstí.', 'Renaissance palace with sgraffito on Hradčany Square.'),
  L('belveder', 'Letohrádek královny Anny', 'Queen Anne’s Summer Palace', 'palace', 'Hradčany', 50.0950, 14.4063, 'Renesanční letohrádek v Královské zahradě.', 'Renaissance summer palace in the Royal Garden.'),
  L('vaclavak', 'Václavské náměstí', 'Wenceslas Square', 'square', 'Nové Město', 50.0811, 14.4280, 'Bulvár s pomníkem sv. Václava, místo dějinných událostí.', 'Grand boulevard with St. Wenceslas statue, scene of history.'),
  L('nm', 'Národní muzeum', 'National Museum', 'museum', 'Nové Město', 50.0790, 14.4308, 'Monumentální budova v čele Václavského náměstí.', 'Monumental building at the top of Wenceslas Square.'),
  L('nd', 'Národní divadlo', 'National Theatre', 'theatre', 'Nové Město', 50.0810, 14.4136, 'Zlatá kaplička na nábřeží, symbol národního obrození.', 'The “golden chapel” on the embankment, symbol of national revival.'),
  L('tancici', 'Tančící dům', 'Dancing House', 'other', 'Nové Město', 50.0755, 14.4140, 'Dekonstruktivistická stavba F. Gehryho a V. Miluniće.', 'Deconstructivist building by F. Gehry and V. Milunić.'),
  L('cyril', 'Kostel sv. Cyrila a Metoděje', 'Church of Sts. Cyril and Methodius', 'church', 'Nové Město', 50.0752, 14.4170, 'Krypta, kde padli parašutisté po atentátu na Heydricha.', 'Crypt where the paratroopers fell after the Heydrich assassination.'),
  L('novomestska', 'Novoměstská radnice', 'New Town Hall', 'palace', 'Nové Město', 50.0772, 14.4195, 'Gotická radnice na Karlově náměstí, místo první defenestrace.', 'Gothic town hall on Charles Square, site of the first defenestration.'),
  L('emauzy', 'Emauzy', 'Emmaus Monastery', 'church', 'Nové Město', 50.0703, 14.4176, 'Klášter s moderními „křídly“ věží.', 'Monastery with modern wing-shaped spires.'),
  L('jubilejni', 'Jubilejní synagoga', 'Jubilee Synagogue', 'synagogue', 'Nové Město', 50.0858, 14.4321, 'Barevná secesní synagoga v Jeruzalémské ulici.', 'Colourful Art Nouveau synagogue on Jerusalem Street.'),
  L('kafka-hlava', 'Hlava Franze Kafky', 'Head of Franz Kafka', 'monument', 'Nové Město', 50.0821, 14.4210, 'Pohyblivá socha D. Černého z 42 otáčejících se plátů.', 'David Černý’s kinetic sculpture of 42 rotating panels.'),
  L('fantova', 'Fantova budova (Hlavní nádraží)', 'Main Station Art Nouveau Hall', 'other', 'Vinohrady', 50.0833, 14.4352, 'Secesní odbavovací hala hlavního nádraží.', 'Art Nouveau hall of Prague Main Station.'),
  L('vysehrad', 'Vyšehrad', 'Vyšehrad', 'castle', 'Vyšehrad', 50.0645, 14.4182, 'Bájné hradiště nad Vltavou s výhledy na řeku.', 'Legendary fortress above the Vltava with river views.'),
  L('petr-pavel', 'Bazilika sv. Petra a Pavla', 'Basilica of Sts. Peter and Paul', 'church', 'Vyšehrad', 50.0644, 14.4187, 'Novogotická bazilika s typickými dvěma věžemi.', 'Neo-Gothic basilica with twin spires.'),
  L('slavin', 'Vyšehradský hřbitov a Slavín', 'Vyšehrad Cemetery & Slavín', 'cemetery', 'Vyšehrad', 50.0647, 14.4193, 'Hroby Smetany, Dvořáka, Muchy a dalších velikánů.', 'Graves of Smetana, Dvořák, Mucha and other greats.'),
  L('martin', 'Rotunda sv. Martina', 'Rotunda of St. Martin', 'church', 'Vyšehrad', 50.0640, 14.4196, 'Nejstarší dochovaná rotunda v Praze (11. století).', 'Prague’s oldest surviving rotunda (11th century).'),
  L('zizkov-vez', 'Žižkovská věž', 'Žižkov TV Tower', 'tower', 'Žižkov', 50.0809, 14.4511, 'Televizní vysílač s lezoucími miminy D. Černého.', 'TV tower with David Černý’s crawling babies.'),
  L('vitkov', 'Národní památník na Vítkově', 'National Monument at Vítkov', 'monument', 'Žižkov', 50.0886, 14.4490, 'Jezdecká socha Jana Žižky a vyhlídka na centrum.', 'Jan Žižka equestrian statue and city views.'),
  L('ludmila', 'Kostel sv. Ludmily', 'St. Ludmila Church', 'church', 'Vinohrady', 50.0755, 14.4372, 'Novogotický kostel na náměstí Míru.', 'Neo-Gothic church on Náměstí Míru.'),
  L('srdce', 'Kostel Nejsvětějšího Srdce Páně', 'Church of the Most Sacred Heart', 'church', 'Vinohrady', 50.0779, 14.4500, 'Plečnikův modernistický kostel na Jiřího z Poděbrad.', 'Plečnik’s modernist church on Jiřího z Poděbrad.'),
  L('olsany', 'Olšanské hřbitovy', 'Olšany Cemeteries', 'cemetery', 'Žižkov', 50.0806, 14.4630, 'Největší pražský hřbitov s hrobem Jana Palacha.', 'Prague’s largest cemetery with Jan Palach’s grave.'),
  L('novy-zid', 'Nový židovský hřbitov (hrob F. Kafky)', 'New Jewish Cemetery (Kafka’s grave)', 'cemetery', 'Žižkov', 50.0784, 14.4794, 'Místo posledního odpočinku Franze Kafky.', 'Franz Kafka’s final resting place.'),
  L('letna', 'Letenské sady a Metronom', 'Letná Park & Metronome', 'park', 'Holešovice', 50.0947, 14.4157, 'Park s nejlepším výhledem na mosty přes Vltavu.', 'Park with the best view of the Vltava bridges.'),
  L('stromovka', 'Stromovka', 'Stromovka Park', 'park', 'Bubeneč', 50.1050, 14.4220, 'Bývalá královská obora, největší park v centru.', 'Former royal game reserve, the largest central park.'),
  L('vystaviste', 'Výstaviště a Průmyslový palác', 'Exhibition Grounds & Industrial Palace', 'palace', 'Holešovice', 50.1063, 14.4316, 'Secesní železná stavba z Jubilejní výstavy 1891.', 'Art Nouveau iron hall from the 1891 Jubilee Exhibition.'),
  L('veletrzni', 'Veletržní palác (Národní galerie)', 'Trade Fair Palace (National Gallery)', 'museum', 'Holešovice', 50.1015, 14.4330, 'Funkcionalistický palác s moderním uměním.', 'Functionalist palace with modern art.'),
  L('zoo', 'Zoo Praha', 'Prague Zoo', 'park', 'Troja', 50.1167, 14.4063, 'Jedna z nejlepších zoo na světě.', 'One of the best zoos in the world.'),
  L('troja', 'Trojský zámek', 'Troja Palace', 'palace', 'Troja', 50.1162, 14.4115, 'Barokní zámek s francouzskou zahradou.', 'Baroque chateau with a French garden.'),
  L('botanicka', 'Botanická zahrada Praha', 'Prague Botanical Garden', 'park', 'Troja', 50.1215, 14.4185, 'Skleník Fata Morgana a vinice sv. Kláry.', 'Fata Morgana greenhouse and St. Clare vineyard.'),
  L('brevnov', 'Břevnovský klášter', 'Břevnov Monastery', 'church', 'Břevnov', 50.0842, 14.3542, 'Nejstarší mužský klášter v Čechách s pivovarem.', 'The oldest monastery in Bohemia, with a brewery.'),
  L('hvezda', 'Letohrádek Hvězda', 'Star Summer Palace', 'palace', 'Liboc', 50.0836, 14.3297, 'Renesanční letohrádek ve tvaru šesticípé hvězdy.', 'Renaissance summer palace shaped like a six-pointed star.'),
  L('muller', 'Müllerova vila', 'Villa Müller', 'other', 'Střešovice', 50.0919, 14.3867, 'Ikonická vila Adolfa Loose.', 'Adolf Loos’s iconic villa.'),
  L('bertramka', 'Bertramka', 'Bertramka', 'palace', 'Smíchov', 50.0710, 14.3958, 'Usedlost, kde pobýval W. A. Mozart.', 'Villa where W. A. Mozart stayed.'),
  L('zbraslav', 'Zámek Zbraslav', 'Zbraslav Chateau', 'palace', 'Zbraslav', 49.9746, 14.3937, 'Bývalý cisterciácký klášter, hrobka přemyslovských králů.', 'Former Cistercian monastery, burial place of Přemyslid kings.'),
  L('sarka', 'Divoká Šárka', 'Divoká Šárka', 'park', 'Liboc', 50.0950, 14.3260, 'Divoké skalnaté údolí s koupalištěm.', 'Wild rocky valley with an open-air pool.'),
];

const KIND_WORDS: [RegExp, LandmarkKind][] = [
  [/synagog/i, 'synagogue'], [/kostel|chrám|bazilik|kaple|katedrál|klášter|rotund|fara\b/i, 'church'], [/most\b|lávka/i, 'bridge'],
  [/hrad\b|zámek|tvrz|pevnost/i, 'castle'], [/palác|letohrádek|vila|usedlost|dvůr\b/i, 'palace'], [/věž|rozhledna|brána/i, 'tower'],
  [/hřbitov|hrobka/i, 'cemetery'], [/zahrad|park|sady|obora/i, 'park'], [/divadl|koncert/i, 'theatre'], [/muze|galeri/i, 'museum'],
  [/socha|sousoší|pomník|památník|kříž|boží muka/i, 'monument'], [/náměstí/i, 'square'],
];
export function guessKind(name: string): LandmarkKind {
  for (const [re, k] of KIND_WORDS) if (re.test(name)) return k;
  return 'other';
}
