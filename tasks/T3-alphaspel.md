# T3 – Alphaspel ShopScraper (`src/infra/shops/alphaspel.ts`)

Källa: `https://www.alphaspel.se/1978-mtg-loskort/`. `politeFetch(1000)`
(sajten svarar 200 med vår UA). Parsa med `cheerio`.

1. `parseSetLinks(html): {url, setRaw}[]` – i `div.categories`, varje
   `.category-name h4 a` → href (absolut) + text (126 set).
2. `parseListPage(html): {url, title, priceSek, qty}[]` per `div.product`:
   första `a[href]` (absolut), `.product-name` text utan inre `<small>`,
   `.price` → `/(\d+)\s*kr/`, `.stock` → `/(\d+) på/` (saknas ⇒ ej i lager, hoppa).
   Paginering: `?page=N` tills sidan saknar `div.product`.
3. `parseTitle(title): {setRaw, name, condition, foil}` –
   `Magic löskort: <Set>: <Namn>[ (EX)| (Foil)| (Played)…]`. Split på `: `
   i max 3 delar. Parentes-suffix → `parseCondition` / `/foil/i`; default
   NM/false; ta bort suffix ur namnet.
4. Matchning (sätt `printingId`):
   a. Set-mappning `setRaw → scryfall setCode` i
      `src/infra/shops/alphaspel-sets.json`. Bygg första versionen från
      `catalog.sets()` där `setName.toLowerCase() === setRaw.toLowerCase()`;
      skriv ut omatchade set och fyll i de största för hand
      (t.ex. `"Magic 2015": "m15"`, `"Origins": "ori"`).
   b. `catalog.findByNameAndSet(name, setCode)`; exakt 1 träff ⇒ klar.
   c. 0 eller >1: hämta produktsidan, JSON-LD `"mpn": "10E-139c"` →
      `findBySetAndNumber("10e","139")` (prova med och utan bokstavssuffix).
      Cacha i tabell `alphaspel_mpn(url PRIMARY KEY, mpn)` i `mtg.db` (egen
      `CREATE TABLE IF NOT EXISTS` i adaptern) så det görs en gång per produkt.
      Titta på 5 mpn med suffix och notera i en kommentar vad suffixet betyder.
   d. Annars `null`.

Test `alphaspel.test.ts` + `fixtures/alphaspel-set.html` (listsida trimmad
till 3 `div.product`, hämta en gång från `/2441-10th-edition/`) +
`fixtures/alphaspel-product.html` (`<head>` med JSON-LD). Assert:
parseListPage-fält, parseTitle (ren, `(EX)`, `(Foil)`), mpn-extraktion,
matchning mot in-memory `SqliteCatalog` seedad med 2 printings (ett unikt,
ett dubblerat namn som tvingar mpn-vägen – injicera fetch så testet är offline).

Verifiera på riktigt (~10 min listsidor + produktsidor för tvetydiga).
Rapportera rader, matchningsgrad (mål ≥ 85 %), top-20 omatchade `setRaw`.

Commit: `feat(alphaspel): scraper`.
