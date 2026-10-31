const UA = "mtg-deal-finder/0.1 (+kontakt@example.com)";

/** Polite fetch: one request per `minIntervalMs` per client, retries on 429/5xx/network. */
export function politeFetch(minIntervalMs = 1000, retries = 3) {
  let next = 0;
  return async function get(url: string, headers: Record<string, string> = {}): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const wait = next - Date.now();
      if (wait > 0) await sleep(wait);
      next = Date.now() + minIntervalMs;
      try {
        const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json, text/html", ...headers } });
        if (res.ok) return res;
        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          await sleep(2 ** attempt * 2000);
          continue;
        }
        throw new Error(`${res.status} ${url}`);
      } catch (e) {
        if (attempt >= retries) throw e;
        await sleep(2 ** attempt * 2000);
      }
    }
  };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
