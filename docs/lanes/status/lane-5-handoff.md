# Lane 5 handoff (2026-10-09)

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

## Current work: invites (2026-10-09)

`lane-5/invite-entry` is cut from main `c0b4ac0f0`, independent of the public-page
stack. Its note-column migration is applied by hand only to the lane 5 disposable
database. Hold its PR while #385 is open. Read `lane-5-invites.md` for the contract,
results, rerun order and owner tickets. API 8/8 (two not run), browser 4/4 (one not
run), clean restart 1/1, database outage/recovery 1/1, clipboard retry 1/1. A real first message reached the database through four
product screens plus the development provider picker.

The source recovery after that message/restart failed outside this lane: repeated
`generation_terminal_recovery_incomplete` and `Actual finalized original terminal
required` kept public AI metadata busy. A clean reset isolates further invite
checks; the failed path stays recorded. Do not repair private money/worker files.

Copy approval is pending for the invite-note label/hint as well as the earlier
biography/date sentence. Keep existing form copy until answered. `useful_answer`
still needs the real lane 3 owner call; domain/app association remains Q4.

PR #388 (withdrawals, main) and #389 (cache/page, stacked on #388) remain drafts.
One CI check at this pause found web/backend and Android runtime passing, other
checks pending. #385 remains open. Nothing was merged or rebased.

Next: finish invite evidence, push the held branch; then 5.8, 5.4, 5.5, 5.9,
5.10 and 5.3. Profile-authoring migration follows Q2 and the one-migration rule.
The stock stack still uses `qelvora-lane5-postgres`, `creator_stack`, ports
56450–56453. Use `node infra/local/stack.mjs down --lane 5` before a long stop.

## Resume update (2026-10-09)

The founder directed this session to continue in its isolated Codex worktree after the
path check stopped it. Work remains single-agent. The original handoff below records the
earlier results; it is not evidence of checks run in this resumed session.

- #372 and #373 are now merged, with every listed CI check passing at the one resume check.
  #373 merged into the delivery branch (`41b7ae922`) after #372 closed. Main
  (`c0b4ac0f0`) lacks #373; #385 carries it. Neither closed PR needs retargeting. No CI fix was needed.
- Main has been merged into `lane-5/notice-snapshots`, without rewriting shared history.
  Its migration PR may now open under Q1's default. SQL registration still belongs to the
  integrator; it is not implied by merging #373.
- Dependencies were installed from the existing offline store. Docker was started; its
  PostgreSQL image was already present. The lane 5 disposable database has been recreated.
- The resumed scenario run passed: 12 scripts, 69 steps, 0 failures, 1 not run (reaction
  undo is excluded from the pilot). Existing backend suites: 9 files, 157 of 157 passed
  in 364.19 s; T-11 took 264.06 s of its 300 s limit. Seven typecheck tasks passed
  (six reused their cache); changed-source eslint and status-file formatting passed.
  Machine load was 42 on arrival, 86 to 104 during scale, and roughly 24 to 29 during
  backend checks. Settled reads: p50 2128 ms / p95 2464 ms. All 60 reads during five
  concurrent deliveries returned 200: p50 2077 ms / p95 2399 ms.
- Q2 has no new answer: use its recorded default, a growth-owned profile table and endpoint
  with lane 6 owning the form, and keep its migration behind notice snapshots. The cache,
  contract note and rendering work can proceed independently from current main.
