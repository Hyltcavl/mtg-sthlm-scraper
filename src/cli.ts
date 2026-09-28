import { openDb, SqliteCatalog, SqliteListings } from "./infra/sqlite.ts";
import { ScryfallSource } from "./infra/scryfall/scryfall.ts";
import { ManatorskScraper } from "./infra/shops/manatorsk.ts";
import { AlphaspelScraper } from "./infra/shops/alphaspel.ts";
import { startServer } from "./web/server.ts";
import { refreshCatalog } from "./app/refreshCatalog.ts";
import { scrapeShop } from "./app/scrapeShop.ts";
import { findDeals } from "./app/findDeals.ts";
import type { ShopScraper } from "./domain/ports.ts";

const args = process.argv.slice(2);
const command = args[0];

try {
  if (command === "refresh") {
    const db = openDb();
    const count = await refreshCatalog(new ScryfallSource(), new SqliteCatalog(db));
    console.log(`refresh: ${count} printings`);
  } else if (command === "scrape") {
    const target = args[1];
    const fresh = args.includes("--fresh");
    if (target !== "manatorsk" && target !== "alphaspel" && target !== "all") usage();
    const db = openDb();
    const catalog = new SqliteCatalog(db);
    const repo = new SqliteListings(db);
    const scrapers: ShopScraper[] = [new ManatorskScraper(), new AlphaspelScraper(db)];
    for (const scraper of scrapers.filter((s) => target === "all" || s.shop === target)) {
      const count = await scrapeShop(scraper, catalog, repo, fresh ? { fresh: true } : undefined);
      console.log(`scrape ${scraper.shop}: saved ${count} listings`);
    }
  } else if (command === "serve") {
    const port = Number(args[1] ?? 3000);
    if (!Number.isInteger(port) || port <= 0) usage();
    const db = openDb();
    const catalog = new SqliteCatalog(db);
    const repo = new SqliteListings(db);
    startServer(() => findDeals(repo, catalog), port);
    console.log(`serve: http://localhost:${port}`);
  } else {
    usage();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

function usage(): never {
  console.error("usage: node src/cli.ts refresh | scrape <manatorsk|alphaspel|all> [--fresh] | serve [port]");
  process.exit(1);
}
