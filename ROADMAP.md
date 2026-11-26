# Garmin Performance Studio — roadmap

## Smjer

Održavati jedan osobni Garmin pregled s jasnim dnevnim sažetkom, odvojenom analizom treninga i laboratorijem za detaljne trendove. Buduće ciljeve dodavati prema novim potrebama korisnika i nalazima iz stvarne upotrebe.

## Trenutačno stanje

- Prehrana · Moj dan samostalno učitava dnevnik i dohvaća katalog pri unosu obroka. Premještanje stare zalihe čuva njezinu raspoloživost, a plan povezan s kupovinom može se preskočiti uz očuvanje veze sa spremljenom listom.

- Četiri pogleda: **Pregled**, **Trening & Load**, **Prehrana** i **Laboratorij**, s brzom navigacijom i sklopivim grupama sadržaja.
- Pregled obuhvaća san, oporavak, Sleep debt, dnevnu aktivnost i sljedeći Runna trening.
- Trening prikazuje load, kalendar, trkačke i višesportske trendove, plan i izvedbu, opremu te detalje aktivnosti.
- Laboratorij sadrži zdravstvene trendove, temperaturu kože, mjerenja, korelacije, osobni dnevnik i izvore podataka.
- Dostupnost i pokrivenost ovise o Garmin Personal API-ju, Garmin Connect sesiji, Runna feedu i lokalnoj arhivi.
- Sleep debt sada u kodu uračunava Garminom zabilježene napove; aktivna instanca treba ponovno pokretanje kako bi preuzela tu izmjenu.

## Isporučeno

Do 2. 11. 2026. dovršeni su radni pogledi i navigacija, dnevni sažetak, interaktivni grafovi izvedbe, laboratorij i usporedbe, vizualno i mobilno poliranje te višesportski sažeci i preslagivanje opterećenja. Ranije pojedinačne faze 1–6 uklonjene su iz aktivnih ciljeva.

## Otvoreni ciljevi

## Zdravstvena i trening analitika — razvoj 15. 11. 2026.

- [x] ~~Faza 1 — Zdravstvena povijest do 365 dana i pouzdana pokrivenost~~. Lokalno provjereno 15. 11. 2026.: Python 104/104, mobilni E2E 1/1, tipovi i izdvojeni build prolaze. Migracija v12 pripremljena; korisnička baza ostaje v11. Release: `GPS-20261115-health-history-01`.
- [x] ~~Faza 2 — Odvojeni doprinosi oporavku, bez novog readiness rezultata~~. Lokalno provjereno 15. 11. 2026.: Python 106/106, E2E analitika 2/2, tipovi i build prolaze. Izvori, datumi, baza i pokrivenost po signalu. Release: `GPS-20261115-recovery-contributions-01`.
- [x] ~~Faza 3 — Prehrana prema treningu i oporavku sljedećeg dana~~. Lokalno provjereno 15. 11. 2026.: Python 109/109, E2E analitika 3/3, tipovi i build prolaze. Potvrđeni dnevnici, trećine loada, prag 5 dana po grupi, D → D+1. Release: `GPS-20261115-nutrition-training-01`.
- [x] ~~Faza 4 — Ručna usporedba trčanja s prijedlozima sličnih aktivnosti~~. Lokalno provjereno 15. 11. 2026.: Python 111/111, E2E analitika 4/4, tipovi i build prolaze. Odabir 2–5 trčanja, arhivska pretraga, prijedlozi ±10 %, vremensko preklapanje i izričita potvrda rute. Release: `GPS-20261115-running-comparison-01`.
- [x] ~~Faza 5 — RPE i dnevni umor uz kontekst treninga~~. Lokalno provjereno 15. 11. 2026.: Python 120/120, puni Playwright 49/49, tipovi i izdvojeni build prolaze. RPE po aktivnosti, dnevni umor za D i D+1, sport i pokrivenost, zaseban prikaz nedovoljnih uzoraka. Završna provjera uključuje migraciju v11 → v12, rollback DDL-a, starije odgovore i HTTP 429. Release: `GPS-20261115-training-response-01`.

