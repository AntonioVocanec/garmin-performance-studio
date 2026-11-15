# Garmin Performance Studio

Lokalni dashboard za Garmin. Uobičajeni health i activity podaci čitaju se preko Garmin Connect Personal API-ja, a Garminove napredne metrike preko postojeće lokalne Garmin Connect sesije. Oba izvora su read-only; ključevi, sesijski tokeni i sirovi odgovori ostaju na serveru, a preglednik prima samo normalizirane sažetke. Aplikacija ne poziva MCP alate.

## Garmin konfiguracija

`.env` u korijenu projekta treba sadržavati:

```env
GARMIN_PERSONAL_API_BASE_URL=https://personal.connectapi.garmin.com
GARMIN_PERSONAL_API_KEY=...

# Opcionalno: mapa postojeće lokalne Garmin Connect sesije; zadano je %USERPROFILE%\.garminconnect.
# Ne lijepi sadržaj tokena ovdje.
GARMIN_CONNECT_TOKEN_PATH=
```

Radi migracije prihvaća se i postojeće ime `GARMIN_API_TOKEN`. Ne šalji API ključ u chat i ne spremaj ga u verzionirane datoteke.

Garmin Connect sesija dohvaća službene Garminove rezultate za **Training Status**, **Load Focus**, **Running Tolerance**, **Endurance Score** i noćno **odstupanje temperature kože od osobne baze**. Temperatura kože se učitava zasebno kako sporiji višenoćni dohvat ne bi zadržavao glavni dashboard. Zadano se koristi sesija u `%USERPROFILE%\.garminconnect`; putanju možeš promijeniti s `GARMIN_CONNECT_TOKEN_PATH`. Garminov sesijski token ostaje izvan baze i preglednika. Ovaj dodatni izvor koristi Garmin Connect sučelje koje nije dio Personal API rute, pa Garminova promjena endpointa može privremeno prekinuti napredne metrike.

## Sljedeći Runna trening

Runna može objaviti treninge kroz privatni iCalendar feed. U aplikaciji Runna otvori **Profile → Connected Apps & Devices → Calendars → Connect Calendar → Other Calendar**, kopiraj iCalendar URL i dodaj ga u lokalni `.env`:

```env
RUNNA_ICAL_URL="https://…"
```

Podržan je i `webcal://` URL. Taj URL služi kao tajna: backend ga dohvaća izravno, ne vraća ga pregledniku i ne zapisuje ga u log. Nakon izmjene `.env` ponovno pokreni dashboard. Kartica prikazuje sljedeće trčanje i do osam budućih Runna treninga. Kod intervalnih treninga odvajaju se poznata ukupna udaljenost i duljina ponavljanja; ako ukupna udaljenost nije pouzdano navedena, izostavlja se iz kilometarskih zbrojeva.

Po želji možeš fiksirati dnevni cilj sna u minutama s `GARMIN_SLEEP_TARGET_MINUTES=480`. Ako varijabla nije postavljena, koristi se individualni Garmin Sleep Need za svaku noć.

Garmin Personal API ključ ovdje pokriva health i activity podatke, ali Garmin workout/calendar rute nisu bile dostupne kroz ovaj Personal API host. Runna iCalendar feed je zato izvor za planirane sesije; dovršene aktivnosti i dalje dolaze iz Garmina.

## Specijalistički laboratorijski nalazi (AI)

U lokalni `.env` dodaj `OPENAI_API_KEY`; po želji promijeni `OPENAI_LAB_MODEL` (zadano `gpt-6-luna`) i ponovno pokreni dashboard. Predložak je u `.env.example`. Ključ ostaje na serveru i ne šalje se pregledniku.

