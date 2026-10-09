# Lane 1: Identity and trust

## Mission

Make "who is this person, are they an adult, and what may they do" real for people other than
the developer, and build the trust surface that keeps real users safe: ops review, deletion,
crisis handling and consent. This lane is on the **critical path to the private alpha**.

**What a person should feel.** A fan taps a creator's link, signs in and confirms they are 18 or
over in under 30 seconds, and lands in the thread. A creator signs in with a passkey, is
verified by a human reviewer, and can sign Notes. An ops reviewer can approve a creator and a
Note reply. Anyone can delete their account and data.

## What great looks like

- Median sign-in under 30 s; a session survives a restart; passkey signing works in Safari,
  Chrome and Android.
- There is no path around the 18+ gate. Under-18 accounts get the policy and no partial access
  (D-11).
- A named human act (Note, reaction, accept, reply) always carries a fresh passkey assertion
  (INV-22, freshness 5 minutes). Revoking a session or key takes effect on the next request.
- Every ops action is attributed and logged. Reviewers never see more than the packet's
  disclosure set unless they open a logged audit (INV-13).

## Scope

**In:** the pilot sign-in (a Qelvora-owned adapter, pending the founder's pick; design now),
the 18+ gate (method pending), the account model and a later link to a Pantopus account,
sessions, passkeys and signed acts, the access and isolation core, the minimal ops console
(verification review, safety cases, disputes, pauses), the Note-reply review queue (including
auto-allow of clean replies), the account-deletion receiver, export and delete completeness,
crisis resources, consent text that names the model providers, the comparison closure
(withdraw-only mode with retry, an overdue-purge alert, a runbook), compliance source-of-truth
documents (privacy label, data safety, retention), and the design of the "who wrote this?" study
(T-21).

**Out:** any change inside the Pantopus repositories (needs the founder's authorization and a
separate plan), calls and media trust, the pass.

## You own and do not touch

Own: see the charter table. In particular `modules/access`, `modules/trust`, `modules/identity`
(adapter, sessions, passkeys, profiles, subjects, signed acts, router, development, consent,
intro offers, request context), `features/identity`, and the auth, identity, onboarding, ops,
support, trust and status routes.

Do not touch: the generation and publication files in `modules/identity` (lane 3), `server.ts`,
`infra/migrations.json`, `packages/api` outside your own files, any preserved database.

## Read first

1. [Identity contract](../operations/pantopus-identity-contract.md) and its options A to D.
2. `modules/identity/{adapter,sessions,passkeys,signed-acts,subjects,profiles,development}.ts`.
3. Domain Model: INV-01, 14, 15, 19, 22, 23 and D-11; System Architecture sections 2 and 4
   (degradation table, retention and deletion jobs); BRIEF section 12.
4. Launch review sections 3 (rows 1 and 2), 7 (rows 8 and 9), 10, 12.
5. Background: `docs/workstreams/W1-platform-identity.md`, `W8-trust-release.md`,
   `docs/implementation/W1-identity-authority.md`, `docs/operations/W8-runbook.md`,
   `W8-security.md`, `W8-pilot.md`, `W8-required-inputs.md`.

## Work packages

| WP | Work | Size | Gate |
| --- | --- | --- | --- |
| 1.1 | **Decision pack and design** for the recommended option D: account and link tables, endpoints, Apple and Google ID-token verification, the 18+ attestation record, session mapping, deletion, the migration list. No code. Includes how INV-14 ("the only shared key is Account.id") is honored | S | none |
| 1.2 | **Sign-in backend**: adapter, migrations through the queue, rate limits, **tests required** (expired or replayed continuation, state mismatch, wrong account, under-18, revoked) | L | founder's pick, 18+ method, Apple and Google client ids for real tokens |
| 1.3 | **Web sign-in and onboarding pages**, creator passkey registration | M | 1.2 |
| 1.4 | **Publish contract C1** early so lane 7 can build native sign-in, and a stub server for it | S | 1.1 |
| 1.5 | **Signing fixes**: a pending publication stuck after the 5-minute window; passkey recovery marking every past signature revoked (guide creators to register two passkeys); the Android 8 and 9 passkey limit (minSdk) as a documented decision | M | none |
| 1.6 | **Ops console, minimal** (verification review, safety cases, disputes, pauses) and the **Note-reply queue**, auto-allowing clean replies and routing flagged ones | L | none |
| 1.7 | **Deletion receiver and export and delete completeness**; the Pantopus deletion event when that integration exists | M | none |
| 1.8 | **Comparison closure**: withdraw-only mode with retry, overdue-purge alert, runbook | M | lowest priority |
| 1.9 | **Compliance content**: consent text naming the providers (after the provider is final), regional crisis resources, privacy label and data-safety source document, retention | S to M | provider, counsel |
| 1.10 | **T-21 study design** with the founder | S | none |

## Contracts

Provides **C1** (sign-in API), **C2** (adapters, with lane 2). Consumes C8 (profile fields on
the public page), C9 (metrics).

## Rules that bite

INV-01 (the server sets authorship), INV-14, INV-15, INV-19 (safety is not an access tier),
INV-22 (named acts are signed), INV-23, D-11. Auth errors must not reveal whether an account
exists. Under-18 and revoked states are designed states with copy. Apple requires Sign in with
Apple if other social sign-in is offered; account deletion must be possible inside the app.

## Verification and exit demo

Tests for every auth path (negative cases first). Operate sign-in locally with the development
adapter on the stack from lane 2. **Exit demo:** on a staging-like stack, a new adult fan signs
in with a test Apple or Google token, passes the 18+ gate, reaches a thread; an under-18 test
account is refused with the policy page; a creator registers a passkey, is approved in the ops
console, signs a Note; the fan deletes the account and the data is gone from an export.

## Known risks

- The design says "one Pantopus account underneath" (D-A, INV-14). A Qelvora-owned account
  deviates from it for the pilot; this needs the founder's explicit yes and a doc amendment.
- Pantopus has no verified age signal; the 18+ method needs counsel.
- Every migration changes the pinned catalogues; keep the number small and batch them.

## Decisions needed (with a recommended default)

Pilot sign-in option (**D**); 18+ method (**attestation plus platform age signals, confirmed
with counsel**); which account id Qelvora receives (**a Qelvora-specific id**); behavior during
a Pantopus outage; request load and caching. See the identity contract.
