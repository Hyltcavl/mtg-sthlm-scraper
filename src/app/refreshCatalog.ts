import type { CardCatalog, PriceSource } from "../domain/ports.ts";

export async function refreshCatalog(source: PriceSource, catalog: CardCatalog): Promise<number> {
  const items = await source.load();
  catalog.replaceAll(items);
  return catalog.count();
}
