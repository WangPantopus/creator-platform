#!/bin/sh
# Rebuild lane 3's own disposable stack from nothing, with the database's
# statement statistics on, and publish Maya's AI for the measurement harness.
# Statement statistics are enabled only in the `postgres` maintenance database
# of this lane's own container, never in the product database or anyone else's.
#   sh tests/scenarios/lane-3/fresh-stack.sh [extra stack options, e.g. --provider anthropic]
set -eu
LANE=3
DB=qelvora-lane3-postgres
cd "$(dirname "$0")/../../.."
OPTS="--lane $LANE --no-web --no-ai --no-smoke $*"
wait_db() {
  for _ in $(seq 1 30); do
    docker exec "$DB" pg_isready -U postgres >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "database did not come up" >&2
  exit 1
}
# shellcheck disable=SC2086
node infra/local/stack.mjs reset $OPTS | tail -1
node infra/local/stack.mjs stop --lane $LANE | tail -1
docker start "$DB" >/dev/null
wait_db
docker exec "$DB" psql -U postgres -d postgres -q \
  -c "ALTER SYSTEM SET shared_preload_libraries='pg_stat_statements'" \
  -c "ALTER SYSTEM SET pg_stat_statements.track='top'" \
  -c "ALTER SYSTEM SET pg_stat_statements.max=10000" \
  -c "ALTER SYSTEM SET track_functions='all'"
docker restart "$DB" >/dev/null
wait_db
docker exec "$DB" psql -U postgres -d postgres -qc "CREATE EXTENSION IF NOT EXISTS pg_stat_statements"
# shellcheck disable=SC2086
node infra/local/stack.mjs up $OPTS | tail -1
echo "fresh lane $LANE stack ready; the harness publishes Maya on its first run"
