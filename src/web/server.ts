import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Deal } from "../domain/valuation.ts";

export type DealRow = {
  shop: string;
  name: string;
  setName: string;
  setCode: string;
  condition: string;
  foil: boolean;
  priceSek: number;
  fairValueSek: number;
  diffSek: number;
  diffPct: number;
  qty: number | null;
  url: string;
  imageUri: string | null;
  cardmarketUrl: string;
};

export function toRow(deal: Deal): DealRow {
  return {
    shop: deal.listing.shop,
    name: deal.printing.name,
    setName: deal.printing.setName,
    setCode: deal.printing.setCode,
    condition: deal.listing.condition,
    foil: deal.listing.foil,
    priceSek: deal.listing.priceSek,
    fairValueSek: deal.fairValueSek,
    diffSek: deal.diffSek,
    diffPct: deal.diffPct,
    qty: deal.listing.qty,
    url: deal.listing.url,
    imageUri: deal.printing.imageUri,
    cardmarketUrl: `https://www.cardmarket.com/en/Magic/Products/Search?searchString=${encodeURIComponent(deal.printing.name)}`,
  };
}

export function startServer(getDeals: () => Deal[], port = 3000): Server {
  const indexPath = join(import.meta.dirname, "index.html");
  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    try {
      if (req.method === "GET" && path === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(await readFile(indexPath, "utf8"));
        return;
      }
      if (req.method === "GET" && (path === "/api/deals" || path === "/deals.json")) {
        res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(getDeals().map(toRow)));
        return;
      }
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
    } catch (error) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end(error instanceof Error ? error.message : "server error");
    }
  });
  server.listen(port);
  return server;
}
