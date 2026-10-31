import type { PrintingId } from "./printing.ts";

export type Shop = "manatorsk" | "alphaspel" | "dragonslair";
export const SHOPS: readonly Shop[] = ["manatorsk", "alphaspel", "dragonslair"];

export type Condition = "NM" | "EX" | "GD" | "PL" | "PO";

/** A shop's offer for one printing at one condition/finish. */
export type Listing = {
  shop: Shop;
  url: string;
  name: string; // shop's card name, cleaned of condition/foil suffixes
  setRaw: string; // shop's set label
  condition: Condition;
  foil: boolean;
  priceSek: number;
  qty: number | null; // null = in stock, exact count unknown
  printingId: PrintingId | null; // null = unmatched
  buyinSek?: number | null; // what the shop pays for this card; absent/null = shop has no buy-in
  buyinFull?: boolean; // shop currently not buying more
};

const CONDITION_WORDS: [RegExp, Condition][] = [
  [/\b(nm|near ?mint|mint)\b/i, "NM"],
  [/\b(ex|excellent|lp|lightly? played|sp|slightly played)\b/i, "EX"],
  [/\b(gd|good|mp|moderately played|vg)\b/i, "GD"],
  [/\b(pl|played|hp|heavily played)\b/i, "PL"],
  [/\b(po|poor|damaged|dmg)\b/i, "PO"],
];

/** Map a shop's condition term to our Condition; null if unrecognised. */
export function parseCondition(raw: string): Condition | null {
  for (const [re, c] of CONDITION_WORDS) if (re.test(raw)) return c;
  return null;
}
