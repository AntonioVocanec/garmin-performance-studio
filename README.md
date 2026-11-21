# Garmin Performance Studio

Garmin Performance Studio je lokalna web-aplikacija za pregled zdravlja, treninga, oporavka i prehrane. Spaja dostupne Garminove podatke, opcionalni Runna kalendar i osobne zapise u sučelje prilagođeno računalu i mobitelu.

## Što aplikacija nudi

- **Pregled** donosi dnevni kontekst, san, oporavak i sljedeći trening. Ispod osobnog uvida prikazuje sedmodnevnu prognozu za Bjelovar iz Open-Metea, uvijek od današnjeg lokalnog datuma.
- **Trening & Load** prikazuje aktivnosti, opterećenje, kalendar, trendove i detalje odabranih aktivnosti.
- **Prehrana** povezuje dnevnik, recepte, planiranje obroka, pripremu, zalihe i kupovinu. USDA pretraga i AI prijedlozi recepata opcionalni su.
- **Laboratorij** sadrži zdravstvene trendove, mjerenja i opcionalnu analizu učitanih PDF nalaza uz korisničku potvrdu.

Dostupnost pojedinih Garminovih metrika ovisi o uređaju, računu i izvoru podataka. Lokalni dnevnik prehrane i planiranje obroka dostupni su i bez Garminove veze.

## Zahtjevi

- Python 3.14 i ovisnosti iz `requirements.txt`.
- Node.js i pnpm za frontend.
- Garmin Personal API pristup za podržane Garminove podatke. Za neke napredne metrike potrebna je postojeća lokalna Garmin Connect sesija.
- Po želji, Runna iCalendar URL, USDA API ključ ili OpenAI API ključ za odgovarajuće integracije.

## Pokretanje

U PowerShellu iz korijena projekta instaliraj ovisnosti i izradi frontend.

```powershell
py -3.14 -m pip install -r requirements.txt
pnpm install --frozen-lockfile
pnpm build
```

Kopiraj `.env.example` u `.env.local` i lokalno unesi vrijednosti za integracije koje želiš koristiti. Ako već imaš konfiguriran `.env` ili `.env.local`, zadrži ga i uredi samo potrebne postavke.

```powershell
py -3.14 server.py
```

Otvori [http://127.0.0.1:8787](http://127.0.0.1:8787). Interaktivna dokumentacija lokalnog API-ja dostupna je na [http://127.0.0.1:8787/api/docs](http://127.0.0.1:8787/api/docs).

Za pristup s mobitela u istom Tailscale tailnetu pokreni aplikaciju, a zatim `./scripts/start-tailscale-serve.ps1`. Povezani uređaj koristi HTTPS adresu koju prikaže Tailscale. Detaljne upute nalaze se u [vodiču za pokretanje](README-GARMIN-DASHBOARD.md#mobitel-i-pwa).

## Podaci i konfiguracija

Osobni zapisi spremaju se u lokalnu SQLite bazu. Aplikacija izrađuje sigurnosnu kopiju pri pokretanju i zatim svakih 24 sata, a ručna kopija može se izraditi naredbom `py -3.14 server.py backup`.

Ključeve, privatni Runna URL i Garminovu sesiju čuvaj u lokalnoj konfiguraciji. `.env`, baza, sigurnosne kopije i lokalni build isključeni su iz Gita. AI funkcije zahtijevaju konfiguriran ključ, a slanje podataka zahtijeva potvrdu u aplikaciji.

## Razvoj i provjera

```powershell
py -3.14 -m unittest discover -s tests -p "test_*.py"
pnpm check
pnpm build
pnpm test:e2e
```

Playwright koristi izdvojenu testnu bazu i port 8878. Za prvi pokret pregledničkih testova može biti potrebna instalacija Chromiuma naredbom `pnpm exec playwright install chromium`.

## Dokumentacija i struktura

- [Detaljni vodič](README-GARMIN-DASHBOARD.md) opisuje izvore, konfiguraciju, mobilni pristup i poslovna pravila.
- [Plan razvoja](ROADMAP.md) prati provedene i preostale faze.
- [Povijest izdanja](RELEASES.md) povezuje manifest i provjere pojedinih izdanja.
- `app.py`, `server.py`, `nutrition/` i `studio_analytics/` čine serverski dio. `frontend/` i `public/` sadrže sučelje i PWA resurse. Testovi su u `tests/`.

Sučelje koristi Svelte 5, TypeScript i Apache ECharts. Serverski dio koristi Python, FastAPI, Pydantic i SQLite.
