#!/usr/bin/env bash
set -euo pipefail

# docker-entrypoint.sh
# This script checks the SQLite DB for expected tables and applies SQL migrations
# and seed files located in ./server/database/migrations if needed.

DB_PATH="sqlite.db"
MIGRATIONS_DIR="/app/server/database/migrations"

echo "Entrypoint: ensure DB exists at $DB_PATH"
mkdir -p "$(dirname "$DB_PATH")"
touch "$DB_PATH"
chmod 664 "$DB_PATH" || true

# helper: run a SQL statement and return output
run_sql() {
  sqlite3 "$DB_PATH" "$1"
}

echo "Entrypoint: checking for migration marker table 'migration' or core tables"
TABLE_EXISTS=$(run_sql "SELECT name FROM sqlite_master WHERE type='table' AND name='shift' LIMIT 1;") || true

if [ -z "$TABLE_EXISTS" ]; then
  echo "No core tables detected. Applying migrations from $MIGRATIONS_DIR"
  if [ -d "$MIGRATIONS_DIR" ]; then
    # Apply SQL migration files in lexicographic order
    for f in $(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
      echo "Applying migration: $f"
      sqlite3 "$DB_PATH" < "$f"
    done
  else
    echo "Migrations directory not found: $MIGRATIONS_DIR. Skipping migrations."
  fi
else
  echo "Core tables present. Skipping migrations."
fi

# Run seed SQL files (idempotent seeds should use ON CONFLICT to be safe)
SEED_FILES=$(ls "$MIGRATIONS_DIR"/*seed*.sql 2>/dev/null || true)
if [ -n "$SEED_FILES" ]; then
  echo "Running seed files"
  for s in $SEED_FILES; do
    echo "Seeding: $s"
    sqlite3 "$DB_PATH" < "$s"
  done
else
  echo "No seed files found; skipping seeding."
fi

echo "Entrypoint: finished DB initialization"

# Exec the container CMD (server) as PID 1
echo "Entrypoint: exec $@"
exec "$@"
