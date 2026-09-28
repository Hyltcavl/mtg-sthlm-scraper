import type { ListingRepository, CardCatalog, ScrapeOptions, ShopScraper } from "../domain/ports.ts";

export async function scrapeShop(
  scraper: ShopScraper,
  catalog: CardCatalog,
  repo: ListingRepository,
  options?: ScrapeOptions,
): Promise<number> {
  const listings = await scraper.scrape(catalog, options);
  repo.replaceForShop(scraper.shop, listings);
  return listings.length;
}
