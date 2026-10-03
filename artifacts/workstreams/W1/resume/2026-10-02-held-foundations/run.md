# W1 held foundation and proof projection — October 2, 2026

Qualification base: `0f7a86da1751e93d4de4ebe43f8224aab31086fd` with the committed source below. This is an independently reviewable main-based extraction of W1's genuine current-thread lifecycle and saved proof projection, not activation of DI09 or translation.

## Implemented

- Access retains the original issuer-supplied Actor in a private WeakMap. Database denial callbacks receive that original object, never a scope-derived replacement.
- Actual request callbacks hold the current original session on the same transaction before positive family locks, check original Actor identity, and recheck session currentness after denial and before commit. Existing separately scoped host callbacks retain their actual supplied Actors without becoming interactive request capabilities.
- The private held binding includes the exact original request context, scope, client, session and read/write mode. Owner operations must finish before commit; the binding is removed before commit or on callback failure. Retained objects, copied request contexts and other sessions cannot reuse it.
- Proof create, submit and read return the originally stored nullable `postUrl`; canonical OpenAPI, Swift and Kotlin outputs include it. W8 observed the missing field during its own synthetic review. No historical case, proof or evidence is rewritten; this projection does not prove external account ownership.

## Personally run checks

macOS 27 / Node 24 / pnpm 12.5.1. Frozen offline dependency install, canonical generation/check (12 resources, 101 operations), backend types, affected lint, formatting and diff checks pass.

All 18 existing backend checks pass: nine contract checks and nine actual PostgreSQL integration checks. PostgreSQL 17 with pgvector used a new separately labelled loopback disposable container, 1 CPU / 768 MiB. Actual SQL cases took 44.272 seconds; suite 45.27 seconds; setup and normal cleanup 47.209 seconds. The owned disposable container was normally stopped and removed. Original canonical and development databases were not used. No new unit tests were written.

These checks do not operate positive DI09, approved translation policy, provider work or proof review. Current native app operation, hosted queued checks and the full W1 H01–H20 assignment remain open.
