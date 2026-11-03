# Lane 1 · WP 1.1 · Pilot sign-in: decision pack and design (option D)

Written 2026-10-15 by lane 1, from the code on `main` (`21b3d4836`), the
[identity contract](../../operations/pantopus-identity-contract.md), the Domain Model and the
System Architecture. Documents only: nothing here changes code. The integrator moves this file
to its permanent place once the founder has answered section 1.

## 1. What you are deciding

Three answers unblock the sign-in backend (WP 1.2). Each has a recommended default.

| #   | Question                                     | Recommendation                                                                                                                                                                                                  | Why, in one line                                                                                                                                             |
| --- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q-A | Which sign-in does the pilot use?            | **Option D:** a Qelvora-owned sign-in with Sign in with Apple and Google, behind the existing adapter seam. Option B (a Pantopus "connect" flow) stays the long-term path, through an account link designed now | Real people can sign in within about two weeks of the pick, without waiting 3 to 5 weeks on another codebase                                                 |
| Q-B | How is "18 or over" established?             | **A neutral date-of-birth attestation inside Qelvora, plus platform age signals where a phone offers one, with "under 18" always winning; confirmed with counsel before real fans join**                        | Pantopus has no verified age to lend (identity contract), and a neutral screen is the accepted floor; platform signals only add refusals, never grant access |
| Q-C | Which account id does Qelvora give a person? | **A Qelvora-specific random UUID**, minted at first sign-in, never derived from the Apple or Google subject or from a Pantopus id                                                                               | Nobody who sees a Pantopus id or a Google subject can link it to a Qelvora account                                                                           |

Answering yes to Q-A also means yes to amending three source sentences (section 3). The
smaller questions in section 10 each have a default that WP 1.2 uses unless you say otherwise.

## 2. What a person will do

**A fan, on the web, from a creator's link.** Taps "Continue with Apple" or "Continue with
Google", authenticates at Apple or Google, comes back. A first-time account sees one screen
asking for their date of birth (it does not say what age is needed). An adult lands in the
handle step, then the thread; a returning adult goes straight to the thread. Target: under 30
seconds median. A person under 18 sees the designed under-18 state with the policy and nothing
else, and cannot get past it by trying again with another date.

**A fan, in the iOS or Android app.** The same, with the system's own Apple or Google sheet
instead of a browser redirect. The app sends the ID token to the backend once and receives a
session; on iOS, if the phone reports an age range under 18, that refusal wins.

**A creator.** Signs in the same way, then (unchanged from today) submits external creator proof,
is approved by a human reviewer, signs in again freshly and registers a passkey. Passkeys stay
what they are today: signing keys for named acts (INV-22), not a sign-in method.

**Anyone, any time.** Signs out, signs out everywhere, deletes the account inside the product.
Signing in again later with the same Apple or Google account gives a new, empty account.

## 3. Source sentences that option D changes (needs your yes)

These are deviations for the pilot, not bends of an invariant. INV-14 holds as written (section
8). They need your explicit yes and a document amendment by the integrator.

| Where                                                                  | Says today                                                                               | Amended to (proposed)                                                                                                                                                                        |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain Model D-A                                                       | "One Account underneath" (a Pantopus account)                                            | For the pilot, one Qelvora account per person, created with Sign in with Apple or Google; it can be linked to a Pantopus account later, and the link is the only place a Pantopus id appears |
| Domain Model D-11                                                      | 18+ "enforced through the Pantopus account age check"                                    | 18+ enforced by the Qelvora age gate (attestation plus platform signals, under 18 wins), as approved by counsel                                                                              |
| Product Design, onboarding steps (line 173 to 174) and BRIEF section 2 | "Continue with Pantopus", "Sign in with Pantopus identity (18+ enforced by the account)" | "Continue with Apple" / "Continue with Google", then the age step for a new account                                                                                                          |

The System Architecture's failure row for identity ("No sign-in; existing sessions continue to
their expiry") becomes true as written: with option D the session check no longer calls another
service (section 6), so an Apple or Google outage stops new sign-ins only. The code today fails
closed with a 503 on every request while Pantopus is unreachable
(`apps/backend/src/modules/identity/sessions.ts:195-204`); under option D that path cannot occur.

## 4. How option D fits the code that exists

