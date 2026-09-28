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
node src/cli.ts scrape all
node src/cli.ts serve 3000
```

`refresh` loads Scryfall bulk data into `mtg.db`. `scrape` replaces listings for the selected shop. `serve` opens the web UI and `/api/deals`.

## Cron

```cron
0 4 * * * cd /home/teoeng/mtg-scraper && node src/cli.ts refresh && node src/cli.ts scrape all
```
