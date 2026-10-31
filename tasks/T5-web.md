# T5 – Webb (`src/web/server.ts`, `src/web/index.html`)

`startServer(getDeals: () => Deal[], port = 3000): Server` med `node:http`:
- `GET /` → `index.html` (läs från disk vid varje request, ingen cache)
- `GET /api/deals` → JSON-array av platta rader via ren funktion `toRow(deal)`:
  `{shop, name, setName, condition, foil, priceSek, fairValueSek, diffSek,
  diffPct, qty, url, imageUri, cardmarketUrl}` där
  `cardmarketUrl = https://www.cardmarket.com/en/Magic/Products/Search?searchString=<encodeURIComponent(name)>`.

`index.html`: en `<table>`, vanilla JS, ingen CDN, inget ramverk. Fetch
`/api/deals`; klick på kolumnhuvud sorterar (toggle asc/desc) på pris,
fairValue, diffSek, diffPct, butik, namn. `<select>` butik, `<input
type=number>` minsta diffSek. Länk till butik + Cardmarket per rad, `<img
loading=lazy width=60>` för bild. Klart > snyggt; ~60 rader JS.

Test `server.test.ts`: `toRow` enhetstest; starta servern på port 0, `fetch`
`/api/deals` med 2 fake-Deals, assert JSON-form, stäng servern.

Commit: `feat(web): deals table`.
