import type { Condition, Listing } from "./listing.ts";
import type { MarketPrice, Printing } from "./printing.ts";

// ponytail: fixed rate; swap for ECB fetch if drift matters
export const EUR_SEK = 11.0;

export const CONDITION_FACTOR: Record<Condition, number> = {
  NM: 1.0,
  EX: 0.9,
  GD: 0.75,
  PL: 0.6,
  PO: 0.4,
};

export type DealPolicy = {
  minDiscount: number; // 0.2 = at least 20 % under fair value
  minFairValueSek: number; // ignore bulk
};

export const DEFAULT_POLICY: DealPolicy = { minDiscount: 0.2, minFairValueSek: 20 };

export type Deal = {
  listing: Listing;
  printing: Printing;
  fairValueSek: number;
  diffSek: number;
  diffPct: number;
};

/** What this listing is worth on Cardmarket, in SEK, adjusted for condition. Null if no reference price. */
export function fairValueSek(
  price: MarketPrice,
  { condition, foil }: Pick<Listing, "condition" | "foil">,
  fx = EUR_SEK,
): number | null {
  const eur = foil ? price.eurFoil : price.eur;
  if (eur == null || eur <= 0) return null;
  return round1(eur * fx * CONDITION_FACTOR[condition]);
}

export function evaluateDeal(
  listing: Listing,
  printing: Printing,
  price: MarketPrice,
  policy = DEFAULT_POLICY,
  fx = EUR_SEK,
): Deal | null {
  const fair = fairValueSek(price, listing, fx);
  if (fair == null || fair < policy.minFairValueSek) return null;
  const diffSek = round1(fair - listing.priceSek);
  const diffPct = diffSek / fair;
  if (diffPct < policy.minDiscount) return null;
  return { listing, printing, fairValueSek: fair, diffSek, diffPct: Math.round(diffPct * 1000) / 1000 };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