Nothing about sessions changes. The backend already has a seam for exactly this:
`PantopusIdentityAdapter` (`apps/backend/src/modules/identity/adapter.ts:10-28`) with
`beginSession`, `completeSession` and `resolveSession`, and a `SessionService`
(`sessions.ts:17`) that wraps any adapter: it stores a 5-minute single-use continuation, checks
`state` in constant time, requires authentication within the last 5 minutes, encrypts the
upstream token with AES-256-GCM and issues its own 15-minute access and 7-day rotating refresh
tokens (`sessions.ts:58-163`, `234-262`). The web keeps the token in an httpOnly cookie and sends
it as a bearer (`apps/web/lib/session.ts:20-58`).

Option D adds a second adapter, `QelvoraIdentityAdapter`, in `modules/identity` (lane 1 files),
that implements the same three methods against Apple and Google:

| Method            | Option D behavior                                                                                                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beginSession`    | Builds the Apple or Google authorization URL: `state`, a `nonce` bound to the continuation, S256 PKCE for Google, forced fresh authentication when asked                                            |
| `completeSession` | Exchanges the code at the provider, verifies the ID token (section 5), finds or creates the account, applies the age gate (section 7), and returns an opaque **grant** token plus `authenticatedAt` |
| `resolveSession`  | Looks the grant up in our own database: grant live, account active, age eligible. Returns exactly `{ accountId, adultEligible }`, as today                                                          |

The **grant** is the "upstream token" the session service already stores encrypted. It exists
so that every request re-checks the account's current state (deleted, closed, flagged under 18,
signed out everywhere) on the next request with no cache, which is what E1.2 and E1.3 require.
`resolveActor` (`adapter.ts:29-40`) keeps refusing a non-adult actor at that boundary.

Two additions to the session flow are needed and nothing else:

1. **An age step between the provider and the session.** Today `complete` creates a session or
   fails (`sessions.ts:124`, `resolveActor` throws for a non-adult). A new account has no age
   record yet, so `complete` returns `{ status: "age_required", ageContinuationId }` instead of a
   session, and a new `POST /v1/identity/age` finishes it (section 7). No session, cookie or
   partial access exists before that step succeeds.
2. **A native entry point.** The apps get an ID token from the system sheet, not a redirect, so
   `POST /v1/identity/native/nonce` and `POST /v1/identity/native/complete` sit beside the web
   flow and end in the same session issuance (section 6).

`SessionSchema.mode` (`packages/api/src/identity.ts:102`) gains `"qelvora"`; `"pantopus"` stays
reserved for option B. Clients branch only on `"development"` today.

## 5. Apple and Google ID-token verification

Every rule below is a refusal case in E1.1. The verifier is one function in lane 1's module;
its key sets come from the provider's published JWKS, cached for one hour, refetched once on an
unknown key id, never more than once a minute.

| Check     | Apple                                                                                                            | Google                                                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Issuer    | `https://appleid.apple.com`                                                                                      | `https://accounts.google.com` or `accounts.google.com`                                                               |
| Audience  | The web Services ID, or the iOS bundle id `com.pantopus.qelvora` for a native token                              | The web client id, or the iOS or Android client id for a native token                                                |
| Signature | RS256 only, key from `https://appleid.apple.com/auth/keys`; `none`, `HS*` and unknown `kid` refused              | RS256 only, key from `https://www.googleapis.com/oauth2/v3/certs`                                                    |
| Expiry    | `exp` in the future (60 s skew); `iat` not more than 30 s in the future and not older than 10 minutes            | Same                                                                                                                 |
| Nonce     | Equals the continuation's nonce (web), or its SHA-256 (iOS native, which hashes it)                              | Equals the continuation's nonce                                                                                      |
| Freshness | `auth_time` if present, else `iat`, must be within 5 minutes (the existing rule, `sessions.ts:129-135`)          | Same; we request `max_age=0` and `prompt=select_account`. _To confirm in WP 1.2: whether Google returns `auth_time`_ |
| Email     | Requested (`email` scope, which forces `response_mode=form_post`). Optional for sign-in; a relay address is fine | Requested (`openid email`); if present, `email_verified` must be true, otherwise refused                             |
| Subject   | Non-empty, at most 255 characters                                                                                | Same                                                                                                                 |

The email is stored encrypted and used only for account notices (deletion confirmation, later
digests). It is never a login key: two provider identities are never merged because their emails
match (section 10, Q-7).

