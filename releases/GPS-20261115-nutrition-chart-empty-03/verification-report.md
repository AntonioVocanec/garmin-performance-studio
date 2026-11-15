# NUTRITION-CHART-EMPTY-STATE-03 — predaja za review

Prioritet P3. Implementacija pripremljena 15. 11. 2026.
Polazišni commit `4f9e669a96a6ee0816211a0d26ce845978628d64`.

## Uzrok i rješenje

Zajednička tablica prikazivala je broj redaka kao broj zapisa. U Nutrition povijesti svaki redak predstavlja dan, uključujući dane bez vrijednosti. Nutrition renderer sada dobiva eksplicitni način days i računa broj redaka te broj dana s barem jednom valjanom vrijednošću nakon postojeće normalizacije.

Oznake su „Nema dana za prikaz”, „7 dana · bez dostupnih vrijednosti”, „7 dana · 3 dana s vrijednostima”, „7 dana · svi dani imaju dostupne vrijednosti” i „1 dan · bez dostupnih vrijednosti”. Nula je dostupna vrijednost. Više dostupnih serija istoga retka povećava broj dostupnih dana samo jednom.

Opcionalni summaryLabel u zajedničkoj tablici dopušta Nutrition oznaku. Ostali pozivi zadržavaju broj zapisa. Renderirani i prazni Nutrition prikazi dobivaju istu informaciju o pokrivenosti u pristupačnom nazivu. Prazan prikaz s jednom vrijednošću dodatno objašnjava da su za graf potrebna dva dana s vrijednostima. Sve retke i ćelije „nema podatka” zadržava postojeća tablica.

Nutrition naziv energetskog grafikona u rendereru skraćen je na „Unos i potrošnja”, kako broj dana u summaryju ne bi bio ponovljen. Naslov kartice i dalje opisuje razdoblje od 7 dana. Nutrition summary koristi 12 px i line-height 1.5 radi čitljivosti na mobitelu.

## Datoteke i diff

- frontend/src/lib/charts.ts
- frontend/src/nutrition/NutritionCharts.svelte
- frontend/src/nutrition/nutrition.css
- tests/e2e/nutrition-ux.spec.ts

`implementation.diff` sadrži diff tih četiriju datoteka prema polazišnom commitu. ROADMAP i RELEASES sadrže odvojene dopune evidencije.

## Izvršene provjere

- pnpm check prolazi s 0 pogrešaka i 0 upozorenja.
- Izdvojeni produkcijski build prolazi.
- Ciljani Chromium Playwright prolazi 11/11, uz 0 preskočenih, 0 neočekivanih i 0 nestabilnih rezultata.
- Sedam novih scenarija pokriva sve tražene oznake, nulu, nedostajuće i nevaljane vrijednosti, zasebnu vrijednost samo u seriji potrošnje, brojanje dana jednom, sva tri Nutrition grafikona i osvježavanje nakon datuma/podkartice.
- Četiri postojeća scenarija potvrđuju hrvatske opise i tablicu, generički brojač „San · 2 zapisa” i CSV, odabir datuma tipkovnicom te izolaciju hovera.
- Širine 1280 i 390 px prolaze provjeru bez horizontalnog prelijevanja dokumenta. Snimke obuhvaćaju proširenu tablicu, a mobilne snimke su vizualno pregledane.
- Svih 87 programskih, konfiguracijskih i testnih ulaza podudara se između radne i izdvojene kopije.

Prvi prolaz otkrio je da simulirani Garmin odgovor nije nosio datum zahtjeva, zbog čega ga je postojeća zaštita ispravno odbacila. Testni odgovor je ispravljen. Završni prolaz iznad koristi aktualni kod i ispravljene simulacije.

Testna kopija je `tmp/analytics-verification-20261115`, port 8878, svježa baza `tmp/nutrition-chart-empty-163839/test.sqlite3` unutar kopije. Privatne .env datoteke odsutne su. Odgovori prikazanih grafikona i kontekst aktivnosti potječu iz sintetičkih fixture podataka.

`verification-config.ts` je zapis stvarno korištene izdvojene konfiguracije. Za ponovno izvođenje kopira se u korijen nove izolirane kopije uz playwright.config.ts, a putanje baze i sigurnosnih kopija usmjere se na nove testne putanje.

## Snimke

U mapi screenshots nalaze se četiri PNG datoteke.

- nutrition-all-missing-1280.png
- nutrition-all-missing-390.png
- nutrition-partial-1280.png
- nutrition-partial-390.png

## Ograničenja i status

Ručna provjera stvarnim čitačem zaslona nije provedena. Pristupačni nazivi i postojeća tipkovnička interakcija provjereni su automatizirano. Ovaj zadatak obuhvaća ciljane Chromium scenarije; puni skup i drugi preglednici nisu ponovno pokretani.

API ugovor, nutritivni izračuni i pohranjeni podaci ostali su izvan zahvata. Python testovi nisu pokretani jer backend nije mijenjan. Novi kandidat spremljen je u frontend.zip i release-manifest.json za review. Commit, push i aktivacija čekaju zasebno korisničko odobrenje.