Faze se označavaju dovršenima nakon lokalnih provjera. Produkcijska aktivacija i migracija korisničke baze zasebni su koraci.

## Nutrition & Meal Planning — implementacija 14. 11. 2026.

- [x] ~~Faza 1 — Database, Nutrition Engine & Inventory~~: aditivne migracije, prazan profil, verzije nutritivnih izvora, Decimal, FEFO, inventarni promet, transakcije i idempotencija.
- [x] ~~Faza 2 — Recipe Library & Scaling~~: ručni recepti, uređivanje, dupliciranje, skaliranje prema porcijama i ograničavajućem sastojku; opcionalan USDA adapter.
- [x] ~~Faza 3 — Meal Prep & Food Diary~~: provjera i potvrda kuhanja, raspored priprema, gotove porcije, djelomična konzumacija, nutritivni snapshot, otpad i kompenzacija.
- [x] ~~Faza 4 — Nutrition Dashboard & Garmin Analytics~~: dnevni KPI, grafovi, tjedni trendovi, odvojena službena potrošnja i lokalna procjena; rad bez Garmina.
- [x] ~~Faza 5 — Weekly Planner & Shopping List~~: premještanje i kopiranje plana, zbrojevi, konsolidirani manjkovi, gotove porcije, pakiranja, cijene iz nabave, ručne stavke i potvrđen prijem.
- [x] ~~Faza 6 — AI Recipe Assistant~~: pregled točnog sadržaja, potvrda, strukturirani odgovor, lokalna validacija alergena i dostupnosti, budžet i kontrola ponovnog slanja. Testirano simuliranim odgovorima; stvarni plaćeni poziv nije pokretan.
- [x] ~~Faza 7 — Adaptive Sports Nutrition, početni opseg~~: prikaz sljedećeg Runna treninga i ručno definirane prilagodbe energije/UH s eksplicitnom potvrdom i datumom važenja. Pravila ostaju lokalna.

### Granice ove verzije

Provjera isporuke: `pnpm check` bez grešaka/upozorenja, produkcijski build, 62 Python testa i 36 E2E testova prolaze. Lokalni poslužitelj ponovno je pokrenut. Baza je nadograđena s verzije 3 na 9; provjereni su kopija prije migracije, `quick_check`, strane veze i očuvani brojevi zapisa svih šest postojećih tablica. Testni podaci nisu uneseni u korisničku bazu.

- Profil počinje prazan. AI budžet počinje s 0; nema automatskog slanja podataka.
- Planiranje ne troši zalihe. Rezervacijska tablica pripremljena je za buduću opcionalnu funkciju; aktivne rezervacije još se ne stvaraju.
- Cijene su iz stvarne lokalne nabave; vanjski maloprodajni adapter nije konfiguriran.
- Mikronutrijenti se vode uz izvor namirnice; glavni grafovi prikazuju energiju i makronutrijente.
- Nema izvanmrežnog zapisivanja, automatskih medicinskih/sportskih prehrambenih preporuka ni drag-and-drop ovisnosti.

### Status aktivacije analitike

Svih pet faza implementirano je i provjereno lokalno. Pripremljeni su odvojeni manifesti i paketi svake faze; završni kandidat obuhvaća svih pet. Korisnička baza ostaje v11, produkcija nije pokrenuta i Git commit novih funkcija nije napravljen. Povijesni release manifesti nisu prepisani. Razvojni paketi u korijenu još imaju stare poveznice nakon preimenovanja; popravak je odbijen (`blocked by policy`). Provjere su izvedene nad zasebno instaliranim paketima u izdvojenom direktoriju.

### Produkcijska aktivacija pet faza — 15. 11. 2026.

