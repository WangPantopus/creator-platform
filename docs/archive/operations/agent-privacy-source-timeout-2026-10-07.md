# Agent privacy source timeout — October 7, 2026

A PostgreSQL driver read timeout could return from the original Agent privacy transaction while its blocked backend was still alive. The transaction now cancels the exact observed source with its original non-owner credential before closing and discarding it. The same cleanup applies to uncertain BEGIN, COMMIT and rollback responses; cancellation does not establish their transaction outcome. Existing caller cancellation, callback drainage, original task/lease/restoration fences and sole COMMIT remain intact.

[Actual observations](../../artifacts/pr-review/2026-10-07/agent-privacy-source-timeout/receipt.json) reproduce the old behavior at174ms, with the blocked source surviving. The repaired source is absent before return at186ms/182ms using the original password and password-provider forms; replacement pool checkouts succeed. These are metadata observations, not application latency percentiles.

A real canonical development session created an HTTP account-export job. The actual Agent hook encountered an operator-held migration-table lock under a150ms driver budget, cancelled and closed its original source at177ms, and saved a retry. Its genuine second lease completed the actual empty creator contribution. No task, lease or clock was fabricated. The database retains canonical61,17 actual sessions,22 HTTP privacy jobs and zero usage rows. All three owned host pools and role backends closed. Initial observation/expectation errors remain in the evidence.

Shipping build, types, scoped lint/format and all18 existing backend tests pass. Populated prepared export, physical deletion, retained-account expiry and full all-eight privacy remain unqualified. No schema or generation activation is included.
