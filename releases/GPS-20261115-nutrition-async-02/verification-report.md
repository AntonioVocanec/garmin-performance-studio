# Nutrition Async — developer handoff i provjera

Task ID `NUTRITION-ASYNC-02`, 15. 11. 2026.
Polazišni commit `aad428f2a7634f01df67d65e826da2d6c05841af`.
Kandidat `GPS-20261115-nutrition-async-02` spreman je za review.

## Uzroci i popravci

- UX-R01, P2. Meal Prep callback mijenjao je sadržaj prije provjere konteksta i računao fingerprint iz izmijenjenog obrasca. Zahtjev sada dobiva vlastitu snimku tijela i opcionalnih sastojaka. Isti fingerprint prati njegov odgovor. Primjena zahtijeva aktualnu reviziju i podudaranje obrasca. Izmjena polja uklanja prethodni pregled. Potvrda kuhanja provjerava aktualni izvedivi pregled i postojeći token.
- UX-R02, P2. Callbackovi skaliranja, USDA i AI ranije su sami primjenjivali rezultat prije zajedničke provjere. Zajednički action sada poziva apply tek nakon provjere konteksta i ulaza. Isti uvjet vrijedi za poruke i pogreške. Učitavanje također provjerava reviziju i aktivni prikaz.
- Skaliranje prati recept/verziju, polja obrasca i datum. Promjena datuma ili polja čisti prikaz. USDA prati upit, AI prati odabrane lotove i potvrđeni previewId. Promjena konteksta poništava privremene preglede i potvrdu slanja. Već primljeni AI recepti ostaju dostupni nakon navigacije i imaju regresijski test.
- UX-R03, P2. Shopping odgovor sada prolazi provjeru cijelog niza i potrebnih polja. Tek nakon provjere izdvajaju se pozitivne količine. Nepotpuni, nevaljani, negativni i nekonačni ulazi daju hrvatsku pogrešku. Prethodni pregled uklanja se prije novog zahtjeva, pa nevaljan odgovor ne ostavlja gumb spremanja stare liste.

Novi frontend tip je ShoppingPreviewItem s količinom string ili number. Backend i SQLite shema zadržavaju postojeći ugovor; migracija nije potrebna.

## Izmijenjeni izvori

- `frontend/src/nutrition/NutritionShell.svelte`
- `frontend/src/lib/nutritionApi.ts`
- `tests/e2e/nutrition-async.spec.ts`, novi skup od 28 scenarija
- `tests/e2e/nutrition-date.spec.ts` i `tests/e2e/nutrition-ux.spec.ts`, potvrda promjene datuma izlaskom iz polja tipkom Tab
- ROADMAP i evidencija isporuka

## Reprodukcija prije popravka

Tri nova testa pala su na prethodnoj implementaciji prije izmjene aplikacijskog koda.

1. meal prep delayed result respects portions — stari pregled ostao je prisutan nakon izmjene porcija.
2. scaling delayed result respects date — rezultat od 777 porcija prikazan je nakon promjene datuma.
3. shopping rejects malformed response invalid — nevaljana količina nije proizvela očekivanu pogrešku.

## Završne provjere

- Puni Playwright skup u Chromiumu prolazi 82/82.
- Nutrition skup u Firefoxu prolazi 41/41.
- Nutrition skup u WebKitu prolazi 41/41.
- Završni prolazi imaju 0 preskočenih, 0 neočekivanih rezultata i 0 nestabilnih testova.
- pnpm check završio je bez grešaka i upozorenja.
- Produkcijski Vite build uspješno je izrađen u izdvojenom direktoriju.
- Provjereno podudaranje svih 87 programskih, konfiguracijskih i testnih ulaza između radne kopije i testne kopije.
- Sve tri izdvojene baze prolaze integrity_check i foreign_key_check.
- git diff --check prolazi.

Nova pokrivenost obuhvaća datum i povratak na datum, recept, porcije, opcionalne sastojke, masu, lokaciju, rok, navigaciju, novi preview nakon odbačenog odgovora i ispravan odgovor bez izmjene. Pokriveni su skaliranje, USDA upit, promjena lotova tijekom AI pregleda/generiranja, očuvanje već primljenog recepta, neispravni shopping nizovi i stavke, stvarna nula i pozitivna decimalna količina.

Puni skup uključuje postojeći stvarni Nutrition tijek na izmišljenim lokalnim podacima, mobilni raspored, tipkovnicu, grafove, povijest navigacije i PWA.

## Testno okruženje i ograničenja

Testovi su radili u `tmp/analytics-verification-20261115` bez .env/.env.local, s odvojenim bazama za Chromium, Firefox i WebKit. Svi AI i USDA odgovori u novim scenarijima su simulirani. Konfiguracije i njihove putanje nalaze se u paketu verification-configs.zip; rezultati i hashovi logova u verification-results.json.

Prvi WebKit pokušaj pokazao je nedeterminističan testni tijek uz service worker i neprimijenjen datum tijekom uređivanja polja. Za determinističko presretanje mrežnih zahtjeva Nutrition scenariji koriste serviceWorkers block. Testovi datum potvrđuju izlaskom iz polja, jer promjena teksta polja i potvrđena promjena datuma u WebKitu imaju različite događaje. Završni WebKit skup prolazi nakon tih prilagodbi testnog okruženja. PWA ponašanje pokriveno je punim Chromium skupom.

Ručna provjera stvarnim čitačem zaslona ostaje neizvršena. Nije pronađena aktivna NVDA sesija ni izvršna datoteka na uobičajenim instalacijskim putanjama. Automatska provjera pristupačnih opisa i tipkovnice uključena je u postojeće testove.

Python skup nije pokretan jer aplikacijski backend nije mijenjan. WebKit rezultat odnosi se na Playwright WebKit engine.

Potvrđene serverske radnje zadržavaju svoj rezultat na serveru i ako korisnik tijekom zahtjeva promijeni prikaz. Provjera konteksta upravlja primjenom odgovora u sučelju.

## Release status

Novi kandidat nije aktiviran. Statička provjera portala na 8787 potvrdila je 20/20 hashova prethodne verzije GPS-20261115-nutrition-ux-01 i health HTTP 200, uz PID 8816. Korisnička baza nije korištena za testne upise, a produkcijski proces i dist nisu mijenjani tijekom ovog zadatka.

Novi manifest koristi LF i sadrži stvarne hashove izvora, svih 20 build datoteka, paketa i rezultata. Povijesni manifesti i release paketi sačuvani su. Commit, push i aktivacija novog kandidata čekaju zasebno odobrenje.
