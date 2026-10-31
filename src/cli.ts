import { openDb, SqliteCatalog, SqliteListings } from "./infra/sqlite.ts";
import { ScryfallSource } from "./infra/scryfall/scryfall.ts";
import { ManatorskScraper } from "./infra/shops/manatorsk.ts";
import { AlphaspelScraper } from "./infra/shops/alphaspel.ts";
import { DragonslairScraper } from "./infra/shops/dragonslair.ts";
import { startServer } from "./web/server.ts";
import { refreshCatalog } from "./app/refreshCatalog.ts";
import { scrapeShop } from "./app/scrapeShop.ts";
import { findDeals } from "./app/findDeals.ts";
import { mkdirSync, copyFileSync, writeFileSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Listing } from "./domain/listing.ts";
import { toRow } from "./web/server.ts";
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
    const workersArg = args[args.indexOf("--workers") + 1];
    const workers = args.includes("--workers") ? Number(workersArg) : undefined;
    if (workers !== undefined && (!Number.isInteger(workers) || workers <= 0)) usage();
    if (target !== "manatorsk" && target !== "alphaspel" && target !== "dragonslair" && target !== "all") usage();
    const num = (flag: string) => (args.includes(flag) ? Number(args[args.indexOf(flag) + 1]) : undefined);
    const dlOpts = { maxPages: num("--pages"), budget: num("--budget"), delayMs: num("--delay") };
    const db = openDb();
    const catalog = new SqliteCatalog(db);
    const repo = new SqliteListings(db);
    const scrapers: ShopScraper[] = [new ManatorskScraper(), new AlphaspelScraper(db), new DragonslairScraper(dlOpts)];
    for (const scraper of scrapers.filter((s) => target === "all" || s.shop === target)) {
      const count = await scrapeShop(scraper, catalog, repo, { fresh, workers });
      console.log(`scrape ${scraper.shop}: saved ${count} listings`);
      const snapshot = args.includes("--snapshot") ? args[args.indexOf("--snapshot") + 1] : undefined;
      if (snapshot && scraper.shop === "dragonslair") {
        mkdirSync(dirname(snapshot), { recursive: true });
        writeFileSync(snapshot, JSON.stringify(repo.all().filter((l) => l.shop === "dragonslair")));
        console.log(`snapshot: ${snapshot}`);
      }
    }
  } else if (command === "load") {
    // Import a committed snapshot (Cloudflare blocks the dragonslair scrape from GitHub runners)
    const file = args[1];
    if (!file) usage();
    const listings = JSON.parse(readFileSync(file, "utf8")) as Listing[];
    new SqliteListings(openDb()).replaceForShop("dragonslair", listings);
    console.log(`load: ${listings.length} dragonslair listings from ${file}`);
  } else if (command === "export") {
    const dir = args[1] ?? "docs";
    const db = openDb();
    const deals = findDeals(new SqliteListings(db), new SqliteCatalog(db));
    mkdirSync(dir, { recursive: true });
    copyFileSync(new URL("./web/index.html", import.meta.url), `${dir}/index.html`);
    writeFileSync(`${dir}/deals.json`, JSON.stringify(deals.map(toRow)));
    writeFileSync(`${dir}/updated.txt`, new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC");
    console.log(`export: ${deals.length} deals -> ${dir}/`);
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
  console.error("usage: node src/cli.ts refresh | scrape <manatorsk|alphaspel|dragonslair|all> [--fresh] [--workers N] [--pages N] [--budget REQUESTS] [--delay MS] [--snapshot file (dragonslair)] | load <file> | export [dir] | serve [port]");
  process.exit(1);
}
