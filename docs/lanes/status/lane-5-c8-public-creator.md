# Lane 5: C8 public creator page

Draft for WP 5.6. Provider: lane 5. Consumers: lanes 1, 3, 4, 6 and 7.
The current wire shape is `CreatorProjection` in
`apps/backend/src/modules/growth/contracts.ts`; the public endpoint is
`GET /v1/growth/public/creators/:handle` and returns `{ creator, posts }`.
It needs no account. These fields are public metadata, never evidence that a
creator read a fan's message or that the fan has access to a private source.

| Field                                                               | Source                                                                                                                                | Missing or unavailable                                                                                                                                                              |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `handle`, `name`                                              | Lane 1: `creator.creator_profile`                                                                                                     | Unknown or former handle: 404. A reused handle resolves to its current owner.                                                                                                       |
| `verified`                                                          | Lane 1: verification is `verified` and recovery is not required                                                                       | No public page when false.                                                                                                                                                          |
| `state`, `mode`, `topics`, `sourceSummary`                          | Lane 3: `PublicCreatorAIProjection.current`, the licensed public reader                                                               | Without that reader, state is `unpublished`, mode is `expert`, topics and summary are empty. `expert` alone never claims an AI was published.                                       |
| `biography` (600 characters), `category` (60), `photoCaption` (100) | Q2 default: growth-owned public profile table, written through a new endpoint by the verified creator; lane 6 owns the authoring form | Still empty until that migration and endpoint are built. The page uses the creator's name and handle, and an initial instead of an empty photo box. No photograph URL exists in C8. |
| `presence`                                                          | Intended source: the latest published Note or post in the world-readable `creator.content_index`; no private text                     | Empty until the approved date sentence is wired. It must not imply the creator was in a fan's conversation.                                                                         |
| `capacity`, `reliability`                                           | Lane 4 must provide a world-readable summary of the capacity it enforces and its reliability range                                    | Empty; never infer capacity from private commerce rows, a price or an old projection.                                                                                               |
| `membershipLabel`, `accessLines`                                    | Lane 4 public membership/offer summary, still unwired                                                                                 | `null`, `[]`; no invented tier, price or promise.                                                                                                                                   |
| `version`, `updatedAt`                                              | Growth projection: increment only when canonical public fields change                                                                 | Internal projection metadata, not a promise of response time.                                                                                                                       |
| `posts`                                                             | Growth's signed public content projection; at most 30, newest first with ID as the tie-breaker                                        | Empty when paused or there are no public posts. Private Notes and fans' replies never enter this list.                                                                              |

## States and rendering

Only a verified creator with a published or paused AI is returned today. An
unpublished, revoked, recovering or missing creator remains unavailable (404).
An unpublished AI does not get the “Official AI” label. A paused page remains
readable, with existing pause copy and no chat button or public posts. Capacity
text is informational; the commerce owner enforces the real decision.

All creator-authored fields render as text, preserving line breaks where useful.
Markup does not create DOM elements. Long names, unbroken text, emoji and
right-to-left text must fit at phone width and large text size. Structured
metadata escapes `<` and never includes private content. A caption is a caption,
not evidence of a hosted photograph.

## Read cost and freshness

The process-local cache holds at most 64 composed pages for five seconds.
Overlapping anonymous requests for one handle share the current-state check and refresh.
A signed-in request always performs its own current visitor/session check; it never
shares an in-flight answer with another request. A busy handle answers 429 instead.
A hit still checks the current canonical creator and public post versions; a
rename, pause, revocation or erasure invalidates it; post edits and withdrawals
invalidate it when their public projection changes, as on the existing read path. Failures do
not serve an older answer. A cold composition refreshes the creator once.

Successful anonymous responses permit storage only with revalidation:
`Cache-Control: public, max-age=0, must-revalidate`, with an ETag. Errors and signed-in responses
remain `no-store`. This avoids a browser or CDN serving through a later revocation.
The cache is not permission and is not durable; restart drops it.

The route admits 120 reads per socket address per minute, answers 429 with
`Retry-After` beyond that, and bounds concurrent distinct handles and address
bookkeeping. Untrusted forwarding headers do not select the address. These are
per-process limits. Lane 2 must add visitor limits at a trusted reverse proxy;
SSR traffic otherwise shares the web server's socket address. A web render
shares its creator read between page and metadata.

## Tickets and gates

- Lane 4, public summary module / C8: publish current capacity, reliability,
  membership label and access lines; identify their revision and freshness rules.
  Growth must not read private commerce tables to fill these strings.
- Lane 6, `features/studio`: add biography, category and photo-caption fields once
  the growth profile endpoint exists. Q2's default is recorded; the migration
  waits its turn behind notice snapshots. No new migration PR accompanies the
  cache and rendering work.
- Lane 2, deployment proxy: enforce the visitor limit before shared SSR/proxy
  traffic reaches the API. Keep forwarding headers untrusted unless the proxy
  boundary is explicitly configured.
- Integrator, `packages/api/src/openapi.ts`: publish C8 in the generated public
  contract when the profile-authoring shape is settled. No generated file is
  edited by hand.

