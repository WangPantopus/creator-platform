# Commerce recovery in the stock development host

Verified 2026-10-22 on the disposable `finish-1022` stack, with development
identity, a software passkey and the existing fake Stripe processor. No real
provider or production authority was used.

The stock backend now starts commerce recovery after its configured graph is
ready. It uses the same commerce service and identity adapter as the HTTP API;
there is no second service or manufactured request session. Shutdown waits for
the current recovery pass before the canonical database pool closes.

- `COMMERCE_RECOVERY_ENABLED=false` disables the in-process scheduler when a
  scenario deliberately runs the existing recovery side process instead.
  The lane 4 stack wrapper sets this explicitly so its existing scheduler
  crash and restart scenarios retain one scheduler.
- `COMMERCE_RECOVERY_INTERVAL_MS` defaults to 15000, and accepts integers from
  200 to 300000. Invalid flags or intervals refuse startup.
- `STRIPE_WEBHOOK_SECRET` mounts the verified raw-body ingress at
  `/v1/commerce/provider-notifications/stripe`, before JSON and session
  middleware. Collection-account checks and event deduplication are preserved.
- Optional `COMMERCE_INBOX_DATABASE_URL` must name the separate restricted
  `creator_commerce_inbox` login on the same loopback database. The host checks
  role properties, ownership, memberships and the exact proposed column
  grants. Its pool discards idle connection failures without crashing the host
  or logging connection details. Without this role, incoming events stay
  pending and the existing due scan still settles requests.

## Observed results

The operated scenario used existing lane 4 HTTP and signing helpers, copied to
a temporary directory with the database guard fixed to the owned stack port.
It called the stock API on port 56581, inspected PostgreSQL on 56580 and checked
the fake processor's actual holds, captures and refunds on 56584. No recovery
side process was started. Only deadlines in this disposable database moved.

| Check                                                                                                  | Result                                                                                             |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Submit, then wait before the decision deadline                                                         | One hold, request still submitted                                                                  |
| Leave the request alone past its deadline                                                              | Expired/released; one provider release; ledger hold 5000, release 5000                             |
| Read the fan's outcome and inspect capacity                                                            | Expired visible, slot returned, notice event retained unpublished                                  |
| Sign and accept a second request                                                                       | Accepted/captured exactly once                                                                     |
| Leave its undelivered commitment overdue                                                               | Fully refunded; ledger hold 5000, capture 5000, refund 5000; commitment `refunded/deadline_missed` |
| Send a signed provider event twice to the stock API                                                    | Two 204 responses, one pending inbox row                                                           |
| Bad signature, stale signature, wrong collection account                                               | 400, 400, 403 respectively; no inbox rows                                                          |
| Existing money invariant sweep                                                                         | All nine checks passed; the scenario passed all eight steps                                        |
| Actual backend startup with an invalid interval, core login as inbox, or disabled scheduler plus inbox | All three refused before listening and exited 1                                                    |
| Inbox qualification SQL against the actual core runtime role                                           | Executed successfully and refused that role                                                        |
| Backend typecheck; touched-source ESLint and Prettier                                                  | Passed                                                                                             |

The scenario retired the offer it created. Applied SQL, migrations, catalogue
pins and existing databases outside this disposable stack were unchanged.

## Still unavailable or not checked

The inbox claimant migration in PR #425 is not registered, so successful
claiming with that role was not run. Real Stripe, production recovery and
production work-index authority remain unverified.

Commerce request notices remain unpublished. Their background recipient
authority and privacy registration are unfinished; the stock host does not
enable the side process's development authority substitutes. Existing signed
Note and reaction notice composition is unchanged. Restart/crash recovery and
graceful shutdown were not separately interrupted through this host. The full
backend regression run passed 157/157 tests, including the existing money
deadline, crash, race and idempotency suites.
