#!/bin/sh
# Lane 5: start the scenario host in the foreground on port 56451, against the
# database built by setup.sh. Run from the repository root.
set -eu
KEY_FILE="${TMPDIR:-/tmp}/qelvora-lane5-session-key"
[ -f "$KEY_FILE" ] || node -e \
  "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))" \
  >"$KEY_FILE"
chmod 600 "$KEY_FILE"
GROWTH_KEY_FILE="${TMPDIR:-/tmp}/qelvora-lane5-growth-key"
[ -f "$GROWTH_KEY_FILE" ] || node -e \
  "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" \
  >"$GROWTH_KEY_FILE"
chmod 600 "$GROWTH_KEY_FILE"
DB=127.0.0.1:56450/creator_foundation_lane5
export NODE_ENV=development CREATOR_FEATURE_ENABLED=true PORT=56451
export DATABASE_URL="postgresql://creator_runtime:foundation-test-only@$DB"
export GROWTH_ENABLED=true GROWTH_ENCRYPTION_KEY="$(cat "$GROWTH_KEY_FILE")"
export GROWTH_WORKER_DATABASE_URL="postgresql://growth_worker:foundation-test-only@$DB"
export GROWTH_API_DATABASE_URL="postgresql://growth_api:foundation-test-only@$DB"
export IDENTITY_ADAPTER=development WEB_ORIGIN=http://localhost:3000
export IDENTITY_SESSION_KEY="$(cat "$KEY_FILE")"
exec node --import tsx tests/scenarios/lane-5/host.mts