U **Laboratorij → Specijalistički laboratorijski nalazi** dodaj do 10 PDF nalaza (do 15 MB pojedinačno i 30 MB ukupno) i uključi izričitu suglasnost. Možeš ih odabrati zajedno ili dodavati pojedinačno te ukloniti s popisa prije slanja. Svi odabrani PDF-ovi šalju se u jednom zahtjevu OpenAI Responses API-ju za zajedničku analizu; nazivi datoteka se ne šalju. Izvorni PDF-ovi obrađuju se privremeno u memoriji i dashboard ih ne pohranjuje. OpenAI API podatke prema zadanim postavkama ne koristi za treniranje, no sigurnosni zapisi mogu ih zadržati do 30 dana. Ukloni identifikatore iz dokumenata ako ih ne želiš poslati.

AI prepisuje stavke i objašnjava ih prvenstveno prema referentnim rasponima i oznakama iz istog laboratorijskog nalaza. Zajednički sažetak povezuje nalaze, a svako mjerenje zadržava broj izvornog PDF-a, stranicu, datum i laboratorij; mjerenja iste pretrage iz različitih dana ostaju zasebna. Rasponi ovise o laboratoriju i metodi; nesigurno očitane vrijednosti treba ručno provjeriti. Objašnjenje je edukativno, nije dijagnoza ni savjet za liječenje. Ništa se ne sprema dok ne pregledaš rezultate i izričito odabereš spremanje. Spremaju se samo strukturirane vrijednosti i objašnjenje u lokalnu SQLite arhivu; brisanje nalaza uklanja ga i iz dostupnih automatskih sigurnosnih kopija dashboarda. Ranije spremljeni pojedinačni nalazi ostaju čitljivi.

Arhiva prikazuje broj izvora, rezultate, oznake laboratorija, stavke koje traže provjeru i objašnjenja koja su zastarjela nakon korekcije. Pretraga i filtri po kategoriji, laboratoriju i statusu skraćuju popis; rezultati su grupirani u sklopive kategorije. Povijesna usporedba prikazuje samo podudaranja naziva, jedinice i laboratorija s jasnom brojčanom vrijednošću. Metoda i vrsta uzorka mogu nedostajati, zato je usporedba samo pregled zapisa, ne zaključak o promjeni zdravlja.

Spremljeno očitanje može se naknadno ispraviti. Arhiva bilježi vrijeme te prethodnu i novu strukturiranu vrijednost; AI objašnjenje i zajednički sažetak označavaju se zastarjelima i ne predstavljaju tumačenje ispravljenog rezultata. Usporedba s originalom zasebna je korisnička potvrda. Ponovna AI analiza zahtijeva novo odabiranje PDF-a i postojeću izričitu suglasnost. Status AI-ja razlikuje konfiguriran ključ od ishoda zadnjeg stvarnog zahtjeva; provjera statusa sama ne šalje dokument ni ne potvrđuje raspoloživu kvotu.

## Što dashboard prikazuje