## Verification

Checked on 2026-10-09 against lane 2's real stock backend and PostgreSQL, with
installed Chrome. No browser or package download; no new unit tests. Edge fakes:
development identity, development creator license, and the model. The post
workflow also enrolls a software passkey. Browser large-text coverage uses a 200%
root-font user stylesheet, not a claim of complete accessibility certification.

| ID                         | Steps                                                                         | Expected                                                              | Observed                                                                                  | Result                            | Evidence                                           |
| -------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------- |
| E5.5-anonymous             | Read published Maya signed out                                                | Public page, no new session                                           | 200, published state, unchanged session count                                             | Pass                              | `e5-5-public-page.mjs`                             |
| E5.5-cache-lock            | Warm; hold growth row lock; read and revalidate                               | No wait on that lock; 304 on match                                    | Cache hit 200; 304                                                                        | Pass                              | Same script                                        |
| E5.5-session               | Sign in, begin conversation, block, race signed and anonymous reads, sign out | No shared visitor authority; revoked token refused                    | Blocked account refused; old token 401; anonymous 200                                     | Pass                              | Same script, stored block count 1                  |
| E5.5-rename/pause/boundary | Rename; pause/resume; invalid handles; unpublished creator                    | Current state immediately                                             | Former handle 404, exact Unicode name; paused/no posts then published; 400/404 boundaries | Pass                              | Same script, canonical rows checked                |
| E5.5-hammer                | 130 concurrent requests, spoofed forwarding headers                           | 120 admitted, ten limited; no lock pile-up                            | 120 identical 200s, ten 429s with retry header; zero lock waiters                         | Pass                              | Same script                                        |
| E5.5-restart               | Stop and restart full host; read                                              | Cold cache and persistent current page                                | Miss, published Maya                                                                      | Pass                              | Same script `--after-restart`                      |
| E5.5-browser               | Empty fields; Unicode/markup; Night; 200% font; former handle                 | Useful existing empty states; text stays text; no horizontal overflow | Five checks passed at 390 and 320 px; no application exceptions                           | Pass                              | `e5-5-public-browser.mjs`, screenshots below       |
| E5.5-conditional           | Weak, listed, wildcard and different ETags                                    | 304 only on a current match                                           | Three empty 304s; different tag 200                                                       | Pass                              | `e5-5-public-failure.mjs`                          |
| E5.5-database-failure      | Warm cache; pause own database; read; recover                                 | Do not serve stale; recover current                                   | 503; then current published page 200                                                      | Pass                              | Same script                                        |
| E5.5-posts                 | Sign, publish, edit, unpublish, wrong person, racing archives                 | Public projection follows current owner state                         | Five passed after the separate withdrawal fix                                             | Pass with withdrawal prerequisite | [withdrawal evidence](lane-5-public-withdrawal.md) |
| E5.5-profile-author/bio    | Real authored biography/category/caption and limits                           | Complete profile                                                      | Authoring endpoint/migration not built                                                    | Not run                           | No projection mock substituted                     |
| E5.5-capacity              | At-capacity profile matches enforcement                                       | Current public summary                                                | Lane 4 reader missing                                                                     | Not run                           | Owner ticket above                                 |

The first API run had two failures: matching ETag returned 200 and the test fan
had no profile/conversation for a block. Both were corrected and the API script
then passed 7/7 (two not run). Restart passed 1/1, browser 5/5 (one not run),
conditional/outage 2/2. Draft review also caught a potential in-flight authority
mix-up; only anonymous requests may now share work. No session/token is put in
the cache key or response.

The post workflow found existing withdrawal defects; these are fixed separately
before this cache can be integrated. A field without its real source is not
complete. E5.5 as a whole is not yet a merge-ready star row.

Local load was roughly 12–45 during these checks. Screenshots were inspected:
`/tmp/qelvora-lane5-public-light.png`, `-night-large.png`, `-unavailable.png`.
An 80-character unbroken name remains fully readable but needs substantial
vertical scrolling at 200%; it is not truncated. Logs use the same prefix:
`-api-rerun.log`, `-restart-proof.log`, `-browser.log`, `-failure.log`.
These local files are evidence for this run, not committed fixtures.

Re-run with the runtime PATH and pnpm setting in the handoff:

```sh
node infra/local/stack.mjs reset --lane 5 --growth --no-smoke
node tests/scenarios/lane-5/e5-5-public-page.mjs
node infra/local/stack.mjs stop --lane 5
node infra/local/stack.mjs up --lane 5 --growth --no-smoke
node tests/scenarios/lane-5/e5-5-public-page.mjs --after-restart
node tests/scenarios/lane-5/e5-5-public-browser.mjs
node tests/scenarios/lane-5/e5-5-public-failure.mjs
```

Reset is required before the full API script because its fan block is persistent.
The failure script always unpauses the database in `finally`. Run scripts in order
because the hammer deliberately fills the rate-limit window. Use the withdrawal
note's command for public posts. Do not run these against the old scenario host.
