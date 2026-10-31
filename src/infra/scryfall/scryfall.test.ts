import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJsonArrayLines, toPricedPrinting } from "./scryfall.ts";

test("toPricedPrinting maps normal Scryfall cards", () => {
  const item = toPricedPrinting({
    id: "p1",
    name: "Sol Ring",
    lang: "en",
    digital: false,
    set: "lcc",
    set_name: "Lost Caverns of Ixalan Commander",
    collector_number: "313",
    image_uris: { normal: "https://img/sol-ring.jpg" },
    prices: { eur: "1.23", eur_foil: null },
  });

  assert.deepEqual(item, {
    printing: {
      id: "p1",
      name: "Sol Ring",
      setCode: "lcc",
      setName: "Lost Caverns of Ixalan Commander",
      collectorNumber: "313",
      imageUri: "https://img/sol-ring.jpg",
    },
    price: { eur: 1.23, eurFoil: null },
  });
});

test("toPricedPrinting uses the front-face image", () => {
  const item = toPricedPrinting({
    id: "p2",
    name: "Fire // Ice",
    lang: "en",
    digital: false,
    set: "mh2",
    set_name: "Modern Horizons 2",
    collector_number: "290",
    card_faces: [{ image_uris: { normal: "https://img/front.jpg" } }],
    prices: { eur: null, eur_foil: "4.50" },
  });

  assert.equal(item?.printing.imageUri, "https://img/front.jpg");
  assert.deepEqual(item?.price, { eur: null, eurFoil: 4.5 });
});

test("toPricedPrinting filters non-English cards", () => {
  assert.equal(toPricedPrinting({ id: "p3", name: "島", lang: "ja", digital: false }), null);
});

test("parseJsonArrayLines parses a line-wise JSON array", async () => {
  const text = '[\n{"id":"p1"},\n{"id":"p2"}\n]';
  const items = [];
  for await (const item of parseJsonArrayLines(text.split("\n"))) items.push(item);

  assert.deepEqual(items, [{ id: "p1" }, { id: "p2" }]);
});
