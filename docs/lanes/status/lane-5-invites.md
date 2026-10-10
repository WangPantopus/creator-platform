# Lane 5: invites and entry (WP 5.7)

## Follow-up failure proof (2026-10-09, 18:33 PT)

Fresh API regression at load 4 passed 8/8, with two not run. Its output is
`/tmp/qelvora-lane5-invite-lock-api.log`. The earlier high-load 7/8 failure remains
recorded below; this repeat does not prove why those two requests returned 503.

The browser scenario now passes 3/3. The added failure check holds the real
PostgreSQL creator-invite advisory lock, uses the normal form and observes a 503
with no persisted row. After releasing the lock, a normal retry sends the same
ID and note, returns 200 through the web proxy and stores exactly one link.
The lock is released in `finally`. No request/response implementation is mocked.
Log: `/tmp/qelvora-lane5-invite-lock-browser.log`.

| ID                               | Steps                                                                   | Expected                                  | Observed                              | Result | Evidence          |
| -------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------- | ------ | ----------------- |
| E5.6-create-failure              | Hold actual invite lock, submit form, release, retry                    | Keep request and save once after recovery | 503/no row, same ID/note, 200/one row | pass   | browser log above |
| E5.6-form-edit / clipboard-retry | Real clipboard denial, edit, unchanged retry, blank/600-character input | Stable retries and separate edited links  | Both passed again                     | pass   | same log          |

## Approved form update (2026-10-09)

The founder approved the exact label “Your invitation note (optional)” and hint
“This note is public to anyone with the link. Up to 600 characters.” The form now
uses them, bounds input to 600 and keeps the note with its retry ID. An edit after
a failed copy makes a new ID; an unchanged retry reuses the stored link. Shared
web/Swift/Kotlin copy was regenerated, never hand-edited.

Real Chrome/server/PostgreSQL form checks initially passed 2/2: denied clipboard then
successful retry at the limit, exact stored/public Unicode and literal markup,
600-character input, edit after failure with unchanged old words, unchanged edited
retry and optional blank note. Screenshots `qelvora-lane5-invite-form.png` and
`-form-public.png` were inspected. Logs `/tmp/qelvora-lane5-invite-form-browser-final.log`.
First form run was 1/2: the scenario granted clipboard permission before the previous
copy finished, so it wrongly expected a retry after a successful copy. Waiting for
the button to become enabled fixed the scenario; no product behavior was changed
for that failure.

Fresh API regression was 7/8 with two not run. At load 23–25, the twenty concurrent
limit requests returned eighteen 201s and two 503s instead of two 429s. The database
still had only 20 active links at that boundary (19 after the following revoke).
This run is a failure, not a pass attributed to load. The earlier clean 8/8 remains
historical evidence. Diagnostics are in `/tmp/qelvora-lane5-invite-form-api.log` and
`-invite-limit-diagnostic.log`; the scenario now prints error codes on failure. A separate twenty-request repeat at the existing limit returned twenty 429 `invite_limit` responses and created no links. The earlier 503 bodies were not captured; backend logs show roughly 5.5 seconds for each and no error code. Do not claim their cause is proven.

Typecheck passed 7/7; changed web lint and generated-resource check passed. No new
unit tests. Full backend 157-test suite was not rerun for this form/copy change.
The pending migration is still held behind #385. Domain/app IDs and the real lane 3
`useful_answer` producer remain unconnected. A first AI answer is still not proven.

Branch `lane-5/invite-entry`, cut from main `c0b4ac0f0`. No pull request while
#385 is the open lane 5 migration PR. Pending SQL:
`apps/backend/src/modules/growth/migrations/pending_w7_invite_note.sql`.
The integrator owns registration. No domain or native association is invented.

## Contract and behavior

`POST /v1/growth/invites` still takes `contextId` (public post ID or null).
It also accepts `note` (optional, trimmed plain text, at most 600 UTF-16 code
units) and `id` (optional UUID). A verified creator owns the request. Old callers
can omit both new fields. Callers that retry must retain the same ID and body.
The same ID/body returns the original ID and expiry; changed content returns 409. A retry cannot renew or restore a link, even when it has expired or been
revoked. There are still at most 20 active links per creator. The existing launch
button retains its request ID through a failed API request or clipboard copy.

