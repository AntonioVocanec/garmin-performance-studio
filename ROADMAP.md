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
