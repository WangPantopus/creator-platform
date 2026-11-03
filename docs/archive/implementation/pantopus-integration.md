# Pantopus integration seam audit

Research date: September 29, 2026. The founder directed that implementation start in `creator-platform`, with Pantopus integration later. This audit is read-only; no Pantopus files, databases, providers or runtime reservations were changed.

## Verified repository contracts

Pantopus uses a Node.js / Express 5 CommonJS backend, Next.js web app, Swift / SwiftUI iOS app and Kotlin / Jetpack Compose Android app. The workspace uses pnpm 9.15.4 and Turbo. These agree with the founder's chosen stack; the architecture's Expo references are superseded.

| Boundary          | Existing implementation                                                                                                                 | Local creator-platform seam                                                                                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity          | `backend/middleware/verifyToken.js`: Supabase `auth.getUser(token)`, `AuthSession` revocation and `User.sessions_valid_after` watermark | `IdentityProvider.resolveActor(token)` returning account ID and minimal eligibility. A JWT-only adapter would miss Pantopus revocation policy.                                                                                   |
| Account lifecycle | `backend/routes/users.js` account-deletion hooks; `backend/services/authSessionService.js` emits process-local revocation events        | Durable lifecycle adapter for account deletion and session revocation. No reads of address, household, neighborhood or local profile data.                                                                                       |
| Persona/audience  | `PublicPersona`, `AudienceIdentity` and `PersonaMembership` exist in the public schema                                                  | Creator-owned profiles keyed by `account_id`; keep cross-app mapping inside the identity adapter. No automatic reuse of Persona membership or profile rows.                                                                      |
| Persistence       | Supabase/Postgres; `backend/config/supabaseAdmin.js` explicitly uses service role and bypasses RLS                                      | Separate `pg` pool using a non-owner `NOBYPASSRLS` role. Set creator/fan scope with `SET LOCAL` in each transaction. Do not use the shared admin client for creator repositories.                                                |
| Payments          | `backend/stripe/stripeService.js`: Stripe Connect Express onboarding and PaymentIntent primitives; Persona subscriptions also exist     | `PaymentProvider` implementation with creator-owned ledger, authorization lifecycle and webhook inbox. Do not mix Pantopus wallet balances or subscriptions. Stripe account topology still needs confirmation before connection. |
| Media             | S3/CloudFront uploads and authorized private Supabase storage patterns                                                                  | Storage provider with module/thread/content prefixes and authorized private byte access. Public CDN URLs cannot secure private conversations.                                                                                    |
| Notifications     | Notification template registry plus APNs, FCM and Expo provider dispatch                                                                | Notification adapter with creator-app destination, explicit sender label and product-specific registration. Device/push provider delivery remains unverified.                                                                    |
| Availability      | `backend/services/scheduling/availabilityService.js`: schedules, overrides, recurring busy intervals, timezone-aware slots              | Availability adapter; the creator Session state machine, room provider tokens and call outcomes remain new.                                                                                                                      |
| Blocking/quotas   | Account and Persona block services; pure `computeQuotaRemaining`                                                                        | Narrow policy adapters. Creator grants, allowances and consumption remain creator-owned. Persona block propagation has membership/refund side effects and is not a drop-in creator service.                                      |
| Workers/realtime  | Socket.IO chat; standalone pg-boss/cron worker                                                                                          | Creator transactional outbox, separately budgeted runtime pools, generation epochs and resumable delivery cursors. Existing chat does not establish the creator takeover invariant.                                              |

The architecture §10 boundary remains useful: only `account_id` crosses into creator data. Native sign-in therefore receives an opaque account/session result from the adapter, rather than importing Pantopus application profile models.

## Existing implementation search

The audit covered current backend services/routes, shared client packages, canonical and archived migrations, `codex/backup-designs-before-sync-20260924`, and `claude/stream3-android-creator-inbox-compose`. Searches found no Qelvora implementation, `creator_profile`, `agent_version`, `ThreadScope`, `resolveActor` or `creator_insights` in those implementation paths. This is a bounded search, not a claim about every historic ref.

`PersonaDmThread` and `PersonaDmMessage` exist, but model membership-funded threads and fan/creator sender roles. They lack creator AI authorship, approved-message versions, scoped memory, signed acts and takeover control. Architecture §10 explicitly requires new creator conversation tables; extending the old DM rows would not meet that contract.

The Pantopus handoff marks Beacon/creator tools and personas as cut from the Pantopus first launch and directs agents not to verify or fix them. Their retained source was inspected only. The creator-platform work does not change those launch flags.

## Snapshot and verification limits

- Read the `AGENTS.md` and project handoff in both Pantopus checkouts; preserve unrelated local work.
- Owner checkout: `master` at `be05b58dd`, with an untracked launch-boundary documentation folder.
- Coordination checkout: `codex/workstream-coordination` at `78c9114c7`, with unrelated workstream documentation edits.
- Remote `master` at inspection: `59154879d846d8ba4900946fda27d6b4ec0f2646`.
- Latest listed backend deployment was skipped; release-notification workflows succeeded. This is not deployment or application acceptance evidence.
- No credentials, provider sessions, raw device tokens, database archives or operator logs were read. No live provider, account age, device delivery, database role deployment, or cross-app SSO was verified.

## Work required before integration

Connect and validate the identity adapter, including 18+ eligibility and revocation; define durable account lifecycle events; choose Stripe topology; provision creator runtime/ETL roles and migrations in the authoritative history; configure product-specific storage and notification namespaces; mount the creator router and worker pools behind a feature flag; and verify cross-app native redirects on real devices. Current local adapters must never claim these external boundaries are already connected.
