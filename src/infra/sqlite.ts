import { DatabaseSync } from "node:sqlite";
import type { Listing, Shop } from "../domain/listing.ts";
import type { Printing } from "../domain/printing.ts";
import type { CardCatalog, ListingRepository, PricedPrinting } from "../domain/ports.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS printings (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, set_code TEXT NOT NULL, set_name TEXT NOT NULL,
  collector_number TEXT NOT NULL, image_uri TEXT, eur REAL, eur_foil REAL);
CREATE INDEX IF NOT EXISTS printings_set_name ON printings(set_code, name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS printings_set_num ON printings(set_code, collector_number);
CREATE INDEX IF NOT EXISTS printings_name ON printings(name COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS listings (
  shop TEXT NOT NULL, url TEXT NOT NULL, name TEXT NOT NULL, set_raw TEXT NOT NULL,
  condition TEXT NOT NULL, foil INTEGER NOT NULL, price_sek REAL NOT NULL, qty INTEGER,
  printing_id TEXT, scraped_at TEXT NOT NULL, buyin_sek REAL, buyin_full INTEGER,
  PRIMARY KEY (shop, url, condition, foil));
`;

export function openDb(path = "mtg.db") {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec(SCHEMA);
  const cols = (db.prepare("PRAGMA table_info(listings)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("buyin_sek")) db.exec("ALTER TABLE listings ADD COLUMN buyin_sek REAL");
  if (!cols.includes("buyin_full")) db.exec("ALTER TABLE listings ADD COLUMN buyin_full INTEGER");
  return db;
}

type PrintingRow = {
  id: string; name: string; set_code: string; set_name: string; collector_number: string;
  image_uri: string | null; eur: number | null; eur_foil: number | null;
};
const toPrinting = (r: PrintingRow): Printing => ({
  id: r.id, name: r.name, setCode: r.set_code, setName: r.set_name,
  collectorNumber: r.collector_number, imageUri: r.image_uri,
});

export class SqliteCatalog implements CardCatalog {
  private db: DatabaseSync;
  constructor(db: DatabaseSync) { this.db = db; }

  byId(id: string): PricedPrinting | null {
    const r = this.db.prepare("SELECT * FROM printings WHERE id = ?").get(id) as PrintingRow | undefined;
    return r ? { printing: toPrinting(r), price: { eur: r.eur, eurFoil: r.eur_foil } } : null;
  }

  findByNameAndSet(name: string, setCode: string): Printing[] {
    const rows = this.db
      .prepare("SELECT * FROM printings WHERE set_code = ? AND (name = ? COLLATE NOCASE OR name LIKE ? || ' // %' COLLATE NOCASE)")
      .all(setCode.toLowerCase(), name, name) as unknown as PrintingRow[];
    return rows.map(toPrinting);
  }

  findByName(name: string): PricedPrinting[] {
    const rows = this.db
      .prepare("SELECT * FROM printings WHERE name = ? COLLATE NOCASE OR name LIKE ? || ' // %' COLLATE NOCASE")
      .all(name, name) as unknown as PrintingRow[];
    return rows.map((r) => ({ printing: toPrinting(r), price: { eur: r.eur, eurFoil: r.eur_foil } }));
  }

  findBySetAndNumber(setCode: string, collectorNumber: string): Printing | null {
    const r = this.db.prepare("SELECT * FROM printings WHERE set_code = ? AND collector_number = ?")
      .get(setCode.toLowerCase(), collectorNumber) as PrintingRow | undefined;
    return r ? toPrinting(r) : null;
  }

  sets(): [string, string][] {
    return (this.db.prepare("SELECT DISTINCT set_code, set_name FROM printings").all() as { set_code: string; set_name: string }[])
      .map((r) => [r.set_code, r.set_name]);
  }

  replaceAll(items: Iterable<PricedPrinting>): void {
    const ins = this.db.prepare("INSERT INTO printings VALUES (?,?,?,?,?,?,?,?)");
    this.db.exec("BEGIN");
    try {
      this.db.exec("DELETE FROM printings");
      for (const { printing: p, price } of items)
        ins.run(p.id, p.name, p.setCode, p.setName, p.collectorNumber, p.imageUri, price.eur, price.eurFoil);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  count(): number {
    return (this.db.prepare("SELECT count(*) n FROM printings").get() as { n: number }).n;
  }
}

export class SqliteListings implements ListingRepository {
  private db: DatabaseSync;
  constructor(db: DatabaseSync) { this.db = db; }

  replaceForShop(shop: Shop, listings: Listing[]): void {
    const now = new Date().toISOString();
    const ins = this.db.prepare("INSERT OR REPLACE INTO listings VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM listings WHERE shop = ?").run(shop);
      for (const l of listings)
        ins.run(l.shop, l.url, l.name, l.setRaw, l.condition, l.foil ? 1 : 0, l.priceSek, l.qty, l.printingId, now,
          l.buyinSek ?? null, l.buyinFull === undefined ? null : l.buyinFull ? 1 : 0);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  all(): Listing[] {
    type Row = { shop: Shop; url: string; name: string; set_raw: string; condition: Listing["condition"];
      foil: number; price_sek: number; qty: number | null; printing_id: string | null;
      buyin_sek: number | null; buyin_full: number | null };
    return (this.db.prepare("SELECT * FROM listings").all() as unknown as Row[]).map((r) => ({
      shop: r.shop, url: r.url, name: r.name, setRaw: r.set_raw, condition: r.condition,
      foil: r.foil === 1, priceSek: r.price_sek, qty: r.qty, printingId: r.printing_id,
      ...(r.buyin_sek !== null && { buyinSek: r.buyin_sek, buyinFull: r.buyin_full === 1 }),
    }));
  }
}
