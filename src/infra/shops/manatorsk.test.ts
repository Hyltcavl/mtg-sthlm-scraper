import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openDb, SqliteCatalog } from "../sqlite.ts";
import { toListings } from "./manatorsk.ts";
import type { PricedPrinting } from "../../domain/ports.ts";

type Product = Parameters<typeof toListings>[0][number];
const fixture = JSON.parse(readFileSync(new URL("../../../fixtures/manatorsk-products.json", import.meta.url), "utf8")) as {
  products: Product[];
};

const solRing: PricedPrinting = {
  printing: {
    id: "2d47121d-8b90-4d28-9ffa-0a640b9dd611",
    name: "Sol Ring",
    setCode: "lcc",
    setName: "The Lost Caverns Of Ixalan Commander",
    collectorNumber: "313",
    imageUri: null,
  },
  price: { eur: 1.5, eurFoil: null },
};

function catalog() {
  const cat = new SqliteCatalog(openDb(":memory:"));
  cat.replaceAll([solRing]);
  return cat;
}

test("toListings maps available Manatorsk variants", () => {
  const listings = toListings(fixture.products, catalog());
  assert.equal(listings.length, 1);
  assert.deepEqual(listings[0], {
    shop: "manatorsk",
    url: "https://manatorsk.com/products/8c39f9b4-02b9-4d44-b8d6-4fd02ebbb0c5",
    name: "Narset, Parter of Veils",
    setRaw: "War Of The Spark",
    condition: "EX",
    foil: false,
    priceSek: 10,
    qty: null,
    printingId: null,
  });
});

test("toListings filters unavailable variants", () => {
  const listings = toListings(fixture.products.filter((p) => p.title === "Sol Ring"), catalog());
  assert.equal(listings.length, 0);
});

test("toListings matches by sku fallback", () => {
  const product = structuredClone(fixture.products.find((p) => p.title === "Sol Ring"));
  assert.ok(product);
  product.handle = "not-in-catalog";
  product.tags = product.tags.filter((t) => !t.startsWith("Scryfall ID_"));
  product.variants[0].available = true;
  const listings = toListings([product], catalog());
  assert.equal(listings.length, 1);
  assert.equal(listings[0].printingId, solRing.printing.id);
  assert.equal(listings[0].priceSek, 25);
  assert.equal(listings[0].condition, "NM");
});

test("toListings matches by tag and foil", () => {
  const product = structuredClone(fixture.products.find((p) => p.title === "Sol Ring"));
  assert.ok(product);
  product.handle = "not-in-catalog";
  product.tags = product.tags.map((t) => t === "Foil_Regular" ? "Foil_Foil" : t);
  product.variants[1].available = true;
  const listings = toListings([product], catalog());
  assert.equal(listings[0].printingId, solRing.printing.id);
  assert.equal(listings[0].foil, true);
});

test("toListings skips non-singles", () => {
  const product = { ...fixture.products[0], product_type: "Sealed" };
  assert.equal(toListings([product], catalog()).length, 0);
});
