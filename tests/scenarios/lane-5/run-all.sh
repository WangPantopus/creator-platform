#!/bin/sh
# Lane 5: run every scenario script, each on a fresh database and host.
# Usage: sh tests/scenarios/lane-5/run-all.sh [script names without .mjs]
# e5-4-known-gaps is not in the default list: it holds cases that fail today.
# Exit status is non-zero if any script had a failing step.
set -u
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
if [ "$#" -gt 0 ]; then SCRIPTS="$*"; else
  SCRIPTS="e5-1-audience e5-1-lifecycle e5-1-scale e5-2-reactions e5-4-note-notices e5-4-reaction-notices e5-4-chunks e5-4-scheduled e5-3-quiet-hours"
fi
status=0
for name in $SCRIPTS; do
  echo "=== $name"
  sh tests/scenarios/lane-5/cycle.sh >/dev/null || { echo "could not start"; exit 2; }
  node "tests/scenarios/lane-5/$name.mjs" || status=1
done
pkill -f 'tests/scenarios/lane-5/host.mts' 2>/dev/null || true
exit $status
