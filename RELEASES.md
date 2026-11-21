# Garmin Performance Studio — evidencija izdanja

| Release ID | Datum | Status | Aplikacija | Git commit | SQLite |
| --- | --- | --- | --- | --- | --- |
| GPS-20261114-date-consistency-01 | 2026-11-14, priprema | READY_FOR_DEPLOYMENT | 1.0.0 | UNKNOWN | 11 |
| GPS-observed-DGAPXk-y | 2026-11-14, provjera postojeće produkcije | PRODUCTION_ACTIVE | 1.0.0 | UNKNOWN | 11 |
| GPS-20261114-git-normalization-01 | 2026-11-14, priprema; 2026-11-15, audit | READY_FOR_DEPLOYMENT | 1.0.0 | `7b95de3` (naknadni audit) | 11 |

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

U izvornom auditu prije 15. 11. 2026. grana `master` nije imala prvi commit, indeks je bio prazan, remote nije bio konfiguriran i projekt nije imao `.gitattributes`. Interne Codex reference nisu predstavljale povijest izdanja. Sljedeće stavke bilježe tadašnji plan; trenutačno Git stanje i rezultate naknadne provjere navodi zaseban odjeljak na kraju dokumenta.

- Pregledati `app.py`, `server.py`, sve Python izvore u `nutrition/` uključujući migracije, `frontend/`, `public/`, korijenski rezervni HTML, projektne skripte i testove. Zajedno uključiti definicije i zaključane verzije ovisnosti, build i Playwright konfiguraciju, pregledane upute i release dokumentaciju.
- `.gitignore` pokriva lokalne baze i prateće datoteke, sigurnosne kopije, privatne env datoteke, privitke, kalendare, ključeve, logove, lokalnu autentikaciju preglednika, privremene datoteke, buildove i binarne pakete izdanja. Iznimka za `.env.example` služi samo pregledanom predlošku.
- Prije prvog dodavanja pregledati sadržaj dokumenata, testnih podataka, URL-ova i predložaka. Koristiti izričit popis datoteka. Korisničke dokumente, snimke, nalaze i nepovezane materijale u zajedničkom direktoriju izostaviti. Pregledati cijeli pripremljeni diff i provesti provjeru tajni prije commita. Automatizirana provjera prepoznatljivih uzoraka ne obuhvaća sve vrste tajni i osobnih podataka.
- Nakon odobrenja izraditi prvi commit. U čistoj radnoj kopiji koristiti istu verziju Nodea, pnpm-a i Pythona, `pnpm install --frozen-lockfile` i izdvojeni build. Usporediti hash svake datoteke s manifestom. Python izravne ovisnosti imaju definirane verzije, puni tranzitivni Python lock zasad nedostaje. Git tag može označiti provjereni commit nakon uspostave te povijesti.

## GPS-20261114-git-normalization-01

Novi kandidat dokumentira Git pravila s LF završecima redaka i uklanjanje osam završnih razmaka iz dva HTML izvora i jednog CSS izvora. Normalizacija ostalih datoteka mijenja samo završetke redaka. Svelte nazivi stilskih klasa sada se temelje na relativnoj putanji komponente pa izdvojeni Git checkout daje jednak build. Prethodni kandidat i njegovi paketi sačuvani su bez izmjena. Usporedba buildova pokazuje promjenu generiranog `index.html`, glavnog JavaScript paketa i glavnog CSS paketa; ostalih 17 datoteka ima iste sažetke kao prethodni kandidat. Pripremljen je zaseban paket izvora i frontenda.

Dva povijesna release manifesta imaju zasebnu Git iznimku za očuvanje njihovih izvornih CRLF bajtova. Njihovi SHA-256 sažeci ostaju isti. Novi manifest i novi izvorni kod koriste LF.

Izolirane provjere nakon promjene završile su s 100/100 Python testova, 42/42 Playwright scenarija, bez Svelte/TypeScript pogrešaka ili upozorenja te s dva međusobno identična produkcijska builda od 20 datoteka. Produkcijska aktivacija nije provedena. Manifest je nastao prije prvog Git commita i zato zadržava tada točan `gitCommit: UNKNOWN`; naknadni audit niže povezuje njegov neizmijenjeni sadržaj s commitom.

[Novi manifest](releases/GPS-20261114-git-normalization-01/release-manifest.json) · [Novi frontend paket](releases/GPS-20261114-git-normalization-01/frontend.zip) · [Novi paket izvora](releases/GPS-20261114-git-normalization-01/source-inputs.zip)

