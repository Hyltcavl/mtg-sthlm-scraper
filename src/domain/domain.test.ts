import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCondition, type Listing } from "./listing.ts";
import { evaluateDeal, fairValueSek } from "./valuation.ts";
import type { Printing } from "./printing.ts";

const printing: Printing = {
  id: "p1", name: "Sol Ring", setCode: "lcc", setName: "LCC", collectorNumber: "313", imageUri: null,
};
const listing = (over: Partial<Listing> = {}): Listing => ({
  shop: "manatorsk", url: "u", name: "Sol Ring", setRaw: "LCC", condition: "NM",
  foil: false, priceSek: 20, qty: null, printingId: "p1", ...over,
});

test("parseCondition maps shop terms", () => {
  assert.equal(parseCondition("Near Mint"), "NM");
  assert.equal(parseCondition("Excellent"), "EX");
  assert.equal(parseCondition("Lightly Played"), "EX");
  assert.equal(parseCondition("Good"), "GD");
  assert.equal(parseCondition("Played"), "PL");
  assert.equal(parseCondition("Heavily Played"), "PL");
  assert.equal(parseCondition("Poor"), "PO");
  assert.equal(parseCondition("Magic löskort: Alpha: Black Lotus"), null);
});

test("fairValueSek applies fx and condition factor", () => {
  assert.equal(fairValueSek({ eur: 5, eurFoil: null }, { condition: "NM", foil: false }, 11), 55);
  assert.equal(fairValueSek({ eur: 5, eurFoil: null }, { condition: "EX", foil: false }, 11), 49.5);
  assert.equal(fairValueSek({ eur: 5, eurFoil: 10 }, { condition: "NM", foil: true }, 11), 110);
});

test("fairValueSek is null without a reference price", () => {
  assert.equal(fairValueSek({ eur: null, eurFoil: null }, { condition: "NM", foil: false }), null);
  assert.equal(fairValueSek({ eur: 5, eurFoil: null }, { condition: "NM", foil: true }), null);
  assert.equal(fairValueSek({ eur: 0, eurFoil: null }, { condition: "NM", foil: false }), null);
});

test("evaluateDeal returns deal when discount and value thresholds are met", () => {
  const d = evaluateDeal(listing({ priceSek: 20, condition: "EX" }), printing, { eur: 5, eurFoil: null }, undefined, 11);
  assert.ok(d);
  assert.equal(d.fairValueSek, 49.5);
  assert.equal(d.diffSek, 29.5);
  assert.equal(d.diffPct, 0.596);
});

test("evaluateDeal keeps cards priced at fair value, rejects above fair, bulk, and unpriced", () => {
  const price = { eur: 5, eurFoil: null };
  const same = evaluateDeal(listing({ priceSek: 55 }), printing, price, undefined, 11);
  assert.ok(same);
  assert.equal(same.diffSek, 0);
  assert.equal(evaluateDeal(listing({ priceSek: 56 }), printing, price, undefined, 11), null);
  assert.equal(evaluateDeal(listing({ priceSek: 1 }), printing, { eur: 1, eurFoil: null }, undefined, 11), null);
  assert.equal(evaluateDeal(listing(), printing, { eur: null, eurFoil: null }), null);
});

test("evaluateDeal honours custom policy", () => {
  const price = { eur: 5, eurFoil: null };
  const strict = { minDiscount: 0.2, minFairValueSek: 0 };
  assert.equal(evaluateDeal(listing({ priceSek: 50 }), printing, price, strict, 11), null);
  const d = evaluateDeal(listing({ priceSek: 40 }), printing, price, strict, 11);
  assert.ok(d);
  assert.equal(d.diffSek, 15);
});
