import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb, SqliteCatalog, SqliteListings } from "./sqlite.ts";
import type { PricedPrinting } from "../domain/ports.ts";
import type { Listing } from "../domain/listing.ts";

const solRing: PricedPrinting = {
  printing: { id: "p1", name: "Sol Ring", setCode: "lcc", setName: "LCC Commander", collectorNumber: "313", imageUri: null },
  price: { eur: 1.5, eurFoil: null },
};
const mdfc: PricedPrinting = {
  printing: { id: "p2", name: "Valakut Awakening // Valakut Stoneforge", setCode: "znr", setName: "Zendikar Rising", collectorNumber: "174", imageUri: "img" },
  price: { eur: 3, eurFoil: 5 },
};

test("catalog replaceAll + lookups", () => {
  const cat = new SqliteCatalog(openDb(":memory:"));
  cat.replaceAll([solRing, mdfc]);
  assert.equal(cat.count(), 2);
  assert.deepEqual(cat.byId("p1"), solRing);
  assert.equal(cat.byId("nope"), null);
  assert.equal(cat.findByNameAndSet("sol ring", "LCC")[0]?.id, "p1");
  assert.equal(cat.findByNameAndSet("Valakut Awakening", "znr")[0]?.id, "p2");
  assert.equal(cat.findByNameAndSet("Sol Ring", "znr").length, 0);
  assert.equal(cat.findBySetAndNumber("ZNR", "174")?.id, "p2");
  assert.deepEqual(cat.sets().sort(), [["lcc", "LCC Commander"], ["znr", "Zendikar Rising"]]);
  cat.replaceAll([solRing]);
  assert.equal(cat.count(), 1);
});

test("listings replaceForShop only touches that shop", () => {
  const repo = new SqliteListings(openDb(":memory:"));
  const l = (shop: Listing["shop"], url: string): Listing => ({
    shop, url, name: "Sol Ring", setRaw: "LCC", condition: "NM", foil: false, priceSek: 25, qty: 2, printingId: "p1",
  });
  repo.replaceForShop("manatorsk", [l("manatorsk", "a"), l("manatorsk", "b")]);
  repo.replaceForShop("alphaspel", [l("alphaspel", "c")]);
  repo.replaceForShop("manatorsk", [l("manatorsk", "a")]);
  const all = repo.all();
  assert.deepEqual(all.map((x) => x.url).sort(), ["a", "c"]);
  assert.deepEqual(all.find((x) => x.url === "a"), l("manatorsk", "a"));
});