## Git baseline i provjera čistog checkouta — 15. 11. 2026.

Prvi lokalni commit `7b95de340e2d503939099a5f245299ec7743a827` sadrži 73 provjerene datoteke. U trenutku provjere grana je `master`, izvorno radno stablo i izdvojeni checkout su čisti, a izvorni repozitorij nema konfiguriran remote. `.gitattributes` je dio commita. Povijesni release manifesti nisu mijenjani; zapis `UNKNOWN` u manifestu kandidata opisuje stanje pri njegovoj pripremi, a ovaj dodatni audit bilježi kasniju vezu s commitom.

Izdvojeni checkout iz tog commita potvrđen je usporedbom SHA-256 svih 72 izvornih datoteka iz manifesta. Instalacija `pnpm install --frozen-lockfile` prošla je uz sigurnosnu provjeru 79 unosa. Prvi pokušaj bez mreže nije završio jer lokalnoj predmemoriji nedostaju metapodaci za istu provjeru; sigurnosna provjera nije preskočena. Python regresijski skup prošao je 100/100, Playwright Chromium na izdvojenoj bazi 42/42, `pnpm check` ima 0 pogrešaka i 0 upozorenja, a produkcijski build odgovara manifestu u svih 20 datoteka.

Kontrolni sažeci: neizmijenjeni manifest kandidata `220d09f5e996686b0913902d9940b8884464a3b0bdf999a9c2dd212299f854bb`; paket izvora `f72cf162d54f179cb1e9c9cf1e5c1f474be952b1d7f1a00e26eccd6c8a49b3e0`; frontend paket `92781236df74a4a19e9779f427007ccde8b1139139ccda2000a91ec4703a5fb4`. Zasebni audit zapis ima SHA-256 `3946f5fd128c5031c7c5eb6389ce0c091e520be159fafee8f69bc53804c2654c` i nastao je jednokratnim upisom; prethodni manifesti nisu prepisani. SHA-256 i atribut samo za čitanje omogućuju otkrivanje i otežavaju slučajnu izmjenu, ali nisu kriptografski potpis. Uključivanje audita u novi Git commit zahtijeva zasebno odobrenje.

Lokalna korisnička baza očitana je samo za čitanje i ostaje na SQLite v11. Na portu 8787 nije zatečen aktivan poslužitelj; ova provjera ne dokazuje aktualno produkcijsko posluživanje niti aktivira kandidata. Pythonove tranzitivne ovisnosti nisu potpuno zaključane.

[Audit čistog checkouta](releases/GPS-20261114-git-normalization-01/audit-20261115-clean-checkout-7b95de3.json)

## GPS-20261115-health-history-01

Lokalno provjerena faza 1. Python 104 testova i ciljani Playwright 1 scenarija prolaze; tipovi i izdvojeni build prolaze. Kandidat v12 nije aktiviran na korisničkoj bazi v11. Neovisni review čeka. [Manifest](releases/GPS-20261115-health-history-01/release-manifest.json).

## GPS-20261115-recovery-contributions-01

Lokalno provjerena faza 2. Python 106 testova i ciljani Playwright 2 scenarija prolaze; tipovi i izdvojeni build prolaze. Kandidat v12 nije aktiviran na korisničkoj bazi v11. Neovisni review čeka. [Manifest](releases/GPS-20261115-recovery-contributions-01/release-manifest.json).

## GPS-20261115-nutrition-training-01

Lokalno provjerena faza 3. Python 109 testova i ciljani Playwright 3 scenarija prolaze; tipovi i izdvojeni build prolaze. Kandidat v12 nije aktiviran na korisničkoj bazi v11. Neovisni review čeka. [Manifest](releases/GPS-20261115-nutrition-training-01/release-manifest.json).

## GPS-20261115-running-comparison-01

Lokalno provjerena faza 4. Python 111 testova i ciljani Playwright 4 scenarija prolaze; tipovi i izdvojeni build prolaze. Kandidat v12 nije aktiviran na korisničkoj bazi v11. Neovisni review čeka. [Manifest](releases/GPS-20261115-running-comparison-01/release-manifest.json).

## GPS-20261115-training-response-01

Lokalno provjerena faza 5. Python 120 testova i puni Playwright 49 scenarija prolaze; tipovi i izdvojeni build prolaze. Kandidat v12 nije aktiviran na korisničkoj bazi v11. Neovisni review čeka. [Manifest](releases/GPS-20261115-training-response-01/release-manifest.json).

Završni kandidat obuhvaća svih pet faza. [Developer Handoff](releases/GPS-20261115-training-response-01/developer-handoff.md). Puni rezultat: 120 Python testova i 49 E2E scenarija.

