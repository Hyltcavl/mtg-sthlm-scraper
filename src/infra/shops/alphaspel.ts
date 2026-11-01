import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import * as cheerio from "cheerio";
import type { Listing } from "../../domain/listing.ts";
import { parseCondition } from "../../domain/listing.ts";
import { evaluateDeal } from "../../domain/valuation.ts";
import type { CardCatalog, ScrapeOptions, ShopScraper } from "../../domain/ports.ts";
import { politeFetch } from "../http.ts";

const BASE = "https://www.alphaspel.se";
const ROOT = `${BASE}/1978-mtg-loskort/`;
const SETS_FILE = new URL("./alphaspel-sets.json", import.meta.url);

type Fetcher = ReturnType<typeof politeFetch>;
type SetLink = { url: string; setRaw: string };
type RawListItem = { url: string; title: string; priceSek: number; qty: number };
type ParsedTitle = Pick<Listing, "setRaw" | "name" | "condition" | "foil">;
type StagingRow = {
  url: string; name: string; set_raw: string; condition: Listing["condition"]; foil: number;
  price_sek: number; qty: number | null; printing_id: string | null;
};

export function parseSetLinks(html: string): SetLink[] {
  const $ = cheerio.load(html);
  return $("div.categories .category-name h4 a[href]").toArray().map((a) => ({
    url: absolute($(a).attr("href") ?? ""),
    setRaw: clean($(a).text()),
  })).filter((l) => l.url && l.setRaw);
}

export function parseListPage(html: string): RawListItem[] {
  const $ = cheerio.load(html);
  return $("div.product").toArray().flatMap((el) => {
    const product = $(el);
    const stockText = product.find(".stock").first().text();
    const qty = /([0-9]+)\s*på/i.exec(stockText)?.[1];
    if (!qty) return [];
    const price = /([0-9]+)\s*kr/i.exec(product.find(".price").first().text())?.[1];
    const href = product.find("a[href]").first().attr("href");
    const titleEl = product.find(".product-name").first().clone();
    titleEl.find("small").remove();
    if (!href || !price) return [];
    return [{ url: absolute(href), title: clean(titleEl.text()), priceSek: Number(price), qty: Number(qty) }];
  });
}

/** Highest page number linked from the pagination (page 1 already links the last page). 1 if none. */
export function parseLastPage(html: string): number {
  const $ = cheerio.load(html);
  const pages = $("ul.pagination a[href]").toArray().map((a) => Number(/[?&]page=(\d+)/.exec($(a).attr("href") ?? "")?.[1]));
  return Math.max(1, ...pages.filter(Number.isFinite));
}

export function parseTitle(title: string): ParsedTitle {
  const [, setRaw = "", ...nameParts] = title.split(": ");
  let name = nameParts.join(": ").trim();
  let condition: Listing["condition"] = "NM";
  let foil = false;
  for (;;) {
    const match = /\s*\(([^()]+)\)\s*$/.exec(name);
    if (!match) break;
    const raw = match[1] ?? "";
    const parsed = parseCondition(raw);
    if (/foil/i.test(raw)) foil = true;
    else if (parsed) condition = parsed;
    else break;
    name = name.slice(0, match.index).trim();
  }
  return { setRaw: setRaw.trim(), name, condition, foil };
}

export function parseMpn(html: string): string | null {
  const $ = cheerio.load(html);
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    try {
      const found = findMpn(JSON.parse($(el).text()));
      if (found) return found;
    } catch {
      // ignore unrelated broken structured data
    }
  }
  return null;
}

export class AlphaspelScraper implements ShopScraper {
  readonly shop = "alphaspel";
  private db: DatabaseSync;
  private getFactory: () => Fetcher;
  private staticMap: Record<string, string>;
  private known: Map<string, string>;

