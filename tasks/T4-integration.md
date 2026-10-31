# T4 – Use cases, CLI, README (efter T1, T2, T3, T5)

`src/app/`:
- `refreshCatalog(source: PriceSource, catalog: CardCatalog)`
- `scrapeShop(scraper: ShopScraper, catalog, repo: ListingRepository)`
- `findDeals(repo, catalog, policy?): Deal[]` – `repo.all()` → `catalog.byId`
  → `evaluateDeal`, sortera `diffPct` desc. Test med in-memory sqlite och
  3 listningar (deal, för dyr, omatchad).

`src/cli.ts`: `refresh | scrape <manatorsk|alphaspel|all> [--fresh] | serve [port]`.
Wire: `openDb()`, `SqliteCatalog`, `SqliteListings`, `ScryfallSource`,
scrapers, `startServer(() => findDeals(...))`. `--fresh` skickas som
`{ fresh: true }` till Alphaspel-scrapern (T3b bygger den signaturen
parallellt: `scrape(catalog, { workers?, fresh? })`; Manatorsk ignorerar).

**Först av allt:** `rm -f mtg.db mtg.db-wal mtg.db-shm` (gammalt schema med
`scryfall_id`) och kör `node src/cli.ts refresh` så snart CLI:n finns – T3b
väntar på att `printings` är fylld. Kör sedan `scrape manatorsk` (2 min).
Kör **inte** `scrape alphaspel` – det gör T3b.

Kör kedjan på riktigt så långt det går utan Alphaspel, öppna sidan, kontrollera
5 Manatorsk-deals för hand mot butik + Cardmarket. Justera `DEFAULT_POLICY`
om det är bulkbrus. Rapportera matchningsgrad och antal deals.

README.md: installation, de fyra kommandona, cron-rad. Kort.

Commit: `feat: cli, use cases, readme`.
