import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import * as cheerio from "cheerio";
import type { Condition, Listing } from "../../domain/listing.ts";
import type { CardCatalog, ScrapeOptions, ShopScraper } from "../../domain/ports.ts";
import { politeFetch } from "../http.ts";

const BASE = "https://astraeus.dragonslair.se";
const LIST = `${BASE}/product/magic/card-singles/store:kungsholmstorg`;
const CMCS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16];

export type Row = {
  id: string;
  rawName: string;
  priceSek: number;
  buyinSek: number;
  buyinFull: boolean;
  setRaw: string;
  number: string; // e.g. "CMM-656"
  qty: number;
};

export function parseListPage(html: string): { rows: Row[]; lastPage: number } {
  const $ = cheerio.load(html);
  const pages = $("div.container.align-center.pagination a").toArray();
  // links: « < 1 2 3 … N > »  → last page number is third from the end
  const lastPage = pages.length >= 3 ? Number($(pages[pages.length - 3]).text().trim()) || 1 : 1;
  const rows = $("tr[id^='product-row-']").toArray().map((el): Row => {
    const tr = $(el);
    const tds = tr.find("td");
    const setCell = tds.eq(1);
    return {
      id: tr.attr("data-id") ?? "",
      rawName: tr.attr("data-name") ?? "",
      priceSek: Number(tr.attr("data-price")),
      buyinSek: Number(tr.attr("data-buyin")),
      buyinFull: tds.eq(7).find("span.format-important").text().trim() === "Fullt",
      setRaw: (setCell.find("img[title]").attr("title") ?? setCell.text()).trim(),
      number: tds.eq(2).text().trim(),
      qty: Number(tr.find("span.stock").first().text().trim()) || 0,
    };
  });
  return { rows, lastPage };
}

const SUFFIX = /\s*\((?:[^)]*)\)|\s*\[[^\]]*\]/g;

function conditionOf(raw: string): Condition {
  if (/\(skadad\)/i.test(raw)) return "PO";
  if (/\(spelad\)/i.test(raw)) return "PL";
  return "NM";
}

const sameCard = (a: string, b: string) => {
  const [x, y] = [a.toLowerCase(), b.toLowerCase()];
  return x === y || x.startsWith(`${y} //`) || y.startsWith(`${x} //`);
};

/**
 * DL "number" is `<SETCODE>-<number>`. Codes mostly equal Scryfall's, but:
 * - promo sets (PAFR, PSTX…) keep the number and Scryfall appends a suffix: prerelease = `p`
 * - Secret Lair cards carry the base set's code, so the number is meaningless there
 * - placeholders (PUMA-000, 59719, 010/010) never match; the name+set fallback handles them
 * A number hit is only trusted if the card name agrees.
 */
export function matchPrinting(r: Row, name: string, catalog: CardCatalog, setCodeByName: Map<string, string>): string | null {
  const [prefix, ...rest] = r.number.split("-");
  const code = prefix?.toLowerCase() ?? "";
  const num = rest.join("-").replace(/^0+(?=\d)/, "");
  const secretLair = /^secret lair/i.test(r.setRaw);
  if (!secretLair && code && num) {
    const tries = /\(prerelease\)/i.test(r.rawName) ? [`${num}p`, num] : [num];
    for (const n of tries) {
      const hit = catalog.findBySetAndNumber(code, n);
      if (hit && sameCard(hit.name, name)) return hit.id;
    }
  }
  const setCode = secretLair ? "sld" : setCodeByName.get(r.setRaw.toLowerCase()) ?? code;
  const hits = setCode ? catalog.findByNameAndSet(name, setCode) : [];
  return hits.length === 1 ? hits[0].id : null;
}

export function toListings(rows: Row[], catalog: CardCatalog, listUrl = LIST): Listing[] {
  const setCodeByName = new Map(catalog.sets().map(([code, name]) => [name.toLowerCase(), code]));
  return rows.flatMap((r) => {
    if (/\[token\]/i.test(r.rawName) || r.qty <= 0 || !(r.priceSek > 0)) return [];
    const name = r.rawName.replace(SUFFIX, "").trim();
    const printingId = matchPrinting(r, name, catalog, setCodeByName);
    return [{
      shop: "dragonslair",
      url: `${listUrl}#product-row-${r.id}`,
      name,
      setRaw: r.setRaw,
      condition: conditionOf(r.rawName),
      foil: /\((?:etched foil|foil etched|foil)\)/i.test(r.rawName),
      priceSek: r.priceSek,
      qty: r.qty,
      printingId,
      buyinSek: r.buyinSek > 0 ? r.buyinSek : null,
      buyinFull: r.buyinFull,
    } satisfies Listing];
  });
}

