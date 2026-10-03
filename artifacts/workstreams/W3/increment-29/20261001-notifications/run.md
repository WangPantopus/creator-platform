# W3 increment 29 — commit notifications

Personally implemented on `codex/w3-realtime-notifications`, based on `1a7d2a8b0f3918c8bc89536626045f946466480b`. No new test files or test assertions were written.

`appendFrame` now sends a UUID-only `pg_notify` in the existing frame transaction. One dedicated LISTEN session serves the conversation service's subscribers. Initial registration and reconnect wake every subscriber for authorized durable replay. Listener failures retry with bounded backoff; the last unsubscribe destroys the dedicated connection. Notifications carry no message, fan, creator, credential or cursor data.

The gateway coalesces wakeups while a replay is running. Every batch retains current identity/session, adult eligibility, family and scope checks. A two-second maintenance cadence replaces the old 100 ms per-socket query loop; a two-second batch deadline closes a connection whose current authority cannot be established. These bounds are implementation limits, not a measured revocation p95. Existing ordered cursors and backpressure limits remain.

The implementation follows PostgreSQL 17's [commit notification behavior](https://www.postgresql.org/docs/17/sql-notify.html) and [LISTEN-before-catch-up rule](https://www.postgresql.org/docs/17/sql-listen.html).

## Personally operated mechanics

Owned PostgreSQL `creator-platform-w3-20261001`, loopback 55443, `creator_w3`. A temporary inline CLI session used the real runtime database role and the implemented notification class; no schema, durable conversation, trial, allowance or message rows were fabricated. Its dedicated application name was `w3-notification-manual-20261001`. Only that session's LISTEN backend was terminated.

Observed output on October 2, 2026, approximately 04:46–04:49 UTC:

| Action | Cumulative subscriber wakeups |
| --- | ---: |
| Committed LISTEN registration/catch-up | 1 |
| NOTIFY inside uncommitted transaction | 1 |
| Rollback | 1 |
| Two identical NOTIFY calls before commit | 1 |
| Commit (one coalesced wakeup) | 2 |
| An unrelated aggregate's notification | 2 |
| Terminate the one dedicated listener; reconnect/catch-up | 3 |

The post-commit observation window was 102 ms; this included an intentional 100 ms observation wait and is **not** a message acknowledgement or response-latency measurement. All temporary clients and pool connections were closed. Backend TypeScript and whitespace checks passed.

The API was restarted on port 4103 with this source and the private development environment. The built-in browser's current `@kilnfire` You page loaded the persisted intro and genuine empty conversation directory against that API. This does not operate a populated realtime subscription. Licensed generation remains unavailable pending the private OpenAI key and producer/migration activation; populated two-device ordering, restart, takeover, last-unit and latency acceptance remain open.

## Shared build-lock incident and recovery

During the preceding increment's final iOS rebuild attempt, cleanup was incorrectly outside the successful `mkdir` branch. Acquisition failed, yet the cleanup removed another stream's shared build-lock directory. No W3 native build ran in that attempt. The primary owner acknowledged this to the human and W1/W4/W6/W7, and installed a clearly labeled W3 recovery hold.

W1 explicitly confirmed its builds were complete and no native build was active; W6 confirmed no native acquisition. W4's completed-build status and W7's completed xcodebuild/launch receipts were inspected. No xcodebuild process was active. The recovery hold was then removed only after checking its exact owner text. Subsequent native build cleanup must be inside successful acquisition and check the exact unique owner before removing the owner file and empty lock directory. The final iOS copy rebuild and actual iOS interaction still remain to be done.

## Acceptance status

Notification implementation and live notification mechanics are observed. Full package B, three-client acceptance, hosted checks and normal main merge are not complete. This focused increment remains draft until those applicable gates are satisfied.