- San, Sleep Score, noćnu arhitekturu, rolling 14-dnevni Sleep Debt i njegovu dnevnu krivulju. Po noći se koristi Garmin Sleep Need; u dug se uračunavaju noćni san i registrirani napovi, a višak sna smanjuje akumulirani manjak. Noći bez podataka ostaju neprocijenjene.
- Napredak prema Garminovu cilju koraka i tjednom cilju intenzivnih minuta u kružnim indikatorima te aktivne kalorije bez proizvoljno zadanog cilja.
- Recovery kontekst prikazuje HRV, puls u mirovanju i san kao tri zasebna signala s ikonama, promjenom prema osobnoj bazi i brojem dostupnih dana u prethodnih 28 dana; ne izračunava ukupni readiness score.
- Noćnu temperaturu kože prikazuje kao odstupanje °C od osobne baze, uz 28-noćni graf, nulu kao baznu crtu, medijan, pokrivenost noćima i Garminov broj dana uspostave baze. To nije apsolutna ni središnja tjelesna temperatura; ne izvodi se zdravstvena dijagnoza ni izmišljeni statusni prag.
- Pravilnost sna prikazuje kružnu standardnu devijaciju lokalnog vremena odlaska na spavanje i buđenja kroz 14 dana te broj noći s dostupnim Garmin vremenima.
- Garminov dnevni prosjek stresa ima zaseban 56-dnevni trend. To nije Oura Daytime Stress: Garminov sažetak ne sadrži Oura mjerenja u intervalima tijekom budnih razdoblja s malo kretanja.
- Lokalni subjektivni dnevnik za RPE, umor, bolnost mišića, raspoloženje i kratku bilješku te 28-dnevni trend i prosjek zadnjih sedam unosa.
- HRV i Body Battery, resting heart rate, stres, disanje, SpO₂ i korake kada ih Garmin vrati.
- Do 52 tjedna povijesti trčanja i tjedne kilometraže, usporedbu prosječnih tempa i running dynamics kroz dva 28-dnevna razdoblja te 7/42-dnevne eksponencijalne trendove Garmin activity load-a za trčanje i sve sportove.
- Trkačke trendove zadnjih 90 dana prema cijelom 365-dnevnom razdoblju: kilometri i sesije tjedno te prosječni tempo. Usporedba se prikazuje nakon barem 180 dana aktivnosti i samo uz potpunu Garmin povijest.
- Usporedbu sedmodnevnog Garmin activity load-a s prosjekom prethodna četiri tjedna uz postojeću usporedbu s tri tjedna.
- Zadnjih 7 dana trening opterećenja, usporedbu s prosječnim tjednom iz prethodna 3 tjedna, ostale sportove i vrijeme u HR zonama.
- Garminov **Training Status** i acute/chronic load omjer, **Load Focus** s ciljnim rasponima za aerobni niski, aerobni visoki i anaerobni load, **Running Tolerance** s akutnim impact loadom i tolerancijom te **Endurance Score** s 28-dnevnim trendom. Sve su to Garminovi rezultati; ostaju odvojeni od lokalno izračunatih activity-load krivulja.
- Kalendar trčanja za 13 tjedana, 28-dnevnu kilometražu, broj dana s trčanjem i najdulji trening; prazni dani razlikuju se od budućih dana.
- Garmin-load monotoniju i strain za trčanje i sve aktivnosti. Monotonija računa dnevne odmore kao nulu; ako Garmin load nedostaje za aktivan dan, pokazatelj se označava kao nedostupan.
- Garmin Fitness Age, korisničke running-zone pragove i zadnju aktivnost s running dynamics podacima.
- Garmin Connect `avgStrideLength` iz activity-list i activity-summary odgovora tretira se kao centimetarska sažeta vrijednost i pretvara u metre. Prikazuje se samo kad je pretvorena vrijednost u fizički mogućem rasponu od 0,2 do 4 m; nepoznata ili nevaljana vrijednost ostaje prazna.
- Do 12 nedavnih aktivnosti te sažete statuse izvora bez ispisivanja sirovih API odgovora.
- Tjedni prikaz Runna plana u odnosu na Garmin aktivnosti; uparivanje koristi datum i udaljenost. Brojevi planiranih i uparenih treninga prikazuju se tek kada lokalna arhiva pokriva razdoblje; Garminova odrađena udaljenost ostaje dostupna zasebno.

Godišnji prikaz koristi Garmin activity-list podatke za zadnjih 365 kalendarskih dana, do 1.200 aktivnosti po dohvaćanju. Ako Garmin vrati manje povijesti ili neka stranica ne učita, dashboard označi izvor kao djelomičan i izračuna trendove samo iz vraćenih zapisa. Load krivulje su lokalni eksponencijalni prosjeci iz Garmin load vrijednosti; njihovi nazivi ne predstavljaju službeni Garmin status.

