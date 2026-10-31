# AGENTS.md – kontrakt för alla agenter

Läs `PLAN.md` (domänmodell + arkitektur) och koden i `src/domain/` först –
**den är kontraktet**. Ändra inte `src/domain/*` eller `src/infra/sqlite.ts`
utan att säga till; alla andra bygger mot dem.

## Regler
- TypeScript, Node 26, kör `.ts` direkt (`node src/x.ts`). Endast *erasable*
  syntax: inga `enum`, inga parameter properties (`constructor(private x)`),
  `import type` för typer, `.ts`-ändelse i relativa imports.
- Beroenden: `cheerio` finns. Inga nya utan motivering.
- Ponytail: minsta kod som fungerar. Ingen abstraktion med en användare.
  Rena funktioner för parsning, I/O i tunna wrappers.
- DDD: adapters översätter butikens språk → `Listing`/`Printing` vid gränsen.
  Domänen ser aldrig Shopify-JSON eller HTML.
- **Tester är obligatoriska.** `node --test`, fil `x.test.ts` bredvid `x.ts`.
  Parsning testas mot sparade fixtures i `fixtures/`. Inget test går online.
- Grönt innan commit: `npm run typecheck && npm test`.
- Nätverk: använd `politeFetch()` från `src/infra/http.ts` (1 req/s, retry).

## Portar att implementera (`src/domain/ports.ts`)
- `ShopScraper { shop; scrape(catalog: CardCatalog, options?: ScrapeOptions): Promise<Listing[]> }`
  – returnerar bara listningar i lager; sätter `printingId` via `catalog`
  (`byId`, `findByNameAndSet`, `findBySetAndNumber`, `findByName`), `null` om omatchad.
- `PriceSource { load(): Promise<PricedPrinting[]> }`

`parseCondition(raw)` i `src/domain/listing.ts` normaliserar skick.

## Git
En commit per task: `feat(manatorsk): scraper`. Lägg bara till egna filer
(`git add <files>`), andra agenter committar samtidigt – retry vid `index.lock`.
Committa med `git -c user.name=teoeng -c user.email=teoeng@local commit -m "..."`
och trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.

## Rapportera
Kort: vad byggdes, testantal, uppmätt matchningsgrad/rader, kända hål.
