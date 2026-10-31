import type { Listing } from "../../domain/listing.ts";
import { parseCondition } from "../../domain/listing.ts";
import type { CardCatalog, ShopScraper } from "../../domain/ports.ts";
import { politeFetch } from "../http.ts";

const BASE = "https://manatorsk.com";
const PRODUCTS = `${BASE}/collections/mtg-loskort/products.json?limit=250&page=`;

type Variant = {
  title: string;
  price: string;
  available: boolean;
  sku?: string;
};

type Product = {
  title: string;
  handle: string;
  product_type: string;
  tags: string[];
  variants: Variant[];
};

export function toListings(products: Product[], catalog: CardCatalog): Listing[] {
  return products.flatMap((p) => {
    if (p.product_type !== "Single") return [];
    const printingId = matchPrintingId(p, catalog);
    const setRaw = p.tags.find((t) => t.startsWith("Set_"))?.slice(4) ?? "";
    const foil = p.tags.includes("Foil_Foil");
    return p.variants.filter((v) => v.available).map((v) => ({
      shop: "manatorsk",
      url: `${BASE}/products/${p.handle}`,
      name: p.title,
      setRaw,
      condition: parseCondition(v.title) ?? "PL",
      foil,
      priceSek: Number(v.price),
      qty: null,
      printingId,
    }));
  });
}

export class ManatorskScraper implements ShopScraper {
  readonly shop = "manatorsk";
  private get: ReturnType<typeof politeFetch>;

  constructor() {
    this.get = politeFetch(1000);
  }

  async scrape(catalog: CardCatalog): Promise<Listing[]> {
    const listings: Listing[] = [];
    for (let page = 1; ; page++) {
      const res = await this.getPage(page);
      if (!res) break;
      const body = await res.json() as { products: Product[] };
      if (body.products.length === 0) break;
      listings.push(...toListings(body.products, catalog));
    }
    console.log(`manatorsk: ${listings.length} listings, ${listings.filter((l) => l.printingId).length} matched`);
    return listings;
  }

  private async getPage(page: number) {
    try {
      return await this.get(`${PRODUCTS}${page}`);
    } catch (e) {
      if (page > 1 && e instanceof Error && e.message.startsWith(`400 ${PRODUCTS}`)) return null;
      throw e;
    }
  }
}

function matchPrintingId(p: Product, catalog: CardCatalog): string | null {
  if (catalog.byId(p.handle)) return p.handle;
  const tagged = p.tags.find((t) => t.startsWith("Scryfall ID_"))?.slice("Scryfall ID_".length);
  if (tagged && catalog.byId(tagged)) return tagged;
  for (const v of p.variants) {
    const printing = printingFromSku(v.sku, catalog);
    if (printing) return printing.id;
  }
  return null;
}

function printingFromSku(sku: string | undefined, catalog: CardCatalog) {
  const parts = sku?.split("-");
  if (!parts || parts.length < 6) return null;
  return catalog.findBySetAndNumber(parts[2], parts[4]);
}
