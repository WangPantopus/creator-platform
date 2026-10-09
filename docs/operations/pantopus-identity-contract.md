# What Qelvora needs from Pantopus identity (Q01)

Written 2026-10-08 from the code and, the same day, from a read-only look at the Pantopus
repository, for whoever owns Pantopus sign-in and for the founder's decisions. It restates behavior that already exists in
[`adapter.ts`](../../apps/backend/src/modules/identity/adapter.ts) and
[`sessions.ts`](../../apps/backend/src/modules/identity/sessions.ts); nothing here changes
what [source/](../source/) requires. [Q01](../workstreams/DECISIONS.md) is the open question
and [step 1 of the launch plan](../LAUNCH_PLAN.md) is blocked on it.

## Where things stand

The product runs only with the development adapter: seven fictional accounts, loopback
only, one of them under 18. A non-development backend serves only health, the OpenAPI
document and identity capabilities (review [section 1](launch-review-2026-10-08.md)). Only
an opaque account id and an adult flag cross the boundary; everything else about a person
stays in Pantopus.

## What Pantopus has today

Read in the Pantopus repository (`master` at `f88f74641`) on 2026-10-08. Nothing was changed
and no secret was read. Paths are inside that repository. Items marked *(checked)* were
re-read by a second person; the rest are the researcher's reading.

- **It is not an OAuth or OpenID Connect provider.** Pantopus signs people in with Google and
  Apple, so it is an OAuth *client*, over Supabase Auth. Supabase's own OAuth-server mode is
  present in `supabase/config.toml` and switched off (`[auth.oauth_server] enabled = false`,
  the untouched template) with no consent page and no registered clients *(checked)*. The
  route `POST /api/users/oauth/token` only completes a Google or Apple sign-in for a Pantopus
  client; it is not a provider endpoint *(checked)*. No authorize, userinfo, introspection,
  key-set or discovery endpoint exists.
- **Its session check is its own.** `backend/middleware/verifyToken.js` calls Supabase
  `getUser`, then checks `AuthSession` rows and a `User.sessions_valid_after` watermark,
  cached for 15 to 60 seconds. Revocation events are in-process only. A check on the
  Supabase token alone would miss device revocation and the watermark.
- **There is no verified 18+ signal.** `User.date_of_birth` is nullable. It is optional at
  sign-up, 18+ is checked only if a date is supplied, Apple and Google sign-ups do not store
  one, and a later edit has no age check *(checked)*. No age vendor is used. D-11 says 18+ is
  "enforced through the Pantopus account"; that does not hold today.
- **The account id is the Supabase user UUID**, equal to `User.id`, which Pantopus can resolve
  publicly in places.
- **Deletion is a hard delete** with in-process listeners; nothing durable (outbox, ban or
  event) leaves Pantopus.
- **No Qelvora integration exists** in the Pantopus repositories, and Pantopus's own launch
  scope keeps Beacon and personas switched off. Native Pantopus clients register only
  `pantopus://`, and their app links already claim `/auth/*` on iOS and all of the Pantopus
  domain on Android.
- **Only local environments exist.** The Supabase stacks running here are local; staging is
  placeholder configuration, and the hosted dashboard (JWT algorithm, whether the OAuth
  server is on, whether staging is live) was not checked.

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

## What a Pantopus-side connect flow must provide (option B below)

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

## Options

Sizes for the Pantopus side are the researcher's estimates.

| Option | What it is | Pantopus side | Qelvora side |
| --- | --- | --- | --- |
| A | Turn on Supabase's OAuth server and register Qelvora as a client | Enable it, build the consent page, register the client, make `verifyToken` refuse client tokens, add an adult claim. Large and uncertain: its tokens would bypass `AuthSession` and the watermark, and forced re-authentication and deletion events are unconfirmed | A standard OpenID Connect adapter |
| B | A small Pantopus "connect" flow built for this | A fresh-login authorize page that issues an S256 code; server-to-server token and resolve endpoints (the internal-route key pattern already exists in `backend/routes/internal.js`); an opaque 7-day grant checked uncached against `AuthSession` and the watermark; returns only `{ accountId, adultEligible }`; a deletion outbox. About 3 to 5 weeks, and an adult rule is needed first. The authorize page must stay outside the existing app-link paths | The adapter and a deletion receiver, about a week |
| C | Verify the Supabase token directly | Nothing | Days, but Qelvora would hold a full Pantopus session, tokens expire hourly, it misses device revocation and the watermark, and it has no freshness or age signal. A development stand-in only |
| D | A Qelvora-owned sign-in (Sign in with Apple and Google, or passkey-first) as a second adapter | Nothing | About one to two weeks plus store and provider accounts. Needs its own 18+ approach. Account linking to Pantopus later |

Whatever the option, 18+ needs its own answer, because Pantopus has none to lend.

## Recommendation *(to confirm)*

Option D for the pilot, with option B as the long-term way to honor "one Pantopus account
signs in to every Pantopus app", and an account-link table designed now so a Qelvora account
can be linked to a Pantopus account later. It starts real people on phones without waiting
three to five weeks on another codebase, and it keeps the adapter interface unchanged. The
18+ method (self-attestation, platform age signals, a vendor, or a combination) is a
decision for you and counsel.

## Decisions for the founder

1. **What defines "18+"?** Pantopus requiring and locking a date of birth, a vendor, platform
   age signals, or an attestation made inside Qelvora. The pilot needs an answer before real fans
   join (D-11, SB 243-style obligations).
2. **Do you authorize new Pantopus code** (a table, endpoints, a page) given its
   verify-first rule in its `AGENTS.md`, and who builds it by when? Only needed for option B.
3. **Which account id should Qelvora receive?** Pantopus's raw `User.id` is publicly
   resolvable in places; a Qelvora-specific id would avoid linking the two by anyone who
   can see the Pantopus one.
4. **Is Pantopus's 15 to 60 second cached revocation lag acceptable** against the
   architecture's 5 second in-flight revocation target?
5. **From the hosted Pantopus dashboard:** the JWT signing algorithm, whether the OAuth
   server is on, and whether staging is live.
6. **Behavior during a Pantopus outage.** The source architecture (section 2, the Pantopus
   identity row) says existing sessions continue to their expiry. The code fails closed: while
   the upstream is unreachable, requests return 503. Pick one; the code or the document
   changes.
7. **Request load.** Every authenticated request, including each client's 4-second
   heartbeat, calls the upstream today. Either the upstream serves that rate, or the backend
   caches the answer for a few seconds and revocation takes that long.

## What this repository still needs

- A production adapter implementing the three methods, and a production composition that
  injects it (review [section 3](launch-review-2026-10-08.md)).
- The account deletion receiver.
- The domain and relying-party ID (Q09), which passkeys and app links also wait on.
