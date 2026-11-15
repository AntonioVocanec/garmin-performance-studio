# Garmin Performance Studio — evidencija izdanja

| Release ID | Datum | Status | Aplikacija | Git commit | SQLite |
| --- | --- | --- | --- | --- | --- |
| GPS-20261114-date-consistency-01 | 2026-11-14, priprema | READY_FOR_DEPLOYMENT | 1.0.0 | UNKNOWN | 11 |
| GPS-observed-DGAPXk-y | 2026-11-14, provjera postojeće produkcije | PRODUCTION_ACTIVE | 1.0.0 | UNKNOWN | 11 |
| GPS-20261114-git-normalization-01 | 2026-11-14, priprema | READY_FOR_DEPLOYMENT | 1.0.0 | UNKNOWN | 11 |

## GPS-20261114-date-consistency-01

Prehrana veže učitavanje energije uz odabrani datum, provjerava datume prije izračuna bilance i ponovno dohvaća potrošnju na ručno osvježavanje. Stvarna nula ostaje vidljiva. Raniji odgovor, pogrešno datiran odgovor i nepoznata vrijednost više ne prikazuju bilancu drugog dana. Promjena obuhvaća frontend. API ugovor i SQLite shema ostaju isti.

Regresijski test je na prethodnom buildu zatekao −300 kcal. Kandidat za novi datum prikazuje 300 kcal nakon dohvata. Python 100/100, Playwright Chromium 42/42, provjera tipova bez pogrešaka i upozorenja. Ponovljeni lokalni build dao je istih 20 datoteka. Ograničenja su izostanak prvog Git commita i provjera uz simulirane Garmin odgovore. Aktivacija ovog kandidata nije odobrena.

[Manifest kandidata](releases/GPS-20261114-date-consistency-01/release-manifest.json) · [Testirani frontend](releases/GPS-20261114-date-consistency-01/frontend.zip) · [Manifest prethodnog frontenda za povrat](releases/GPS-observed-DGAPXk-y/release-manifest.json)

## GPS-observed-DGAPXk-y

Identifikator je dodijeljen pri promatranju prethodno pokrenute produkcije. Meal Prep Preview / Commit i ispravak obrasca AI budžeta opisani su u prethodnoj verifikaciji. Na dan ovog izdanja na portu 8787 zatečen je PID 29328. Svih 20 posluženih statičkih datoteka odgovaralo je lokalnom produkcijskom buildu. OpenAPI odgovara izdvojenom backendu, a 18 backend izvora na disku odgovaralo je prethodnom manifestu. Izvorni datum pripreme i Git commit te kombinacije su UNKNOWN. Nakon ispravka budžeta prethodno je provjereno šest Nutrition E2E scenarija. Raniji rezultat od 38 E2E testova odnosi se na prethodnu Meal Prep kombinaciju.

Za ovaj frontend hotfix spremljen je zaseban statički paket za povrat, s provjerenim sadržajem prema HTTP odgovorima. Povrat na produkciji nije uvježbavan. Starija privatna arhiva prethodne aplikacije pripada drugom buildu. Ne koristiti je kao identičnu kopiju zatečene kombinacije.

[Manifest zatečenog stanja](releases/GPS-observed-DGAPXk-y/release-manifest.json) · [Prethodni frontend za povrat](releases/GPS-observed-DGAPXk-y/frontend.zip)

## Postupak za sljedeća izdanja

1. Za izdanje vezati pregledani Git commit, zaključane ovisnosti, verzije alata, popis izvora i SHA-256 svakog artefakta. Dok je stablo nepotpuno u Gitu, zabilježiti konkretne putanje i hash radne kopije. Status počinje kao `DEVELOPMENT`.
2. Testirati točne artefakte na izdvojenoj bazi. Nakon prolaza provjera spremiti nepromjenjivi manifest, binarni paket i rezultate uz isti Release ID. Evidentirati `READY_FOR_DEPLOYMENT`. Svaka naknadna izmjena izvora ili builda zahtijeva novu provjeru i novi identitet kandidata.
3. Manifeste i ovaj dnevnik verzionirati. Binarne pakete lokalno čuvati izvan Gita, a za dugoročnu isporuku prenijeti ih u odobreno privatno spremište artefakata. Prije upotrebe usporediti SHA-256 paketa i svih njegovih članova s manifestom.
4. Nakon zasebnog odobrenja provjeriti stvarni proces, backend, služene datoteke, API, shemu, integritet korisničkih podataka i osnovne korisničke tokove. Tek tada dodati zapis o aktivaciji sa statusom `PRODUCTION_ACTIVE` i referencom na odobrenje. Ako se aktivna kombinacija razlikuje, izraditi zaseban manifest zatečenog stanja. Ispravke povijesti dodavati kao nove zapise.
5. Kod neuspjele isporuke evidentirati `DEPLOYMENT_FAILED`, sačuvati dijagnostiku i provjeriti je li prethodni paket i dalje kompatibilan sa shemom. Za ovaj je hotfix opseg povrata prethodni frontend. Povrat baze zasebna je odluka koja mora uzeti u obzir novije korisničke zapise.