Svih pet faza aktivirano je uz korisničko odobrenje kao `GPS-20261115-training-response-01`. SQLite v12, PID 4308, port 8787. Integritet i strane veze prolaze, korisnički Nutrition i dnevnički zapisi očuvani, 20/20 posluženih frontend datoteka i 20/20 Garmin izvora provjereno. Prethodni odlomci o čekanju aktivacije opisuju stanje prije ove aktivacije. Sigurnosna zabrana popravka razvojnih poveznica ostaje nerazjašnjena.

## NUTRITION-UX-AUDIT-01 — lokalne provjere 15. 11. 2026.

- [x] ~~N1 — Poruke vezane uz podkarticu i datum~~. Promjena konteksta briše poruku, a zakašnjeli uspjeh i pogreška radnje provjeravaju reviziju konteksta.
- [x] ~~N2 — Hrvatski pristupačni opisi nutritivnih grafikona~~. Graf, tooltip, tablica i odabir tipkovnicom koriste provjerene numeričke vrijednosti. Nedostajući podatak i 0 imaju različite opise.
- [x] ~~N3 — Hrvatska nutritivna polja~~. Energija u kcal, proteini/UH/masti/vlakna u g, osnovica na 100 g, stvaranje i uređivanje.
- [x] ~~Prazna kupovina i ručne liste~~. Razlikuje prazan plan i plan bez manjkova, omogućuje praznu listu i ručni unos. Nulti manjkovi iz API odgovora izostavljeni su iz prikaza nedostataka.
- [x] ~~Izolirani korisnički tijek~~. Unos namirnice, primitak, recept, planiranje bez potrošnje, kuhanje, pola porcije u dnevniku i kupovina. Nutrition E2E 10/10, grafovi 2/2, dodatna provjera tipkovnice 1/1. Tipovi bez grešaka i upozorenja, izdvojeni build prolazi.

Kandidat `GPS-20261115-nutrition-ux-01` pripremljen je za pregled. Commit, push i aktivacija na portu 8787 čekaju zasebno odobrenje za ovaj zadatak. Provjere koriste novu izdvojenu bazu na portu 8878 i simulirane vanjske podatke.

### Aktivacija Nutrition UX — 15. 11. 2026.

`GPS-20261115-nutrition-ux-01` aktiviran je uz izričito odobrenje korisnika. Prethodni server PID 37860 zaustavljen je prije isporuke. Novi PID 8816 sluša na 127.0.0.1:8787. Provjereno je svih 20 posluženih frontend hashova, SQLite v12, integritet, strane veze i očuvanje sadržaja svih 36 tablica. Nutrition profil, dashboard i arhivirana zdravstvena povijest vraćaju HTTP 200. Sačuvani su prethodni frontend i konzistentna kopija baze izvan rotacije. Kandidatov manifest i raniji izvještaj opisuju stanje prije aktivacije; novi zapis je `releases/GPS-20261115-nutrition-ux-01/local-activation-20261115.json`.

## Nutrition Async — review popravci 15. 11. 2026.

- [x] ~~UX-R01 — Meal Prep snimka zahtjeva i provjera aktualnosti~~. Fingerprint pripada poslanom obrascu; zakašnjeli odgovor odbacuje se nakon promjene ulaza, datuma ili navigacije.
- [x] ~~UX-R02 — Zaštićena primjena rezultata~~. Zajednička provjera obuhvaća skaliranje, USDA, AI, podatkovno učitavanje i dovršetak kuhanja. Primljeni AI recepti sačuvani su pri navigaciji.
- [x] ~~UX-R03 — Validacija pregleda kupovine~~. Valjane nule izostavljaju se nakon provjere cijelog odgovora; nevaljani podaci daju pogrešku i uklanjaju stari pregled.
- [x] ~~Regresijska provjera~~. Tri reproducirana pada prije popravka, 28 novih scenarija, puni Chromium 82/82, Nutrition Firefox 41/41 i WebKit 41/41. Tipovi i izdvojeni build prolaze.
- [ ] Ručna provjera stvarnim čitačem zaslona. Aktivna NVDA sesija i instalacija na uobičajenim putanjama nisu pronađene.