## Produkcijska aktivacija — 15. 11. 2026.

`GPS-20261115-training-response-01` je `PRODUCTION_ACTIVE`, PID 4308, port 8787, SQLite v12, nakon izričitog korisničkog odobrenja. Migracija je sačuvala svih 32 postojećih tablica; nakon pokretanja i stvarne Garmin sinkronizacije svih 30 zaštićenih tablica ostalo je neizmijenjeno. Posluženo je 20/20 provjerenih frontend datoteka, Garmin 20/20 izvora, Nutrition i analitički API rade. [Zapis aktivacije](releases/GPS-20261115-training-response-01/production-activation-20261115.json). Povijesni manifest kandidata sačuvan je bez izmjene.

## GPS-20261115-nutrition-ux-01

Kandidat zadatka `NUTRITION-UX-AUDIT-01` pripremljen je u izdvojenom okruženju. Nutrition E2E 10/10, grafovi 2/2, dodatna provjera tipkovnice 1/1. pnpm check i produkcijski build prolaze. Manifest i izvještaj nalaze se u istoimenoj release mapi. Izvori su radna kopija nad commitom `7b84b0b8145d06ec1565c3623f939d3412417f7b`, uključujući ranije provjereni hover popravak. Aktivacija, commit i push čekaju zasebno odobrenje za ovaj zadatak.

### Aktivacija Nutrition UX — 15. 11. 2026.

`GPS-20261115-nutrition-ux-01` aktiviran je uz izričito odobrenje korisnika. Prethodni server PID 37860 zaustavljen je prije isporuke. Novi PID 8816 sluša na 127.0.0.1:8787. Provjereno je svih 20 posluženih frontend hashova, SQLite v12, integritet, strane veze i očuvanje sadržaja svih 36 tablica. Nutrition profil, dashboard i arhivirana zdravstvena povijest vraćaju HTTP 200. Sačuvani su prethodni frontend i konzistentna kopija baze izvan rotacije. Kandidatov manifest i raniji izvještaj opisuju stanje prije aktivacije; novi zapis je `releases/GPS-20261115-nutrition-ux-01/local-activation-20261115.json`.

## GPS-20261115-nutrition-async-02

Kandidat nad commitom `aad428f2a7634f01df67d65e826da2d6c05841af` rješava UX-R01/R02/R03. Tri pada reproducirana su prije popravka. Završna provjera daje Chromium 82/82, Nutrition Firefox 41/41 i WebKit 41/41; tipovi i izdvojeni build prolaze. Manifest, paketi, rezultati i izvještaj nalaze se u istoimenoj release mapi. Ručna provjera čitačem zaslona ostaje otvorena. Kandidat čeka review i zasebno odobrenje za commit, push i aktivaciju. Postojeća aktivna verzija na portu 8787 ostaje GPS-20261115-nutrition-ux-01.

### Aktivacija Nutrition Async — 15. 11. 2026.

`GPS-20261115-nutrition-async-02` aktiviran je uz korisničko odobrenje. Prethodni PID 8816 zaustavljen je prije isporuke, novi PID 20888 sluša na 127.0.0.1:8787. Posluženi hashovi odgovaraju paketu 20/20. SQLite v12 prolazi integritet i strane veze, a sadržaj svih 36 tablica očuvan je. Nutrition profil/dashboard, arhivirana zdravstvena povijest i /api/openapi.json vraćaju HTTP 200. Sačuvani su prethodni frontend, izvorni kod prethodnog commita i konzistentna kopija baze izvan rotacije. Ručna provjera čitačem zaslona ostaje otvorena. Zapis je `releases/GPS-20261115-nutrition-async-02/local-activation-20261115.json`. Raniji statusi čekanja u manifestu i izvještaju opisuju stanje kandidata prije aktivacije.

## GPS-20261115-nutrition-chart-empty-03

Kandidat zadatka `NUTRITION-CHART-EMPTY-STATE-03` razlikuje prikazane dane od dana s dostupnim vrijednostima. Chromium 11/11, pnpm check i izdvojeni build prolaze. Diff, rezultati, četiri snimke i manifest nalaze se u istoimenoj release mapi. Pripremljeno za review; commit, push i aktivacija čekaju zasebno odobrenje.

### Aktivacija Nutrition Chart Empty State — 15. 11. 2026.