## Git audit i prvi pregledani commit

Grana `master` nema prvi commit, indeks je prazan i nema konfiguriranog remotea. Interne Codex reference postoje. One ne predstavljaju povijest izdanja. Projekt nema lokalnu datoteku `.gitattributes`. U manifestu kandidata navedene su pojedinačne putanje, njihov status i kontrolni sažeci.

- Pregledati `app.py`, `server.py`, sve Python izvore u `nutrition/` uključujući migracije, `frontend/`, `public/`, korijenski rezervni HTML, projektne skripte i testove. Zajedno uključiti definicije i zaključane verzije ovisnosti, build i Playwright konfiguraciju, pregledane upute i release dokumentaciju.
- `.gitignore` pokriva lokalne baze i prateće datoteke, sigurnosne kopije, privatne env datoteke, privitke, kalendare, ključeve, logove, lokalnu autentikaciju preglednika, privremene datoteke, buildove i binarne pakete izdanja. Iznimka za `.env.example` služi samo pregledanom predlošku.
- Prije prvog dodavanja pregledati sadržaj dokumenata, testnih podataka, URL-ova i predložaka. Koristiti izričit popis datoteka. Korisničke dokumente, snimke, nalaze i nepovezane materijale u zajedničkom direktoriju izostaviti. Pregledati cijeli pripremljeni diff i provesti provjeru tajni prije commita. Automatizirana provjera prepoznatljivih uzoraka ne obuhvaća sve vrste tajni i osobnih podataka.
- Nakon odobrenja izraditi prvi commit. U čistoj radnoj kopiji koristiti istu verziju Nodea, pnpm-a i Pythona, `pnpm install --frozen-lockfile` i izdvojeni build. Usporediti hash svake datoteke s manifestom. Python izravne ovisnosti imaju definirane verzije, puni tranzitivni Python lock zasad nedostaje. Git tag može označiti provjereni commit nakon uspostave te povijesti.

## GPS-20261114-git-normalization-01

Novi kandidat dokumentira Git pravila s LF završecima redaka i uklanjanje osam završnih razmaka iz dva HTML izvora i jednog CSS izvora. Normalizacija ostalih datoteka mijenja samo završetke redaka. Svelte nazivi stilskih klasa sada se temelje na relativnoj putanji komponente pa izdvojeni Git checkout daje jednak build. Prethodni kandidat i njegovi paketi sačuvani su bez izmjena. Usporedba buildova pokazuje promjenu generiranog `index.html`, glavnog JavaScript paketa i glavnog CSS paketa; ostalih 17 datoteka ima iste sažetke kao prethodni kandidat. Pripremljen je zaseban paket izvora i frontenda.

Dva povijesna release manifesta imaju zasebnu Git iznimku za očuvanje njihovih izvornih CRLF bajtova. Njihovi SHA-256 sažeci ostaju isti. Novi manifest i novi izvorni kod koriste LF.

Izolirane provjere nakon promjene završile su s 100/100 Python testova, 42/42 Playwright scenarija, bez Svelte/TypeScript pogrešaka ili upozorenja te s dva međusobno identična produkcijska builda od 20 datoteka. Produkcijska aktivacija nije provedena. Git commit još nije odobren za ovaj korak pa je `gitCommit` označen kao `UNKNOWN`. Stari zapis da je Git indeks bio prazan opisuje stanje prethodnog audita; u ovoj pripremi indeks sadrži datoteke za prvi commit.

[Novi manifest](releases/GPS-20261114-git-normalization-01/release-manifest.json) · [Novi frontend paket](releases/GPS-20261114-git-normalization-01/frontend.zip) · [Novi paket izvora](releases/GPS-20261114-git-normalization-01/source-inputs.zip)
