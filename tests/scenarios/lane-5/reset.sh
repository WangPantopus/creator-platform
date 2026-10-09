#!/bin/sh
# Lane 5: return the working database to the clean migrated template. Stop the
# scenario host first (or restart it afterwards): its connections are closed
# here, which a running host does not survive.
set -eu
NAME=qelvora-lane5-db
DB=creator_foundation_lane5
BASE=creator_foundation_lane5_base
docker exec "$NAME" psql -U postgres -Atc \
  "select pg_terminate_backend(pid) from pg_stat_activity where datname='$DB'" \
  >/dev/null
docker exec "$NAME" psql -U postgres -c "DROP DATABASE IF EXISTS $DB" >/dev/null
docker exec "$NAME" psql -U postgres -c "CREATE DATABASE $DB TEMPLATE $BASE" >/dev/null
echo "database $DB reset from $BASE on 127.0.0.1:56450"
