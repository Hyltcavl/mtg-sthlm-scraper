import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openDb, SqliteCatalog } from "../sqlite.ts";
import { AlphaspelScraper, parseLastPage, parseListPage, parseMpn, parseSetLinks, parseTitle } from "./alphaspel.ts";
import type { PricedPrinting } from "../../domain/ports.ts";

const setHtml = readFileSync(new URL("../../../fixtures/alphaspel-set.html", import.meta.url), "utf8");
const productHtml = readFileSync(new URL("../../../fixtures/alphaspel-product.html", import.meta.url), "utf8");

test("parseSetLinks maps category anchors", () => {
  assert.deepEqual(parseSetLinks(`<div class="categories"><div class="category-name"><h4><a href="/2441-10th-edition/">10th Edition</a></h4></div></div>`), [
    { url: "https://www.alphaspel.se/2441-10th-edition/", setRaw: "10th Edition" },
  ]);
});

test("parseListPage maps in-stock products", () => {
  const items = parseListPage(setHtml);
  assert.equal(items.length, 3);
  assert.deepEqual(items[0], {
    url: "https://www.alphaspel.se/2441-10th-edition/168029-magic-loskort-10th-edition-drudge-skeletons",
    title: "Magic löskort: 10th Edition: Drudge Skeletons",
    priceSek: 10,
    qty: 2,
  });
});

test("parseTitle extracts set, name, condition, and foil", () => {
  assert.deepEqual(parseTitle("Magic löskort: 10th Edition: Drudge Skeletons"), {
    setRaw: "10th Edition", name: "Drudge Skeletons", condition: "NM", foil: false,
  });
  assert.deepEqual(parseTitle("Magic löskort: 10th Edition: Drudge Skeletons (EX)"), {
    setRaw: "10th Edition", name: "Drudge Skeletons", condition: "EX", foil: false,
  });
  assert.deepEqual(parseTitle("Magic löskort: 10th Edition: Drudge Skeletons (Foil)"), {
    setRaw: "10th Edition", name: "Drudge Skeletons", condition: "NM", foil: true,
  });
});

test("parseMpn reads product JSON-LD", () => {
  assert.equal(parseMpn(productHtml), "10E-139c");
});

test("AlphaspelScraper matches by name and falls back to cached mpn", async () => {
  const db = openDb(":memory:");
  const catalog = new SqliteCatalog(db);
  catalog.replaceAll(printings());
  const root = `<div class="categories"><div class="category-name"><h4><a href="/2441-10th-edition/">10th Edition</a></h4></div></div>`;
  const list = setHtml.replaceAll("Magic löskort: 10th Edition: Goblin Lore", "Magic löskort: 10th Edition: Ambiguous Card");
  const empty = "<html><body></body></html>";
  const calls: string[] = [];
  const scraper = new AlphaspelScraper(db, async (url: string) => {
    calls.push(url);
    if (url.endsWith("/1978-mtg-loskort/")) return new Response(root);
    if (url.includes("?page=2")) return new Response(empty);
    if (url.includes("168076")) return new Response(productHtml);
    return new Response(list);
  });

  const listings = await scraper.scrape(catalog);
  assert.equal(listings.length, 3);
  assert.equal(listings[0]?.printingId, "drudge");
  assert.equal(listings[1]?.printingId, "drudge");
  assert.equal((db.prepare("SELECT count(*) n FROM alphaspel_mpn").get() as { n: number }).n, 1);
  await scraper.scrape(catalog);
  assert.equal(calls.filter((url) => url.includes("168076")).length, 1);
});

test("AlphaspelScraper skips the product page for ambiguous bulk that can never be a deal", async () => {
  const db = openDb(":memory:");
  const catalog = new SqliteCatalog(db);
  catalog.replaceAll(printings());
  const calls: string[] = [];
  const scraper = new AlphaspelScraper(db, async (url: string) => {
    calls.push(url);
    if (url.endsWith("/1978-mtg-loskort/")) return new Response(rootHtml(["10th Edition"]));
    if (url.includes("?page=")) return new Response("<html></html>");
    return new Response(listHtml("10th Edition", "Bulk Card"));
  });

  const listings = await scraper.scrape(catalog, { workers: 1 });
  assert.equal(listings[0]?.printingId, null);
  assert.equal(calls.filter((url) => url.includes("bulk-card")).length, 0);
});

