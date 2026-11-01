# MTG Stockholm Deal Finder

Hämtar löskort från Manatorsk + Alphaspel, jämför mot Cardmarket-pris (via
Scryfall), visar deals i en sorterbar webbsida.

## Rekognosering (verifierad 2026-09-28)

**Manatorsk** – Shopify/BinderPOS. `GET manatorsk.com/collections/mtg-loskort/products.json?limit=250&page=N`
(~25 000 produkter, ~101 requests, ingen auth). `handle` = Scryfall-ID.
`variants[]`: `title` = skick (Near Mint/Excellent/…), `price` SEK-sträng,
`available`. Tag `Foil_Foil`/`Foil_Regular`, `Set_<namn>`. Exakt saldo bara i
produktsidans HTML (`"inventoryQuantity": N`) – MVP använder `available`.

**Alphaspel** – egen HTML-plattform. `alphaspel.se/1978-mtg-loskort/` listar 312
set-kategorier `/<id>-<slug>/`; varje set paginerad `?page=N`, 48 kort/sida
(~1 000 listsidor, ingen sidstorleksparameter). Per kort: `a[href]`, `.product-name`
(`Magic löskort: <Set>: <Namn>`), `.price` (`10 kr`), `.stock` (`2 på postorder`).
Produktsidan har JSON-LD `mpn` = `10E-139c` (SETKOD-collectornr+suffix; suffixet
är butikens variant, Scryfall saknar det). Skick NM om inget annat i titeln.
Svarstid ~0,5 s/sida.

**Scryfall** – `api.scryfall.com/bulk-data` → `default_cards` (gzip-jsonl,
dagligen; cachas som `default_cards.json.gz`). `prices.eur`/`eur_foil` =
Cardmarket-trend i EUR. Kräver EUR→SEK.

## Stack

TypeScript på **Node 26** – kör `.ts` direkt (type stripping), `node:sqlite`,
`fetch`, `node --test`. Beroenden: `cheerio` (Alphaspel-HTML). Dev:
`typescript`, `@types/node`. Inget ramverk, ingen bundler.

## Domänmodell (ubiquitous language)

| Term | Betydelse |
|------|-----------|
| **Printing** | Ett specifikt tryck av ett kort (Scryfall-ID, namn, set, collector number, bild). |
| **MarketPrice** | Cardmarket-referenspris för en Printing: `eur`, `eurFoil`. |
| **Listing** | En butiks erbjudande: Printing (eller omatchad råtext), `condition`, `foil`, `priceSek`, `qty`, `url`. |
| **Condition** | `NM \| EX \| GD \| PL \| PO`. Butikers egna termer normaliseras vid gränsen. |
| **FairValue** | `MarketPrice × EUR/SEK × conditionFactor`. Ren domänregel. |
| **Deal** | Listing vars `priceSek` ligger under FairValue enligt `DealPolicy` (min-rabatt, min-värde). |
| **Shop** | `manatorsk \| alphaspel`. |

Regler (i `src/domain/`, ren TS, noll I/O, 100 % testad):
- `conditionFactor`: NM 1.0, EX 0.9, GD 0.75, PL 0.6, PO 0.4
- `fairValueSek(price, {condition, foil}, fx)`; foil utan `eurFoil` ⇒ inget värde
- `evaluateDeal(listing, printing, price, policy)` → `Deal | null`
- `DealPolicy` default: `minDiscount 0` (at or under fair value), `minFairValueSek 20`

## Arkitektur (hexagonal, tunn)

```
src/
  domain/        printing.ts listing.ts valuation.ts ports.ts   + *.test.ts
  infra/
    http.ts      fetch + UA + 1 req/s + retry
    sqlite.ts    CardCatalog + ListingRepository via node:sqlite   + test (:memory:)
    scryfall/    PriceSource-adapter (bulk → Printing+MarketPrice)  + test (fixture)
    shops/       manatorsk.ts alphaspel.ts (ShopScraper)           + test (fixture)
  app/           refreshCatalog.ts scrapeShop.ts findDeals.ts (use cases)
  web/           server.ts (node:http: / → index.html, /api/deals) + index.html
  cli.ts         node src/cli.ts refresh|scrape <shop> [--fresh] [--workers N]|serve [port]
```