export type DragonslairOptions = {
  maxPages?: number; // cap pages per CMC (testing)
  budget?: number; // max HTTP requests this run; progress is kept, run again to continue
  delayMs?: number; // minimum gap between requests
  progressFile?: string;
};

/** Thrown when the scrape stopped early (budget, block). Progress is saved; run again to resume. */
export class IncompleteScrape extends Error {}

type Chunk = { cmc: number; page: number; last: number; rows: Row[] };

export class DragonslairScraper implements ShopScraper {
  readonly shop = "dragonslair";
  private opts: Required<DragonslairOptions>;
  private get: ReturnType<typeof politeFetch>;
  private requests = 0;

  constructor(opts: DragonslairOptions = {}) {
    this.opts = { maxPages: Infinity, budget: Infinity, delayMs: 2000, progressFile: "data/dragonslair-progress.jsonl", ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)) };
    this.get = politeFetch(this.opts.delayMs);
  }

  // One JSON line per fetched page; append-only so an abort never loses completed pages.
  private load(): Chunk[] {
    if (!existsSync(this.opts.progressFile)) return [];
    return readFileSync(this.opts.progressFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Chunk);
  }

  private async fetchPage(cmc: number, n: number): Promise<string> {
    if (this.requests >= this.opts.budget) throw new IncompleteScrape(`request budget ${this.opts.budget} reached`);
    this.requests++;
    try {
      return await (await this.get(`${LIST}/cmc-${cmc}/${n}`)).text();
    } catch (e) {
      throw new IncompleteScrape(`stopped at cmc-${cmc} page ${n}: ${e instanceof Error ? e.message : e}`);
    }
  }

  async scrape(catalog: CardCatalog, options?: ScrapeOptions): Promise<Listing[]> {
    const file = this.opts.progressFile;
    if (options?.fresh) rmSync(file, { force: true });
    mkdirSync(dirname(file), { recursive: true });
    const chunks = this.load();
    const done = new Map<number, Set<number>>();
    const last = new Map<number, number>();
    for (const c of chunks) {
      (done.get(c.cmc) ?? done.set(c.cmc, new Set()).get(c.cmc)!).add(c.page);
      last.set(c.cmc, c.last);
    }
    console.log(`dragonslair: resuming with ${chunks.length} pages already saved (${file})`);

    try {
      for (const [i, cmc] of CMCS.entries()) {
        const have = done.get(cmc) ?? new Set<number>();
        let lastPage = last.get(cmc) ?? 0;
        for (let n = 1; n === 1 || n <= Math.min(lastPage, this.opts.maxPages); n++) {
          if (have.has(n)) continue;
          const { rows, lastPage: lp } = parseListPage(await this.fetchPage(cmc, n));
          lastPage = lp;
          const chunk: Chunk = { cmc, page: n, last: lp, rows };
          appendFileSync(file, JSON.stringify(chunk) + "\n");
          chunks.push(chunk);
          console.log(`dragonslair: cmc ${cmc} (${i + 1}/${CMCS.length}) page ${n}/${Math.min(lp, this.opts.maxPages)}, ${rows.length} rows, ${this.requests} requests this run`);
        }
      }
    } catch (e) {
      if (e instanceof IncompleteScrape) {
        console.log(`dragonslair: INCOMPLETE - ${e.message}. ${chunks.length} pages saved; run the same command to continue.`);
      }
      throw e;
    }

    const byId = new Map<string, Row>(); // inventory shifts between requests, so a row can appear twice
    for (const c of chunks) for (const r of c.rows) byId.set(r.id, r);
    const listings = toListings([...byId.values()], catalog);
    rmSync(file, { force: true });
    console.log(`dragonslair: done, ${listings.length} listings, ${listings.filter((l) => l.printingId).length} matched`);
    return listings;
  }
}
