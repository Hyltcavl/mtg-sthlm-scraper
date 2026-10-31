# T7 – Dragon's Lair ShopScraper + inköpspris (`src/infra/shops/dragonslair.ts`)

Rekognosering (verifierad 2026-10-31). Referens: Hyltcavl/mtg-prz-rust
(`dragonslair_scraper.rs`, `card_parser.rs`).

## Åtkomst
- `/product/tag/card-singles` (URL:en från uppdraget) ger **403 Cloudflare** för
  curl/fetch. **Använd inte den.**
- Rust-repots URL fungerar (200, ingen auth, vanlig UA):
  `https://astraeus.dragonslair.se/product/magic/card-singles/store:kungsholmstorg/cmc-{N}/{page}`
- `store:kungsholmstorg` = bara kort i lager i den butiken. Utan store-filter =
  hela sortimentet (även slut) – avgör med användaren om slutsålda ska med.
- robots.txt blockerar bara AI-träningsbottar, inte `*`. Håll 1 req/s (`politeFetch`).
  Risk: Cloudflare kan börja blocka → backoff på 403/429, avbryt snyggt.

## Paginering
- CMC-facetter: 0–13, 15, 16 (alla finns i sidans sidopanel).
- Sidantal per CMC: `div.container.align-center.pagination a` – siffran i
  näst-sista-tre länken (`« < 1 2 3 4 … 145 > »`), annars 1 sida. cmc-3 = 145 sidor
  (36 rader/sida) ⇒ totalt ~ några hundra–tusen requests ≈ 10–30 min vid 1 req/s.
  Alternativ: gå tills sidan har 0 `tr[id^=product-row-]`.

## HTML per rad: `tr[id^="product-row-"]`
Data finns som attribut – parsa dem, inte celltext:
| Fält | Källa |
|------|-------|
| `sku`/produkt-id | `data-id` |
| namn | `data-name` (suffix: `(Foil)`, `(Borderless)`, `(Showcase)`, `(Extended Art)`, `(Prerelease)`, `(Skadad)`, `(Spelad)`, `[Token]`) |
| **säljpris** (butik → kund) | `data-price` (SEK) |
| **inköpspris** (butik köper av oss) | `data-buyin` (SEK) |
| set | `img[title]` i 2:a cellen, annars länktexten (`td.align-right a`) |
| collector number | 3:e `td` (`CMM-656`, `PUMA-000` = SETKOD-nr) |
| lager | `span.stock` (`1 / 1 st`; 2:a talet = max/önskat) |
| bild | `a.fancybox[href]` → `https://astraeus.dragonslair.se` + href |
| "Slut"/"Fullt" | `span.format-important` i Inbyte-cellen (Fullt = tar ej emot fler); pris-span `format-bold` = i lager, `format-subtle` = slut |

Inköpspris `data-buyin` gäller NM; "Fullt" betyder butiken köper inte fler just nu
→ spara flaggan, så pris inte tolkas som aktuell inlösen.

## Domänändring (kräver OK – `src/domain/*` är kontrakt)
- `Shop`: lägg till `"dragonslair"`.
- `Listing`: nytt valfritt fält `buyinSek: number | null` (+ `buyinOpen: boolean`)
  – null för butiker utan inköp. Alternativ: separat typ `BuyOffer` + repo; enklare
  = fältet på Listing. Lagra i `listings`-tabellen (migrera kolumn i `sqlite.ts`).
- Skick: DL listar skick i namnet (`(Skadad)`, `(Spelad)`); inget = NM.
  Skadad/Spelad ⇒ `parseCondition`-utökning (skadad→PO, spelad→PL) – eller hoppa
  över som Rust-versionen (rekommenderas inte; vi vill ha dem).
  Token (`[Token]`) hoppas över.
- Ny `findBuylist`-vy (valfri, senare): kort där `buyinSek` > köppris hos annan
  butik = arbitrage, + inköp vs Cardmarket-fair value.

## Matchning
`catalog.findBySetAndNumber(setCode, number)` från `data-` kolla 3:e cellen
(`CMM-656` → `cmm`, `656`); fallback `findByNameAndSet(namn utan suffix, mappad set)`
via set-namn→kod-karta (`catalog.sets()`); annars `printingId = null`.
Special: `PUMA-000`-liknande placeholder-nummer → matcha på namn+set.

## Implementation (ponytail)
1. `parseListPage(html): {rows: DlRow[], lastPage: number}` – ren, cheerio.
2. `toListings(rows, catalog): Listing[]` – ren, filtrerar `[Token]`, qty från `stock`.
3. `scrape(catalog, {workers, fresh})`: per CMC hämta sida 1 → lastPage → resten;
   checkpoint per (cmc,page) som Alphaspel (`dragonslair_progress`/`_staging`),
   workers claimar atomiskt; en politeFetch-klient (delad 1 req/s, inte per worker).
4. Registrera i `cli.ts` (`scrape dragonslair`) och `scrapeShop.ts`.
5. Webb: kolumn "Inköp" i `/api/deals`/index.html (valfritt, senare).

## Tester (`dragonslair.test.ts`, offline)
- Fixture `fixtures/dragonslair-list.html` (sparad: cmc-3 sida 2, 36 rader, trimma
  till ~4 rader inkl. Foil, Borderless, `PUMA-000`, ett utan set-ikon).
- Assert: `priceSek` = `data-price`, `buyinSek` = `data-buyin`, foil-flagga,
  suffix rensat från `name`, set/nummer, qty, `lastPage` = 145, 1 sida när pagination saknas.

## Öppna frågor till användaren
1. Bara Kungsholmstorg-lager, eller hela sortimentet (inkl. slut)?
2. OK att utöka domänen (`Shop`, `Listing.buyinSek`)?
3. Ska inköpspris användas i dealvyn (arbitrage/buylist) nu eller bara samlas in?

Commit: `feat(dragonslair): scraper with buy-in prices`.

## Status
Implementerad: Kungsholmstorg-lager, `Shop`+`Listing.buyinSek/buyinFull`, DB-migrering, CLI `scrape dragonslair`. Utan checkpointing (sekventiell, 1 req/s). Dealvyn använder ännu inte inköpspris.