**Apple's form post.** Because the `email` scope is requested, Apple returns to us with a
cross-site `POST`, and a `SameSite=Lax` cookie is not sent on it. The callback therefore never
relies on a cookie: `POST /api/auth/callback/apple` looks up the continuation by its single-use
`state`, and answers with a `303` to a same-site completion page that then completes with the
continuation cookie bound to this browser (the binding check that exists today in
`apps/web/app/api/auth/complete/route.ts:31-61`). Google returns with a `GET`, which carries the
cookie, and uses the existing route.

**Apple's notices and revocation.** Apple sends signed server-to-server notices
(`consent-revoked`, `account-delete`, `email-disabled`, `email-enabled`) to a registered endpoint:
`POST /v1/identity/providers/apple/notifications` verifies the JWT and revokes the grants and
sessions (`consent-revoked`) or starts account deletion (`account-delete`). When a person deletes
their account, we call Apple's token revocation endpoint with the stored (encrypted) Apple refresh
token, as App Store review expects of apps offering Sign in with Apple.

## 6. Endpoints (the outline of contract C1)

Contract C1 (WP 1.4) publishes these in `packages/api/src/identity.ts` with exact schemas and
error codes; this is the outline. Existing endpoints keep their paths.

| Endpoint                                                           | Who              | In                                                                                          | Out                                                              |
| ------------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `GET /v1/identity/capabilities` (exists)                           | any              |                                                                                             | adds `providers: ["apple","google"]`                             |
| `POST /v1/identity/continue` (exists)                              | web              | `returnTo`, `provider`, `reauthenticate?`                                                   | `redirectUrl`, `continuationId`                                  |
| `POST /v1/identity/complete` (exists)                              | web              | `continuationId`, `code`, `state`                                                           | a session **or** `{ status: "age_required", ageContinuationId }` |
| `POST /v1/identity/native/nonce` (new)                             | apps             | `provider`, `platform`, `reauthenticate?`                                                   | `continuationId`, `nonce`, `expiresAt`                           |
| `POST /v1/identity/native/complete` (new)                          | apps             | `continuationId`, `provider`, `idToken`, `authorizationCode?` (Apple, for later revocation) | same union as `complete`                                         |
| `POST /v1/identity/age` (new)                                      | web, apps        | `ageContinuationId`, `birthDate`, `platformSignal?`                                         | a session, or `403 adult_eligibility_required`                   |
| `GET /v1/identity/session` (exists)                                | signed in        |                                                                                             | the session object (unchanged shape plus `mode: "qelvora"`)      |
| `POST /v1/identity/refresh`, `/logout`, `/revoke-sessions` (exist) | signed in        |                                                                                             | unchanged; `revoke-sessions` also revokes every grant            |
| `POST /v1/identity/providers/apple/notifications` (new)            | Apple            | signed JWT                                                                                  | `200`                                                            |
| `POST /v1/trust/privacy/jobs` (exists)                             | signed in, fresh | `kind: "delete"`, `scope: "account"`                                                        | the job; immediate denial follows                                |

Web completion keeps the session in the httpOnly cookie; native completion returns the token pair
in the body for the Keychain or Keystore. Errors are the existing `{ error: { code, message } }`
shape. Every refusal before a session exists answers the same way for an unknown and a known
person (section 9).

## 7. The 18+ gate

**The screen.** A first-time account sees one neutral screen: "Your date of birth", with no hint
of the required age and no pre-filled year. (The wording is copy and needs your approval; WP 1.3
proposes it in `config/copy.json`.)

**What is stored.** Not the date of birth. The backend derives a result and keeps only that:

`creator.age_signal(id, account_id, source, result, copy_version, recorded_at)`, append-only,
with `source` in `attestation | apple_declared_age_range | google_play_age_signals | ops_review`
and `result` in `adult | under_18`.

**The rule.** An account is adult-eligible when it has an `adult` attestation and **no**
`under_18` signal from any source. Under 18 always wins, whatever its source or time.

- **Platform signals only refuse.** Apple's Declared Age Range and Google Play's age signals
  reach us through the app, so the backend cannot tell a genuine report from a modified client.
  An under-18 report only harms the person sending it, so it is accepted; an adult report is
  ignored as proof, and the attestation is still required. The web has no platform signal.