Kandidat `GPS-20261115-nutrition-async-02` pripremljen je za review. Commit, push i aktivacija čekaju zasebno odobrenje. Pojedinosti i ograničenja zabilježeni su u release izvještaju.

### Aktivacija Nutrition Async — 15. 11. 2026.

`GPS-20261115-nutrition-async-02` aktiviran je uz korisničko odobrenje. Prethodni PID 8816 zaustavljen je prije isporuke, novi PID 20888 sluša na 127.0.0.1:8787. Posluženi hashovi odgovaraju paketu 20/20. SQLite v12 prolazi integritet i strane veze, a sadržaj svih 36 tablica očuvan je. Nutrition profil/dashboard, arhivirana zdravstvena povijest i /api/openapi.json vraćaju HTTP 200. Sačuvani su prethodni frontend, izvorni kod prethodnog commita i konzistentna kopija baze izvan rotacije. Ručna provjera čitačem zaslona ostaje otvorena. Zapis je `releases/GPS-20261115-nutrition-async-02/local-activation-20261115.json`. Raniji statusi čekanja u manifestu i izvještaju opisuju stanje kandidata prije aktivacije.

## NUTRITION-CHART-EMPTY-STATE-03 — 15. 11. 2026.

- [x] ~~Nutrition brojači dana i dostupnih vrijednosti~~. Sedam praznih dana više ne sugerira sedam mjerenja; nula se broji, a više serija u istom danu broji se jednom.
- [x] ~~Vidljivi i pristupačni tekstovi~~. Usuglašeni prazni prikazi, summary i pristupačni nazivi; zadržani retci i oznake „nema podatka”. Generički brojači drugih grafikona zadržani su.
- [x] ~~Ciljane provjere i snimke~~. Chromium 11/11, tipovi i izdvojeni build prolaze; prazni i djelomični prikaz snimljeni su na desktopu i 390 px.

Kandidat `GPS-20261115-nutrition-chart-empty-03` pripremljen je za review. Ručna provjera čitačem zaslona nije provedena. Commit, push i aktivacija čekaju zasebno odobrenje.

### Aktivacija Nutrition Chart Empty State — 15. 11. 2026.

`GPS-20261115-nutrition-chart-empty-03` aktiviran je uz izričito korisničko odobrenje. Prethodni PID 20888 zaustavljen je prije isporuke. Novi PID 17152 sluša na 127.0.0.1:8787. Posluženo je 20/20 datoteka s odobrenim hashovima. SQLite v12 prolazi provjere integriteta i stranih veza, a sadržaj svih 36 tablica očuvan je. Health, Nutrition profil/dashboard i arhivirana zdravstvena povijest vraćaju HTTP 200. Prethodni frontend, kod i nova konzistentna kopija baze sačuvani su izvan rotacije. Ručna provjera čitačem zaslona ostaje otvorena. Novi zapis je `releases/GPS-20261115-nutrition-chart-empty-03/local-activation-20261115.json`; raniji statusi kandidata opisuju stanje prije aktivacije.

### NUTRITION-USDA-ENTRY-01 · spremno za pregled

U obrascu **Zalihe → Nova namirnica** moguće je pretražiti USDA, pregledati vrijednosti na 100 g i primijeniti ih prije spremanja. Zasebni USDA odjeljak otvara isti obrazac. Katalog razlikuje izvorne vrijednosti i lokalne korekcije, a ponovljeni FDC zapis traži svjestan izbor. Postojeći API za potvrđeni uvoz ostaje dostupan. Produkcijska aktivacija čeka zasebno odobrenje.

### Aktivacija USDA unosa · 15. 11. 2026.

GPS-20261115-nutrition-usda-entry-01 aktiviran je uz korisničko odobrenje. PID 8520, port 8787. Provjereno 20/20 frontend hashova, SQLite v12 i očuvanje 36 tablica. Python 122/122, ciljani Chromium 8/8, pnpm check i izdvojeni build prolaze. USDA provjere koriste simulirane odgovore. Evidencija je u releases/GPS-20261115-nutrition-usda-entry-01/local-activation.json.

