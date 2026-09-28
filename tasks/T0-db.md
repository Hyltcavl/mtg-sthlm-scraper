# T0 – db.py (gör först, blockerar T1–T3)

Skapa `db.py` enligt schemat i `AGENTS.md`, plus:

```sql
CREATE VIEW IF NOT EXISTS deals AS
SELECT l.shop, c.name, c.set_name, l.condition, l.foil, l.price_sek, l.qty,
  ROUND(COALESCE(CASE WHEN l.foil THEN c.eur_foil ELSE c.eur END, 0) * 11.0
    * CASE l.condition WHEN 'NM' THEN 1 WHEN 'EX' THEN .9 WHEN 'GD' THEN .75
                       WHEN 'PL' THEN .6 ELSE .4 END, 1) AS fair_sek,
  ROUND(fair_sek - l.price_sek, 1) AS diff_sek,   -- ok i SQLite? nej: upprepa uttrycket eller använd subquery
  l.url, c.image_uri,
  'https://www.cardmarket.com/en/Magic/Cards/' || REPLACE(c.name,' ','-') AS cm_url
FROM listings l JOIN cards c USING (scryfall_id)
WHERE fair_sek >= 20 AND (fair_sek - l.price_sek) / fair_sek >= 0.2;
```
(Använd en inre subquery så `fair_sek` kan återanvändas; lägg till `diff_pct`.)

Även: `git init`, `.gitignore` (`mtg.db`, `*.json`, `__pycache__`),
`run.sh` med `set -e` som kör de tre skripten i ordning.

Klart: `python -c "import db; db.conn()"` skapar `mtg.db` med tabeller + vy.
