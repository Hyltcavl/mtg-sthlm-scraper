import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { httpStats, politeFetch } from "./http.ts";

const reset = () => Object.assign(httpStats, { attempts: 0, retries: 0, throttled: 0, timeouts: 0, errors: 0 });

async function withServer(handler: Parameters<typeof createServer>[1], run: (url: string) => Promise<void>) {
  const server = createServer(handler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
  } finally {
    server.closeAllConnections();
    server.close();
  }
}

test("httpStats counts a successful request", async () => {
  reset();
  await withServer((_, res) => res.end("ok"), async (url) => {
    await politeFetch(0, 0)(url);
  });
  assert.deepEqual(httpStats, { attempts: 1, retries: 0, throttled: 0, timeouts: 0, errors: 0 });
});

test("httpStats counts a throttled response that exhausts retries as an error", async () => {
  reset();
  await withServer((_, res) => { res.statusCode = 429; res.end(); }, async (url) => {
    await assert.rejects(politeFetch(0, 0)(url), /429/);
  });
  assert.deepEqual(httpStats, { attempts: 1, retries: 0, throttled: 1, timeouts: 0, errors: 1 });
});

test("httpStats counts a timeout", async () => {
  reset();
  await withServer(() => {}, async (url) => {
    await assert.rejects(politeFetch(0, 0, 100)(url), /timeout/);
  });
  assert.deepEqual(httpStats, { attempts: 1, retries: 0, throttled: 0, timeouts: 1, errors: 0 });
});
