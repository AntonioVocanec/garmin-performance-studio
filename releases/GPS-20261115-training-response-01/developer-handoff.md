# Developer Handoff — zdravstvena i trening analitika

Task ID: GPS-ANALYTICS-F1 do GPS-ANALYTICS-F5. Završni Release ID: `GPS-20261115-training-response-01`. Status: `READY_FOR_DEPLOYMENT`, neovisni review `PENDING`, aktivacija nije odobrena.

Baseline commit: `7b95de340e2d503939099a5f245299ec7743a827`. Novi kod je u radnom stablu i nije commitiran. Prethodno pripremljeni indeks s auditom čistog checkouta sačuvan je. Za pregled koristiti radni diff i nove datoteke, ne samo staged diff.

## Problem i isporučeno ponašanje

1. Kontrola raspona prethodno je samo filtrirala uglavnom 56 dana već dohvaćenih vrijednosti. Sada zdravstvena povijest ima lokalna opažanja i pokrivenost po izvoru/danu, postupni dohvat do 365 dana, granicu 14 dana po zahtjevu i prekid na HTTP 429. Nula se razlikuje od odsutnog mjerenja, a stariji odgovor ne prepisuje noviji zapis.
2. Postojeći signali oporavka bili su razasuti. Dodatni prikaz donosi šest doprinosa s datumom, izvorom i pokrivenošću. Medijan je dostupan s najmanje 7 dana osobne baze. Stariji fallback iz drugog dana ne ulazi u novi prikaz. Sleep Debt koristi postojeći obračun s napovima.
3. Prehrambeni trendovi nisu imali dnevni trening kontekst. Nova lokalna analitika povezuje potvrđene dnevnike i tada važeće ciljeve s donjom/gornjom trećinom potpunog Garmin loada; za grupni sažetak treba najmanje 5 dana u obje grupe. Sauna i nedovršeni današnji dan ne ulaze u grupiranje. Sljedeći HRV, puls i san povezuju se s datumom D+1.
4. Dostupni detalji aktivnosti nisu nudili odabir više trčanja. Nova pretraga arhive, prijedlozi istog podtipa unutar ±10 % udaljenosti te usporedba 2–5 aktivnosti koriste postojeće izvore. Preklapanje vremenskih nizova dostupno je ako Garmin vrati uzorke. Potvrda rute je korisnička; GPS identitet nije utvrđen.
5. RPE je bio ograničen na tjedni prosjek. Nova analitika prikazuje RPE uz trajanje i load, sport i broj zapisa te zasebni dnevni umor na datume D i D+1. Vrijeme upisa umora ne dokazuje jutarnje mjerenje. Sauna je isključena, a nedovoljni uzorci nemaju brojčani grupni sažetak.

## Kod i ugovori

- `studio_analytics/health.py`: arhiva, provjera raspona, dohvat dijela, datumska pokrivenost i sažeci aktivnosti.
- `studio_analytics/recovery.py`: odvojeni doprinosi i provjera pripadnosti dana.
- `studio_analytics/training.py`: lokalni spojevi dnevnika, treninga i sljedećeg datuma; RPE i dnevni umor.
- `studio_analytics/running.py`: prijedlozi i usporedba odabranih trčanja.
- `studio_analytics/routes.py`: tipizirani ulazi i dodatni `/api/analytics` ugovori.
- `studio_analytics/migrations.py`: aditivna v12; postojeći runner ostaje u `server.py`.
- `frontend/src/analytics/`: zasebni Svelte prikazi zdravstvene povijesti, doprinosa, prehrane/treninga, usporedbe trčanja i odgovora na trening.
- Integracija: `app.py`, `server.py`, `frontend/src/main.ts`, `frontend/src/lib/analyticsApi.ts`, `frontend/src/lib/charts.ts`, `frontend/src/legacy/dashboard.ts`, `frontend/src/nutrition/NutritionShell.svelte` i `frontend/index.html`.

API: `GET /api/analytics/health`, `POST /api/analytics/health/fetch`, `GET /api/analytics/nutrition-training`, `GET /api/analytics/activities`, `POST /api/analytics/running-comparison`, `GET /api/analytics/training-response`. Postojeći ugovori su podržani; dashboard ima dodatno polje `normalized.recoveryContributions`.

