# Lane 5: Presence and reach status

## Current update: Android push (2026-10-09, 18:10 PT)

The founder approved the invitation-note label and hint, human-reply-only shares,
the web-push package download, and holding iOS retention until safe background
presentation exists. Those approvals persist; do not ask again. Public biography/date
copy still has no answer. Metrics cohort assignment was asked separately; no answer yet.

**Merge-order correction:** #372 merged to main at 23:17:30 UTC; #373 merged into
`lane-5/delivery-queue` at 23:17:44 UTC, after #372 closed. Main `c0b4ac0f0` therefore
lacks the mute fix. #385 carries BOTH the mute fix and notice records and its PR text
now names both pending SQL files. It is the only open lane 5 migration PR.

Open drafts: #388 public withdrawal, #389 public page (base #388), #392 share owner
connection evidence, #393 launch kit. #392 and #393 were checked once at this pause:
web/backend and Android runtime passed; foundation and visual checks pending.
No failed check was observed. Do not repeatedly poll.

Pushed without PR: `lane-5/invite-entry` (`7171961e1`, pending invite-note column),
`lane-5/profile-fields` (`aa48528ca`, pending growth-owned profile table). The profile
branch compiles but its real host refused startup with
`comparison_artifact_custody_changed`: adding any table changes the independent
privacy catalogue review. Integrator registration/review is required. No profile
scenario passed; the attempted script could not connect. Never bypass that review.
See each branch's `lane-5-invites.md` and `lane-5-profile-fields.md`.

#393 launch kit API and checklist are implemented. Its browser share action remains
blocked because `apps/web/app/api/growth/[...path]/route.ts` does not admit GET /launch.
That file belongs to the integrator. API owner/pause checks and four checklist routes
passed; browser result was 3 pass, 1 fail, 4 not run. Do not call the kit complete.
#392 records the missing share owner readers: positive creation/revocation/hash proof
remain unrun. The approved human-only correction is the next edit on that branch.

Current branch `lane-5/push-offline`: real native FCM adapter, one-day opaque Android
ID retention; eight server/gateway scenarios and one real restart passed, two device/iOS
cases not run. See `lane-5-push-offline.md`. The stock lane 2 container and volume were
removed after the profile startup failure. Current resources are `qelvora-lane5-db`
on 56450, scenario host 56451 and local native gateway 56453. Host runs with
`LANE5_NATIVE_PUSH=true sh tests/scenarios/lane-5/run-host.sh`. Stop and remove only
these lane 5 resources before a long stop. Existing backend regression passed: 9 files, 157/157, 187.87 seconds; T-11 132.14 seconds.

Next: publish the Android evidence PR, apply approved invite copy and human-only share
rule, then finish web push and document/prove the unblocked digest/metrics work. Keep
migration PRs queued behind #385. No new unit tests; no merge or history rewrite.

## Earlier progress (superseded by the current update)

