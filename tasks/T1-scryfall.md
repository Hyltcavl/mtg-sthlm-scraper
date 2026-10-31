# T1 – Scryfall PriceSource (`src/infra/scryfall/scryfall.ts`)

Implementera `PriceSource`:
1. `GET https://api.scryfall.com/bulk-data` via `politeFetch` (Scryfall kräver
   User-Agent + Accept). Ta `download_uri` för `type === "default_cards"`.
2. Ladda ner till `default_cards.json` (~630 MB) om filen saknas eller är
   > 24 h (fs.stat mtime). Streama till fil:
   `Readable.fromWeb(res.body).pipe(createWriteStream(...))`.
3. Parsa **radvis** (`readline`): bulkfilen är en JSON-array med ett
   kortobjekt per rad (`[`, `{...},`, `{...}`, `]`). Strippa avslutande komma
   och `JSON.parse` per rad. (Hel-fil `JSON.parse` slår V8:s strängtak.)
4. Ren funktion `toPricedPrinting(card): PricedPrinting | null`: behåll
   `lang === "en"` och `!digital`; `imageUri = image_uris?.normal ??
   card_faces?.[0]?.image_uris?.normal ?? null`; priser är strängar/null →
   `Number()`/null; `setCode = set` (redan lowercase).
5. `load()` returnerar array (~95k objekt, ok i minne).

Test `scryfall.test.ts`: 3 handskrivna kortobjekt (vanligt, dubbelsidigt med
`card_faces`, ett med `lang: "ja"` som filtreras) → `toPricedPrinting`. Plus
ett test för radparsern på en liten sträng `"[\n{...},\n{...}\n]"`.

Verifiera på riktigt: kör `load()` + `new SqliteCatalog(openDb()).replaceAll()`
mot `mtg.db` (tillfälligt skript eller `node -e`), kontrollera `count() > 90000`
och att `byId('2d47121d-8b90-4d28-9ffa-0a640b9dd611')` (Sol Ring, LCC) har `eur`.

Commit: `feat(scryfall): bulk price source`.
