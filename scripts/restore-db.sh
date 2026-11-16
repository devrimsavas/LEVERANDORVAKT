#!/usr/bin/env bash
# Restores a backup made by backup-db.sh into the database of
# docker-compose.prod.yml, replacing what is in it now:
#   bash scripts/restore-db.sh backups/leverandorvakt-2026-11-20-0315.sql.gz
# The web app and the API are stopped while it runs, so nothing writes to
# the database in the meantime, and started again afterwards.
set -euo pipefail

cd "$(dirname "$0")/.."
file="${1:-}"
if [[ -z "$file" || ! -f "$file" ]]; then
  echo "Usage: bash scripts/restore-db.sh backups/<file>.sql.gz" >&2
  exit 1
fi

read -r -p "Replace the database with $file? Type yes to go on: " answer
if [[ "$answer" != "yes" ]]; then
  echo "Nothing was changed."
  exit 1
fi

compose=(docker compose -f docker-compose.prod.yml)
"${compose[@]}" stop web api
# A failed restore stops at the first error, and the apps start again
trap '"${compose[@]}" start api web' EXIT
gunzip -c "$file" \
  | "${compose[@]}" exec -T db \
    psql -U leverandorvakt -d leverandorvakt -v ON_ERROR_STOP=1 --quiet --output=/dev/null
echo "Restored $file"