Updated: 2026-10-09, resumed lane 5 session
Working on: WP 5.7 on `lane-5/invite-entry`, cut from main `c0b4ac0f0`.
Its pending invite-note migration is applied only to the disposable lane 5 stack;
no PR will open while #385 holds the migration turn. Public-page read work is open
in draft [PR #389](https://github.com/WangPantopus/creator-platform/pull/389)
(head `3a8e6a5f1`), stacked on withdrawal fix
[PR #388](https://github.com/WangPantopus/creator-platform/pull/388)
(head `7a3e29516`, base main). Owner notice records
are open for review in [PR #385](https://github.com/WangPantopus/creator-platform/pull/385),
`lane-5/notice-snapshots` targeting main (head `6b14b9dcc`). **Resume from [lane-5-handoff.md](lane-5-handoff.md)**.
#365, #366, #372 and #373 are merged. #373 merged into `lane-5/delivery-queue`
(`41b7ae922`) after #372 had merged. Main (`c0b4ac0f0`) lacks #373; #385 carries it. All listed checks on
#372 and #373 passed when checked once at resume. No retargeting is needed for a closed PR.
`origin/main` has been merged into the shared notice-snapshots branch without rewriting history.
The one-migration-PR hold is clear because #373 merged; registration of its SQL is still an
integrator ticket. Notice snapshots (#385) is the current lane 5 migration PR; the public-page read work has no migration.
Done: contract C4 ([details](lane-5-c4-note-reaction-delivery.md)); the thread-presence read
`GET /v1/content/{creatorId}/presence`; the creator-session fan-out of Note and reaction notices
with 500-recipient chunking, one creator's deliveries queued, and a failed delivery retried by the
same session; the notification owner for both; muted members left out; **owner notice records for
answers, request status, offers, call reminders and commitments (option A) with export and
erasure**; scenario host and scripts.
Next: finish invite evidence and push the held branch, then WP 5.8 share cards,
5.4 web push, 5.5 digests, 5.9 metrics, 5.10 launch kit and 5.3 fake-gateway push.
Profile authoring follows Q2
(growth owns the fields, lane 6 the form; migration PR held behind #385).
Blocked on: the founder's answers (handoff, "Decisions waiting"); lanes 3 and 4 each adding their
one call (tickets) before answers and request status fire; Apple and Google credentials for 5.3.

## Invite progress (2026-10-09)

[Invite contract, evidence, migration and owner tickets](lane-5-invites.md).
API 8/8 (two not run), Chrome 4/4 (one not run), clean-stack restart 1/1, database outage/recovery 1/1, clipboard retry 1/1.
The four product screens include mandatory handle and provider review, plus the
separate development identity picker. One real fan message was stored.
The creator note is stored, public, plain text and included in metadata. The
PNG preview uses the public handle and existing copy without external font fetches.
Creation retries reuse one link and never extend expiry or undo revocation.

A new copy question asks for the optional invitation-note label and public/600
character hint. No answer yet, so the form remains unchanged. No invite PR yet.
The public-page PRs were checked once at this natural pause: web/backend and
Android runtime passed; iOS, Android foundation and web visual were pending.
No failed CI check was observed; no repeated CI polling.

A separate host defect was found after sending the first message and restarting:
`generation_terminal_recovery_incomplete` / `Actual finalized original terminal
required` repeatedly locked `ai_workspace`; public reads returned `public_ai_busy`.
The owner ticket names lanes 3/4 and the exact worker/settlement files. A disposable
reset without an active generation proved normal invite restart. This does not
count the failing recovery path as passed.

## Public page progress (2026-10-09)

The cache and rendering work passes the covered part of E5.5 on the real full lane 2
stack: API 7/7, restart 1/1, browser 5/5, validators/outage 2/2. Authoring fields,
biography markup and capacity remain not run because the real sources are missing.
[Contract and full results](https://github.com/WangPantopus/creator-platform/blob/lane-5/public-page/docs/lanes/status/lane-5-c8-public-creator.md). No fabricated public projection.
The existing copy remains; a founder question proposes a biography empty state and
last-publication date sentence. It has no answer yet.

Post checks exposed and fixed public withdrawal defects in PR #388: edits did not
queue removal; unpublish/archive did not start delivery; the withdrawal SQL rejected
its UUID parameter. The real post workflow now passes 5/5, including re-signing an
edit, wrong-person refusal and racing archive retries. [Evidence and owner tickets](https://github.com/WangPantopus/creator-platform/blob/lane-5/public-withdrawal/docs/lanes/status/lane-5-public-withdrawal.md).
Both public-page PRs stay draft until the outstanding lane-wide star rows are complete.

The final backend regression passed: 9 files, 157/157, 254.28 seconds; T-11 took
183.92 seconds. Seven typecheck tasks and changed-source eslint also passed.

The old scenario database/container were removed. The stock stack currently runs
on 56450–56453 with `qelvora-lane5-postgres` / `creator_stack`. Stop it with
`node infra/local/stack.mjs down --lane 5` before a long stop. Do not touch the other
lanes' containers. The notice-snapshot migration is the only open lane 5 migration PR.

## Resumed verification (2026-10-09)

The complete default scenario run passed again: 12 scripts, 69 steps, no failures; reaction
undo is the one case not run, as agreed for the pilot. Existing backend suites: 9 files,
157 of 157 passed in 364.19 s; T-11 took 264.06 s. Seven typecheck tasks passed (six cached),
changed-source eslint passed, and the status files pass formatting. No new notice defect was
found. The real owners, providers, devices and UI listed below remain not run for this change.

Load was 42 at resume and peaked around 104 during scale; backend checks ran at roughly
24 to 29. Scale: 600 members reached, 20 outsiders excluded; settled reads p50 2128 ms,
p95 2464 ms; all 60 reads during five concurrent deliveries returned 200 (p50 2077 ms,
p95 2399 ms). These are local measurements with fake identity.

Re-run using the toolchain in the handoff: `sh tests/scenarios/lane-5/setup.sh`, then
`sh tests/scenarios/lane-5/run-all.sh`. The backend suites used the same disposable container:
`CREATOR_TEST_DATABASE_URL=postgresql://postgres:foundation-test-only@127.0.0.1:56450/creator_foundation pnpm --filter @qelvora/backend test`.

## Scenarios (database on 56450, host on 56451, fake push gateway on 56453)

Re-run (from the repository root, with node on PATH): `sh tests/scenarios/lane-5/setup.sh` once,
then `sh tests/scenarios/lane-5/run-all.sh`. It resets the database and restarts the host before
each script; pass script names to run only some. `e5-4-known-gaps` is not in the default list.

| Script                  | Rows                                                                                                                                                                                                                                                                               | Result (2026-10-09)                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `e5-1-audience`         | E5.1 ★ who sees a Note: member, outsider, signed out, blocked, restricted, deleted, no thread, leaves, joins, tiers, mute, unknown creator                                                                                                                                         | 13 of 13 pass                      |
| `e5-1-lifecycle`        | E5.1 ★ duplicate publish, edit, delete, wrong person, hostile text, paging and bad input                                                                                                                                                                                           | 6 of 6 pass                        |
| `e5-1-scale`            | E5.1 ★ 600 members and 20 outsiders; latency; reads keep working while five Notes are delivered to 600 members at once                                                                                                                                                             | 3 of 3 pass                        |
| `e5-2-reactions`        | E5.2 ★ react, privacy between fans, duplicate, race, pending reply, wrong person, deleted reply                                                                                                                                                                                    | 7 pass, 1 not run (no undo exists) |
| `e5-4-note-notices`     | E5.3 ★ and E5.4 Notes: recipients (outsiders, blocked, deleted, restricted, muted), in-app list, push honesty, once per cause, silent edit, join and leave, blocked after the notice, failure and retry, withdrawn before send, unmute                                             | 9 of 9 pass                        |
| `e5-4-reaction-notices` | E5.2 ★ and E5.3 ★ reactions: who is told, push wording and privacy, once, withdrawn reply, denied fan                                                                                                                                                                              | 5 of 5 pass                        |
| `e5-4-chunks`           | E5.1 ★ and E5.4: 600 recipients become events of 500 and 100; after 100 mute, one event of exactly 500                                                                                                                                                                             | 3 of 3 pass                        |
| `e5-4-mute-function`    | E5.4 the Note mute projection: only the owning creator learns who muted; boundaries; nothing sent when missing; a team publisher cannot finish a Note                                                                                                                              | 5 of 5 pass                        |
| `e5-4-owner-snapshots`  | E5.3 ★ and E5.4: answers labeled by who wrote them, settings still apply, five more types to the right role, wrong author refused, once per cause, event before record, versions, withdraw before send, live owner in the list, no private words anywhere, real export and erasure | 12 of 12 pass                      |
| `e5-4-self-retry`       | E5.4: the denial check is missing while a Note is published; nobody is told; once it is back the creator's session retries by itself and tells the audience once; a failure that never clears stops after three retries (takes 3 minutes)                                          | 2 of 2 pass                        |
| `e5-4-scheduled`        | E5.4: scheduled Note, early run, racing runs                                                                                                                                                                                                                                       | 2 of 2 pass                        |
| `e5-3-quiet-hours`      | E5.3 ★ quiet hours read in each fan's own time zone; held push released later (DST edges not run: need a clock fake)                                                                                                                                                               | 2 of 2 pass                        |
| `e5-4-known-gaps`       | a reaction push survives a withdrawn reply                                                                                                                                                                                                                                         | 0 of 1 pass (known)                |

## Wiring for the integrator (WP 5.2a)

`tests/scenarios/lane-5/host.mts` is the working wiring. In `apps/backend/src/server.ts`:

1. Before `configureGrowthForBackend`: `const late: { content?: ReturnType<typeof contentNoticeOwner> } = {}`.
   Add to its `owners`: `notificationState: composeNotificationOwners({ content: (e, r, c) =>
late.content ? late.content(e, r, c) : Promise.resolve({ retryable: true, available: false,
authorized: false, version: 0, creatorName: "", authorKind: "system", safePreview: "",
destination: "/notifications" }) })` (from `growth/owners.js` and `content/notices.js`).
2. In `composeContentHost({...})` add `notices: { relay: features.growth.relay }` when growth is on.
3. After `contentHost.bindContent(content.content)`:
   `late.content = contentNoticeOwner({ pool: runtime.pool, content: content.content })`.
4. Nothing for the trigger: `contentFeature` now drains the creator's pending effects after a
   publish, a reaction and a scheduled run, in her own session. One creator's deliveries run one
   after the other (a burst of publishes would otherwise start overlapping fan-outs that starve
   the connection pool her fans read through). There is no background worker for this yet, so a
   Note or reaction effect that failed for a passing reason (a lock timeout, a restart, the
   denial check briefly missing) is retried by the same session when its backoff is due, at
   most three times; after that the Studio's effects run finishes it. When a real worker with
   creator authority exists it should replace the in-session retry.

5. Answers, request status, offers, call reminders and commitments: pass `features.growth.notices`
   (`GrowthNotices`, from `configureGrowthForBackend`) to lane 3's conversation host and lane 4's
   commerce and calls hosts. Nothing else in `server.ts`: the dispatcher that reads those records
   is inside `configureGrowthForBackend`, and a connected owner still answers live in a person's own
   list (the `owners.notificationState` you already pass).

Until WP 5.3 gives growth a `DeliveryProvider`, a fan who turned push on has a delivery that
fails and retries to `dead`; fans with push off (the default) are unaffected.

## Tickets to other lanes

- **Integrator, migrations (one at a time, in your order):** register
  `apps/backend/src/modules/content/migrations/pending_w5_note_mute_read.sql` (the Note mute
  projection: one `SECURITY DEFINER` function `creator.content_note_muters`, a new no-login role
  `creator_content_mute` with column-level grants on `creator_profile` and `content_preference`, and
  one policy scoped to the creator the function has just proved the caller owns). Add the role to the
  role-custody checks if they list roles. Until it is registered, a Note's notices wait (fail closed)
  rather than reach someone who muted.
- **Integrator, migrations (second, after the Note mute one):** register
  `apps/backend/src/modules/growth/migrations/pending_w7_notice_snapshot.sql` (one table
  `growth.notice`, forced row level security, readable and writable by `growth_worker` only: the API
  role has nothing). It holds one row per owner object and recipient: a version, who is speaking,
  the creator's display name, a fixed safe sentence and a destination, never message text, an
  amount or another person's name. A new table changes the privacy catalogues: export and erasure
  already cover it in code (guarded by `to_regclass`, so they work before and after), but the
  catalogue checksums need regenerating and review.
- **Lane 3 (conversation host):** where you enqueue an `ai_reply`, `approved_draft` or
  `personal_reply` event for a fan, call `growth.notices.emit({ type, aggregateId: <message id>,
accountId: <fan account>, creatorId, version: <message sequence>, authorKind: 'ai' |
'approved_draft' | 'human_creator', creatorName, safePreview: <fixed copy>, destination:
'/creators/<handle>/chat' })` **before** `growth.relay.enqueue(...)`, and `growth.notices.withdraw({
type, aggregateId, accountId? })` when the message is deleted or the fan loses access. Keep
  `conversationNotificationState` as the live owner for a person's own list. The event must be
  byte-identical every time the same cause is named (use the message's own timestamp for
  `occurredAt`), or the relay refuses it as a conflicting event.
- **Lane 4 (commerce and calls hosts):** the same two calls for `request_status`, `creator_offer`,
  `new_packet`, `commitment_due` and `call_reminder` (the recipient's role is `fan` or `creator`
  as in `roles` in `growth/notifications.ts`; a reminder's `status` is `scheduled` or `joinable`).
  Withdraw when a request is withdrawn or a call ends.
- **Integrator, `packages/api/src/openapi.ts`:** register `GET /v1/content/{creatorId}/presence`
  (operation `contentThreadPresence`, response `ContentThreadPresencePage`, query
  `ContentThreadPresenceQuery`) next to `contentList`. The component schemas are generated.
- **Lane 3 (web thread, `features/conversation/ConversationScreen.tsx` near line 1019):** render
  presence items with `authorLabel`, `audience.label` and the glyph instead of "Audience
  details unavailable", merged by time. Optionally call `ThreadPresence.read` from
  `ConversationService.read` so one request returns both.
- **Lane 7:** the same in both apps (`W3Message` has no audience field; these items do).
- **Lane 1 (`modules/trust/reply-review.ts`):** auto-allow clean replies. Until then no creator
  can react to anyone, because every reply waits for a human decision.
- **Lane 1:** an unknown creator is `403 audience_unavailable` on `GET /v1/content/{id}` and on
  `/presence` but `503 scope_denial_unavailable` on other guarded routes. Pick one.
- **Lane 2:** the stock host needs the later migration waves (restoration, privacy export,
  `0089` creator/fan denial); until the one-command stack lands, scenarios run on the base
  schema plus `0089` applied by hand to a disposable database.

## Decisions (founder, 2026-10-08)

1. **Answers, request status, commitment due: option A** (owner notice snapshots), from
   [the decision pack](lane-5-notification-owner-authority.md). Built in
   `lane-5/notice-snapshots` (a second small migration), waiting for lanes 3 and 4 to make their
   calls.
2. **A muted member is not pushed: the small migration.** Done in `lane-5/note-mute-read`
   (`modules/content/migrations/pending_w5_note_mute_read.sql`, needs the integrator's registration).
3. **Notes are rendered into the thread at read time**, not inserted as messages (the Domain Model's
   wording; the database would refuse per-fan signed copies). Confirmed.
4. **A new member sees the Notes posted before they joined** (current membership decides, as the
   existing Notes list does). Confirmed for the pilot; reversible.
5. **A reaction cannot be undone** in the pilot (the table is insert-only; each reaction already
   needs the creator's passkey). Confirmed.
6. **An edit to a published Note tells no one again**; Notes to followers or groups tell no one
   yet (followers need the reserved follow migration; groups need the original-recipient reader).
   Confirmed.

Still open and small: a reaction push can go out after the fan withdrew the reply (the worker
cannot read replies; the in-app list hides it). Kept as a failing case in
`tests/scenarios/lane-5/e5-4-known-gaps.mjs`. The snapshot table can close it (record the reaction
notice, withdraw it in the fan's own withdraw request); that is a small follow-up in the content
module.

A limit of option A to keep in mind: a record is as current as its owner's last call. If an owner
changes its own state and does not withdraw, the person's own list still follows a connected
owner's live answer, but a push that was already queued follows the record. Owners must withdraw.

## What the scenarios do not prove

The host composes the real content, signing, audience, growth and denial code on a real
PostgreSQL with the development identity. It leaves out the later migration waves the stock
trust runtime needs, the reply reviewer, and the conversation and commerce hosts. Membership
purchases, creator verification, safety decisions, blocks and deletions are rows standing in for
lane 1 and 4 outcomes, named in `lib.mjs`. The owners of answers, request status and calls are stand-in routes in `host.mts` that make the calls lanes 3 and 4 will make; the real owners were not run. The push gateway is a recorder that stands in for
APNs and FCM, so device registration, token redaction, quiet hours and the real adapters are not
exercised. Nothing here ran on a phone, a browser or a real provider.