Lokalni acute/chronic omjer je opisni izračun iz Garmin activity load vrijednosti; službeni Garmin Training Status i ACWR dolaze zasebno iz Garmin Connect sesije. Monotonija i strain su lokalne prilagodbe Runalyze ideje iz Garmin activity load vrijednosti; Runalyzeov model koristi TRIMP, pa se formule i pragovi ne podudaraju. Running Tolerance prikazuje Garminov biomehanički impact load izražen kao kilometri ekvivalentnog opterećenja, zasebno od kardiovaskularnog activity load-a; Garmin navodi da prelazak tolerancije označava stanje za oprez, a ne dijagnozu ili jamstvo izostanka ozljede. Nedostajući podaci prikazuju se kao nedostupni, bez izmišljanja vrijednosti.

## Oura inspiracija i izvedivost s Garminom

Oura aplikacija nudi osobne baze, dnevne readiness doprinose, dugoročne trendove, pravilnost sna, sleep debt, stres i oporavak te označavanje navika radi usporedbe s biometrikom. Dashboard već koristi izvedive obrasce: osobnu bazu za HRV/puls/san, 14-dnevni Sleep Debt, pravilnost sna, zasebne trendove te Garminove ciljeve aktivnosti. Oura Readiness i Resilience imaju vlastite bodovne modele i senzorske ulaze; dashboard ih zato ne kopira kao Oura rezultate niti prikazuje neobjašnjiv zbirni score.

Sljedeća izvediva proširenja, redom:

1. **Osobni obrasci uz događaje — implementirano.** Postojeće oznake događaja uspoređuju Garminov san, HRV i puls u mirovanju sljedećeg jutra s danima bez zabilježenog događaja. Prikaz koristi medijane, broj dana i minimalno tri mjerenja u obje skupine; riječ je o osobnoj, opisnoj usporedbi, ne uzročnosti. Podaci se čitaju iz postojeće lokalne arhive događaja; nova SQLite tablica nije potrebna.
2. **Tjedni i mjesečni osobni izvještaj — implementirano.** Postojeći tjedni osvrt dopunjen je 28-dnevnom usporedbom prema prethodnih 28 dana za prosjek sna, medijan HRV-a i pulsa u mirovanju te volumen trčanja. Svaka metrika prikazuje svoje pokriće; fiziološke usporedbe traže barem 14 zapisa po razdoblju, a kilometraža se prikazuje samo kad je Garminova povijest potpuna. Istaknute promjene su opisne i ne predstavljaju procjenu spremnosti.
3. **Izbor razdoblja za health trendove** — dnevni, tjedni, mjesečni i dulji prikazi uz usporedbu s osobnom bazom. Za health metrike dulje od trenutno dohvaćenog prozora prvo treba potvrditi Garminovu povijesnu dostupnost i proširiti dohvat bez prikazivanja lažne potpunosti.
4. **Garminov osobni oporavak po doprinosima** — san/Sleep Debt, HRV, puls u mirovanju, Body Battery i load prikazani odvojeno uz njihove trendove. Takvu kombinaciju ne nazivati Oura Readinessom ili Resilienceom.

Oura Daytime Stress koristi HR, HRV, kretanje i temperaturu te prikazuje mjerenja približno svakih 15 minuta tijekom budnih razdoblja s malo kretanja. Trenutni Garmin izvor u dashboardu daje dnevni stress sažetak, pa ga prikazujemo samo kao dnevni trend. Garminova noćna odstupanja temperature kože sada su dostupna zasebno; ne računamo Oura-specifične stres/restorative minute ni Oura bodove. Žensko zdravlje i ciklus nisu uključeni.

