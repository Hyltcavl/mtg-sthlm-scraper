import type { Listing, Shop } from "./listing.ts";
import type { MarketPrice, Printing, PrintingId } from "./printing.ts";

export type PricedPrinting = { printing: Printing; price: MarketPrice };

/** Read model over known printings; used by scrapers to match and by findDeals to price. */
export interface CardCatalog {
  byId(id: PrintingId): PricedPrinting | null;
  /** Case-insensitive exact name (front face allowed) within a set. */
  findByNameAndSet(name: string, setCode: string): Printing[];
  findBySetAndNumber(setCode: string, collectorNumber: string): Printing | null;
  /** All printings of a card across sets, with prices; lets scrapers decide if exact identity is worth resolving. */
  findByName(name: string): PricedPrinting[];
  /** distinct [setCode, setName] pairs, for building shop→scryfall set maps. */
  sets(): [string, string][];
  replaceAll(items: Iterable<PricedPrinting>): void;
  count(): number;
}

export interface ListingRepository {
  replaceForShop(shop: Shop, listings: Listing[]): void;
  all(): Listing[];
}

export interface PriceSource {
  load(): Promise<PricedPrinting[]>;
}

export type ScrapeOptions = { workers?: number; fresh?: boolean };

export interface ShopScraper {
  readonly shop: Shop;
  /** Only in-stock listings. Implementations may checkpoint and resume; `fresh` discards checkpoints. */
  scrape(catalog: CardCatalog, options?: ScrapeOptions): Promise<Listing[]>;
}
