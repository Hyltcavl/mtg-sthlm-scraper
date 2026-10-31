#!/usr/bin/env bash
# Run from a machine with a Swedish/residential IP (GitHub runners are blocked by Cloudflare).
# One batch per run; progress persists in data/dragonslair-progress.jsonl, so cron it
# repeatedly (e.g. hourly) until the scrape completes. On completion the snapshot is
# committed and pushed, and the GitHub workflow picks it up.
set -euo pipefail
cd "$(dirname "$0")/.."

BUDGET="${BUDGET:-300}"

# Needs the Scryfall catalog for matching.
[ -f mtg.db ] || node src/cli.ts refresh

if node src/cli.ts scrape dragonslair --budget "$BUDGET" --snapshot data/dragonslair.json; then
  git add data/dragonslair.json
  git diff --cached --quiet || {
    git commit -m "data: dragonslair snapshot" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
    git pull --rebase --autostash
    git push
  }
else
  echo "scrape incomplete; will resume on next run"
fi