  /** `known`: product url -> printing id from the previous snapshot; saves the product-page fetch for cards seen before. */
  constructor(db: DatabaseSync, get?: Fetcher | (() => Fetcher), known = new Map<string, string>()) {
    this.db = db;
    this.known = known;
    this.getFactory = get ? normalizeFetcher(get) : () => politeFetch(1000);
    this.staticMap = JSON.parse(readFileSync(SETS_FILE, "utf8")) as Record<string, string>;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS alphaspel_mpn (url TEXT PRIMARY KEY, mpn TEXT);
      CREATE TABLE IF NOT EXISTS alphaspel_progress (
        set_url TEXT PRIMARY KEY, set_raw TEXT NOT NULL,
        claimed_at TEXT, done_at TEXT);
      CREATE TABLE IF NOT EXISTS alphaspel_staging (
        url TEXT, name TEXT, set_raw TEXT, condition TEXT, foil INTEGER,
        price_sek REAL, qty INTEGER, printing_id TEXT, set_url TEXT NOT NULL,
        PRIMARY KEY (url, condition, foil));
    `);
  }

  async scrape(catalog: CardCatalog, options: ScrapeOptions = {}): Promise<Listing[]> {
    const workers = options.workers ?? 3;
    const rootGet = this.getFactory();
    const setLinks = parseSetLinks(await this.text(ROOT, rootGet));
    if (options.fresh) this.db.exec("DELETE FROM alphaspel_progress; DELETE FROM alphaspel_staging");
    this.prepareProgress(setLinks);
    const setMap = this.setMap(catalog, setLinks);
    // ponytail: spec asks 3 polite clients for throughput; keep the default capped at 3 req/s total.
    await Promise.all(Array.from({ length: Math.max(1, workers) }, (_, i) => this.work(i + 1, setMap, catalog)));
    const listings = this.stagedListings();
    const matched = listings.filter((l) => l.printingId).length;
    console.log(`alphaspel: ${listings.length} listings, ${matched} matched (${pct(matched, listings.length)}%)`);
    return listings;
  }

  async rematch(catalog: CardCatalog): Promise<Listing[]> {
    const setMap = this.setMap(catalog, this.db.prepare("SELECT set_url url, set_raw setRaw FROM alphaspel_progress").all() as SetLink[]);
    const rows = this.db.prepare("SELECT rowid id, url, name, set_raw, condition, foil, price_sek, qty FROM alphaspel_staging").all() as {
      id: number; url: string; name: string; set_raw: string; condition: Listing["condition"]; foil: number; price_sek: number; qty: number | null;
    }[];
    const upd = this.db.prepare("UPDATE alphaspel_staging SET printing_id = ? WHERE rowid = ?");
    const get = this.getFactory();
    for (const r of rows) {
      const listing: Listing = {
        shop: "alphaspel", url: r.url, name: r.name, setRaw: r.set_raw, condition: r.condition,
        foil: r.foil === 1, priceSek: r.price_sek, qty: r.qty, printingId: null,
      };
      upd.run(await this.resolve(listing, setMap[r.set_raw], catalog, get), r.id);
    }
    return this.stagedListings();
  }

  private prepareProgress(setLinks: SetLink[]) {
    const ins = this.db.prepare("INSERT OR IGNORE INTO alphaspel_progress (set_url, set_raw) VALUES (?, ?)");
    this.db.exec("BEGIN");
    try {
      for (const l of setLinks) ins.run(l.url, l.setRaw);
      this.db.prepare("UPDATE alphaspel_progress SET claimed_at = NULL WHERE done_at IS NULL").run();
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  private async work(worker: number, setMap: Record<string, string>, catalog: CardCatalog) {
    const get = this.getFactory();
    for (;;) {
      const setLink = this.claim();
      if (!setLink) return;
      const listings = await this.scrapeSet(setLink, setMap, catalog, get);
      this.commitSet(setLink, listings);
      const done = (this.db.prepare("SELECT count(*) n FROM alphaspel_progress WHERE done_at IS NOT NULL").get() as { n: number }).n;
      const total = (this.db.prepare("SELECT count(*) n FROM alphaspel_progress").get() as { n: number }).n;
      console.log(`alphaspel [w${worker}] ${done}/${total} ${setLink.setRaw}: ${listings.length} listings`);
    }
  }

  private claim(): SetLink | null {
    const now = new Date().toISOString();
    const row = this.db.prepare(`
      UPDATE alphaspel_progress SET claimed_at = ?
      WHERE set_url = (
        SELECT set_url FROM alphaspel_progress
        WHERE done_at IS NULL AND claimed_at IS NULL
        LIMIT 1
      )
      RETURNING set_url, set_raw
    `).get(now) as { set_url: string; set_raw: string } | undefined;
    return row ? { url: row.set_url, setRaw: row.set_raw } : null;
  }

  private async scrapeSet(setLink: SetLink, setMap: Record<string, string>, catalog: CardCatalog, get: Fetcher) {
    const listings: Listing[] = [];
    let last = 1; // page 1 links the last page, so no extra request is needed to find the end
    for (let page = 1; page <= last; page++) {
      const html = await this.optionalText(pageUrl(setLink.url, page), get);
      if (html == null) break;
      if (!cheerio.load(html)("div.product").length) break;
      last = Math.max(last, parseLastPage(html));
      for (const item of parseListPage(html)) listings.push(await this.toListing(item, setMap, catalog, get));
    }
    return listings;
  }

  private commitSet(setLink: SetLink, listings: Listing[]) {
    const ins = this.db.prepare("INSERT OR REPLACE INTO alphaspel_staging VALUES (?,?,?,?,?,?,?,?,?)");
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM alphaspel_staging WHERE set_url = ?").run(setLink.url);
      for (const l of listings) ins.run(l.url, l.name, l.setRaw, l.condition, l.foil ? 1 : 0, l.priceSek, l.qty, l.printingId, setLink.url);
      this.db.prepare("UPDATE alphaspel_progress SET done_at = ?, claimed_at = NULL WHERE set_url = ?").run(new Date().toISOString(), setLink.url);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  private stagedListings(): Listing[] {
    return (this.db.prepare("SELECT url, name, set_raw, condition, foil, price_sek, qty, printing_id FROM alphaspel_staging").all() as StagingRow[])
      .map((r) => ({
        shop: "alphaspel", url: r.url, name: r.name, setRaw: r.set_raw, condition: r.condition,
        foil: r.foil === 1, priceSek: r.price_sek, qty: r.qty, printingId: r.printing_id,
      }));
  }

  private setMap(catalog: CardCatalog, links: SetLink[]) {
    const byName = new Map(catalog.sets().map(([code, name]) => [name.toLowerCase(), code.toLowerCase()]));
    const map = { ...this.staticMap };
    const unmatched = [];
    for (const { setRaw } of links) {
      const code = map[setRaw] ?? byName.get(setRaw.toLowerCase());
      if (code) map[setRaw] = code;
      else unmatched.push(setRaw);
    }
    if (unmatched.length) console.log(`alphaspel unmatched sets: ${unmatched.join(", ")}`);
    return map;
  }

  private async toListing(item: RawListItem, setMap: Record<string, string>, catalog: CardCatalog, get: Fetcher): Promise<Listing> {
    const parsed = parseTitle(item.title);
    const listing: Listing = { shop: "alphaspel", url: item.url, ...parsed, priceSek: item.priceSek, qty: item.qty, printingId: null };
    listing.printingId = await this.resolve(listing, setMap[parsed.setRaw], catalog, get);
    return listing;
  }

  /** Name+set first; the product-page fetch (mpn) only when some printing of this name could be a deal. */
  private async resolve(listing: Listing, setCode: string | undefined, catalog: CardCatalog, get: Fetcher) {
    const byName = setCode ? single(catalog.findByNameAndSet(listing.name, setCode)) : null;
    if (byName) return byName.id;
    const seen = this.known.get(listing.url);
    if (seen) return seen;
    // ponytail: bulk that can never pass the deal policy is left unidentified; saves ~90 % of requests.
    const worthIt = catalog.findByName(listing.name).some((p) => evaluateDeal(listing, p.printing, p.price));
    return worthIt ? (await this.matchByMpn(listing.url, catalog, get))?.id ?? null : null;
  }

  private async matchByMpn(url: string, catalog: CardCatalog, get: Fetcher) {
    const mpn = await this.mpn(url, get);
    const match = /^([A-Za-z0-9]+)-(.+)$/.exec(mpn ?? "");
    if (!match) return null;
    const setCode = match[1].toLowerCase();
    const number = match[2];
    // ponytail: Alphaspel's trailing letter distinguishes shop variants; Scryfall collector numbers omit it.
    return catalog.findBySetAndNumber(setCode, number) ?? catalog.findBySetAndNumber(setCode, number.replace(/[a-z]$/i, ""));
  }

  private async mpn(url: string, get: Fetcher) {
    const cached = this.db.prepare("SELECT mpn FROM alphaspel_mpn WHERE url = ?").get(url) as { mpn: string } | undefined;
    if (cached) return cached.mpn || null;
    const mpn = parseMpn(await this.text(url, get)) ?? "";
    this.db.prepare("INSERT OR REPLACE INTO alphaspel_mpn VALUES (?, ?)").run(url, mpn);
    return mpn || null;
  }

  private async text(url: string, get: Fetcher) {
    return await (await get(url, { "User-Agent": "Mozilla/5.0 (compatible; mtg-deal-finder/0.1)" })).text();
  }

  private async optionalText(url: string, get: Fetcher) {
    try {
      return await this.text(url, get);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("404 ")) return null;
      throw e;
    }
  }
}

function normalizeFetcher(get: Fetcher | (() => Fetcher)): () => Fetcher {
  return get.length === 0 ? (get as () => Fetcher) : () => (get as Fetcher);
}

function pageUrl(url: string, page: number) {
  if (page === 1) return url;
  const u = new URL(url);
  u.searchParams.set("page", String(page));
  return u.href;
}

function absolute(href: string) {
  return new URL(href, BASE).href;
}

function clean(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function single<T>(items: T[]) {
  return items.length === 1 ? items[0] : null;
}

function findMpn(value: unknown): string | null {
  if (Array.isArray(value)) return value.map(findMpn).find(Boolean) ?? null;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.mpn === "string") return record.mpn;
  return Object.values(record).map(findMpn).find(Boolean) ?? null;
}

function pct(n: number, total: number) {
  return total ? Math.round((n / total) * 1000) / 10 : 0;
}
