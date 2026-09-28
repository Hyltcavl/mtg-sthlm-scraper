# T2 – manatorsk.py

Källa: `https://manatorsk.com/collections/mtg-loskort/products.json?limit=250&page=N`,
N från 1 tills `products` är tom (~101 sidor). 1 s sömn mellan.

Per produkt `p`:
- `scryfall_id = p["handle"]` (uuid). Fallback: tag som börjar `Scryfall ID_`.
- `foil = 1 if "Foil_Foil" in p["tags"] else 0`
- `set_raw` = tag `Set_…` utan prefix
- Per `v in p["variants"]` där `v["available"]`:
  `condition` = normalisera `v["title"]` (se AGENTS.md), `price_sek = float(v["price"])`,
  `qty = None`, `url = f"https://manatorsk.com/products/{handle}"`.
- Hoppa produkter där `product_type != "Single"`.

Exempel på verklig post finns i PLAN.md-rekognoseringen (Sol Ring, LCC).

Test: `test_manatorsk.py` med `fixture_manatorsk.json` (spara sida 1, trimma
till 3 produkter) → assert antal rader, ett pris, ett skick.

Klart: `python manatorsk.py` → ~4–5 000 rader, 100 % med `scryfall_id`.