### Jasnoća deklaracije i prijema namirnica · 16. 11. 2026.

Prag niske zalihe premješten je u opcionalne postavke s objašnjenjem i jedinicom. Obrazac razlikuje stanje deklaracije na 100 g od stvarne količine pri prijemu. Prijem prikazuje inventarnu jedinicu odabrane namirnice (g, ml ili kom). Implementirano u razvojnom kodu.

### AI Recipe Assistant · provjera prijedloga i novi pregled

Razvojna verzija prikazuje razlog odbijanja, provjerava količine odabranih lotova i nakon greške traži novi pregled i potvrdu. Commit i aktivacija su na čekanju.

### Aktivacija prehrane i AI recepata · 16. 11. 2026.

GPS-20261116-nutrition-ai-recovery-01 aktiviran je uz korisničko odobrenje. Uključuje jasnije jedinice prijema, opcionalni prag zaliha i AI dijagnostiku s novom potvrdom nakon greške. PID 7088, port 8787. Hashovi 20/20 frontend datoteka i sadržaj svih 36 tablica provjereni. SQLite v12, integritet i strane veze prolaze. Python 124/124, Chromium 6/6 na svježoj izoliranoj bazi, pnpm check i build prolaze. Prvi E2E pokušaj koristio je staru testnu bazu i pao na praznom stanju kupovine. Generiranje recepata provjereno je simuliranim odgovorima. Evidencija je u releases/GPS-20261116-nutrition-ai-recovery-01/local-activation.json.

### AI količine · usklađivanje izlazne sheme

Razvojni popravak usklađuje OpenAI quantity i portions s lokalnom preciznošću od 0,001 do 999999999,999 te prikazuje razlog nevaljane količine. Regresija reproducira raniju preširoku shemu. Spremno za provjeru, aktivacija nije provedena.

### Aktivacija AI količina · 16. 11. 2026.

GPS-20261116-ai-quantity-schema-01 aktiviran uz odobrenje. PID 39976, port 8787. Python 125/125 i pnpm check prolaze. Zadržan prethodno verificirani frontend, potvrđeno 20/20 hashova. SQLite v12 i sadržaj svih 36 tablica provjereni, integritet i strane veze prolaze. Stvarni plaćeni AI poziv nije izvršen. Evidencija je u releases/GPS-20261116-ai-quantity-schema-01/local-activation.json.

### Redizajn Prehrane · faze 0 i 1 · 20. 11. 2026.

- [x] Snimljeno polazište na commitu `e62c1c8` uz izdvojenu SQLite bazu i testne namirnice. Primitak već katalogizirane namirnice zahtijeva tri radnje nakon otvaranja odjeljka. Od Zaliha do potvrđenog kuhanja šest je radnji, a od gotovih porcija do evidencije doručka tri. Snimljeni su prikazi primitka, pregleda kuhanja i unosa obroka pri širinama 390 i 1440 px.
- [x] Uvedena četiri odredišta. Moj dan sadrži Pregled dana i Dnevnik, Kuhinja sadrži Recepte i Pripremu, a Zalihe sadrže Stanje zaliha i Kupovinu. Planer ima vlastito odredište. Provjereno je svih sedam postojećih poveznica, osvježavanje, povratak i naprijed u pregledniku te otvaranje odredišta tipkom Enter.
- [x] Referentni tok prije i poslije navigacijske izmjene daje 500 g nakon primitka i pregleda kuhanja, 200 g i pet porcija nakon potvrde te 200 g, četiri porcije i jedan zapis nakon evidentiranja doručka. U fazi 1 prošlo je svih 56 Playwright scenarija za Prehranu.
- [x] Faza 2 · objedinjeni Moj dan i Dnevnik. Evidentiraj obrok otvara zajednički obrazac bez pomicanja na 320, 390 i 1440 px. Obroci iz plana označeni su odvojeno od dnevničkih unosa. Trendovi i Profil i ciljevi imaju zasebne ulaze. Prečac s gotove porcije otvara obrazac s odabranom porcijom. Regresijski prolaz Prehrane, analitike i dashboarda završio je sa 100/100. Nakon završne dorade prikaza količine i razmaka ponovno je prošlo 6/6 scenarija redizajna, pnpm check i izdvojeni build.
- [x] Faza 3 · Zalihe i Kupovina. Početni prikaz prikazuje fizičko stanje po roku. Katalog, Povijest i Kupovina dostupni su iz navigacije Zaliha. Dovršen je tok Zaprimi namirnicu → Nova namirnica → povratak u primitak s odabranim zapisom.
- [x] Faza 4 · Planer, Recepti i Priprema. Planer prikazuje odabrani dan na mobitelu i svih sedam dana na računalu. Recept, kuhanje, gotove porcije i evidencija povezani su prečacima. AI recepti dostupni su u Kuhinji.
- [ ] Faza 5 · Pristupačnost, završna regresija i predaja kandidata na neovisni pregled, uključujući stvarni čitač zaslona.