## Provjere

Završna kombinacija provjerena je u `tmp/analytics-verification-20261115`, bez privatnih env datoteka i produkcijske baze. Instalacija koristi postojeći `pnpm-lock.yaml`; nema novih ovisnosti. Python 120/120 PASS, Playwright Chromium 49/49 PASS, `pnpm check` 0 pogrešaka/upozorenja i izdvojeni build PASS. Svih 85 programskih/konfiguracijskih/testnih ulaza iz završnog paketa podudara se s provjerenom radnom kopijom, kao i svih 20 build artefakata.

Dodano je 20 Python testova i 7 E2E scenarija. Pokrivaju praznine i nulu, 365-dnevni raspon, neuspjele i djelomične izvore, HTTP 429, stariji odgovor, medijane s premalo uzoraka, napove bez ponovnog oduzimanja, datume D/D+1, trećine loada, nepotvrđene dnevnike, saunu, više treninga istog dana, odabir trčanja, nedostajuće metrike, API validaciju, mobilnu širinu i zakašnjele odgovore. Nadogradnja v11 → v12 testirana je s postojećim nutritivnim snapshotom i provjerenom kopijom v11; namjerno prekinuta migracija vraća DDL i čuva v11.

Python prikazuje postojeći ResourceWarning pri čišćenju simuliranog HTTPError 429 iz ranijeg laboratorijskog testa; skup je uspješan. Stvarni Garmin/Runna i plaćeni API pozivi nisu pokretani.

## Kontrolni sažeci i zaštita produkcije

- Manifest: `05bd7878841788a3f7f6e534e4a974d5e1cb1b21df9eafd671fafaa34baabe8c`.
- Frontend ZIP: `f9a83ddbe5367cc88d3e859ddc09b61d682f2aa6d58bb0ab037e7bd098409bf1`.
- Izvorni ZIP: `c5fbda1d191b3eaae03faa08169b31d0987ee94737bb1e17255c02fdd825b383`.

Povijesni manifesti i audit čistog checkouta imaju izvorne SHA-256 vrijednosti. Svih pet parova novih ZIP paketa provjereno je prema manifestima i sadržaju članova. Korisnička baza ostaje v11, bez novih zdravstvenih tablica; produkcijski `dist` odgovara zabilježenom starom buildu. Portovi 8787 i 8878 su nakon testova bez poslužitelja.

## Ograničenja i pitanja za review

- Ranija sigurnosna blokada nije razriješena. Ovaj pokušaj popravljanja starih junction poveznica u korijenskom `node_modules` također je odbijen (`blocked by policy`); nije ponovljen drugim putem. Razvojni paketi u korijenu zato i dalje mogu biti neupotrebljivi. Zasebna instalacija u testnom direktoriju prošla je sve provjere.
- Stvarna godišnja dostupnost svake Garmin serije ovisi o računu i API izvoru. Testovi dokazuju obradu simuliranih oblika i kvarova, ne dostupnost svih korisnikovih mjerenja.
- Potpunost dana prehrane potvrđuje korisnik. Nedovoljan broj takvih dana znači da usporedba još neće imati grupne rezultate.
- Podvrsta treninga poput intervala/dužine ne zaključuje se iz naziva. GPS grupiranje, vrijeme i podloga nisu implementirani u ovoj verziji.
- Prije aktivacije reviewer treba provjeriti konzervativno računanje pokrivenosti djelomičnih izvora, logiku pragova i jednakih loadova, prikaz različitih dana, način odabira referentnog trčanja te oporavak migracije u stvarnom release postupku.
- Aktivacija zahtijeva zasebno odobrenje, novu konzistentnu kopiju baze i zajedničku isporuku kandidata backenda i frontenda. Kandidat pri pokretanju traži v12. Stari v11 backend nije kompatibilan s v12 bazom; bazu ne vraćati automatski ako nastanu novi korisnički zapisi.

Ovaj izvještaj je developerska predaja. Ne predstavlja neovisno odobrenje koda ni odobrenje produkcijske aktivacije.
