const UA = "mtg-deal-finder/0.1 (+kontakt@example.com)";

/** Process-wide request counters; scrapers print them so cron wrappers can report a run. */
export const httpStats = { attempts: 0, retries: 0, throttled: 0, timeouts: 0, errors: 0 };

/**
 * Polite fetch: one request per interval per client. Retries 429/5xx/network errors with exponential
 * backoff + jitter (honours Retry-After) and permanently doubles the interval after each throttle
 * (max 30 s). A 403 or a response slower than `timeoutMs` fails immediately - no retry.
 */
export function politeFetch(minIntervalMs = 1000, retries = 3, timeoutMs = 120_000) {
  let next = 0;
  let interval = minIntervalMs;
  const jitter = (ms: number) => ms + Math.random() * ms * 0.25;
  return async function get(url: string, headers: Record<string, string> = {}): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const wait = next - Date.now();
      if (wait > 0) await sleep(wait);
      next = Date.now() + jitter(interval);
      let retryAfterMs = 0;
      httpStats.attempts++;
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": UA, Accept: "application/json, text/html", ...headers },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.ok) return res;
        if (res.status === 429 || res.status >= 500) {
          httpStats.throttled++;
          retryAfterMs = Number(res.headers.get("retry-after")) * 1000 || 0;
          interval = Math.min(interval * 2, 30_000);
        }
        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          httpStats.retries++;
          await sleep(jitter(Math.max(retryAfterMs, 2 ** attempt * 5000)));
          continue;
        }
        throw new Error(`${res.status} ${url}`);
      } catch (e) {
        if (e instanceof Error && e.name === "TimeoutError") {
          httpStats.timeouts++;
          throw new Error(`timeout after ${timeoutMs / 1000}s ${url}`);
        }
        // a 403 means we are blocked; retrying only hammers the server
        if (attempt >= retries || (e instanceof Error && e.message.startsWith("403 "))) {
          httpStats.errors++;
          throw e;
        }
        httpStats.retries++;
        await sleep(jitter(2 ** attempt * 5000));
      }
    }
  };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
