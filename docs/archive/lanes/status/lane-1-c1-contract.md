# Contract C1: the sign-in API

Provider: lane 1. Consumers: lanes 2, 5, 6 and 7. Written 2026-10-15.

**Status: published as a draft for option D.** The schemas are in
`packages/api/src/identity.ts` (and generated into the OpenAPI document and the Swift and Kotlin
models). The founder has not yet confirmed the sign-in option (decision pack, pull request #406).
If the founder picks option D, this contract is what WP 1.2 builds. If the founder picks option B
(a Pantopus connect flow), only the native entry point changes (to a system-browser sign-in); the
session object, refresh, sign-out, fresh authentication and deletion stay as written here.

The backend does **not** serve the new endpoints yet. Build against the stub (section 8), which
puts C1 in front of your lane's stack and turns an accepted sign-in into a real session there.

## 1. The flows

**Web (Apple or Google).** The web app's own routes (`/api/auth/*`, lane 1) do this; other web
lanes only link to `/api/auth/continue?returnTo=<path>`.

1. `POST /v1/identity/web/start` `{ returnTo, provider, reauthenticate? }` returns
   `{ redirectUrl, continuationId }`. The browser goes to `redirectUrl`.
2. The provider returns to the web callback with `code`, `state`, `continuationId`.
3. `POST /v1/identity/web/complete` `{ continuationId, code, state }` returns an
   **`IdentitySignInResult`** (section 3).
4. If `status` is `age_required`, the age screen posts `POST /v1/identity/age` and gets an
   `IdentitySignInResult` with `status: "signed_in"`, or `403 adult_eligibility_required`.

**Native (iOS: Apple and Google; Android: Google).**

1. `POST /v1/identity/native/nonce` `NativeSignInStart { provider, platform, returnTo?,
reauthenticate? }` returns `NativeSignInNonce { continuationId, nonce, expiresAt }`. Single use,
   five minutes.
2. The app runs the system sheet with the nonce. **iOS with Apple** passes `SHA-256(nonce)` as a
   lowercase hex string (Apple puts that hash in the token); Google takes the nonce as is.
3. `POST /v1/identity/native/complete` `NativeSignInComplete { continuationId, provider, idToken,
authorizationCode? }` returns an `IdentitySignInResult`. Send Apple's `authorizationCode` when
   you have it: the backend keeps it encrypted so account deletion can revoke the grant at Apple.
4. Age, as on the web.

Android offers Google only in the pilot. Apple's "offer Sign in with Apple" rule binds the iOS
app.

## 2. Endpoints

| Endpoint                                     | In                                       | Out (200)                            | Refusals                                                                                                                                                                        |
| -------------------------------------------- | ---------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/identity/web/start`                | `IdentityProviderContinue`               | `IdentityRedirect`                   | `400 invalid_request`, `400 sign_in_provider_unavailable`, `429 rate_limited`, `503 sign_in_unconfigured`                                                                       |
| `POST /v1/identity/web/complete`             | `CompleteIdentity`                       | `IdentitySignInResult`               | `403 continuation_expired`, `403 identity_state_invalid`, `401 continuation_failed`, `403 adult_eligibility_required`, `403 scope_revoked`, `503 identity_provider_unavailable` |
| `POST /v1/identity/native/nonce`             | `NativeSignInStart`                      | `NativeSignInNonce`                  | `400 invalid_request`, `400 sign_in_provider_unavailable`, `429 rate_limited`, `503 sign_in_unconfigured`                                                                       |
| `POST /v1/identity/native/complete`          | `NativeSignInComplete`                   | `IdentitySignInResult`               | `403 continuation_expired`, `401 continuation_failed`, `403 adult_eligibility_required`, `403 scope_revoked`, `503 identity_provider_unavailable`                               |
| `POST /v1/identity/age`                      | `AgeConfirmationInput`                   | `IdentitySignInResult` (`signed_in`) | `400 invalid_request`, `403 age_confirmation_expired`, `403 adult_eligibility_required`                                                                                         |
| `GET /v1/identity/session` (exists)          | bearer                                   | `Session`                            | section 5                                                                                                                                                                       |
| `POST /v1/identity/refresh` (exists)         | bearer                                   | `SessionToken`                       | `401 session_expired`, `401 session_changed`                                                                                                                                    |
| `POST /v1/identity/logout` (exists)          | bearer                                   | `Done`                               |                                                                                                                                                                                 |
| `POST /v1/identity/revoke-sessions` (exists) | bearer                                   | `Done`                               |                                                                                                                                                                                 |
| `POST /v1/trust/privacy/jobs` (exists)       | `{ kind, scope, proof, idempotencyKey }` | the job                              | `401 fresh_verification_required`, `429 privacy_rate_limited`                                                                                                                   |

`/v1/identity/continue` and `/v1/identity/complete` stay the development identity's, with their
shapes unchanged, so the development sign-in and today's clients keep working. Only the two start
endpoints are rate limited (20 a minute per client); every completion is single use, so that bounds
every attempt. Each step is single use whatever its outcome: after any refusal, start again.

Every error is `{ error: { code, message, requestId } }`. Show the `message` or your own copy for
the `code`; never branch on the message text.

## 3. The sign-in result

`IdentitySignInResult` is a flat object so every generated client decodes it:

| `status`       | `completion`                                      | `ageConfirmation`                                           |
| -------------- | ------------------------------------------------- | ----------------------------------------------------------- |
| `signed_in`    | `IdentityCompletion { token, returnTo, session }` | `null`                                                      |
| `age_required` | `null`                                            | `{ ageContinuationId, expiresAt }` (10 minutes, single use) |

Nothing is signed in while `status` is `age_required`: there is no token and no cookie, and no
domain route can be reached.

**The age step.** `AgeConfirmationInput { ageContinuationId, birthDate (YYYY-MM-DD),
platformSignal? }`. The screen asks for the date of birth without saying what age is needed. On
iOS, if the Declared Age Range API reports under 18, send `platformSignal: { source:
"apple_declared_age_range", under18: true }`; on Android, the Play age signals likewise. Only
`under18: true` changes anything: an adult report is never proof. A date that does not exist
(`2001-02-30`) is `400 invalid_request` and does **not** use up the step.

**Under 18** is `403 adult_eligibility_required`. It is final for that Apple or Google identity:
signing in again gives the same answer and never offers the age step again. Show the designed
under-18 state with the policy and nothing else (D-11).

## 4. The session

- `token` is an opaque bearer. On the web it lives in the httpOnly cookie (lane 1's routes); in the
  apps, in the Keychain or Keystore. Never log it.
- Access lasts 15 minutes (`session.expiresAt`). Refresh before then with `POST /v1/identity/refresh`;
  each refresh returns a **new** token and the old one stops working. Refresh works for 7 days from
  sign-in, then the person signs in again.
- `session.mode` is `development` on a local stack and `qelvora` with option D. Branch only on
  `development` (to show the local-account notice). Do not show "Signed in with Pantopus" for
  `qelvora`.
- `session.adultEligible` is always `true`: an ineligible person has no session.
- Send `X-Expected-Account-Id` and `X-Expected-Session-Id` on writes from a form that was opened
  under a known session. A mismatch is `409 session_account_changed` or `409 session_view_changed`;
  reopen the view.

## 5. When a request is refused

| Code                              | Meaning                                                                                                      | Client does                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `401 session_required`            | No token                                                                                                     | Start sign-in                             |
| `401 session_expired`             | Access window over, or this session was signed out                                                           | Refresh once; if that fails too, sign in  |
| `401 session_changed`             | The token was already rotated (two refreshes raced)                                                          | Sign in                                   |
| `401 authorization_ended`         | The sign-in behind the session was withdrawn (with option D: the person withdrew consent at Apple or Google) | Sign in; do not retry                     |
| `403 scope_revoked`               | The account was deleted or restricted                                                                        | The closed-account state; do not retry    |
| `403 adult_eligibility_required`  | Under 18, at sign-in or flagged later (\*)                                                                   | The under-18 state; no partial access     |
| `503 identity_unavailable`        | The session check could not run                                                                              | Keep the session; offer a retry           |
| `403 fresh_identity_required`     | Passkey registration needs a sign-in within 5 minutes                                                        | Sign in again with `reauthenticate: true` |
| `401 fresh_verification_required` | Export or deletion needs a sign-in within 5 minutes                                                          | Sign in again with `reauthenticate: true` |

A revoked session is refused on the very next request, including one already in flight.

(\*) WP 1.2 (the sign-in backend, stacked on this pull request) answers
`403 adult_eligibility_required` when an account is flagged under 18 after sign-in, so the client
can show the under-18 state. A backend from before WP 1.2 answers `401 authorization_ended`
(`apps/backend/src/modules/identity/sessions.ts:195-213`); handle both until it merges.

## 6. Fresh authentication and signed acts

- **Passkey registration** (creators) and **export or deletion** need a session created in the last
  5 minutes: start sign-in again with `reauthenticate: true`, which makes the provider ask again.
- **Signed acts** (a Note, a reaction, accepting a request, a reply) do not need a fresh session.
  Each needs a passkey assertion over the exact content within 5 minutes of its challenge
  (`/v1/identity/{creatorId}/signed-acts/begin`, then `/v1/identity/signed-acts/verify`), as today.

## 7. Sign-out and deletion

- Sign out: `POST /v1/identity/logout`. Sign out everywhere: `POST /v1/identity/revoke-sessions`
  (with option D it also revokes the account's provider grants).
- Delete the account: after a fresh sign-in, `POST /v1/trust/privacy/jobs` with `{ kind: "delete",
scope: "account", proof, idempotencyKey }` (`idempotencyKey`: 16 to 128 of `[A-Za-z0-9_-]`).
  Access is denied immediately; domain erasure follows as tasks. On a local stack the `proof` is the
  typed confirmation `LOCAL DEVELOPMENT`. Signing in again later with the same Apple or Google
  account gives a new, empty account.

## 8. The stub

`tests/scenarios/lane-1/c1-stub.mjs` serves C1 in front of a running stack. It verifies fake Apple
and Google ID tokens with the rules of the decision pack, runs the age step, and on success signs
the matching synthetic account in on your stack, so the token it returns works for every other
endpoint. Every other request is passed through to the stack unchanged.

```
node infra/local/stack.mjs up --lane N --no-web
C1_BACKEND=http://127.0.0.1:564N1 C1_STUB_PORT=564N4 node tests/scenarios/lane-1/c1-stub.mjs
```

Point the app (or your scenario) at the stub's address instead of the backend's.

- **Test people:** `fan-1`, `fan-2`, `maya`, `ops`, `fan-5`, `fan-6` and `teen` (the stack's
  development accounts 1 to 7; `teen` is refused as under 18 even with an adult date). Any other
  subject is `403 stub_subject_unknown`.
- **Getting an ID token without a real Apple or Google sheet:** `POST /__fake/id-token` with
  `{ "claims": { "provider": "google", "sub": "fan-1", "aud": "<audience>", "nonce": "<nonce>" } }`.
  Audiences and issuers are at `GET /__fake/info`; any claim can be overridden to make a bad token,
  and `options` takes `{ "alg": "none" }` or `{ "badSignature": true }`. A debug build can call this
  in place of the system sheet.
- **Web:** `POST /v1/identity/web/start` returns a `redirectUrl` to a fake
  authorization page; add `&sub=fan-1` to it and it redirects to `C1_WEB_CALLBACK` (default: a
  stub page) with `code`, `state` and `continuationId`.
- `POST /__fake/reset` forgets age confirmations and under-18 locks.
- **Limits:** age confirmations live in the stub's memory (a stub restart asks again; sessions
  survive because they are the stack's); `session.mode` is `development`; Apple's server
  notifications are not simulated. The default rate limit is 20 sign-in starts a minute per
  address (`C1_RATE_LIMIT`, `C1_RATE_WINDOW_MS`).

`node tests/scenarios/lane-1/c1-check.mjs [stub-url]` walks all of this, refusals first, and checks
each response against the published schemas.
