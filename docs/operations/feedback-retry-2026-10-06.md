# Product feedback retry recovery — October 6, 2026

The optional Support feedback form now retains a scoped idempotency key with its unchanged payload through failures. The existing Trust command transaction serializes concurrent duplicates and commits the feedback plus its durable result together. Reusing a key with a changed payload returns 409. Editing the form starts a new intent; confirmed unchanged submissions cannot be sent repeatedly. Inputs stay stable while saving. Actual account/session changes clear the key and form through the original-session boundary.

An unconfirmed response keeps the answers and says that their save could not be confirmed, with a same-submission retry. It does not claim that the server did not save. That message uses generated shared copy. Consent validation and the existing 90-day retention/cleanup remain unchanged. The updated backend requires the retry key; deploy the updated web consumer with it.

## Personally operated evidence

Used the real browser form and non-owner PostgreSQL-backed canonical development host. Browser developer tools held the actual 201 Fetch response after the server had committed; no response was fabricated. The browser's whole-response deadline settled with its answers intact. Retrying the unchanged submission returned saved success and the database still contained one feedback and one command. Editing the comment deliberately started another submission. Repeating the lost-response/retry journey produced two total rows, not four. The revised human-readable timeout and saved result were captured at 390 pixels in Light/Night, without horizontal overflow.

A separate operator-issued genuine development session sent two concurrent identical requests and a subsequent replay. All returned 201 while creating only one additional row. An edited payload with the same key returned `idempotency_conflict` (409); consent false returned `invalid_request` (400), with no additional inserts. The operator-only session was then ended. [Manifest and observations](../../artifacts/pr-review/2026-10-06/feedback-retry/manifest.json).

All seven workspace types, shared generation checks, scoped lint, backend build and production web build passed. No new test code was written. Browser Fetch interception and media overrides were cleared. This is browser/development verification; production identity, native acceptance, screen-reader/large-text qualification, and long-duration retention cleanup remain unverified. The existing DI-19 Support design gap remains; no new resting composition was introduced.