`GET /v1/growth/public/invites/:id` returns the creator, destination and exact
public note. No account is required. Reuse is allowed until expiry or revocation.
Creator pause/revocation and unavailable post context continue to deny the link.
Creation now refreshes current public state, so it does not depend on a prior
anonymous page view having populated the projection.

The web page renders the note as text, including markup and Unicode. Page and
metadata share only a render-scoped read. The note appears in link descriptions.
`/invite/:id/image` produces a 1200×630 PNG with the public ASCII handle, existing
copy and brand colors, and rechecks the link each time. It sends `no-store` and
returns 404 for expired/revoked links. The card deliberately avoids passing
arbitrary creator text to Next's automatic external font/emoji loader; it needs
no font or asset download. The complete note stays on the page and in metadata.
Already captured third-party previews cannot be recalled by this endpoint.

A signed-out visitor's button starts the existing sign-in continuation directly.
The fan-handle form and provider/privacy review still run. Browser proof reached
the first message in four Qelvora screens: invite, handle, review, thread. The
development identity picker is an additional outer-provider test screen, not
hidden from the count. A signed-in visitor goes to the existing chat review.

## Evidence (2026-10-09)

Real stock server and PostgreSQL on lane 5's ports. Fakes: development identity,
development creator license and model edge; expiry on one disposable link was
set into the past as a clock boundary. Browser: installed Chrome, no download.
SQL checks the stored note, expiry, active-link count and accepted fan message.
The authored note uses the real creator API; the note form is still gated below.
No new unit tests.

| ID                       | Steps                                                        | Expected                                    | Observed                                              | Result              | Evidence                           |
| ------------------------ | ------------------------------------------------------------ | ------------------------------------------- | ----------------------------------------------------- | ------------------- | ---------------------------------- |
| E5.6-create-race         | Five identical creates                                       | One link and expiry                         | Five 201s, one row/expiry                             | Pass                | `e5-6-invites.mjs`                 |
| E5.6-open-reuse          | Anonymous reuse, changed body, unknown ID                    | Same text; changed body 409; unknown 404    | Matched                                               | Pass                | Same script                        |
| E5.6-wrong-person        | Fan creates or revokes creator invite                        | Refused; link retained                      | Refused, original still 200                           | Pass                | Same script                        |
| E5.6-boundaries          | 600 Unicode characters; 601; invalid ID/context              | Exact boundary; invalid values refused      | 201/400/400/404                                       | Pass                | Same script                        |
| E5.6-limit               | Concurrent creates fill 20 slots; retry original             | Exactly 20, two refused; retry allowed      | Matched stored count                                  | Pass                | Same script                        |
| E5.6-revoke/expire/pause | Repeat revoke; expired retry; real pause/resume              | No resurrection; current state              | Matched                                               | Pass                | Same script                        |
| E5.6-browser-note/card   | Read real note and metadata; render PNG; request dead images | Plain text, PNG, dead images 404            | Matched                                               | Pass                | `e5-6-invite-browser.mjs`          |
| E5.6-four-screens        | New fan signs in, chooses handle, reviews providers, sends   | Four product screens and one stored message | Four + development provider; one accepted fan message | Pass                | Same script, `--fan-two` final run |
| E5.6-browser-errors      | Observe browser exceptions                                   | None                                        | None                                                  | Pass                | Same script                        |
| E5.6-clean-restart       | Restart before the first message                             | Note survives; dead links remain 404        | Matched                                               | Pass                | `e5-6-invites.mjs --after-restart` |
| E5.6-database-outage     | Pause own database, read, unpause                            | No stale answer; recovery                   | 503 then 200                                          | Pass                | `e5-6-invite-failure.mjs`          |
| E5.6-clipboard-retry     | Deny clipboard; allow and retry at 20-link limit             | One link                                    | Two web-proxy 200s, same ID, one row                  | Pass                | Same script                        |
| E5.6-restart/failure     | Restart after an active generation                           | Public reads recover                        | Worker recovery loop; public AI busy                  | Fail outside lane 5 | Logs and owner ticket below        |
| E5.6-note-form           | Creator writes note through UI                               | Real form                                   | Copy awaiting founder                                 | Not run             | Question below                     |
| E5.6-useful-answer       | Owner records useful answer once                             | Prompt eligibility from real outcome        | Owner not connected                                   | Not run             | Lane 3 ticket                      |
| E5.6-app-links           | App installed/absent                                         | Correct app/web route                       | Domain and app identifiers missing                    | Not run             | Q4                                 |

