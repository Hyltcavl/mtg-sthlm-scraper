#!/usr/bin/env bash
# Run from a machine with a Swedish/residential IP (GitHub runners are blocked by Cloudflare).
# Cron it hourly: it does nothing while the last snapshot is younger than MAX_AGE_DAYS (3),
# otherwise it runs one batch of BUDGET requests per call (progress persists in
# data/dragonslair-progress.jsonl) until the scrape completes, then commits and pushes
# data/dragonslair.json. The GitHub workflow publishes that snapshot.
set -euo pipefail
cd "$(dirname "$0")/.."

BUDGET="${BUDGET:-300}"
MAX_AGE_DAYS="${MAX_AGE_DAYS:-3}"
SNAPSHOT=data/dragonslair.json
PROGRESS=data/dragonslair-progress.jsonl

git pull --rebase --autostash --quiet

if [ ! -f "$PROGRESS" ]; then
  last=$(git log -1 --format=%ct -- "$SNAPSHOT" 2>/dev/null || true)
  if [ -n "$last" ] && [ $(( $(date +%s) - last )) -lt $(( MAX_AGE_DAYS * 86400 )) ]; then
    echo "$(date -Is) snapshot is fresh (< ${MAX_AGE_DAYS}d), nothing to do"
    exit 0
  fi
fi

# Needs the Scryfall catalog for matching.
[ -f mtg.db ] || node src/cli.ts refresh

if node src/cli.ts scrape dragonslair --budget "$BUDGET" --snapshot "$SNAPSHOT"; then
  git add "$SNAPSHOT"
  git diff --cached --quiet || {
    git commit -m "data: dragonslair snapshot" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
    git push
  }
else
  echo "$(date -Is) scrape incomplete; will resume on next run"
fi
