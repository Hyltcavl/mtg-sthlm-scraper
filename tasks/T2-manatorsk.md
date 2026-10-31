# T2 – Manatorsk ShopScraper (`src/infra/shops/manatorsk.ts`)

Källa: `https://manatorsk.com/collections/mtg-loskort/products.json?limit=250&page=N`,
N = 1… tills `products` är tom (~101 sidor). `politeFetch(1000)`.

Verifierad produktform:
```json
{"title":"Sol Ring","handle":"2d47121d-8b90-4d28-9ffa-0a640b9dd611","product_type":"Single",
 "tags":["Foil_Regular","Scryfall ID_2d47121d-…","Set_The Lost Caverns Of Ixalan Commander"],
 "variants":[{"title":"Near Mint","price":"25.00","available":false,"sku":"WZSI-C-LCC-A-313-EN-NM"},
             {"title":"Excellent","price":"27.00","available":true}]}
```

Ren funktion `toListings(products, catalog: CardCatalog): Listing[]`:
- hoppa `product_type !== "Single"`
- `printingId`: `handle` om `catalog.byId(handle)`; annars tag
  `Scryfall ID_<uuid>` om den finns i katalogen; annars sku
  `…-LCC-A-313-…` → `catalog.findBySetAndNumber("lcc","313")`; annars `null`.
- `foil = tags.includes("Foil_Foil")`, `setRaw` = `Set_`-tag utan prefix,
  `url = https://manatorsk.com/products/${handle}`, `qty = null`
- per variant med `available === true`: `condition = parseCondition(title) ?? "PL"`,
  `priceSek = Number(price)`.

`scrape(catalog)` = paginera → `toListings` → returnera. Logga
`manatorsk: N listings, M matched`.

Test `manatorsk.test.ts` + `fixtures/manatorsk-products.json`: hämta sida 1
en gång, trimma till 3 produkter varav minst en med `available: true`.
Fake-katalog = `new SqliteCatalog(openDb(":memory:"))` seedad med Sol Ring.
Assert: antal rader, pris, skick, foil, printingId, att otillgängliga
varianter filtreras, att sku-fallback fungerar.

Verifiera på riktigt mot `mtg.db` (T1 fyller `printings` parallellt – om tom,
rapportera ändå antal rader). Förväntat ~4–5 000 listningar.

Commit: `feat(manatorsk): scraper`.
