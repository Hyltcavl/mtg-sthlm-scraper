# AGENTS.md – kontrakt för alla agenter

Läs `PLAN.md` först. Ponytail-läge: stdlib före beroende, ingen klass utan
två användare, ingen abstraktion "för senare". Fewest files.

## Stack
Python 3.12, stdlib only i scrapers (`urllib.request`, `json`, `re`, `sqlite3`,
`html.parser`). Enda tillåtna pip-paket: `datasette` (webb). Vill du ha ett
till – skriv varför i PR:en.

## Schema (`db.py`, ägs av T0 – ändra inte utan att uppdatera alla)

```sql
CREATE TABLE IF NOT EXISTS cards (
  scryfall_id TEXT PRIMARY KEY, name TEXT, set_code TEXT, set_name TEXT,
  collector_number TEXT, eur REAL, eur_foil REAL, image_uri TEXT);
CREATE INDEX IF NOT EXISTS cards_name_set ON cards(name, set_name);

CREATE TABLE IF NOT EXISTS listings (
  shop TEXT, url TEXT, name TEXT, set_raw TEXT,
  condition TEXT,            -- NM | EX | GD | PL | PO
  foil INTEGER,              -- 0/1
  price_sek REAL, qty INTEGER,  -- qty NULL = okänt men i lager
  scryfall_id TEXT, scraped_at TEXT,
  PRIMARY KEY (shop, url, condition, foil));
```

`db.py` exponerar: `conn()` (öppnar `mtg.db`, kör schemat, returnerar
connection), `EUR_SEK = 11.0`, `replace_listings(shop, rows)` (raderar
butikens gamla rader, `executemany` INSERT). Vy `deals` skapas i `conn()`.

## Scraper-kontrakt (T2, T3)
- Fil `<shop>.py`, körbar: `python manatorsk.py`. Inga argument.
- Hämtar allt, bygger `rows: list[tuple]` i kolumnordning ovan, anropar
  `db.replace_listings("manatorsk", rows)`.
- Bara rader som är i lager.
- Max **1 request/s** per butik (`time.sleep(1)`), User-Agent
  `mtg-deal-finder/0.1 (+kontakt@example.com)`. Retry 3× med backoff på 5xx/429.
- Skriv `print(f"{shop}: {len(rows)} rows, {matched} matched")` sist.
- Lämna **ett** `test_<shop>.py` med sparad fixture (en JSON-/HTML-sida) som
  kör parsern och `assert`:ar några fält. Inget pytest-krav – `python test_x.py`.

## Skick-normalisering
Manatorsk-variant → `Near Mint`=NM, `Excellent`=EX, `Good`=GD,
`Played`/`Light Played`=PL, `Poor`=PO. Alphaspel: default NM; regex i titeln
för `(EX|GD|PL|Played|HP|Poor|Signed)` → mappa; `Foil` i titeln → foil=1.

## Git
Inte initierat ännu; T0 kör `git init`. En commit per task, meddelande
`feat(manatorsk): scraper`. Inga hemligheter, `mtg.db` och `*.json`-bulk i
`.gitignore`.

## Rapportera tillbaka
Kort: vad gjordes, matchningsgrad, kända hål. Ingen prosa om alternativ som
inte byggdes.