- **No retry.** An `under_18` result locks the account. The lock is also kept against a keyed hash
  of the Apple or Google subject (`creator.age_lock(subject_hmac, provider, locked_at)`), so a
  second date, or deleting the account and signing in again, does not pass. How long the hash
  is kept is a counsel question (section 10, Q-5).
- **Flagged later.** An ops reviewer or a report can add an `ops_review` `under_18` signal. The
  next request's `resolveSession` sees it and the account loses access then (E1.2), with the
  designed under-18 copy (D-11) and no partial access.
- **No route around it.** The gate sits at `resolveActor` (`adapter.ts:33-37`), which every
  authenticated request already passes through (`apps/backend/src/app.ts:101-152`), so every
  domain route is covered without per-route checks. E1.2 proves it by calling each route
  directly with a session that has not passed the gate (there is none: no session exists before
  the age step), and with a session whose account was flagged after sign-in.

## 8. Accounts, links and INV-14

Tables for the pilot, in one migration (section 11). All carry RLS on `app.account_id` like the
existing identity tables (`apps/backend/migrations/0002_w1_identity.sql:22-27`).

| Table                      | Columns                                                                                                                    | Rule                                                                                                                                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `creator.account`          | `id` (random UUID), `state` (`active`, `closed`, `deleted`), `created_at`, `deleted_at`                                    | `id` is the `Account.id` of the Domain Model. Never derived from anything external                                                                                                                                                         |
| `creator.account_identity` | `id`, `account_id`, `provider` (`apple`, `google`), `subject_hmac`, `email_cipher`, `created_at`, `last_used_at`           | Unique `(provider, subject_hmac)`. The subject is kept as an HMAC with a server key, so a database copy does not hold Google's cross-app subject. Deleted when the account is deleted, which is why signing in again creates a new account |
| `creator.identity_grant`   | `id`, `account_id`, `identity_id`, `token_hash`, `authenticated_at`, `expires_at`, `revoked_at`, `provider_refresh_cipher` | The adapter's opaque token; at most as long-lived as the session's 7-day refresh window                                                                                                                                                    |
| `creator.age_signal`       | see section 7                                                                                                              | Append-only                                                                                                                                                                                                                                |
| `creator.age_lock`         | `subject_hmac`, `provider`, `locked_at`                                                                                    | Survives account deletion, holds nothing else                                                                                                                                                                                              |
| `creator.pantopus_link`    | `account_id`, `pantopus_account_id`, `linked_at`, `unlinked_at`                                                            | **Designed now, created later** (with option B). Unique on both ids                                                                                                                                                                        |

**INV-14** says no object here stores Pantopus private data and "the only shared key is
Account.id". Option D stores no Pantopus data at all during the pilot. When a link exists, the
Pantopus account id lives only in `creator.pantopus_link`, is never returned by any endpoint, and
is never used as a Qelvora account id (Q-C). That honors INV-14 as written. T-14's schema scan
gains these tables; none has an address, household, neighborhood, mailbox or local-verification
column.

## 9. Sessions, revocation, abuse and non-leakage

- **Sessions** keep today's rules: 15-minute access, 7-day absolute refresh, rotation on refresh,
  token hashed at rest (`sessions.ts:234-248`). Sign out revokes one session; sign out everywhere
  revokes every session **and** grant of the account.
- **Revocation on the next request,** including an in-flight one: `resolveSession` reads the
  grant and account in the same request, with no cache.
- **Load.** One indexed query per authenticated request in our own database, instead of a call to
  another service; identity contract questions 4, 6 and 7 (revocation lag, outage behavior,
  request load) no longer apply to the pilot.
- **Rate limits.** Per IP and per continuation on `continue`, `complete`, `native/*` and `age`
  (proposed: 20 a minute per IP, 5 attempts per continuation), with `429` and a `Retry-After`.
  There are no passwords, so there is no account lockout to abuse; the provider owns credentials.
- **Non-leakage.** Sign-in creates an account on first use, so it never answers "no such account".
  Expired, replayed, mismatched and invalid tokens all return `continuation_expired` or
  `continuation_failed` with no detail about the person; the web already collapses them
  (`apps/web/app/api/auth/complete/route.ts:83-91`).
- **CSRF and cross-origin.** The web proxy refuses a cross-origin completion
  (`sameRequestOrigin`, `route.ts:32-36`); session writes go through the same-origin proxies.

