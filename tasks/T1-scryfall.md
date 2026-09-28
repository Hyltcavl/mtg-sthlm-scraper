# T1 – scryfall.py

1. `GET https://api.scryfall.com/bulk-data` (headers `User-Agent`, `Accept: application/json`),
   ta `download_uri` för `type == "default_cards"`.
2. Ladda ner till `default_cards.json` om filen saknas eller är > 24 h gammal.
3. `json.load` hela filen (≈1.5 GB RAM, ok). `# ponytail: ijson om OOM.`
4. Behåll kort där `lang == "en"` och `digital` är False. Skriv till `cards`
   med `INSERT OR REPLACE`: `id, name, set, set_name, collector_number,
   prices.eur, prices.eur_foil, image_uris.normal` (dubbelsidiga kort har
   bilden i `card_faces[0].image_uris`).
5. Priser är strängar eller null → `float()`/None.

Test: `test_scryfall.py` med 3 handskrivna kortobjekt (vanligt, dubbelsidigt,
utan pris) → assert på radutdata.

Klart: `SELECT count(*) FROM cards` > 90 000, `SELECT eur FROM cards WHERE name='Sol Ring' AND set_code='lcc'` ger tal.