Rad je započet prema sažetku razgovora Product Lab. Nakon što je izvorni plan postao dostupan u projektu, provjerene su faze 0 i 1 te je dovršen prvi MVP iz faze 2. Isporuka je u razvojnom kodu.


#### Provjera faze 3

- Na 390 px naziv je unesen jednom, USDA deklaracija ostala je na 100 g, a izvorna lokacija primitka sačuvana je pri povratku iz kataloga. Spremanje deklaracije stvorilo je nula stavki zalihe. Dvostruka potvrda poslala je jedan zahtjev i dodala točno 500 g.
- Kupovina koristi isti odabrani raspon za pregled i spremanje. Poslužitelj u istoj transakciji provjerava odgovara li izračun potvrđenom pregledu. Promjena zalihe odbila je stari manjak od 100 g, a novi pregled spremio je 50 g. Oznaka Kupljeno ažurirala je samo listu. Primitak 75 g za istu stavku koristio je stvarnu količinu i odabrani datum.
- Prošlo je 125 Python testova, pnpm check i izdvojeni build. U regresijskom prolazu prošlo je 60/61 Playwright scenarija za Prehranu. Scenarij za Kupovinu ponovljen je s odabirom polja datuma unutar pripadajuće stavke i prošao je u ciljanoj provjeri 4/4.
- Isporuka je u razvojnom kodu. Za pregled USDA korišteni su simulirani odgovori.

#### Provjera faze 4

- Na 390 px prikazuje se jedan dan uz birač od sedam dana. Na 1440 px vidljiv je cijeli tjedan. Odabir dana ažurira zajednički datum. Provjereni su uređivanje, kopiranje, promjena statusa, prečac na Kupovinu s prvim i posljednjim danom tjedna te unos obroka iz spremljene verzije recepta.
- Zakazivanje i pregled zadržavaju fizičku zalihu. Izračun raspoloživosti u pregledu grupira ponovljene sastojke i isključuje istekle lotove. Kuhanje ažurira zalihu tek pri potvrdi, a konzumacija gotove porcije smanjuje broj porcija i evidentira obrok.
- Spremljena verzija recepta ostaje dostupna za ranije zakazanu pripremu i planirani obrok. Pristup verziji koristi novu rutu samo za čitanje. Ovaj dio ne zahtijeva migraciju baze.
- Provjereni su pregled za slanje, privola, osvježavanje nakon neuspjeha i zadržavanje primljenih AI prijedloga u novom odredištu, sa simuliranim odgovorima.
- Prošlo je 126/126 Python testova i 104/104 Playwright scenarija. Prošli su pnpm check, izdvojeni Vite build i git diff --check. Faza je dostupna u razvojnom kodu.
- Dorada pregleda „Moj dan” prikazuje dnevnik i objedinjeni sažetak unosa. Raspored pripreme i gotove porcije dostupni su u Kuhinji, a upozorenja su u Zalihama i koriste aktualni datum zalihe. Prošlo je 18 ciljanih Playwright scenarija, pnpm check i izdvojeni build.
