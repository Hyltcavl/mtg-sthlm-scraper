# MTG Stockholm Deal Finder

Hämta löskort från Manatorsk + Alphaspel, jämför mot Cardmarket-pris (via
Scryfall), visa deals i sorterbar webbsida.

## Rekognosering (verifierad 2026-09-28)

**Manatorsk** – Shopify/BinderPOS. `GET manatorsk.com/collections/mtg-loskort/products.json?limit=250&page=N`
(~25 000 produkter, ~101 requests, ingen auth). `handle` = Scryfall-ID.
`variants[]`: `title` = skick (Near Mint/Excellent/…), `price` SEK, `available`.
Tag `Foil_Foil`/`Foil_Regular`. Exakt saldo bara i produktsidans HTML
(`"inventoryQuantity": N`) – hoppa över i MVP, `available` räcker.

**Alphaspel** – egen HTML-plattform. `alphaspel.se/1978-mtg-loskort/` listar 126
set-kategorier `/<id>-<slug>/`, varje set paginerad `?page=N`, 48 kort/sida
(~400 listsidor totalt). Per kort: URL, `product-name`
(`Magic löskort: <Set>: <Namn>`), `div.price` (`10 kr`), `div.stock`
(`2 på postorder`). Produktsidan har JSON-LD med `mpn` = `10E-139c`
(setkod-collectornr+suffix). Skick NM om inget annat i titeln.

**Scryfall** – `api.scryfall.com/bulk-data` → `default_cards` (~150 MB JSON).
`prices.eur`/`eur_foil` = Cardmarket-trend i EUR. Kräver EUR→SEK-kurs.

## Lösning

Python 3.12 + stdlib (`urllib`, `json`, `sqlite3`, `re`, `html.parser`) +
**Datasette** för webben. En SQLite-fil `mtg.db`. Inga ramverk, inga klasser.

```
scryfall.py    # bulk → tabell cards (id, name, set, cn, eur, eur_foil, img)
manatorsk.py   # products.json → tabell listings
alphaspel.py   # HTML → tabell listings
db.py          # schema + vy deals + EUR/SEK-konstant
run.sh         # python scryfall.py && python manatorsk.py && python alphaspel.py
```

`listings(shop, url, name, set_raw, condition, foil, price_sek, qty, scryfall_id)`
– PK `(shop, url, condition)`. Scrapers skriver `scryfall_id` direkt när de
kan (Manatorsk alltid; Alphaspel via set+namn-lookup i `cards`, fallback `mpn`).

Vy `deals`:
```sql
fair = eur*11.0*cond_factor  -- cond_factor: NM 1, EX .9, GD .75, PL .6
diff_sek = fair - price_sek, diff_pct = diff_sek/fair
WHERE fair >= 20 AND diff_pct >= 0.2
```

Webb: `datasette mtg.db` → `/mtg/deals` är sorterbar på alla kolumner,
filtrerbar på shop/pris/skick, med länkar. Noll UI-kod.

## Alternativ (om Datasette inte räcker)

| Behov | Lägg till |
|-------|-----------|
| Egen design/UX | `python -m http.server` + statisk `deals.html` genererad från vyn, sortering med 15 rader JS |
| Exakt saldo Manatorsk | hämta `/products/<handle>` bara för rader i `deals` (~hundratal) |
| Alphaspel-matchning < 85 % | hämta produktsida för `mpn`, cacha i tabell `alphaspel_mpn(url, mpn)` |
| Prishistorik | lägg `scraped_at` i PK, sluta skriva över |
| Fler butiker | en fil per butik, samma `listings`-schema |

Skippat: pydantic, FastAPI, http-cache-lager, ijson, uv/poetry, CI. Lägg till
när något faktiskt gör ont.

## Parallella arbetspaket

```
T0 db.py (10 min, en agent, först)
 ├─ T1 scryfall.py   ─┐
 ├─ T2 manatorsk.py  ─┼─ T4 run.sh + README + första riktiga körning
 └─ T3 alphaspel.py  ─┘   (Datasette kräver inget arbete)
```

T1–T3 helt oberoende efter T0. Specar i `tasks/`. Kontrakt i `AGENTS.md`.

## Klart när

`./run.sh && datasette mtg.db` → `/mtg/deals` visar kort från båda butikerna,
sorterbart på `price_sek`, `diff_sek`, `diff_pct`, `shop`. ≥ 95 % Manatorsk
och ≥ 85 % Alphaspel matchade (`SELECT shop, avg(scryfall_id IS NOT NULL)`).
