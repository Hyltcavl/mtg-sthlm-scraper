# T4 – integration (efter T1–T3)

1. `pip install datasette`. Kör `./run.sh && datasette mtg.db`.
2. Öppna `/mtg/deals?_sort_desc=diff_pct`. Kontrollera 10 rader mot butik +
   Cardmarket för hand. Justera trösklar i vyn om det är bulkbrus.
3. `datasette-metadata.json` (valfritt, 10 rader): sätt `deals` som default-
   tabell, `image_uri` renderas ej – hoppa, länken räcker.
4. README.md: tre kommandon (run.sh, datasette, cron-rad
   `0 4 * * * cd … && ./run.sh`). Inget mer.
5. Rapportera matchningsgrad per butik och antal deals.
