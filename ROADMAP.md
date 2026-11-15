# Garmin Performance Studio — roadmap

## Smjer

Održavati jedan osobni Garmin pregled s jasnim dnevnim sažetkom, odvojenom analizom treninga i laboratorijem za detaljne trendove. Buduće ciljeve dodavati prema novim potrebama korisnika i nalazima iz stvarne upotrebe.

## Trenutačno stanje

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