Portar (`domain/ports.ts`):
- `ShopScraper { shop; scrape(catalog, options?: {workers, fresh}): Promise<Listing[]> }`
- `PriceSource { load(): Promise<{printing, price}[]> }`
- `CardCatalog { byId(id); findByNameAndSet(name, setCode); findBySetAndNumber; findByName(name) }`
- `ListingRepository { replaceForShop(shop, listings); all() }`

Scrapers får `CardCatalog` så matchning sker vid gränsen (Alphaspel behöver
set+namn-lookup); domänen ser bara färdiga `Listing` med `printingId | null`.

Alphaspel checkpointar per set i adapter-privata tabeller (`alphaspel_progress`,
`alphaspel_staging`, `alphaspel_mpn`); N workers claimar set atomiskt. Produktsidan
(mpn) hämtas bara när `evaluateDeal` säger att någon printing med det namnet kan
bli en deal – domänregeln styr I/O:t och sparar ~90 % av requesterna. Billiga
tvetydiga kort lämnas därför omatchade med avsikt.

Webb: `node:http` serverar `index.html` + `GET /api/deals` (JSON från
`findDeals`). Sortering/filter i browsern, ~50 rader vanilla JS; hover på
bild/namn visar stor kortbild (ren CSS).

## Tester

`node --test 'src/**/*.test.ts'`. Domän: rena enhetstester. Adapters: parse-
funktioner mot sparade fixtures (`fixtures/*.json|html`). SQLite: `:memory:`.
Inga mocks av nätverk – I/O skiljs från parsning så tester aldrig går online.
Varje task levererar sina tester; inget mergas utan gröna tester + `tsc --noEmit`.

## Status 2026-09-28 22:20

| Task | Status | Bevis |
|------|--------|-------|
| T0 scaffold, domän, portar, sqlite | ✅ | 8 tester |
| T1 scryfall | ✅ | 106 636 printings laddade |
| T2 manatorsk | ✅ | 10 098 listningar, 99.9 % matchade, **0 deals** (priser 13–35 % över trend) |
| T3/T3b alphaspel, återupptagningsbar + lat identifiering | ✅ | 312/312 set, 44 410 listningar, 59 % identifierade (bulk skippas avsiktligt), 10 deals |
| T4 use cases, cli, README | ✅ | commit `731f7ee` |
| T5 web | ✅ | kolumnordning + hover-zoom klara |
| T6 e2e, granskning, commit | 🟡 | sortering verifierad av användaren; deals ej handkontrollerade |

Totalt: `tsc` grönt, 29/29 tester. Committat: plan, scryfall, manatorsk, cli.
**Otrackat:** `src/domain/`, `src/infra/{sqlite,http}.ts`, `src/web/`,
`src/infra/shops/alphaspel*`, `fixtures/`, `package.json`, `tsconfig.json`.

## Öppna frågor

- **Få deals (10 av 54 508 listningar).** Manatorsk 0. Antingen är butikerna
  välprissatta eller så är policyn för hård. Alternativ: sänk `minDiscount`,
  visa även "nära fair" med diff-kolumn, eller jämför mot Cardmarket *low*
  i stället för trend (Scryfall har bara trend).
- Deals ej handkontrollerade mot butik + Cardmarket (T6 steg 2).

## Kvarvarande arbete

T6: handkontrollera 10 deals, besluta policy, ponytail-review, committa allt.

## Alternativ som medvetet skippats

| Skippat | Lägg till när |
|---------|---------------|
| Bun / Hono / Next | Node 26 räcker; UI:t är en tabell |
| ORM (Drizzle/Prisma) | schemat är två tabeller |
| Money-värdeobjekt (öre) | priser är hela kronor; visa om avrundningsfel dyker upp |
| Exakt saldo Manatorsk | hämta `/products/<handle>` bara för Deals |
| Prishistorik | lägg `scrapedAt` i PK, sluta ersätta |
| ECB-kurs | `EUR_SEK` konstant i `valuation.ts` |

## Klart när

`node src/cli.ts refresh && scrape all && serve` → `localhost:3000` visar deals
från båda butikerna, sorterbara på pris, diff SEK, diff %, butik; filter på
butik. ≥ 95 % Manatorsk matchade; Alphaspel: alla kort som kan vara deals
identifierade. Alla tester gröna.