## 10. Smaller decisions (defaults WP 1.2 uses unless you say otherwise)

| #   | Question                                                                                            | Default                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q-4 | Request email from Apple and Google?                                                                | Yes, stored encrypted, for account notices only                                                                                                                                            |
| Q-5 | How long is an under-18 subject hash kept after deletion?                                           | Until counsel answers; proposed 2 years                                                                                                                                                    |
| Q-6 | Is the date of birth stored?                                                                        | No, only the derived result                                                                                                                                                                |
| Q-7 | Same person, Apple then Google: one account or two?                                                 | Two, never merged by email (a merge by email is an account-takeover path). A second provider can be linked only from inside a signed-in session with fresh authentication, after the pilot |
| Q-8 | If Apple's web setup (Services ID, domain check) is late, can the web alpha start with Google only? | Yes. Apple's "offer Sign in with Apple" rule binds the iOS app, not the website; the web adds Apple as soon as it is configured                                                            |
| Q-9 | Creators: same sign-in?                                                                             | Yes; passkeys stay signing keys only                                                                                                                                                       |

## 11. Migration list

One migration for the pilot, written by lane 1 and registered by the integrator:

1. `creator.account`, `creator.account_identity`, `creator.identity_grant`, `creator.age_signal`,
   `creator.age_lock`, with RLS and grants to `creator_runtime`.
2. `creator.identity_session.mode` check extended with `'qelvora'` (`0002_w1_identity.sql:12`).

`creator.pantopus_link` waits for option B. Like every migration, this one changes the pinned
catalogue checksums, so the integrator regenerates and reviews them before export and delete run
(launch review, finding 2).

**Deletion.** Account deletion stays the trust privacy job that exists today
(`apps/backend/src/modules/trust/service.ts:830-952`): a fresh verification, an immediate
tombstone, one task per domain. The identity task's erasure is still refused today
(`identity-privacy-hook.ts:23-27`, `identity_retention_unconfigured`); WP 1.7 designs it. For
option D it also: revokes every session and grant, calls Apple's revocation endpoint, deletes the
account's identities (so a later sign-in mints a new account), keeps only the `age_lock` hash,
and sets `creator.account.state` to `deleted`.

## 12. What WP 1.2 needs from outside the repository

| Item                                                                                                                                                | From                | Needed for                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------- |
| Apple Developer account: App ID with Sign in with Apple, a Services ID for the web, a key (`.p8`) for the client secret, the notifications endpoint | Founder             | Real Apple tokens, the iOS app                                                   |
| Google Cloud OAuth clients: web, iOS and Android (the Android one needs the signing certificate's SHA-1)                                            | Founder             | Real Google tokens                                                               |
| The domain (Q09)                                                                                                                                    | Founder             | Apple's web domain check, the redirect allow-lists, the passkey relying-party id |
| Counsel's yes on the age method                                                                                                                     | Founder and counsel | Real fans                                                                        |

Until these exist, every sign-in scenario runs against a **fake ID-token issuer** on lane 1's
port 56414 (its own JWKS, signing keys made at start, tokens with any claim we choose, including
wrong audience, wrong issuer, bad signature, expired, missing nonce or unverified email), and the
pull request says "not verified against the real provider".

## 13. The scenarios that will prove WP 1.2

From the lane brief, negative cases first, each on the one-command stack with the fake issuer:
E1.1 (every refusal in section 5; Apple then Google; two tabs completing at once make one
account; the network dropping mid-flow; a reload and a backend restart keep the session), E1.2
(every domain route without a gate pass; decline; a platform under-18 signal winning; a later
flag), E1.3 (sign out, sign out everywhere, in-flight revocation, idle and absolute expiry, a
tampered cookie, cross-origin writes) and E1.4 (same answer for unknown and known; the rate limit
and its recovery).

## 14. Your three answers

Please answer in the chat, one line each (a "yes" takes the recommendation):

- **Q-A sign-in option:** D (Apple and Google, Qelvora-owned, linkable to Pantopus later)?
- **Q-B 18+ method:** neutral date-of-birth attestation plus platform signals, under 18 wins,
  confirmed with counsel before real fans?
- **Q-C account id:** a Qelvora-specific random UUID?

WP 1.2 starts only after all three, given in the session.
