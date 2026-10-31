import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openDb, SqliteCatalog, SqliteListings } from "../sqlite.ts";
import { matchPrinting, parseListPage, toListings } from "./dragonslair.ts";

const html = readFileSync(new URL("../../../fixtures/dragonslair-list.html", import.meta.url), "utf8");

function catalog() {
  const cat = new SqliteCatalog(openDb(":memory:"));
  cat.replaceAll([{
    printing: { id: "x1", name: "Extraplanar Lens", setCode: "cmm", setName: "Commander Masters", collectorNumber: "656", imageUri: null },
    price: { eur: 1, eurFoil: null },
  }]);
  return cat;
}

test("parseListPage reads rows and page count", () => {
  const { rows, lastPage } = parseListPage(html);
  assert.equal(lastPage, 145);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    id: "70113", rawName: "Eternal Witness (Foil)", priceSek: 700, buyinSek: 400, buyinFull: true,
    setRaw: "Ultimate Box Topper", number: "PUMA-000", qty: 1,
  });
});

test("toListings gives sell and buy-in price, foil, match", () => {
  const ls = toListings(parseListPage(html).rows, catalog());
  assert.equal(ls.length, 2);
  assert.equal(ls[0].name, "Eternal Witness");
  assert.equal(ls[0].foil, true);
  assert.equal(ls[0].priceSek, 700);
  assert.equal(ls[0].buyinSek, 400);
  assert.equal(ls[0].printingId, null);
  assert.equal(ls[1].name, "Extraplanar Lens");
  assert.equal(ls[1].foil, false);
  assert.equal(ls[1].buyinSek, 100);
  assert.equal(ls[1].printingId, "x1");
});

test("buy-in survives the listings repository", () => {
  const db = openDb(":memory:");
  const repo = new SqliteListings(db);
  repo.replaceForShop("dragonslair", toListings(parseListPage(html).rows, catalog()));
  assert.deepEqual(repo.all().map((l) => [l.buyinSek, l.buyinFull]), [[400, true], [100, true]]);
});

test("no pagination means one page", () => {
  assert.equal(parseListPage("<table></table>").lastPage, 1);
});

test("matchPrinting: prerelease suffix, name guard, secret lair", () => {
  const cat = new SqliteCatalog(openDb(":memory:"));
  const pr = (id: string, name: string, setCode: string, setName: string, collectorNumber: string) =>
    ({ printing: { id, name, setCode, setName, collectorNumber, imageUri: null }, price: { eur: 1, eurFoil: null } });
  cat.replaceAll([
    pr("pre", "Vein Ripper", "pmkm", "Murders at Karlov Manor Promos", "110p"),
    pr("iko", "Eerie Ultimatum", "iko", "Ikoria", "184"),
    pr("other", "Something Else", "abc", "ABC", "1"),
  ]);
  const base = { id: "1", priceSek: 1, buyinSek: 1, buyinFull: false, qty: 1 };
  const m = (rawName: string, name: string, setRaw: string, number: string) =>
    matchPrinting({ ...base, rawName, setRaw, number }, name, cat, new Map());
  assert.equal(m("Vein Ripper (Foil) (Prerelease)", "Vein Ripper", "Murders at Karlov Manor Promos", "PMKM-110"), "pre");
  assert.equal(m("Eerie Ultimatum", "Eerie Ultimatum", "Secret Lair Drop", "IKO-184"), null);
  assert.equal(m("Wrong Name", "Wrong Name", "ABC", "ABC-001"), null);
});
