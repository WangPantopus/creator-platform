#!/bin/sh
# Lane 5: build the disposable database the scenarios run on. Safe to re-run.
# Run from the repository root with node and pnpm on PATH (the toolchain block
# in docs/lanes/01-working-agreement.md section 3.7). Port 56450, container
# qelvora-lane5-db, test-only credentials. It migrates once into a template
# (creator_foundation_lane5_base) and clones the working database from it, so
# reset.sh can return to a clean state in seconds.
set -eu
NAME=qelvora-lane5-db
PORT=56450
BASE=creator_foundation_lane5_base
PW=foundation-test-only

if ! docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
  docker run -d --name "$NAME" -e POSTGRES_PASSWORD=$PW \
    -e POSTGRES_DB=creator_foundation -p 127.0.0.1:$PORT:5432 \
    pgvector/pgvector:pg17 >/dev/null
fi
docker start "$NAME" >/dev/null 2>&1 || true
# A new container answers pg_isready during its init phase and then restarts, so
# wait for the image's own "init process complete" line as well.
tries=0
until docker logs "$NAME" 2>&1 | grep -q "PostgreSQL init process complete" &&
  docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; do
  tries=$((tries + 1))
  [ "$tries" -gt 300 ] && { echo "database did not become ready" >&2; exit 1; }
  sleep 0.5
done
if ! docker exec "$NAME" psql -U postgres -Atc \
  "select 1 from pg_database where datname='$BASE'" | grep -q 1; then
  docker exec "$NAME" psql -U postgres -c "CREATE DATABASE $BASE" >/dev/null
  DATABASE_MIGRATION_URL="postgresql://postgres:$PW@127.0.0.1:$PORT/$BASE" \
    W8_LEGACY_ROOT_MIGRATIONS=false \
    node --import tsx apps/backend/scripts/migrate-trust.ts | tail -3
fi
for role in creator_runtime growth_runtime growth_worker \
  creator_trust_runtime creator_trust_worker; do
  docker exec "$NAME" psql -U postgres -d "$BASE" \
    -c "ALTER ROLE $role PASSWORD '$PW'" >/dev/null
done
sh "$(dirname "$0")/reset.sh"
