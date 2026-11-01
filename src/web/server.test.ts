import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { startServer, toRow } from "./server.ts";
import type { Deal } from "../domain/valuation.ts";

const deal = (name: string, priceSek: number): Deal => ({
  listing: {
    shop: "manatorsk",
    url: `https://shop.example/${encodeURIComponent(name)}`,
    name,
    setRaw: "Commander",
    condition: "NM",
    foil: false,
    priceSek,
    qty: 2,
    printingId: "p1",
  },
  printing: {
    id: "p1",
    name,
    setCode: "cmd",
    setName: "Commander",
    collectorNumber: "1",
    imageUri: "https://img.example/card.jpg",
  },
  fairValueSek: 100,
  diffSek: 100 - priceSek,
  diffPct: (100 - priceSek) / 100,
});

test("toRow flattens deal", () => {
  assert.deepEqual(toRow(deal("Sol Ring", 70)), {
    shop: "manatorsk",
    name: "Sol Ring",
    setName: "Commander",
    setCode: "cmd",
    condition: "NM",
    foil: false,
    priceSek: 70,
    fairValueSek: 100,
    diffSek: 30,
    diffPct: 0.3,
    qty: 2,
    url: "https://shop.example/Sol%20Ring",
    imageUri: "https://img.example/card.jpg",
    cardmarketUrl: "https://www.cardmarket.com/en/Magic/Products/Search?searchString=Sol%20Ring",
  });
});

test("serves api deals", async () => {
  const server = startServer(() => [deal("Sol Ring", 70), deal("Counterspell", 40)], 0);
  try {
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/deals`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    assert.deepEqual(await res.json(), [
      toRow(deal("Sol Ring", 70)),
      toRow(deal("Counterspell", 40)),
    ]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("index page has the card-name search and the per-shop scrape line", async () => {
  const server = startServer(() => [], 0);
  try {
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;
    const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    assert.match(html, /id="q"[^>]*type="search"|type="search"[^>]*id="q"/);
    assert.match(html, /id="scraped"/);
    assert.match(html, /shops\.json/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
