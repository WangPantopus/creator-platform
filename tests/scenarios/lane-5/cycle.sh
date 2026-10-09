#!/bin/sh
# Lane 5: stop the scenario host, return the database to the clean template,
# start the host again and wait until it answers. Run from anywhere; needs node
# on PATH (the toolchain block in docs/lanes/01-working-agreement.md 3.7).
set -eu
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
pkill -f 'tests/scenarios/lane-5/host.mts' 2>/dev/null || true
tries=0
while pgrep -f 'tests/scenarios/lane-5/host.mts' >/dev/null; do
  tries=$((tries + 1))
  [ "$tries" -gt 200 ] && { echo "host did not stop" >&2; exit 1; }
done
sh tests/scenarios/lane-5/reset.sh
LOG="${TMPDIR:-/tmp}/qelvora-lane5-host.log"
(nohup sh tests/scenarios/lane-5/run-host.sh >"$LOG" 2>&1 &)
tries=0
until curl -s -m 2 http://127.0.0.1:56451/v1/identity/capabilities >/dev/null 2>&1; do
  tries=$((tries + 1))
  [ "$tries" -gt 300 ] && { echo "host did not start; see $LOG" >&2; exit 1; }
done
echo "host ready on 56451"
