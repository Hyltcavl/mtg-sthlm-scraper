import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb, SqliteCatalog, SqliteListings } from "../infra/sqlite.ts";
import { findDeals } from "./findDeals.ts";
import type { Listing } from "../domain/listing.ts";

const listing = (over: Partial<Listing>): Listing => ({
  shop: "manatorsk",
  url: "u",
  name: "Sol Ring",
  setRaw: "LCC",
  condition: "NM",
  foil: false,
  priceSek: 10,
  qty: 1,
  printingId: "deal",
  ...over,
});

test("findDeals evaluates matched listings and sorts deals", () => {
  const db = openDb(":memory:");
  const catalog = new SqliteCatalog(db);
  const repo = new SqliteListings(db);
  catalog.replaceAll([
    { printing: { id: "deal", name: "Deal Card", setCode: "tst", setName: "Test", collectorNumber: "1", imageUri: null }, price: { eur: 10, eurFoil: null } },
    { printing: { id: "expensive", name: "Expensive Card", setCode: "tst", setName: "Test", collectorNumber: "2", imageUri: null }, price: { eur: 2, eurFoil: null } },
  ]);
  repo.replaceForShop("manatorsk", [
    listing({ url: "deal", name: "Deal Card", priceSek: 50, printingId: "deal" }),
    listing({ url: "expensive", name: "Expensive Card", priceSek: 30, printingId: "expensive" }),
    listing({ url: "unmatched", name: "Unknown", priceSek: 1, printingId: null }),
  ]);

  const deals = findDeals(repo, catalog);

  assert.equal(deals.length, 1);
  assert.equal(deals[0]?.listing.url, "deal");
  assert.equal(deals[0]?.diffPct, 0.545);
});