test("AlphaspelScraper resumes after an interrupted set without refetching done sets", async () => {
  const db = openDb(":memory:");
  const catalog = new SqliteCatalog(db);
  catalog.replaceAll(printings());
  const calls: string[] = [];
  let failSet2 = true;
  const scraper = new AlphaspelScraper(db, async (url: string) => {
    calls.push(url);
    if (url.endsWith("/1978-mtg-loskort/")) return new Response(rootHtml(["10th Edition", "Magic 2011"]));
    if (url.includes("?page=2")) return new Response("<html></html>");
    if (url.includes("magic-2011") && failSet2) {
      failSet2 = false;
      throw new Error("boom");
    }
    return new Response(listHtml(url.includes("magic-2011") ? "Magic 2011" : "10th Edition", url.includes("magic-2011") ? "Lightning Bolt" : "Drudge Skeletons"));
  });

  await assert.rejects(() => scraper.scrape(catalog, { workers: 1 }));
  assert.equal((db.prepare("SELECT count(*) n FROM alphaspel_progress WHERE done_at IS NOT NULL").get() as { n: number }).n, 1);
  const listings = await scraper.scrape(catalog, { workers: 1 });
  assert.equal(listings.length, 2);
  assert.equal(calls.filter((url) => url === "https://www.alphaspel.se/10th-edition/").length, 1);
});

test("AlphaspelScraper fresh reruns completed sets", async () => {
  const db = openDb(":memory:");
  const catalog = new SqliteCatalog(db);
  catalog.replaceAll(printings());
  const calls: string[] = [];
  const scraper = new AlphaspelScraper(db, async (url: string) => {
    calls.push(url);
    if (url.endsWith("/1978-mtg-loskort/")) return new Response(rootHtml(["10th Edition"]));
    if (url.includes("?page=2")) return new Response("<html></html>");
    return new Response(listHtml("10th Edition", "Drudge Skeletons"));
  });

  await scraper.scrape(catalog, { workers: 1 });
  await scraper.scrape(catalog, { workers: 1, fresh: true });
  assert.equal(calls.filter((url) => url === "https://www.alphaspel.se/10th-edition/").length, 2);
});

test("AlphaspelScraper workers claim each set once", async () => {
  const db = openDb(":memory:");
  const catalog = new SqliteCatalog(db);
  catalog.replaceAll(printings());
  const calls: string[] = [];
  const scraper = new AlphaspelScraper(db, async (url: string) => {
    calls.push(url);
    if (url.endsWith("/1978-mtg-loskort/")) return new Response(rootHtml(["10th Edition", "Magic 2011"]));
    if (url.includes("?page=2")) return new Response("<html></html>");
    return new Response(listHtml(url.includes("magic-2011") ? "Magic 2011" : "10th Edition", url.includes("magic-2011") ? "Lightning Bolt" : "Drudge Skeletons"));
  });

  const listings = await scraper.scrape(catalog, { workers: 2 });
  assert.equal(listings.length, 2);
  assert.equal(calls.filter((url) => url === "https://www.alphaspel.se/10th-edition/").length, 1);
  assert.equal(calls.filter((url) => url === "https://www.alphaspel.se/magic-2011/").length, 1);
});

test("parseLastPage reads the highest page link, 1 without pagination", () => {
  const pager = (hrefs: string[]) => `<ul class="pagination">${hrefs.map((h) => `<li class="page-item"><a class="page-link" href="${h}">x</a></li>`).join("")}</ul>`;
  assert.equal(parseLastPage("<html></html>"), 1);
  assert.equal(parseLastPage(pager(["/s/?page=2", "/s/?page=3", "/s/?page=12", "/s/?page=14"])), 14);
  assert.equal(parseLastPage(pager(["/s/?order_by=name&page=5"])), 5);
});