- The lane 2 stack is now on main (#367). Use it for the public-page work and report any
  missing production-host wiring as a ticket; do not edit `server.ts` or `integration.ts`.

The notice branch is open as [PR #385](https://github.com/WangPantopus/creator-platform/pull/385)
against main, head `6b14b9dcc`. No notice implementation changed in
this resume: main was merged forward and the evidence was refreshed. Scenario hosts have
stopped. The old disposable database has been removed; the stock lane 2 stack now runs in lane 5 ports.
The public-page read work is on `lane-5/public-page`, now stacked on the separate
withdrawal fix PR #388 (`lane-5/public-withdrawal`, head `7a3e29516`, base main);
none of that work depends on #385. The full lane 2 stock stack is running on ports 56450–56453
with the model and development identity at the outer edge. Its database is `creator_stack`. No new unit tests were written.

The cache/read work is open as draft PR #389, base `lane-5/public-withdrawal`
(#388). The final backend regression passed 157/157 in 254.28 seconds (T-11:
183.92 seconds); seven typecheck tasks and changed-source eslint passed.

The real public-page checks passed: API 7/7 (two not run), restart 1/1, browser
5/5 (one not run), conditional/outage 2/2. PostgreSQL outage gave 503, then recovered 200. Public post workflow is now 5/5 after the withdrawal fixes. See the C8 note and
`lane-5-public-withdrawal.md` for complete tables and first-run failures. Missing
sources remain missing: authoring fields and lane 4 capacity. The pending copy
question asks about “No biography added yet.” and “Last published a Note or post on
{date}.” No answer yet; current UI retains existing copy. New unit tests: none.
Current stack: `qelvora-lane5-postgres`, database `creator_stack`, ports 56450–56453.
The original handoff below is historical; this resume update supersedes its state.

For the next lane 5 session. Read this after [docs/lanes/README.md](../README.md) and before
touching anything. It is written so you can resume without redoing work, without guessing, and
without leaving gaps. The standing rules are in [the lane 5 prompt](../prompts/lane-5.md) and
[the working agreement](../01-working-agreement.md); this file records only what changed and
where things stand. The shorter, always-current summary is [lane-5.md](lane-5.md).

## 1. Original handoff state (superseded by the resume update above)

Nothing is running. All containers, hosts and background jobs from the last session were shut
down (section 8). Everything below is committed and pushed.

### Branches and pull requests

```text
main (169b5d94f)   <- #365 (WP 5.1) and #366 (WP 5.2a) merged on 2026-10-09
 `- lane-5/delivery-queue  #372  base main                     no migration
     `- lane-5/note-mute-read  #373  base lane-5/delivery-queue  migration pending_w5_note_mute_read.sql
         `- lane-5/notice-snapshots   NO pull request          migration pending_w7_notice_snapshot.sql
```

| What                                                                                                                              | Branch / PR                                                                  | State at handoff                                                              | Verified locally                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP 5.1 contract C4 and Note and reaction presence in the thread                                                                   | #365 merged `e28759a77`                                                      | done                                                                          | in that PR                                                                                                                                                                                                          |
| WP 5.2a tell a Note's audience and a reacted-to fan                                                                               | #366 merged `169b5d94f`                                                      | done                                                                          | in that PR                                                                                                                                                                                                          |
| WP 5.2 one creator's deliveries queue; a failed one is retried by its session (3 tries: 10, 20, 40 s)                             | #372 `lane-5/delivery-queue`, targets main, head `02ca07e16`                 | open; `web-and-backend` passes, iOS / Android / web-visual were still pending | scenarios 10 scripts, 50 steps pass, 1 not run; backend suites 157 of 157 (T-11 took 295 s of its 300 s limit at load 28)                                                                                           |
| WP 5.2 a member who muted a creator's Notes is not pushed (small migration)                                                       | #373 `lane-5/note-mute-read`, base `lane-5/delivery-queue`, head `c799c9bd0` | open; same CI state                                                           | scenarios 11 scripts, 57 steps pass, 1 not run (run on a tree with this code); backend suites 156 of 157, T-11 alone then passed in 147 s at load 7 to 14                                                           |
| WP 5.2 owner notice records for answers, request status, offers, call reminders, commitments (option A, a second small migration) | `lane-5/notice-snapshots`, **no pull request on purpose**                    | pushed                                                                        | scenarios 12 scripts, 69 steps pass, 1 not run; `e5-4-owner-snapshots` 12 of 12; seven guards each shown red when removed (section 6); backend suites 157 of 157 in 201 s (T-11 143 s of its 300 s limit at load 8) |

"1 not run" is always `E5.2-undo`: the content module has no way to undo a reaction (decision 5,
the pilot has none).

**Stack rules.** All three branches are pushed: never rebase or force-push them. If a base branch
gains commits (a CI fix), bring them forward with `git merge`. When #372 merges, retarget #373
(`gh pr edit 373 --base main`); when #373 merges, the same for the notice-snapshots pull request.

**Merge permission.** The founder lifted "never merge" only for #365 and #366, and both are
merged. Everything else: you do not merge, you do not enable auto-merge, you do not push to main.
The integrator or the founder merges #372 and #373.

**Branching for new work.** The three stacked branches exist only for the three open pieces. Every
**new** concern (WP 5.6 onward) is cut from the latest `origin/main`
(`git switch -c lane-5/<topic> origin/main`), not from the stack, so it can merge in any order. None
of the next work packages depends on code in #372, #373 or the notice-snapshots branch. Use the
stack's tip only to run the whole current suite (`lane-5/notice-snapshots` has everything).

**The second migration pull request.** The working agreement says one migration pull request at a
time. #373 carries the first. The notice-snapshots branch is complete and verified but has no pull
request until the founder says "open it now" (as a stacked pull request) or #373 has been
registered. Its pull request description is drafted in section 9 so you do not re-derive it.

### What is done: do not redo it

| Piece                                                                                                                         | Where                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract C4 (`ThreadPresence*` schemas, `GET /v1/content/{creatorId}/presence`)                                               | `packages/api/src/content.ts`, [lane-5-c4-note-reaction-delivery.md](lane-5-c4-note-reaction-delivery.md), `modules/content/thread-presence.ts`                                                 |
| A Note and a reaction rendered into a fan's thread at read time (no inserted messages; decision 3)                            | `thread-presence.ts`; `ContentService` helpers made public in `content/service.ts`                                                                                                              |
| Fan-out of Note and reaction notices in the creator's own session; 500-recipient chunks; W8 denial per pair; "once per cause" | `content/notices.ts` (`contentNoticeProducer`, `contentNoticeOwner`), `growth/relay.ts` (`enqueueRecipients`, `hasAudience`, `stableUuid`), `content/integration.ts`                            |
| One dispatcher for the engine's single `notificationState` hook                                                               | `growth/owners.ts` (`composeNotificationOwners`)                                                                                                                                                |
| Delivery queue per creator and in-session retry                                                                               | `content/registration.ts` (`deliver`)                                                                                                                                                           |
| Muted members left out                                                                                                        | `modules/content/migrations/pending_w5_note_mute_read.sql`, `content/notices.ts` (`withoutMuted`)                                                                                               |
| Owner notice records (option A): table, `GrowthNotices.emit` / `withdraw`, reader, dispatcher, export and erasure             | `modules/growth/migrations/pending_w7_notice_snapshot.sql`, `growth/notices.ts`, `growth/configured.ts`, `growth/runtime.ts`, `growth/service.ts` (`privacyDelete`), `growth/privacy-export.ts` |
| Scenario host and scripts, setup, reset, cycle, run-all                                                                       | `tests/scenarios/lane-5/` (section 4)                                                                                                                                                           |

### Decisions the founder has made (2026-10-08): do not reopen

1. Answers, request status, commitment due: **option A** (owner notice records).
2. A muted member is not pushed: **the small migration**.
3. Notes are rendered into the thread at read time, not inserted as messages.
4. A new member sees the Notes posted before they joined.
5. A reaction cannot be undone in the pilot.
6. An edit to a published Note tells no one again; Notes to followers or groups tell no one yet.

## 2. Decisions waiting on the founder (each has a default; keep working on what is unblocked)

| #   | Question                                                                                                                                                                               | Default if no answer                                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | May the notice-snapshots pull request be opened now, stacked on #373, even though that is a second migration pull request?                                                             | Hold it until #373 is registered or merged.                                                                                                                                                                 |
| Q2  | **WP 5.6 gate:** where do creators write their biography, category and photo caption? (Today the public projection hardcodes them to empty strings in `growth/creator-projection.ts`.) | A growth-owned table written by the verified creator through a new growth endpoint (a third migration), with lane 6 building the form. The alternative is lane 1 adding the fields to the identity profile. |
| Q3  | May I merge my own green, no-migration pull requests (#372) as was allowed for #365 and #366?                                                                                          | No. The integrator or the founder merges.                                                                                                                                                                   |
| Q4  | **WP 5.7 gate:** the domain for links (associated-domain and app-link files).                                                                                                          | Build everything that does not need the domain; say so.                                                                                                                                                     |
| Q5  | **WP 5.9 gate:** the pilot-size metrics privacy rule (what an aggregate may show at about 10 fans).                                                                                    | Build the emitters; leave the aggregate view behind the privacy review.                                                                                                                                     |

## 3. What to do next, in order

0. **Housekeeping first (a few minutes).** `gh pr checks 372` and `gh pr checks 373` once. If a check
   failed, read the log and fix it on that branch with a new commit (never force-push); `git merge`
   the fix forward into `lane-5/notice-snapshots`. If #372 has merged, retarget #373 to main. Do not
   poll CI repeatedly; check when you resume and at natural pauses.
1. **WP 5.6, the public creator page (contract C8, star row E5.5).** The unblocked parts, in order:
   1. Cache and rate-limit the public read path. Today `GET /v1/growth/public/creators/:handle`
      (`growth/router.ts`, `Cache-Control: no-store`) calls `service.creator(handle)` and then
      `service.posts(id)`; each calls `refreshCreator`, which takes advisory locks and reads the
      canonical state, so one page view takes the lock twice and a page of posts takes it again.
      Add a short in-process cache of the composed page keyed by handle (and a sensible
      `Cache-Control` for the public response) plus a per-address limit that answers 429, with no lock
      pile-up under hammering. Scenario E5.5 "hammering the page gives cached answers or 429".
   2. Write the C8 contract note (new file `docs/lanes/status/lane-5-c8-public-creator.md`): each
      field of `CreatorProjection` (`growth/contracts.ts`), where it comes from, and what shows when
      it is missing. Sources: name, handle, verification from `creator.creator_profile`; public AI
      state, topics, source summary from lane 3's `PublicCreatorAIProjection` (not wired in the
      scenario host, so state is "unpublished" until it is); presence line from the world-readable
      `creator.content_index` (last published Note or post); capacity and reliability from a
      world-readable summary lane 4 must publish (ticket it, do not read private commerce rows);
      biography, category, photo caption from the decision in Q2.
   3. Designed empty states and plain-text rendering in the web page
      (`apps/web/app/creators/[handle]/page.tsx`, `apps/web/features/growth/`): missing biography,
      category or photo; long and unicode text; markup in the biography appears as text; an
      unpublished AI; at capacity; a paused creator; a renamed handle.
   4. Scenario `tests/scenarios/lane-5/e5-5-public-page.mjs`. Reuse a block below `ACTOR_COUNT`
      (each script runs on a fresh database, so blocks only need to be unique within a script);
      do not edit `ids.mjs` unless you truly need more identities.
      The gated part (the fields' author, a migration) waits for Q2; if the default is taken, it is a
      third migration pull request and obeys the one-at-a-time rule.
2. **WP 5.7 invites and entry**, **WP 5.8 share card** (star row E5.7, the largest), **WP 5.4 web push
   for the Studio**, **WP 5.5 digests**, **WP 5.9 metrics**, **WP 5.10 launch kit**, in that order
   unless the founder reorders. Read the rows for each in
   [lane-5-presence-reach.md](../lane-5-presence-reach.md); the existing code to build on is
   `growth/engagement.ts`, `growth/service.ts` (shares, invites), `growth/weekly-impact.ts`,
   `growth/retention.ts`.
3. **WP 5.3 push** on the fake gateway: device registration, token redaction, tap routing (C7), the
   real APNs and FCM adapters need Apple and Google credentials (ask the founder; build against the
   recorder in `host.mts`). The rows not yet run for E5.3: device registration and token
   redaction, an invalid token removed, sign-out removes the token, two devices, tap routing, DST
   edges of quiet hours (needs a clock fake), offline expiration.
4. **Small follow-ups:** close the known gap `GAP-withdrawn-reply-push` (a reaction push can go out
   after the fan withdrew the reply) by recording the reaction notice with the new table and
   withdrawing it in the fan's withdraw request (content module). That means adding `reaction` to
   the type list and `human_reaction` to the author kinds, in `growth/notices.ts` and in the CHECKs
   of the proposal; the migration is not registered yet, so edit the proposal instead of adding
   another.

## 4. How to resume the environment

All scenario tooling is in `tests/scenarios/lane-5/`. Ports 56450 to 56459 are yours; containers
are `qelvora-lane5-*`.

```sh
cd <your lane 5 worktree>          # git rev-parse --show-toplevel must contain .claude/worktrees/
git fetch origin
git switch lane-5/notice-snapshots # to run the whole current suite; new work: git switch -c lane-5/<topic> origin/main
export PATH="/Users/yingpengwang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/yingpengwang/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH"
export npm_config_manage_package_manager_versions=false
pnpm install --frozen-lockfile --offline    # about 5 s, only if node_modules is missing
sh tests/scenarios/lane-5/setup.sh          # builds container qelvora-lane5-db on 56450 (a few minutes)
sh tests/scenarios/lane-5/run-all.sh        # every default script, a fresh database and host for each, about 14 minutes
sh tests/scenarios/lane-5/run-all.sh e5-4-owner-snapshots   # or only some
```

| Port  | What                                                                                                                          |
| ----- | ----------------------------------------------------------------------------------------------------------------------------- |
| 56450 | disposable PostgreSQL (`qelvora-lane5-db`; template `creator_foundation_lane5_base`, working copy `creator_foundation_lane5`) |
| 56451 | the scenario host (`host.mts`)                                                                                                |
| 56452 | the database for the existing backend suites (`qelvora-lane5-test`)                                                           |
| 56453 | the fake push gateway (recorder; GET and DELETE `/sent`, PUT `/down` and `/up`)                                               |

Existing backend suites (9 files, 157 tests, about 6.5 minutes):

```sh
docker run -d --name qelvora-lane5-test -e POSTGRES_PASSWORD=foundation-test-only \
  -e POSTGRES_DB=creator_foundation -p 127.0.0.1:56452:5432 pgvector/pgvector:pg17
# wait for "PostgreSQL init process complete" in `docker logs qelvora-lane5-test`
CREATOR_TEST_DATABASE_URL=postgresql://postgres:foundation-test-only@127.0.0.1:56452/creator_foundation \
  pnpm --filter @qelvora/backend test
```

T-11 (`postgres.integration`, 10,000 pairs) has its own 300 s limit and is load-sensitive: it timed
out at machine load 29 to 35, passed in 295 s at load 28, and in 147 s at load 7. Check `uptime`;
above about 15, rerun it alone later (`cd apps/backend && pnpm exec vitest run
tests/postgres.integration.test.ts -t "T-11 checks 10,000"`) before calling it a regression.

Other checks: `pnpm typecheck` (7 of 7), `pnpm generate:check` after a contract change, and
prettier and eslint on changed files (see the gotchas for how to pass the file list in zsh).

### How the scenario host works

- `run-host.sh` starts `host.mts` (`node --import tsx`), which composes the real identity sessions,
  signed acts, content service and routes, audience and membership recognition, the growth runtime
  (relay, notification engine, worker loop) and the real `creator_trust` denial callbacks, on the
  disposable database, with the development identity provider and a recorder standing in for the
  push gateway. The stock `server.ts` cannot boot on this schema (it needs the later migration
  waves), so this host is also the wiring the integrator copies; see "Wiring for the integrator" in
  [lane-5.md](lane-5.md).
- `setup.sh` builds the template once (base migrations through `migrate-trust`, then migration
  `0089` and the two pending lane 5 migrations applied **by hand**, then role passwords and the
  `growth_api` role) and `reset.sh` re-clones the working database from it in seconds. `cycle.sh`
  = stop host, reset, start host. `run-all.sh` runs `cycle.sh` before every script.
- `lib.mjs` holds the helpers (`http`, `signIn`, `seedCreator/Fan/Tier/Membership`, `publishNote`,
  `inbox`, `setPreferences`, `pushes`, `gateway`, `runEffects`, `waitFor`, `asAccount`, and the SQL
  stand-ins for outcomes owned by other lanes: verification, membership purchase, safety decision,
  block, deletion). `ids.mjs` lists the synthetic accounts (`ACTOR_COUNT`: see below).
- Actor index blocks used: audience 100, lifecycle 400, reactions 700, scale 1000, note-notices
  2100, reaction-notices 2400, known-gaps 2600, scheduled 2800, quiet-hours 2900, chunks 3000,
  self-retry 3820, mute-function 3900, owner-snapshots 4000 to 4199. Each script runs on a fresh
  database, so blocks only need to be unique within a script and below `ACTOR_COUNT` (4000 on main;
  4200 on the notice-snapshots branch, which added the last block). The host lists exactly that
  many identities; a higher index fails with `development_actor_invalid`. Prefer reusing a block
  to editing `ids.mjs`, so branches do not conflict.
- The **stand-in owners** in `host.mts` (`/v1/lane5-owners/*`: `emit`, `enqueue`, `both`, `withdraw`,
  `resume`, `live`, `erase`, `export`) make the calls lanes 3 and 4 will make; `erase` and `export`
  run the real growth erasure and export over a fake job authority. They are mounted on feature
  path `/` because `createApp` only accepts a fixed list of feature paths.
- Fakes, all at the outer edge: the development identity provider, a software passkey, rows standing
  in for lane 1 and 4 outcomes, the push gateway recorder, the stand-in owners, and the job
  authority for erasure and export. Say so in every pull request.

## 5. Gotchas learned (each one cost time)

- `node` is not on the shell's PATH. Put the Codex runtime on PATH (section 4) in **every** command
  that runs node, pnpm or the scenarios. A first run without it creates an empty key file in
  `$TMPDIR`; `run-host.sh` now requires non-empty key files.
- The Bash tool runs zsh: an unquoted `$FILES` is **not** split into words (prettier and eslint then
  report "No files matching the pattern"). Use an array (`F=(a b); cmd "${F[@]}"`) or `xargs`.
  macOS `sed -i` needs `-i ''`; use python for edits.
- Foreground `sleep` is blocked. Start long jobs with `run_in_background` and wait for the
  notification, or use the Monitor tool with an until-loop on a log file.
- Bare imports (`express`, `zod`, `pg`) do not resolve from `tests/`; use
  `createRequire(new URL("../../../apps/backend/package.json", import.meta.url))` as `lib.mjs` and
  `host.mts` do. Files under `tests/` are not typechecked.
- `createApp` (apps/backend/src/app.ts) accepts feature paths only from a fixed list (`/`, `/v1/agent`,
  `/v1/commerce`, `/v1/commerce-approvals`, `/v1/w6`, `/v1/growth`, `/v1/content`, `/v1/studio`).
- A growth event must be **byte-identical** every time the same cause is named (the relay refuses a
  different envelope under the same id with 409 `producer_event_conflict`): derive `occurredAt` from
  the owner's own row, never from `now()`. A relay event that finds no owner state is marked
  `blocked` as `owner_unconfigured` and stays until `GrowthRelay.resume(producer, creatorId)`: owners
  must record before they enqueue.
- The effects backoff is `5 * 2^attempts` seconds capped at 900; attempts count from the lease, so
  the first retry is at +10 s.
- pg returns `bigint` counts as strings: cast with `::int` before comparing in a scenario.
- The scale script's latency numbers swing with machine load (p50 1.1 s at load 10, 2.2 s at load
  150). Other sessions run emulators on the same Mac; report the load with any timing.
- Migrations: write the SQL next to its module as `pending_*.sql`, apply it by hand to the
  disposable template (`setup.sh` does this by name, not by glob), describe it in the pull request,
  never edit `infra/migrations.json`. A new table also changes the privacy catalogues; export and
  erasure code is guarded with `to_regclass` so it works before and after.

## 6. Red checks (how I know the new scenarios are not vacuous)

Each row: remove the guard, restart the host (`cycle.sh`), run the scenario, expect that step to
fail, restore with `git checkout -- <file>`. Recreate them if you change the code they guard.

| Guard removed                                                       | Step that goes red        | What it showed                                |
| ------------------------------------------------------------------- | ------------------------- | --------------------------------------------- |
| `configured.ts` reads no recorded state (the world before option A) | `E5.3-answer-ai`          | timed out waiting for the notice              |
| `present(...)` author rule in `GrowthNotices.emit`                  | `E5.4-author-guard`       | `200 {"recorded":true,"enqueued":true}`       |
| `"notice"` in the export sources (`privacy-export.ts`)              | `E5.4-export-and-erasure` | export has 0 notice records, the table has 14 |
| `DELETE FROM growth.notice WHERE account_id` (`service.ts`)         | `E5.4-export-and-erasure` | after erasure `{"notices":11,...}`            |
| erasure fence in `GrowthNotices.emit`                               | `E5.4-export-and-erasure` | late call `{"recorded":true,...}`             |
| `ON CONFLICT ... WHERE` version and creator guard                   | `E5.4-versions`           | late v1 recorded                              |
| the withdraw `UPDATE`                                               | `E5.4-withdraw`           | `{"withdrawn":0}`                             |

Earlier pull requests carry their own: no queue (`E5.1-reads-during-delivery`), no retry
(`E5.4-self-retry`), no owner-only guard (`E5.4-mute-missing-and-team`), no per-row refusal
(`E5.4-blocked-after`), no in-flight-only coalescing (`E5.4-failure-and-withdrawn`).

## 7. Known gaps and limits (honest)

- **Option A is as current as its owner's last call.** If an owner changes its state and does not
  withdraw, a signed-in person's own list still follows a connected owner's live answer, but a push
  already queued follows the record. Owners must withdraw (ticketed to lanes 3 and 4).
- A creator who blocks a fan after a notice was queued does not stop that already-queued generic
  push (the sentence says only "A signed reply is available in your conversation"); the in-app list
  hides it once the live owner is wired.
- `GAP-withdrawn-reply-push` (above), kept as a failing case in `e5-4-known-gaps.mjs`.
- Records are kept until the account is erased (as `growth.notification` is); there is no time-based
  retention. Ask before adding one.
- Not run: real APNs and FCM, device registration, DST quiet-hour edges (needs a clock fake), the stock
  host (`server.ts`), the real conversation, commerce and calls owners (stand-ins only), any UI in a
  browser or on a phone, web push, Android and iOS. Followers and group Notes tell no one yet.
- Lane 2's one-command stack (pull request #367, `infra/local/stack.mjs`, guide
  `infra/local/README.md`) builds the whole host from scratch on all 114 migrations. It was not on
  main at handoff. When it is, re-run the lane 5 scenarios against it (the biggest remaining gap is
  "the stock host was never run") and apply the four-step wiring in "Wiring for the integrator" in
  [lane-5.md](lane-5.md) to `server.ts` only if the integrator asks; until then keep using
  `tests/scenarios/lane-5/host.mts`.
- The in-session retry (`deliver`) is bounded and lives in the creator's session; a restart during a
  backoff leaves the Note for the Studio's effects run. A real worker with creator authority would
  replace it.
- Read latency of the presence endpoint is about 50 ms per Note (parity with `GET /v1/content/{id}`
  was measured in #365); not optimized.

## 8. Resources at handoff

Shut down: the scenario host (56451), the push gateway recorder (56453, part of the host), every
background job and monitor, and the containers `qelvora-lane5-db` (56450) and `qelvora-lane5-test`
(56452), which were **removed together with their data volumes**: recreate them with section 4. The local temporary branch
`tmp/lane5-combined-tested` was deleted. Nothing else of mine runs: no browser tabs, no simulator,
no scheduled tasks. The worktree is left on a detached HEAD at the tip of `lane-5/notice-snapshots` with a clean tree, so that branch can be checked out in any worktree. Temporary key files and logs in `$TMPDIR` (`qelvora-lane5-*`) were removed.

## 9. Draft pull request description for `lane-5/notice-snapshots`

Use when the founder says to open it (Q1) or #373 is registered. Base: `lane-5/note-mute-read`
until #373 merges, then main. Re-run the suites first if the branch has moved since this handoff. End the
description with the attribution line the session instructions give.

```text
**Stacked on #373. Carries a second migration (below); please register it after the Note mute one.**

## What this does
Answers (ai_reply, approved_draft, personal_reply), request status, offers, new requests, call
reminders and commitments now tell the right person. Their truth lives in private rows the growth
worker cannot read, so the owner, in the process that already holds that authority, records what a
notice may say (version, who is speaking, the creator's display name, a fixed safe sentence, a
destination) and withdraws it when its own state changes; the worker reads only that record. The
founder chose this (option A) on 2026-10-08.

## The migration
modules/growth/migrations/pending_w7_notice_snapshot.sql: one table growth.notice, forced row level
security, readable and writable by growth_worker only (the API role has nothing). Primary key
(type, aggregate_id, account_id). It holds no message text, amount or other person's name. A new
type means changing the CHECK. Export and erasure cover it (guarded by to_regclass); the privacy
catalogue checksums need regenerating and review. Rollback: drop the table.

## Scenarios run
(real HTTP on a real PostgreSQL, the real engine and worker loop; fakes: development identity, a
software passkey, the push gateway recorder, stand-in owner routes that make the calls lanes 3 and
4 will make, and a fake job authority for the real export and erasure)
e5-4-owner-snapshots, 12 of 12: E5.3-answer-ai (list and push say "Maya's AI", never Maya),
E5.3-answer-human (Maya, labeled human), E5.3-controls (push off, muted creator, switched-off type:
listed, not pushed), E5.4-types (five types, right role and voice; a finished call tells no one),
E5.4-author-guard (3 of 3 wrong authors refused 409 notification_author_mismatch, nothing recorded),
E5.4-once (3 at once then a repeat: one event, one notice, one push), E5.4-order (event before
record waits as owner_unconfigured, told once after record and resume), E5.4-versions (older
version refused, other creator 409, withdrawn stays withdrawn, newer revives), E5.4-withdraw (never
pushed, leaves the list), E5.4-live-owner (live answer wins in the person's list), E5.3-no-private-
words (9 pushes, 5 lists, 5 tables searched; the same search finds Maya's name),
E5.4-export-and-erasure (the real export lists the records, the real erasure removes them, a late
call is refused as erased, a creator's records go with hers).
Regression: 12 scripts, 69 steps pass, 1 not run, exit 0. Seven guards shown red when removed.
Existing backend suites: 9 files, 157 of 157 pass in 201 s (T-11 143 s at load 8). typecheck 7 of 7; eslint and prettier clean.

## Defects found in my own work
1. A scenario stand-in used now() for occurredAt, so concurrent calls for one cause were refused
   as conflicting events (409). A real owner must use its own row's time. (Ticket text updated.)
2. A sweep compared bigint counts to numbers (always false); fixed, with a positive control.

## Not checked
Real owners (lanes 3 and 4), the stock host, real APNs/FCM, any UI. Staleness is bounded by the
owner's last call. Records are kept until erasure. Tickets to lanes 3 and 4 are in
docs/lanes/status/lane-5.md.

## Decisions I need
Q1 above (open now or hold).
```
