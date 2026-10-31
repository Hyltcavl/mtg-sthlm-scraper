import * as cheerio from "cheerio";
import type { Condition, Listing } from "../../domain/listing.ts";
import type { CardCatalog, ShopScraper } from "../../domain/ports.ts";
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

export class DragonslairScraper implements ShopScraper {
  readonly shop = "dragonslair";
  private get = politeFetch(1000);
  private maxPages: number;

  constructor(maxPages = Infinity) { this.maxPages = maxPages; }

  private async page(cmc: number, n: number): Promise<string> {
    return (await this.get(`${LIST}/cmc-${cmc}/${n}`)).text();
  }

  async scrape(catalog: CardCatalog): Promise<Listing[]> {
    const listings: Listing[] = [];
    for (const cmc of CMCS) {
      const first = parseListPage(await this.page(cmc, 1));
      listings.push(...toListings(first.rows, catalog));
      for (let n = 2; n <= Math.min(first.lastPage, this.maxPages); n++)
        listings.push(...toListings(parseListPage(await this.page(cmc, n)).rows, catalog));
    }
    console.log(`dragonslair: ${listings.length} listings, ${listings.filter((l) => l.printingId).length} matched`);
    return listings;
  }
}
