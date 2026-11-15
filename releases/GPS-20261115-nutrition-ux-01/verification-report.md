# Nutrition UX — rezultat provjere

Task ID `NUTRITION-UX-AUDIT-01`, 15. 11. 2026.

## Popravci

- P2 N1. NutritionShell koristio je zajedničku poruku za sve podkartice. Promjena podkartice, datuma ili izlazak iz Prehrane sada briše poruke. Asinkrone radnje i pogreške učitavanja provjeravaju reviziju konteksta. Odgođeni shopping odgovor može ažurirati pregled samo u izvornom kontekstu.
- P2 N2. Renderer je prepuštao opis EChartsu, koji za praznine može proizvesti engleski opis i NaN. Sada koristi hrvatski opis, provjerene numeričke vrijednosti, jedinice i isto formatiranje za tablicu, tooltip i tipkovnicu. Stvarna nula ostaje 0, a odsutan podatak dobiva opis „nema podatka”. Ovo opažanje nije dokaz pogrešnih izračuna pohranjene prehrane.
- P2 N3. CatalogEditor je prikazivao interne ključeve. Stvaranje i uređivanje koriste hrvatske nazive, kcal ili g te osnovicu na 100 g.
- P2 prazna kupovina. Postojeći API podržava prazne liste i ručne stavke. Prazan rezultat sada objašnjava tu mogućnost i razlikuje prazan plan od pokrivenog plana.
- Dodatni P2 nalaz. U planu s 200 g zalihe i potrebom od 100 g, API je vratio stavku s manjkajućom količinom 0. Prikaz je ispisao „nedostaje 0 g”. Pregled kupovine sada prikazuje pozitivne manjkove. Postojeći API ugovor sačuvan je.

## Provjere

- Nutrition Playwright skup prolazi 10/10, s jednim radnikom i Chromiumom.
- Postojeći test izolacije hovera i test odabira datuma tipkovnicom prolaze 2/2.
- Nakon dopune testa dodavanja ručne stavke tipkovnicom dodatna ciljana provjera prolazi 1/1. Test je pri ponavljanju prvo otkrio nestabilan izbor disclosure kontrole; dodano je čekanje završetka učitavanja i otvaranje samo zatvorene kontrole.
- pnpm check završio je s 0 grešaka i 0 upozorenja.
- Produkcijski Vite build uspješno je izrađen u izdvojenom direktoriju.
- Provjereno podudaranje 86 programskih, konfiguracijskih i testnih datoteka između radne kopije i izdvojenog okruženja.
- SQLite integrity_check vraća ok i foreign_key_check je prazan na izdvojenoj bazi.
- Python testovi nisu pokretani jer backend nije mijenjan.

## Izolirani korisnički tijek

Port 8878 koristi zasebnu bazu `tmp/analytics-verification-20261115/tmp/nutrition-ux-final-20261115-135624/nutrition.sqlite3`. Prije upisa provjereni su nova putanja i odsutnost .env/.env.local iz testne kopije. Vanjski odgovori u pregledniku su simulirani.

Kroz sučelje unesena je izmišljena namirnica, potvrđen prijem 200 g i cijena 4 EUR, uređena deklaracija, kreiran recept sa 100 g za dvije porcije i dodan plan. Planiranje je ostavilo 200 g. Kuhanje je smanjilo sirovu zalihu na 100 g i stvorilo dvije porcije. Konzumacija 0,5 porcije ostavila je 1,5 porciju i evidentirala 100 kcal. Dodatni plan ukupno osam porcija dao je manjak 225 g nakon uračunavanja gotovih porcija i sirove zalihe.

Provjereni su prazni obvezni unosi, odbijen primitak negativne količine, promjena datuma, zakašnjeli uspjeh i pogreška nakon navigacije, ručna lista, tipkovnica i širina 390 px bez horizontalnog prelijevanja. Mobilni screenshot je u `tmp/analytics-verification-20261115/tmp/nutrition-ux-mobile.png`.

## Status i preostala ograničenja

Kandidat obuhvaća i prethodno verificirani popravak hovera grafova. Korisničke izmjene AGENTS.md očuvane su. Manifest bilježi stvarne SHA-256 izvora, builda i paketa te početni commit.

Ova provjera obuhvaća Chromium i ciljane Nutrition/graf scenarije. Ostali preglednici i puni aplikacijski E2E skup nisu pokretani u ovom zadatku. Dugi pristupačni opisi obrađuju sve prikazane datume; praktično čitanje stvarnim čitačem zaslona ostaje za dodatnu provjeru.

Lokalna produkcijska instanca na portu 8787 odgovara HTTP 200 i poslužuje prethodni frontend. Novi kandidat čeka zasebno odobrenje za commit, push i aktivaciju prema zahtjevu zadatka.