API: 8/8, two not run, including the clean rerun. Browser: final 4/4, one not
run. Clean restart: 1/1; database outage: 1/1; clipboard retry: 1/1. The initial browser run
could not find preview metadata because the shared HTTPS-only origin helper
omitted loopback; this branch adds an explicit development-only loopback fallback.
It also reached handle setup before hydration had settled. The next run reached
the thread but the scenario matched both the draft textarea and optimistic
bubble. The final scenario waits for the actual send response and reads the
stored message. The clipboard scenario initially expected the backend
201, but the web proxy returns 200; the assertion was corrected and the actual
permission-denial/retry workflow then passed. These first failures were not
counted as passes.

Local load ranged roughly 18–51 on 16 CPUs. Evidence:
`/tmp/qelvora-lane5-invites-api.log`, `-invite-browser-final.log`,
`-invite-restart-proof.log`, `-invite-failure.log`, and
`-invite-generation-recovery.log`, each with the `qelvora-lane5` prefix.
Clean repeat evidence: `/tmp/qelvora-lane5-invites-clean-api.log`,
`/tmp/qelvora-lane5-invite-clean-restart-proof.log`,
`/tmp/qelvora-lane5-invite-clean-failure.log` (outage passed; old clipboard status
assertion failed), and `/tmp/qelvora-lane5-invite-clipboard-final.log`.
Inspected screenshots: `qelvora-lane5-invite-page.png`, `-invite-card.png`,
`-invite-first-message.png` in `/tmp`. Seven typecheck tasks and changed-source
eslint passed; these do not replace the workflows.

## Decisions and owner tickets

- Founder copy approval pending: “Your invitation note (optional)” and “This
  note is public to anyone with the link. Up to 600 characters.” Until answered,
  the existing creator form stays unchanged. No note copy is invented for creators.
- Lane 3 / lane 4 / integrator: after the first real fan message, stop/up left
  one AI message `generating`. The worker repeatedly logged
  `generation_terminal_recovery_incomplete`; PostgreSQL reported
  `Actual finalized original terminal required`. Inspect
  `apps/backend/src/workers/generation-terminal.ts` and the lane 4 terminal
  settlement functions in `modules/commerce/schema-generation-*.sql`.
  Repeated recovery locked `ai_workspace`, making public reads and invite creates
  return 503 `public_ai_busy`. No money semantics or owner check was changed.
- Lane 3, `modules/conversation`: connect the real useful-answer outcome to
  `GrowthService.measure`, once per cause. A browser event cannot claim value.
  Then run prompt eligibility against that real outcome. The generic metric
  method exists; the owner call is absent.
- Founder / lane 2 / lane 7: Q4 domain, Apple app ID and Android association
  identifiers; then associated-domain/app-link files and installed-device proof.
  Production preview metadata still needs the approved HTTPS origin.
- Integrator: register the pending note-column migration after #385's turn.
  Existing invite export uses `SELECT *` and erasure deletes invite rows; a real
  privacy-job export/erasure run for this new column is still not run.

## Rerun

Use the runtime PATH and pnpm setting in the handoff. Start with a disposable reset
for fresh actors and limits; apply the SQL by hand. Do not read generated env files.

```sh
node infra/local/stack.mjs reset --lane 5 --growth --no-smoke
docker exec -i qelvora-lane5-postgres psql -v ON_ERROR_STOP=1 -U postgres -d creator_stack < apps/backend/src/modules/growth/migrations/pending_w7_invite_note.sql
node tests/scenarios/lane-5/e5-6-invites.mjs
node infra/local/stack.mjs stop --lane 5
node infra/local/stack.mjs up --lane 5 --growth --no-smoke
node tests/scenarios/lane-5/e5-6-invites.mjs --after-restart
node tests/scenarios/lane-5/e5-6-invite-failure.mjs
node tests/scenarios/lane-5/e5-6-invite-browser.mjs
```

Run the first-message browser walk last because the owner recovery issue above
can affect later checks. A clean run uses fan one; `--fan-two` is available for
one repeat with a still-new account. The scripts close their browsers and always
unpause the database in `finally`. Shut the stock stack down when finished.