`GPS-20261115-nutrition-chart-empty-03` aktiviran je uz izričito korisničko odobrenje. Prethodni PID 20888 zaustavljen je prije isporuke. Novi PID 17152 sluša na 127.0.0.1:8787. Posluženo je 20/20 datoteka s odobrenim hashovima. SQLite v12 prolazi provjere integriteta i stranih veza, a sadržaj svih 36 tablica očuvan je. Health, Nutrition profil/dashboard i arhivirana zdravstvena povijest vraćaju HTTP 200. Prethodni frontend, kod i nova konzistentna kopija baze sačuvani su izvan rotacije. Ručna provjera čitačem zaslona ostaje otvorena. Novi zapis je `releases/GPS-20261115-nutrition-chart-empty-03/local-activation-20261115.json`; raniji statusi kandidata opisuju stanje prije aktivacije.

### Aktivacija USDA unosa · 15. 11. 2026.

GPS-20261115-nutrition-usda-entry-01 aktiviran je uz korisničko odobrenje. PID 8520, port 8787. Provjereno 20/20 frontend hashova, SQLite v12 i očuvanje 36 tablica. Python 122/122, ciljani Chromium 8/8, pnpm check i izdvojeni build prolaze. USDA provjere koriste simulirane odgovore. Evidencija je u releases/GPS-20261115-nutrition-usda-entry-01/local-activation.json.

### Aktivacija prehrane i AI recepata · 16. 11. 2026.

GPS-20261116-nutrition-ai-recovery-01 aktiviran je uz korisničko odobrenje. Uključuje jasnije jedinice prijema, opcionalni prag zaliha i AI dijagnostiku s novom potvrdom nakon greške. PID 7088, port 8787. Hashovi 20/20 frontend datoteka i sadržaj svih 36 tablica provjereni. SQLite v12, integritet i strane veze prolaze. Python 124/124, Chromium 6/6 na svježoj izoliranoj bazi, pnpm check i build prolaze. Prvi E2E pokušaj koristio je staru testnu bazu i pao na praznom stanju kupovine. Generiranje recepata provjereno je simuliranim odgovorima. Evidencija je u releases/GPS-20261116-nutrition-ai-recovery-01/local-activation.json.

### Aktivacija AI količina · 16. 11. 2026.

GPS-20261116-ai-quantity-schema-01 aktiviran uz odobrenje. PID 39976, port 8787. Python 125/125 i pnpm check prolaze. Zadržan prethodno verificirani frontend, potvrđeno 20/20 hashova. SQLite v12 i sadržaj svih 36 tablica provjereni, integritet i strane veze prolaze. Stvarni plaćeni AI poziv nije izvršen. Evidencija je u releases/GPS-20261116-ai-quantity-schema-01/local-activation.json.

## GPS-20261120-nutrition-redesign-01

Aktiviran je redizajn Prehrane do faze 4. Kod je u commitu `45775783401d10d0f37bc665d3166985dbd66009`. PID 38696 sluša na 127.0.0.1:8787. Provjereni su Tailscale HTTPS, 20/20 posluženih frontend datoteka, 14 HTTP provjera i Chromium prikaz na produkcijskom buildu. SQLite v12 prolazi integritet i provjeru stranih ključeva. Očuvan je sadržaj svih 36 tablica i izrađena je konzistentna sigurnosna kopija izvan rotacije. Izolirane provjere obuhvaćaju 126 Python testova, 104 Playwright scenarija, pnpm check i produkcijski build. Provjera stvarnim čitačem zaslona pripada fazi 5. [Manifest](releases/GPS-20261120-nutrition-redesign-01/release-manifest.json) · [Zapis aktivacije](releases/GPS-20261120-nutrition-redesign-01/local-activation.json).

## GPS-20261121-nutrition-my-day-01

Dorada „Moj dan” aktivirana je na portu 8787. Nakon prestanka prethodnog procesa servis je pokrenut s PID-om 16368. Novi prikaz objedinjuje energiju i makronutrijente. Upozorenja se prikazuju u Zalihama. Provjereno je 20/20 frontend datoteka, jedan Chromium scenarij na aktivnom servisu i Tailscale HTTPS. SQLite v12 prolazi provjeru integriteta i stranih ključeva. Sadržaj svih 36 tablica očuvan je. U izdvojenom okruženju prošli su 18 ciljanih Playwright scenarija, pnpm check i build. [Manifest](releases/GPS-20261121-nutrition-my-day-01/release-manifest.json) · [Zapis aktivacije](releases/GPS-20261121-nutrition-my-day-01/local-activation.json).

## GPS-20261121-recovery-cards-01