test("AlphaspelScraper fetches exactly the linked pages, no probe past the end", async () => {
  const db = openDb(":memory:");
  const catalog = new SqliteCatalog(db);
  catalog.replaceAll(printings());
  const calls: string[] = [];
  const pager = `<ul class="pagination"><li><a href="/10th-edition/?page=2">2</a></li><li><a href="/10th-edition/?page=3">3</a></li></ul>`;
  const scraper = new AlphaspelScraper(db, async (url: string) => {
    calls.push(url);
    if (url.endsWith("/1978-mtg-loskort/")) return new Response(rootHtml(["10th Edition"]));
    const page = Number(/page=(\d+)/.exec(url)?.[1] ?? 1);
    return new Response(listHtml("10th Edition", `Drudge Skeletons`) + (page === 1 ? pager : ""));
  });

  await scraper.scrape(catalog, { workers: 1 });
  assert.deepEqual(calls.filter((u) => u.includes("10th-edition")).map((u) => u.slice(u.indexOf("10th-edition"))), [
    "10th-edition/", "10th-edition/?page=2", "10th-edition/?page=3",
  ]);
});

test("AlphaspelScraper reuses the previous snapshot instead of fetching the product page", async () => {
  const db = openDb(":memory:");
  const catalog = new SqliteCatalog(db);
  catalog.replaceAll(printings());
  const list = setHtml.replaceAll("Magic löskort: 10th Edition: Goblin Lore", "Magic löskort: 10th Edition: Ambiguous Card");
  const url = parseListPage(list).find((i) => i.url.includes("168076"))!.url;
  const calls: string[] = [];
  const fetchFake = async (u: string) => {
    calls.push(u);
    if (u.endsWith("/1978-mtg-loskort/")) return new Response(`<div class="categories"><div class="category-name"><h4><a href="/2441-10th-edition/">10th Edition</a></h4></div></div>`);
    if (u.includes("168076")) return new Response(productHtml);
    return new Response(list);
  };

  const listings = await new AlphaspelScraper(db, fetchFake, new Map([[url, "drudge"]])).scrape(catalog, { workers: 1 });
  assert.equal(listings.find((l) => l.url === url)?.printingId, "drudge");
  assert.equal(calls.filter((u) => u.includes("168076")).length, 0);
});

function printings(): PricedPrinting[] {
  const base = { setCode: "10e", setName: "Tenth Edition", imageUri: null };
  const eur5 = { eur: 5, eurFoil: null };
  return [
    { printing: { ...base, id: "drudge", name: "Drudge Skeletons", collectorNumber: "139" }, price: eur5 },
    { printing: { ...base, id: "viashino", name: "Viashino Sandscout", collectorNumber: "240" }, price: eur5 },
    { printing: { ...base, id: "ambiguous-a", name: "Ambiguous Card", collectorNumber: "1" }, price: eur5 },
    { printing: { ...base, id: "ambiguous-b", name: "Ambiguous Card", collectorNumber: "2" }, price: eur5 },
    { printing: { ...base, id: "bulk-a", name: "Bulk Card", collectorNumber: "3" }, price: { eur: 0.5, eurFoil: null } },
    { printing: { ...base, id: "bulk-b", name: "Bulk Card", collectorNumber: "4" }, price: { eur: 0.5, eurFoil: null } },
    { printing: { setCode: "m11", setName: "Magic 2011", imageUri: null, id: "bolt", name: "Lightning Bolt", collectorNumber: "149" }, price: eur5 },
  ];
}

function rootHtml(sets: string[]) {
  return `<div class="categories">${sets.map((s) => `<div class="category-name"><h4><a href="/${slug(s)}/">${s}</a></h4></div>`).join("")}</div>`;
}

function listHtml(setRaw: string, name: string) {
  return `<div class="product">
    <a href="/${slug(setRaw)}/${slug(name)}"></a>
    <div class="product-name">Magic löskort: ${setRaw}: ${name}</div>
    <div class="price">10 kr</div>
    <div class="stock">1 på postorder</div>
  </div>`;
}

function slug(s: string) {
  return s.toLowerCase().replaceAll(" ", "-");
}