Izvori za Oura mogućnosti: [Readiness Contributors](https://support.ouraring.com/hc/en-us/articles/360057791533-Readiness-Contributors), [Sleep Health Hub](https://support.ouraring.com/hc/en-us/articles/43839624818963-Sleep-Health-Hub), [Using Trends](https://support.ouraring.com/hc/articles/360055983614-Using-Trends), [Daytime Stress](https://support.ouraring.com/hc/articles/21205822135315-Daytime-Stress), [Using Tags](https://support.ouraring.com/hc/en-us/articles/360038676993-Using-Tags) i [Resilience](https://support.ouraring.com/hc/en-us/articles/25358829055251-Resilience).

Runna plan, normalizirani sažeci Garmin aktivnosti i osobni dnevnik arhiviraju se lokalno u `garmin-dashboard.sqlite3`. Arhiva plana počinje prvim uspješnim sinkroniziranjem i ne može popuniti planove koji su nestali iz Runna feeda prije tog datuma. Uparivanje je približno; nepovezana sesija nije automatski označena kao propuštena. Baza ostaje lokalna i isključena iz verzioniranja. Dnevni check-in može se naknadno ispraviti; spremanje praznog unosa briše taj dan.

SQLite arhiva koristi WAL, `busy_timeout` od 15 sekundi i verzionirane migracije (`PRAGMA user_version`). Prije migracije postojeće baze aplikacija napravi online backup i provjeri njegov integritet. Pri pokretanju i zatim svakih 24 sata sprema provjeren backup u `backups/`; čuva zadnjih 14 kopija. Za ručnu kopiju pokreni `py -3.14 server.py backup`. Baza i backupi ostaju lokalni i isključeni su iz Git-a.

## Pokretanje

```powershell
pnpm install
pnpm build
py -3.14 -m pip install -r requirements.txt
py -3.14 server.py
```

Otvori <http://127.0.0.1:8787>. FastAPI dokumentacija endpointa dostupna je na <http://127.0.0.1:8787/api/docs>. Na istom računalu dashboard se može instalirati kao aplikacija iz podržanog preglednika.

## Mobitel i PWA

Sučelje se može dodati na početni zaslon i otvoriti u samostalnom prikazu. Na iPhoneu otvori dashboard u Safariju, dodirni **Dijeli → Add to Home Screen**. Na Androidu u Chromeu otvori izbornik pa **Install app** ili **Add to Home screen**. Za instalaciju preko mreže potreban je HTTPS; localhost radi kao siguran kontekst samo na računalu na kojem se dashboard vrti.

Za privatni HTTPS pristup s mobitela preporučen je Tailscale Serve, koji dashboard drži dostupnim uređajima prijavljenima u tvoj tailnet:

1. Instaliraj Tailscale na računalo i mobitel te ih prijavi u isti tailnet.
2. Pokreni dashboard lokalno (`py -3.14 server.py`), a zatim u ovom direktoriju pokreni `./scripts/start-tailscale-serve.ps1`.
3. Ako Tailscale zatraži, odobri HTTPS za tailnet. Otvori adresu `https://…ts.net` koju prikaže naredba, pa instaliraj aplikaciju na mobitel.

Skripta provjerava lokalni `/api/health` i koristi `tailscale serve --bg 8787`, tako da HTTPS prosljeđivanje ostaje aktivno nakon zatvaranja terminala. Ona ne pokreće Funnel niti mijenja postavke pristupa za javni internet. Tailnet ACL i dalje određuje koji tvoji uređaji mogu pristupiti. Ako promijeniš port, proslijedi ga kao parametar, primjerice `./scripts/start-tailscale-serve.ps1 -Port 8878`.

Kad nema veze s računalom, PWA može otvoriti spremljenu ljusku sučelja, ali Garmin podaci i lokalni dnevnik namjerno se ne spremaju u browser cache i neće biti dostupni izvan mreže. Spremanje dnevnika zato zahtijeva aktivnu vezu s dashboardom.

Nemoj otvarati server na cijelu kućnu/javnu mrežu bez autentikacije. PWA ikone možeš obnoviti naredbom `pnpm icons:pwa`.
# Prehrana i planiranje obroka

Kartica **Prehrana** ravnopravna je postojećim pogledima. Podpogledi su Pregled, Dnevnik, Planer, Recepti, Meal Prep, Zalihe i Kupovina. Koristi zajednički datum i temu; zalihe su uvijek trenutačno stanje. Profil je početno prazan.

## Početak rada

1. U profilu postavi vlastite ciljeve i datum od kojeg vrijede. Možeš ostaviti ciljeve praznima.
2. U Zalihama dodaj namirnice prema deklaraciji. Vrijednosti su na 100 g, uz jasno stanje sirovo/kuhano/suho. Za ml i komade nutritivni izračun traži grame po jedinici.
3. Prijem kreira lot s lokacijom, količinom, opcionalnim rokom i nabavnom cijenom. Nepoznat nutritivni podatak ili cijena ostaje nepoznat.
4. Kreiraj recept, provjeri skaliranje i potvrdi kuhanje u Meal Prep. Tek potvrda troši sirove sastojke i kreira gotove porcije.
5. Gotove porcije konzumiraj kroz dnevnik; tu se više ne troše sirovi sastojci. Djelomične porcije su dopuštene. Za običnu namirnicu možeš odabrati samo evidenciju ili stvarnu potrošnju iz zaliha.
6. Tjedni planer ne mijenja inventar. Kupovina konsolidira manjkove uz raspoložive lotove i gotove porcije do datuma obroka. Označavanje kupljenog i stvarni prijem odvojene su radnje.

## Podaci i zaštita povijesti

SQLite migracije 4–9 nadograđuju postojeću arhivu uz postojeći backup. Normalizirane tablice nose prefiks `nutrition_`; postojeće Garmin, Runna, dnevničke i laboratorijske tablice se ne zamjenjuju. Migracija 9 dodaje raspored budućih priprema.

Količine su pohranjene u tisućinkama jedinice, a cijene u desetisućinkama EUR. Računanje koristi Python Decimal; decimalne vrijednosti u API-ju prenose se kao stringovi. Obrasci prihvaćaju decimalni zarez za količine. Inventarni postupci koriste `BEGIN IMMEDIATE`, FK, provjeru stanja i `Idempotency-Key`. Uređivanje koristi očekivanu verziju zapisa.

Recept čuva nutritivnu verziju sastojka; dnevnik čuva snapshot. Naknadna izmjena izvora ili recepta ne prepisuje prošle unose. Poništenje stvara kompenzaciju i odbija se ako postoje kasnije nepotvrđeno poništene promjene istih lotova. Ručna korekcija stanja ima obavezan razlog. FEFO isključuje istekle lotove; lotovi bez roka dolaze iza poznatih rokova.

Prazan dnevnik nije potvrđena nula. Dan se može označiti potpunim; novi unos ga ponovno otvara. Službeni Garmin `burnedTotal` prikazuje se odvojeno od aktivnih kalorija. Lokalna procjena dana iz jučerašnjeg mirovanja i današnjih aktivnih kalorija posebno je označena i ne zamjenjuje službenu seriju. Današnja bilanca je privremena. Prehrana radi i bez Garmina.

## Opcionalni vanjski izvori i AI

`USDA_API_KEY` omogućuje serversku pretragu i potvrđen uvoz FoodData Central zapisa. Bez ključa koristi se ručni unos; nema automatskog zamjenjivanja lokalnih izvora. Cijene dolaze iz lokalne nabave, uz datum izvora.

AI koristi postojeći serverski OpenAI ključ. Opcionalni `NUTRITION_AI_MODEL` bira model za recepte; ako nije zadan, koristi konfigurirani model laboratorijske integracije. Ključ nije provjera pristupa modelu ni kredita. Nove vrijednosti navedene su samo u `.env.example`; stvarni `.env` nije automatski mijenjan.

Za AI prvo postavi dnevni broj poziva i tokena u profilu (zadano 0). Jedan zahtjev konzervativno rezervira 8000 tokena, uz najviše 4000 izlaznih tokena. Prije slanja prikazuje se točan popis namirnica i statičke upute. Šalju se samo nazivi, količine i jedinice; profil, alergeni, Garmin, dnevnik i identitet ne šalju se. Ograničenja i alergeni provjeravaju se lokalno. Nepoznati alergeni blokiraju prijedlog kada profil ima ograničenje alergena.

Timeout je do 21 sekunde po pokušaju. Samo eksplicitno odbijanje `rate_limit_exceeded` dopušta jedan ponovljeni pokušaj nakon sekunde. Nejasan mrežni prekid, nevaljan odgovor, kvota ili nedostupan model ne uzrokuju automatski novi poziv. Najviše je jedan aktivan zahtjev i tri zahtjeva u minuti. Ponovno pokretanje označava prekinute zahtjeve; rezervirani budžet zadržava se konzervativno.

AI prijedlog ne mijenja zalihe. Spremanje stvara lokalni recept koji dalje prolazi isti prikaz, skaliranje i planer. Sportska prilagodba početno je korisnički definiran dodatak energiji/UH uz trajanje i naziv treninga; sprema se tek potvrdom i ne zbraja se automatski s Garmin potrošnjom.

## Provjere prehrane

Backend: `py -3.14 -m unittest tests.test_nutrition tests.test_sqlite_archive`.
Frontend: `pnpm check`, `pnpm build` i `pnpm exec playwright test tests/e2e/nutrition.spec.ts`.
Testovi koriste sintetičke podatke, privremene baze i simulirane AI odgovore. Playwright radi na portu 8878 i izdvojenim putanjama. Stvarni plaćeni AI i USDA pozivi nisu dio regresijskog skupa.

### Definicije nutritivnih vrijednosti

Verzija arhive 10 dodaje neobavezni metadata_json uz svaku nutritivnu verziju. Izvorne vrijednosti, ID-evi nutrijenata, jedinice, osnovica /100 g, stanje namirnice i metoda energije čuvaju se uz novi zapis. Polje nutrients zadržava izvorno značenje uz jedinice kcal i g. Polje comparableNutrients služi usporedbi s ciljem UH prema EU definiciji.

Pri ručnom unosu potvrdi definiciju UH. EU deklaracija vodi UH odvojeno od vlakana. Za USDA Foundation i SR Legacy s prepoznatim ukupnim UH i potpunim podatkom vlakana usporedna vrijednost koristi razliku, označenu kao procjena. Ta razlika može odstupati od EU deklaracije. Za nepoznatu definiciju, Branded zapise, nedostajuća ili proturječna mjerenja usporedba UH ostaje nedostupna. Povijesni izvorni zbrojevi ostaju dostupni u dnevniku.

USDA energija bira se deterministički. Foundation koristi prioritet 2048, 2047, 1008. Ostali tipovi koriste 1008, 2048, 2047. Sve zaprimljene vrijednosti ostaju sačuvane. Energija se preuzima iz izabranog zapisa i konvertira iz kJ ako je potrebno. Makronutrijenti ne zamjenjuju deklariranu energiju. Postojeći recepti, batchevi i dnevnik zadržavaju svoje spremljene vrijednosti i semantiku. Naknadna potvrda definicije kreira novu verziju namirnice.

Migracija 9 → 10 aditivno dodaje stupac i koristi postojeću sigurnosnu kopiju prije nadogradnje. Stari redovi dobivaju NULL metapodatke. Greška unutar migracije vraća transakciju i user_version na 9. Za operativni povrat na stari program potrebno je zaustaviti aplikaciju i vratiti provjerenu kopiju verzije 9 uz prethodno čuvanje nove baze. Takav povrat zahtijeva zasebnu odluku o zapisima nastalim poslije nadogradnje. Automatsko snižavanje verzije baze nije uvedeno.


### Raspoloživost inventara i poslovni datumi

Verzija arhive 11 dodaje available_on lotovima i event_date prometu. Vrijeme received_at ostaje tehničko vrijeme upisa. Novi primitak koristi receivedOn ili današnji lokalni datum. Priprema koristi asOf. Naknadni upis primitka i pripreme dopušten je uz provjeru datuma i stanja. Poništavanje kompenzira promet na izvornom poslovnom datumu.

Zajednička provjera u nutrition/availability.py ograničava raspoloživu količinu fizičkim stanjem, datumom primitka/pripreme, rokom i najmanjim preostalim saldom kroz kasnije poznate poslovne datume. Time naknadni unos ne može potrošiti količinu pokrivenu tek kasnijom pozitivnom korekcijom. Rok je uključiv do zadanog dana. FEFO prvo troši poznati najbliži rok, zatim lotove bez roka.

Inventar prikazuje fizičko, raspoloživo i isteklo stanje. Dashboard i planiranje koriste raspoloživo stanje na datum odluke. Skaliranje i kuhanje koriste datum pripreme, dnevnik datum konzumacije, kupovina datume planiranih obroka, a AI današnji datum. Kupovina dodatno simulira zajedničku potrošnju više obroka i koristi odgovarajuće gotove porcije prije sirovina.

Stari lotovi i promet dobivaju nepoznat poslovni datum. Tehničko vrijeme upisa ne dokazuje datum primitka. Takvi lotovi ostaju vidljivi kao fizička zaliha, a njihova raspoloživa količina je 0. Poništavanje stare inventarne operacije bez poslovnog datuma traži zasebno usklađivanje. Ručno premještanje fizički potvrđene količine stvara novi lot raspoloživ od dana premještanja. Povijesni nutritivni snapshotovi ostaju sačuvani.

Ovaj prikaz računa koliko se preostale fizičke zalihe smije upotrijebiti na odabrani datum. Rekonstrukcija nekadašnjeg stanja već potrošenih lotova zaseban je zahtjev. Rezervacije se još ne stvaraju; postojeća rezervacijska tablica ostaje mjesto za buduću transakcijsku integraciju s provjerom raspoloživosti. Migracija koristi postojeću kopiju prije nadogradnje i transakcijski rollback. Operativni povrat zahtijeva provjerenu kopiju i odluku o novim zapisima nastalim nakon nadogradnje.

### Pregled i potvrda kuhanja

Pregled i potvrda koriste isti izračun u nutrition/cooking.py. Izbor optionalIngredientPositions koristi pozicije sastojaka u nepromjenjivoj verziji recepta, počevši od 0. Ako recept ima opcionalne stavke, izričito potvrdi uključene pozicije ili prazan izbor. Isključene stavke izostaju iz kalorija, troška i potrošnje. Brojevi i hranjive vrijednosti gotove šarže slijede prikazane količine zaokružene na 0,001 inventarne jedinice. Manje pozitivne količine odbijaju se uz objašnjenje. Gotova masa je zasebno mjerenje i ostaje nepoznata kada nije unesena.

Pregled vraća previewToken. Sučelje šalje taj token pri potvrdi. Potvrda ponovno izračunava plan unutar BEGIN IMMEDIATE. Promjena relevantnih lotova, FEFO raspodjele, zahtjeva ili rasporeda vraća 409 i strukturirane details s uputom za osvježavanje. Neizvediv plan vraća 422. Jedan pregled može potvrditi jednu šaržu, a ponavljanje istog Idempotency-Key vraća spremljeni rezultat. Mrežna greška zadržava zahtjev za siguran ponovni pokušaj. Kod 409/422 sučelje traži novi pregled.

Stari pozivi bez tokena ostaju podržani i provjeravaju svježi plan u transakciji, ali nemaju usporedbu s ranijim pregledom. Nepoznati troškovi utrošenih lotova ostaju nepoznati. Povijesni snapshotovi i SQLite v11 shema se ne prepisuju. Aktivacija ovog koda i builda traži zasebno odobrenje.
