# MTG Deal Finder

Finds cheap MTG singles from Manatorsk and Alphaspel against Scryfall/Cardmarket prices.

## Install

Requires Node 26.

```sh
npm install
```

## Commands

```sh
node src/cli.ts refresh
node src/cli.ts scrape manatorsk
node src/cli.ts scrape alphaspel --fresh
node src/cli.ts scrape alphaspel --workers 4
node src/cli.ts scrape all
node src/cli.ts serve 3000
```

`refresh` loads Scryfall bulk data into `mtg.db`. `scrape` replaces listings for the selected shop. `serve` opens the web UI and `/api/deals`.

Alphaspel checkpoints per set: Ctrl-C and rerun to resume; `--fresh` restarts. `--workers N` runs N polite clients (1 req/s each, default 3). Product pages are only fetched for cards that could pass the deal policy; cheaper ambiguous cards stay unmatched. A full run takes ~20 min.

## Web UI

Columns: image, name (condition/foil), set, price, fair value, diff SEK, diff %, shop, links. Click a header to sort; filter by shop and minimum diff. Hover the image or name to see a larger card image centred on the page.

Fair value = Cardmarket trend (EUR) × 11 × condition factor (NM 1, EX .9, GD .75, PL .6, PO .4). A deal is ≥ 20 % under fair value and fair ≥ 20 SEK (`DEFAULT_POLICY` in `src/domain/valuation.ts`).

## Develop

```sh
npm run typecheck && npm test
```

Tests are offline: parsers run against `fixtures/`, SQLite uses `:memory:`. See `PLAN.md` for the domain model and `AGENTS.md` for the contribution contract.

## Cron

```cron
0 4 */3 * * cd /home/teoeng/mtg-scraper && node src/cli.ts refresh && node src/cli.ts scrape manatorsk && node src/cli.ts scrape alphaspel
```

## Publish (GitHub Pages)

`.github/workflows/scrape.yml` runs every third day (and manually): refresh, scrape Manatorsk and Alphaspel, load the Dragon's Lair snapshot, export `docs/`, deploy to GitHub Pages.
Enable once: repo Settings, Pages, Source: GitHub Actions. `node src/cli.ts export [dir]` writes index.html, deals.json and updated.txt (preview with `npx serve docs`).

Dragon's Lair blocks GitHub runner IPs (Cloudflare 403), so the workflow never scrapes it: it loads the committed `data/dragonslair.json`, which a machine with a Swedish IP keeps fresh (see below). Manual one-off:

    node src/cli.ts scrape dragonslair --snapshot data/dragonslair.json

The full scrape is ~1000+ requests, so go easy on the server: default gap is 2 s (+jitter), requests that take over 120 s fail the run, 429/5xx back off exponentially and slow the pace, a 403 stops immediately. Progress is saved per page in `data/dragonslair-progress.jsonl`, so an aborted run resumes where it stopped. Do it in batches with `--budget N` (max requests per run), repeat the same command until it prints `done`; `--fresh` starts over, `--delay MS` changes the gap. Listings are only replaced once the whole scrape is complete.

### Dragon's Lair cron on a home machine

Setup on the other computer (once):

1. Install Node 26 and git; `git clone https://github.com/Hyltcavl/mtg-sthlm-scraper.git && cd mtg-sthlm-scraper && npm ci`.
2. Make sure `git push` works non-interactively there (SSH key or credential helper / token with write access).
3. `crontab -e` and add (hourly check):

       0 * * * * /path/to/mtg-sthlm-scraper/scripts/scrape-dragonslair.sh >> /tmp/dl-scrape.log 2>&1

What `scripts/scrape-dragonslair.sh` does each run: pulls; exits right away if the last snapshot commit is younger than 3 days (`MAX_AGE_DAYS`); otherwise runs one batch (`BUDGET`, default 300 requests, ~10-15 min) and resumes from `data/dragonslair-progress.jsonl` on the next run. When the whole scrape is complete it commits and pushes `data/dragonslair.json`; the next Pages run (every third day) publishes it. Check `/tmp/dl-scrape.log` for progress.
