# T3b – Alphaspel: återupptagningsbar körning i batcher

`src/infra/shops/alphaspel.ts` + 5 tester finns. Bygg om `scrape()` så den kan
avbrytas och startas om utan att börja från början, och kör den sedan.

## Design (batch = ett set, 312 st)

Adapter-privata tabeller i samma `mtg.db` (skapas i konstruktorn; domänen och
`sqlite.ts` rörs **inte**):

```sql
CREATE TABLE IF NOT EXISTS alphaspel_progress (
  set_url TEXT PRIMARY KEY, set_raw TEXT NOT NULL,
  claimed_at TEXT, done_at TEXT);
CREATE TABLE IF NOT EXISTS alphaspel_staging (   -- samma kolumner som listings
  url TEXT, name TEXT, set_raw TEXT, condition TEXT, foil INTEGER,
  price_sek REAL, qty INTEGER, printing_id TEXT, set_url TEXT NOT NULL,
  PRIMARY KEY (url, condition, foil));
```
`alphaspel_mpn` finns redan och är återupptagningsbar.

`scrape(catalog, { workers = 3, fresh = false })`:
1. `fresh` ⇒ töm progress + staging. Annars: hämta set-länkar, `INSERT OR IGNORE`
   alla i progress; nollställ `claimed_at` där `done_at IS NULL` (kraschade claims).
2. Starta `workers` async-loopar. Varje loop **claimar** nästa set atomiskt:
   `UPDATE alphaspel_progress SET claimed_at=? WHERE set_url = (SELECT set_url
   FROM alphaspel_progress WHERE done_at IS NULL AND claimed_at IS NULL LIMIT 1)
   RETURNING set_url, set_raw` – SQLite serialiserar, inget extra lås.
   Ingen rad ⇒ loopen avslutas.
3. Per set: paginera, `toListing` per rad, sedan i **en transaktion**:
   `DELETE FROM alphaspel_staging WHERE set_url=?`, insert alla rader,
   `done_at=now`. Logga `alphaspel [w2] 37/126 Innistrad: 212 listings`.
4. När alla loopar är klara: läs staging → `Listing[]` → returnera (T4:s
   `scrapeShop` gör `replaceForShop`). Staging behålls = checkpointen.
5. Varje worker har egen `politeFetch(1000)` ⇒ ~3 req/s mot Alphaspel totalt.
   Inte mer än 3 – vi är gäster. Kommentera avsteget från AGENTS.md:s 1 req/s.

## Tester (offline, injicerad fake fetch, `:memory:`-db)
- Avbruten körning: fake fetch kastar under set 2 ⇒ progress har 1 `done_at`;
  nytt anrop ⇒ set 1:s sidor hämtas inte igen, resultatet har båda setens rader.
- `fresh: true` tömmer och kör allt igen.
- Två workers claimar olika set (varje set-URL hämtas exakt en gång).

## Riktig körning
1. `mtg.db` ska ha rätt schema (`PRAGMA table_info(listings)` visar
   `printing_id`) och > 90 000 printings – annars vänta på T4:s `refresh`.
2. Tillfälligt skript: `scrape(catalog, { workers: 3 })` →
   `replaceForShop("alphaspel", …)`. Kör i bakgrunden, logga till fil.
   Räkna med 5–10 min. **Döda och starta om avsiktligt en gång** för att
   bevisa återupptagning.
3. Rapportera: listningar, matchningsgrad, top-20 omatchade `setRaw`. Fyll på
   `alphaspel-sets.json` för de största. Om < 85 %: lägg till
   `rematch(catalog)` som bara kör matchningen om på staging-raderna (ingen
   ny scraping) och kör den.
4. Radera skriptet.

Commit: `feat(alphaspel): resumable batched scrape`.
