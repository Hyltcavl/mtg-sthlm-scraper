import type { CardCatalog, ListingRepository } from "../domain/ports.ts";
import { evaluateDeal, type Deal, type DealPolicy } from "../domain/valuation.ts";

export function findDeals(repo: ListingRepository, catalog: CardCatalog, policy?: DealPolicy): Deal[] {
  return repo.all().flatMap((listing) => {
    if (!listing.printingId) return [];
    const priced = catalog.byId(listing.printingId);
    if (!priced) return [];
    const deal = evaluateDeal(listing, priced.printing, priced.price, policy);
    return deal ? [deal] : [];
  }).sort((a, b) => b.diffPct - a.diffPct);
}
