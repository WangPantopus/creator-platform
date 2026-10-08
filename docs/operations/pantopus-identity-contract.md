# What Qelvora needs from Pantopus identity (Q01)

Written 2026-10-08 from the code, for whoever owns Pantopus sign-in and for the founder's
decisions. It restates behavior that already exists in
[`adapter.ts`](../../apps/backend/src/modules/identity/adapter.ts) and
[`sessions.ts`](../../apps/backend/src/modules/identity/sessions.ts); nothing here changes
what [source/](../source/) requires. [Q01](../workstreams/DECISIONS.md) is the open question
and [step 1 of the launch plan](../LAUNCH_PLAN.md) is blocked on it.

## Where things stand

The product runs only with the development adapter: seven fictional accounts, loopback
only, one of them under 18. A non-development backend serves only health, the OpenAPI
document and identity capabilities (review [section 1](launch-review-2026-10-08.md)). Only an opaque account id and an
adult flag cross the boundary; everything else about a person stays in Pantopus.

## The interface

Three methods, none returning profile data:

| Method | In | Out |
| --- | --- | --- |
| `beginSession` | return path, `state`, `continuationId`, PKCE `codeChallenge`, `reauthenticate: true` | an HTTPS `redirectUrl` |
| `completeSession` | `code`, `state`, `codeVerifier` | an opaque upstream `token` and `authenticatedAt` |
| `resolveSession` | the upstream token | exactly `{ accountId (UUID), adultEligible (boolean) }` |

## The sign-in flow the backend runs

1. A client asks to continue. The backend stores a 5-minute, single-use continuation and
   makes a random `state` and a PKCE verifier (HMAC of the state with the session key).
2. It sends the person to the Pantopus HTTPS authorization URL with `state`,
   `continuationId`, an S256 `code_challenge`, and a request to authenticate again.
3. Pantopus authenticates the person freshly (and, if Pantopus requires it, asks them to allow
   Qelvora), then redirects back with `code`, `state` and `continuationId`.
4. The backend checks `state` in constant time, exchanges `code` with the verifier, and
   requires `authenticatedAt` to be within the last 5 minutes (and at most 30 seconds in
   the future). Signed acts such as publishing a Note or accepting a request depend on that
   freshness.
5. It resolves the token to the actor, stores the token encrypted (AES-256-GCM) and issues
   its own session: 15-minute access, 7-day refresh, rotating. The upstream token never
   reaches a client.

## What Pantopus must provide

- **Authorization endpoint:** HTTPS only; forced re-authentication on request; S256 PKCE;
  a redirect allow-list that includes the Qelvora callback (final domain, Q09) and the native
  return paths (system browser sign-in on iOS and Android).
- **Token exchange:** returns an opaque token and the time of the actual authentication.
- **Token resolution:** a stable UUID account id and `adultEligible` from the Pantopus age
  check (D-11, 18 and over). It must answer 401 when the person signed out, the account was
  removed or revoked, or the account is not an adult. The backend treats any other failure
  as an outage, keeps the session, and returns 503.
- **Fast revocation:** the session service keeps no cache, so every authenticated request
  resolves the token upstream today and a revoked token stops working on the next request. The architecture's
  target is 5 seconds for in-flight revocation.
- **Account deletion event:** a signed, retried, idempotent notice when a Pantopus account is
  deleted. The architecture (section 4, `account_delete`) deletes everything except ledger
  entries, which keep the account id hashed. The backend has no receiver for this event yet.
- **A non-production environment** with at least seven test accounts, including one under 18,
  one that can be revoked or deleted on demand, and one whose authentication can be made
  stale.

## Decisions for the founder

1. **Does Pantopus already run an OAuth 2 or OpenID Connect provider?** If so, the adapter is
   small and the work is client registration plus the account deletion event. If not, someone
   has to build the five items above, and the date for that sets the date for step 1.
2. **Behavior during a Pantopus outage.** The source architecture (section 2, the Pantopus
   identity row) says existing sessions continue to their expiry. The code fails closed: while the
   upstream is unreachable, requests return 503. Pick one; the code or the document changes.
3. **Request load.** Every authenticated request, including each client's 4-second heartbeat,
   calls the upstream today. Either Pantopus serves that rate, or the backend caches the
   answer for a few seconds and revocation takes that long. This needs the 5-second target
   in mind.
4. **An interim sign-in.** If Pantopus cannot deliver in time, a Qelvora-owned sign-in can
   be a second adapter for the pilot. That makes 18+ evidence and later account linking open
   questions for counsel, because the age check today lives in the Pantopus account.

## What this repository still needs

- A production adapter implementing the three methods, and a production composition that
  injects it (review [section 3](launch-review-2026-10-08.md)).
- The account deletion receiver.
- The domain and relying-party ID (Q09), which passkeys and app links also wait on.
