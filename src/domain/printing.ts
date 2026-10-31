/** A specific print of a card, identified by Scryfall id. */
export type PrintingId = string;

export type Printing = {
  id: PrintingId;
  name: string;
  setCode: string; // lowercase scryfall set code, e.g. "lcc"
  setName: string;
  collectorNumber: string;
  imageUri: string | null;
};

/** Cardmarket reference price in EUR. */
export type MarketPrice = {
  eur: number | null;
  eurFoil: number | null;
};
