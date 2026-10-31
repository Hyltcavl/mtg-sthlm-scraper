# T6 – End-to-end, commit, granskning (efter T3b + T4)

1. `rm mtg.db*` → `node src/cli.ts refresh && node src/cli.ts scrape all`
   (Alphaspel tar 15–30 min). Kontrollera schema (`printing_id`), radantal,
   matchningsgrad per butik.
2. `node src/cli.ts serve` → öppna `localhost:3000`. Verifiera sortering på
   pris/diffSek/diffPct/butik, filter på butik. Kontrollera 10 deals för hand
   mot butikssida + Cardmarket; notera falska positiva och varför
   (fel tryck? foil-miss? skick?). Justera `DEFAULT_POLICY` eller matchning.
3. `npm run typecheck && npm test` grönt.
4. Code review (ponytail-review): död kod, abstraktioner med en användare,
   duplicerad parsning. Ta bort.
5. Commit allt (i logiska steg om det går, annars ett `feat: mvp`).

Rapportera: deals-antal, matchning per butik, falska positiva, vad som togs bort.
