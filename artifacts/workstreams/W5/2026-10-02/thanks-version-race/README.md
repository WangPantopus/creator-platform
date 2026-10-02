# W5 Thanks initial-version serialization

Source commit: `829b47ea` on `codex/w5-thanks-version-race-20261002`.

Two initial commands with different retry keys could both observe no Thanks row under `SELECT FOR UPDATE`, then the upsert would overwrite each at version one. A same-transaction advisory lock on the actual unique fan/target tuple now precedes the prior-row/version check. After one commits, the other sees version one and receives `thanks_changed`; successful retries using the original command key retain the existing response. The lock covers subsequent updates and withdrawal too. No schema, permission, copied state, or downstream receipt change.

## Validation and qualifications

Backend strict TypeScript, scoped ESLint, Prettier and diff checks passed. The real W5 development host was restarted at this source, retaining the non-owner composite content/Growth runtime and separate canonical AI runtime, with the author-impersonating worker disabled.

Using the fan's normal browser session, the actual unpublished draft was unavailable in the fan UI. A manual browser request to record This helped for it returned HTTP 403 `content_unavailable`. Durable DB reads confirmed zero Thanks, zero consent history and zero fan effects. These are negative target/rollback checks, **not positive concurrent-write acceptance**. No fake publication or Thanks row was created. The creator remains **DEVELOPMENT-ONLY SEEDED VERIFIED**, with no proof or passkey.

Implemented, compiled and running locally. The conflict outcome follows the serialized source path; it must still be personally exercised with two live first submissions against genuinely eligible published content. Full integration and release readiness remain unverified. No new test code.