Kartice doprinosa oporavku prikazuju dostupnost mjerenja i pokrivenost višednevnih pokazatelja. Iz prikaza su uklonjeni interni nazivi izvora i vremena dohvata. Frontend je aktiviran na portu 8787. Provjereno je 20/20 posluženih datoteka, Chromium sa sintetičkim podacima i Tailscale HTTPS. SQLite v12 prolazi integritet i provjeru stranih ključeva, a sadržaj svih 36 tablica očuvan je. Prošli su svih sedam Playwright scenarija za analitiku, pnpm check i izdvojeni build. [Manifest](releases/GPS-20261121-recovery-cards-01/release-manifest.json) · [Zapis aktivacije](releases/GPS-20261121-recovery-cards-01/local-activation.json).

## GPS-20261121-dashboard-readability-01

Povećana je čitljivost kartica i grafikona u četiri glavna prikaza. Tehnički podaci o dohvaćanju uklonjeni su iz dnevnih kartica. Svih 20 datoteka provjereno je preko porta 8787. Chromium je provjerio veličinu teksta na 390, 836 i 1440 px uz simulirane podatke. [Manifest](releases/GPS-20261121-dashboard-readability-01/release-manifest.json) · [Zapis aktivacije](releases/GPS-20261121-dashboard-readability-01/local-activation.json).

## GPS-20261121-section-links-01

Poveznice u traci Sekcije prikazuju nazive bez numeracije. Chromium je na aktivnoj verziji provjerio nazive i skok na sekciju. [Manifest](releases/GPS-20261121-section-links-01/release-manifest.json) · [Zapis aktivacije](releases/GPS-20261121-section-links-01/local-activation.json).

## GPS-20261121-bjelovar-forecast-01

U Pregledu je aktivirana sedmodnevna prognoza za Bjelovar uz osobni uvid. Chromium je potvrdio sedam dana iz produkcijskog API-ja. [Zapis aktivacije](releases/GPS-20261121-bjelovar-forecast-01/local-activation.json).

## GPS-20261121-weather-runna-01

Prognoza za Bjelovar prikazuje temperaturu, oborine i vjetar po terminima. Prelazak na dan otvara oblačić s Runna planom za taj datum. Prikaz je provjeren u Chromiumu na portu 8787 uz stvarnu prognozu i simulirani trening. [Manifest](releases/GPS-20261121-weather-runna-01/release-manifest.json) · [Zapis aktivacije](releases/GPS-20261121-weather-runna-01/local-activation.json).

## GPS-20261121-weather-tooltip-01

Runna oblačić u prognozi prati izgled oblačića na trend grafovima i nestaje kad pokazivač napusti dan. Chromium je na portu 8787 potvrdio izgled i zatvaranje uz stvarnu prognozu i simulirani Runna raspored. [Manifest](releases/GPS-20261121-weather-tooltip-01/release-manifest.json) · [Zapis aktivacije](releases/GPS-20261121-weather-tooltip-01/local-activation.json).

## GPS-20261121-overview-priorities-01

Pregled prvo prikazuje dnevni uvid, oporavak, san, status treninga i Runna plan. Prognoza je sklopivi alat uz sljedeći trening. [Manifest](releases/GPS-20261121-overview-priorities-01/release-manifest.json) · [Zapis aktivacije](releases/GPS-20261121-overview-priorities-01/local-activation.json).

## GPS-20261121-overview-redesign-01

Pregled organizira četiri dnevna signala, Runna plan, vremenski sažetak, status treninga, doprinose oporavku i ciljeve aktivnosti. Prikaz je provjeren na portu 8787 pri 390 i 1440 px. [Manifest](releases/GPS-20261121-overview-redesign-01/release-manifest.json) · [Zapis aktivacije](releases/GPS-20261121-overview-redesign-01/local-activation.json).

## GPS-20261121-overview-polish-01

Pregled sažima doprinose oporavku, ističe tjedne usporedbe i prikazuje čitljivije grafikone prognoze. Na aktivnoj verziji provjerene su širine od 390 i 1440 px. [Manifest](releases/GPS-20261121-overview-polish-01/release-manifest.json) · [Zapis aktivacije](releases/GPS-20261121-overview-polish-01/local-activation.json).

## GPS-20261121-daily-insight-01

Dnevni uvid imenuje glavni signal i povezuje ga s dostupnim mjerenjima. Poveznice na tjedni trend i check-in ovise o pokrivenosti i odabranom datumu. [Manifest](releases/GPS-20261121-daily-insight-01/release-manifest.json) · [Zapis aktivacije](releases/GPS-20261121-daily-insight-01/local-activation.json).
