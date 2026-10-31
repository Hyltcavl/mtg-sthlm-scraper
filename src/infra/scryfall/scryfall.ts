import { createReadStream, createWriteStream } from "node:fs";
import { rename, stat, unlink } from "node:fs/promises";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import type { ReadableStream } from "node:stream/web";
import { politeFetch } from "../http.ts";
import type { PricedPrinting, PriceSource } from "../../domain/ports.ts";

const BULK_DATA_URL = "https://api.scryfall.com/bulk-data";
const DAY_MS = 24 * 60 * 60 * 1000;

type ScryfallCard = {
  id?: unknown;
  name?: unknown;
  lang?: unknown;
  digital?: unknown;
  set?: unknown;
  set_name?: unknown;
  collector_number?: unknown;
  image_uris?: { normal?: unknown } | null;
  card_faces?: { image_uris?: { normal?: unknown } | null }[] | null;
  prices?: { eur?: unknown; eur_foil?: unknown } | null;
};

type BulkItem = { type?: unknown; download_uri?: unknown; jsonl_download_uri?: unknown };
type BulkFile = { path: string; gzip: boolean; jsonl: boolean };

export function toPricedPrinting(card: ScryfallCard): PricedPrinting | null {
  if (card.lang !== "en" || card.digital === true) return null;
  if (!isString(card.id) || !isString(card.name) || !isString(card.set) || !isString(card.set_name) || !isString(card.collector_number)) return null;
  const imageUri = stringOrNull(card.image_uris?.normal) ?? stringOrNull(card.card_faces?.[0]?.image_uris?.normal);
  return {
    printing: {
      id: card.id,
      name: card.name,
      setCode: card.set,
      setName: card.set_name,
      collectorNumber: card.collector_number,
      imageUri,
    },
    price: {
      eur: price(card.prices?.eur),
      eurFoil: price(card.prices?.eur_foil),
    },
  };
}

export async function* parseJsonArrayLines(lines: AsyncIterable<string> | Iterable<string>): AsyncGenerator<unknown> {
  for await (const line of lines) {
    let text = line.trim();
    if (!text || text === "[" || text === "]") continue;
    if (text.endsWith(",")) text = text.slice(0, -1);
    if (text) yield JSON.parse(text);
  }
}

async function* parseJsonLines(lines: AsyncIterable<string> | Iterable<string>): AsyncGenerator<unknown> {
  for await (const line of lines) {
    const text = line.trim();
    if (text) yield JSON.parse(text);
  }
}

export class ScryfallSource implements PriceSource {
  private bulkPath: string;
  private get: ReturnType<typeof politeFetch>;

  constructor(bulkPath = "default_cards.json", get = politeFetch()) {
    this.bulkPath = bulkPath;
    this.get = get;
  }

  async load(): Promise<PricedPrinting[]> {
    const file = await this.ensureBulkFile();
    const input = file.gzip ? createReadStream(file.path).pipe(createGunzip()) : createReadStream(file.path);
    const lines = createInterface({ input, crlfDelay: Infinity });
    const parser = file.jsonl ? parseJsonLines(lines) : parseJsonArrayLines(lines);
    const items: PricedPrinting[] = [];
    for await (const raw of parser) {
      const item = toPricedPrinting(raw as ScryfallCard);
      if (item) items.push(item);
    }
    return items;
  }

  private async ensureBulkFile(): Promise<BulkFile> {
    if (await fresh(this.bulkPath)) return { path: this.bulkPath, gzip: false, jsonl: false };
    const gzipPath = `${this.bulkPath}.gz`;
    if (await fresh(gzipPath)) return { path: gzipPath, gzip: true, jsonl: true };
    const bulk = await (await this.get(BULK_DATA_URL)).json() as { data?: BulkItem[] };
    const item = bulk.data?.find((x) => x.type === "default_cards");
    const downloadUri = isString(item?.download_uri) ? item.download_uri : null;
    const jsonlDownloadUri = isString(item?.jsonl_download_uri) ? item.jsonl_download_uri : null;
    const url = downloadUri ?? jsonlDownloadUri;
    const path = downloadUri ? this.bulkPath : gzipPath;
    if (!url) throw new Error("Scryfall default_cards bulk data not found");

    const res = await this.get(url);
    if (!res.body) throw new Error("Scryfall bulk download had no body");
    const part = `${path}.download`;
    try {
      await pipeline(Readable.fromWeb(res.body as ReadableStream<Uint8Array>), createWriteStream(part));
      await rename(part, path);
      return { path, gzip: !downloadUri, jsonl: !downloadUri };
    } catch (e) {
      await unlink(part).catch(() => {});
      throw e;
    }
  }
}

async function fresh(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return Date.now() - s.mtimeMs < DAY_MS;
  } catch {
    return false;
  }
}

function price(value: unknown): number | null {
  return typeof value === "string" ? Number(value) : null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
