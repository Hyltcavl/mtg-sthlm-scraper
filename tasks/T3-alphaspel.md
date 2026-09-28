# T3 – alphaspel.py

Källa: `https://www.alphaspel.se/1978-mtg-loskort/` → alla länkar `href="/<id>-<slug>/"`
i `<div class="categories row">` (126 set). Per set: `?page=N` tills sidan
saknar `class="product">` eller ingen `?page=N+1` i paginationen. 1 s sömn.
Kör med `User-Agent` (sidan svarar 200 för Mozilla-UA).

Parsning – `re` räcker, HTML:et är regelbundet (se PLAN.md). Per `div.product`:
- `url` = första `href` (absolut).
- `name_full` = text i `product-name`, format `Magic löskort: <Set>: <Namn>`.
  Split på `: ` från vänster, max 2 → `set_raw`, `name`. Titeln kan ha
  suffix som `(Foil)`, `(EX)`, `(Played)` → foil/condition, strippa ur namnet.
- `price_sek` = tal ur `div.price` (`10 kr`).
- `qty` = tal ur `div.stock` (`2 på postorder`). Ingen `div.stock` ⇒ hoppa.

Matchning mot `cards`:
1. `alphaspel_sets.json`: `{ "<set_raw>": "<scryfall set_code>" }`. Bygg den
   halvautomatiskt: `SELECT DISTINCT set_code, set_name FROM cards` och matcha
   lowercase set_name == set_raw; skriv ut omatchade set och fyll i för hand.
2. `SELECT scryfall_id FROM cards WHERE set_code=? AND lower(name)=lower(?)`.
   Namnet kan vara bara framsidan på dubbelsidiga kort → även `name LIKE ? || ' // %'`.
3. Fler än en träff (olika tryck) eller noll: hämta produktsidan, ta
   `"mpn": "10E-139c"` ur JSON-LD → `set_code=lower('10E')`, `collector_number`
   = `139` (prova med och utan suffix). Cacha i tabell `alphaspel_mpn(url PRIMARY KEY, mpn)`
   så det bara görs en gång per produkt. Undersök vad suffixet `c` betyder
   (kolla 5 produkter) och notera i filen.
4. Ingen träff → rad med `scryfall_id NULL` (syns i matchningsgraden).

Test: `test_alphaspel.py` med `fixture_alphaspel.html` (en listsida, trimmad
till 3 produkter) → assert namn, pris, qty.

Klart: `python alphaspel.py` → ≥ 85 % rader med `scryfall_id`. Skriv ut top-20
omatchade `set_raw` i slutet.
