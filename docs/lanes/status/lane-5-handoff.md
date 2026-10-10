# Lane 5 handoff — 2026-10-09

This is the current source of truth. Earlier handoffs remain in git history; do
not follow their old next-step lists. Read this and `lane-5.md` first. The founder
asked to keep working until everything is done. All currently unblocked work has
changes or evidence; remaining items need registration, owner code or decisions.
Do not claim the launch is done.

**Final check and cleanup, 18:55 PT:** reaction scenarios passed 6/6 plus the
separate restart 1/1 again after merging main. Backend 9 files, 157/157 in 212.17 s
(T-11 137.86 s); seven typecheck tasks and changed-source lint passed. Load reached
about 17 near the end. No lane 5 host/container remains, ports 56450–56459 have no
listeners, and temporary lane 5 development key files were removed. Other lanes'
resources were left alone. Details/logs are in the reaction evidence note.

## 1. Resume safely

The founder authorized the isolated Codex worktree after the initial path guard
stopped work: `/Users/yingpengwang/.codex/worktrees/bf8e/creator-platform`.
Work alone, no agents or other sessions. No new unit tests. Real server/PostgreSQL
workflows, named edge fakes, honest failures. Never read/print credentials or .env.

Current branch `lane-5/reaction-withdrawal`, PR #400: implementation `62d80dfec`, normal
merge from main `b3979c9d5`, with subsequent evidence/status commits as needed.
Main advanced from `c0b4ac0f0` to `21b3d4836` when the integrator merged #381.
That adds the Anthropic adapter and changes the local stack's fake model default.
Lane 5 used no real model gateway, model key or provider account.

Check status, fetch, compare PRs/remote refs before acting. Never stash, rebase,
force-push, rewrite shared commits, merge PRs, push main or enable auto-merge.
Use ordinary `git merge` for shared bases. No merge permission remains from
#365/#366. New concerns start from latest origin/main. Stay in the lane's files;
shared composition, registry and other lanes' files require tickets.

## 2. PRs and migration queue

**#385 is first in the migration registration queue.** The founder subsequently
requested all PRs opened for this handoff. That authorizes draft #397–#400 in
addition to #385; review/registration and merging remain gated and serial. This
publication exception does not waive safety review or grant merge permission.

#372 merged into main at 23:17:30 UTC;
#373 merged into its already-closed delivery branch at 23:17:44 UTC. Main lacks
#373. #385 carries BOTH `pending_w5_note_mute_read.sql` and
`pending_w7_notice_snapshot.sql`; its description was corrected. Neither closed
PR needs retargeting. #365/#366/#372 are merged into main.

All branches below have prefix `lane-5/`. Heads exclude later status-only commits
on the current branch. PRs are at `https://github.com/WangPantopus/creator-platform/pull/<number>`.

| PR   | Branch              | Head        | Base              | State / purpose                                             |
| ---- | ------------------- | ----------- | ----------------- | ----------------------------------------------------------- |
| #385 | notice-snapshots    | `6b14b9dcc` | main              | Open; mute + owner records, first registration              |
| #388 | public-withdrawal   | `7a3e29516` | main              | Draft; remove old public post versions                      |
| #389 | public-page         | `3a8e6a5f1` | public-withdrawal | Draft; cache/rate limit, plain text, C8                     |
| #392 | share-card          | `400391383` | main              | Draft; approved human-only contract and refusal proof       |
| #393 | launch-kit          | `e9d9e5cea` | main              | Draft; creator link and checklist                           |
| #394 | push-offline        | `d6905e1b5` | main              | Draft; one-day Android ID retention, iOS held               |
| #395 | digest-owners       | `598738028` | main              | Draft; real missing digest connections and tickets          |
| #396 | metrics-contract    | `223b9eb2c` | main              | Draft; C9 and observed missing events                       |
| #397 | invite-entry        | `f51bfa228` | main              | Draft; invite note/form; registration after #385            |
| #398 | profile-fields      | `e6c3e4443` | main              | Draft; catalogue startup blocked; review after #385         |
| #399 | web-push            | `c54f0125d` | main              | Draft; encrypted browser transport; registration after #385 |
| #400 | reaction-withdrawal | current     | main              | Draft; limited reader; privacy review after #385            |

All four formerly held branches now have open drafts, **#397–#400**, as requested.
Their migrations remain queued behind #385; the integrator registers/reviews one
at a time. #397/#398/#399 were brought forward to main `21b3d4836` by ordinary
merge. Their previous workflow results were not rerun during this handoff pass;
PR descriptions say so explicitly. #400 already had post-merge proof. No product
code changed during publication. Do not edit registry or custody
checksums. Branches are independent except #389 on #388. All created PRs were
attached to this task. CI was checked once per new PR: web/backend and some
Android jobs passed, longer checks were pending, no failed check observed. These
snapshots do not claim every current head is green. Do not repeatedly poll CI.
The initial check of #397–#400 was made once during publication; CI was still
starting/running. No completed green run is claimed for those draft heads.

## 3. Founder decisions

Approved; never reopen:

- Option A owner records, small mute reader, Notes at read time, new members see
  earlier Notes, no reaction undo in pilot, edits notify nobody again, no
  follower/group fan-out yet.
- Q2 default: growth owns biography/category/photo-caption table and endpoint;
  lane 6 owns the form.
- Exact invite label “Your invitation note (optional)” and hint “This note is
  public to anyone with the link. Up to 600 characters.” Implemented; copy generated.
- Human replies only for shares. AI/approved drafts refused by corrected #392.
- `web-push` package download: 3.6.7 plus types installed on its branch. Temporary
  development VAPID keys used locally, never printed.
- **Hold iOS retention** until lane 7 supplies safe background presentation.
- Limited reaction availability reader, queued behind #385 with integrator
  privacy review before registration. Implemented on this branch.

Unanswered, with defaults:

- Public copy “No biography added yet.” / “Last published a Note or post on
  {date}.” Keep existing copy until approved.
- Q4: real public domain/HTTPS origin, Apple app ID, Android app identifiers and
  signing fingerprints. Do not invent association files or device routing proof.
- Q5: privacy review for a useful ten-fan aggregate. Keep five distinct actors and
  existing fixed slices; no lower threshold approved.
- Who assigns expert/companion cohorts when an AI supports both? No guessed
  context or unassigned event. A genuine durable metrics replay contract is also
  missing; never save or manufacture an Actor for worker use.

## 4. Evidence map

Concern notes hold tables, failures, exact file tickets and rerun commands. Most
exist only on their branch: use
`git show lane-5/<branch>:docs/lanes/status/<file>` before switching.

| Branch / note                                                                 | Observed result                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| notice-snapshots / earlier handoff and lane-5-notification-owner-authority.md | Full stack 12 scripts, 69 steps pass, one not run (undo); backend 157/157. Real answer/request/call owners still missing.                                                                                                    |
| public-withdrawal / lane-5-public-withdrawal.md                               | Five public-post API cases pass, including races/archive; backend 157/157. Wrong-creator 503 and source-revoke owner missing are tickets.                                                                                    |
| public-page / lane-5-c8-public-creator.md                                     | API 7/7, browser 5/5, restart 1/1, conditional/outage 2/2. 130 reads: 120 successes, ten 429, no lock pile-up. Profile/capacity portions of E5.5 incomplete.                                                                 |
| invite-entry / lane-5-invites.md                                              | Fresh API 8/8 (two not run), approved form 3/3. Earlier browser entry 4/4; clean restart/outage/clipboard each 1/1. Fan message persisted after four product screens + dev provider picker. First AI answer/recovery failed. |
| profile-fields / lane-5-profile-fields.md                                     | Typecheck/generation pass; stock startup refuses comparison_artifact_custody_changed. API scenario cannot connect, no pass claimed.                                                                                          |
| share-card / lane-5-share-card.md                                             | Three refusal cases pass; five positive owner/hash/withdraw/render cases not run. E5.7 not green.                                                                                                                            |
| launch-kit / lane-5-launch-kit.md                                             | Browser 3 pass, 1 fail, 4 not run; API restart 2 pass, 4 not run. Share action fails because BFF lacks GET /launch.                                                                                                          |
| push-offline / lane-5-push-offline.md                                         | Eight gateway cases + restart pass; backend 157/157, 187.87 s. Physical devices/iOS retention not run.                                                                                                                       |
| web-push / lane-5-web-push.md                                                 | Six cases + restart pass; gateway verifies VAPID/decrypts ID-only payload. Three stock registration/revision/logout checks pass. Backend 157/157, 180.19 s. Actual browser worker/OS/provider not run.                       |
| digest-owners / lane-5-digests.md                                             | Two stock checks expose missing connections: published AI creates no activation job, API returns null. Five digest workflows not run. Existing builders are present.                                                         |
| metrics-contract / lane-5-c9-pilot-metrics.md                                 | Three pass, one FAIL, two not run. Real attribution/follow stored, zero arrival/follow metric rows. No browser outcome-claim endpoint.                                                                                       |
| reaction-withdrawal / lane-5-reaction-withdrawal.md                           | Six new checks + actual restart pass; old notices 5/5; audience/lifecycle/reaction 26/26, undo excluded. No text/write grant. Production registration/devices not run.                                                       |

The invite burst at load 23–25 returned two unexpected 503s instead of 429 (7/8).
Later 8/8 at load 4 and twenty all-429 requests do not establish the cause. The
form's deliberate real PostgreSQL lock failure proves 503/no row, then the same
ID and note succeeds once after release. Keep the earlier failure visible.

The reaction reader's initial migration failed on custom function SET permission;
it now explicitly saves/restores local settings. Its script first had a syntax
error, then wrongly expected 409 rather than the existing 403 refusal. These were
fixed and rerun; the concern note records them. No failed expectation was weakened
to allow the wrong fan or changed private state.

Fakes differ by case and are named in each note: development identity, software
passkey, model/license/payment outcomes, review/verification/denial fixtures,
gateway and deadlines. Real owner wiring, provider accounts and real devices are
never implied. No new unit tests; backend regression uses the existing suites.

## 5. Tickets and next work

1. **Integrator, migrations/custody:** register both SQL files in #385. Review each
   queued proposal separately. Profile adds a table and changes the independently
   reviewed catalogue; do not silence its checksum guard. Reaction adds a limited
   role/function and scoped read policies; review permissions before registration.
2. **Integrator, apps/backend/src/server.ts and composition:** connect content
   notice owner/producers (scenario host shows the calls), lanes 3/4 owner notices,
   real native/web providers and existing digest ports. No invented private owner.
3. **Integrator, apps/web/app/api/growth/[...path]/route.ts:** admit GET /launch;
   profile endpoints need mapping once approved. This file is outside lane 5.
4. **Lanes 1/3/4, share owners:** connect signed human source/version/hash and held
   permission. Commerce.share returns commitment ID rather than the actual grant
   ID growth needs. Then run positive E5.7 and revoke/page/image races. No fake grant.
5. **Lanes 3/4, first-answer recovery:** inspect apps/backend/src/workers/generation-terminal.ts
   and modules/commerce/schema-generation-\*.sql. Restart after a real message logs
   generation_terminal_recovery_incomplete / Actual finalized original terminal
   required; ai_workspace stays locked and public AI is busy. This was observed
   before #381; the newer adapter has not proved it fixed. Lane 3 must connect the
   confirmed useful_answer outcome for installation eligibility too.
6. **Lanes 1/2/3/4 + integrator, digests:** existing growth/weekly-impact.ts,
   growth/canonical.ts and agent/growth-adapter.ts need real outcome ports and one
   publication relay. No production caller exists. Use the exact digest note;
   don't manufacture zero counts or duplicate the builders.
7. **All owners + founder, C9:** settle cohort/context and durable replay authority,
   then connect sixteen confirmed outcomes, including lane 5 arrival/follow.
   A second non-atomic analytics write must not break a successful business action.
   Privacy reviewer evaluates the ten-fan view. C9 has the file-by-file owner table.
8. **Lane 6, Studio:** profile form, PushManager, notification worker, trusted
   public VAPID key and current-account/sign-out lifecycle. Server encryption is
   not proof of safe browser presentation. **Lane 7:** safe iOS background display,
   actual devices, native links/taps/rendering. iOS retention stays held.
9. **Lane 4:** C8 capacity/reliability. **Lane 1:** stable wrong-person refusal and
   real clean-reply review. **Founder/lane 2/7:** domain/app identifiers and HTTPS
   origin before association files and installed-device proof.

These are tickets, not permission to edit other lanes. Never message another
session without explicit human authorization. No periodic monitoring was requested.
After each owner/decision arrives, finish that workflow and rerun its star rows.

## 6. Environment and rerun

Every shell that runs Node or pnpm needs:

```sh
export PATH="/Users/yingpengwang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/yingpengwang/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH"
export npm_config_manage_package_manager_versions=false
```

gh: `/Users/yingpengwang/.local/bin/gh`. Check uptime; load above about 15 can hurt
timing tests, but report failures rather than assuming the cause. Only ports
56450–56459 and containers qelvora-lane5-\* belong to this lane.

Scenario host: `sh tests/scenarios/lane-5/setup.sh`, manually apply concern SQL to
`creator_foundation_lane5`, then `sh tests/scenarios/lane-5/run-host.sh`.
Reset clones `creator_foundation_lane5_base`. run-all resets each script, so SQL
it needs must also be manually applied to that disposable template. Nothing here
registers pending SQL. The reaction note has exact commands and restart order.

Stock/browser host: `node infra/local/stack.mjs up --lane 5 --growth --no-smoke`.
Default model is now the Anthropic-shaped fake; no key needed. Do not print generated
environment files. Stock and scenario databases both use 56450: stop/remove the
previous lane 5 container before switching. Stock cleanup:
`node infra/local/stack.mjs down --lane 5`.

On web-push, branch switching can remove its dependency symlink. Offline frozen
install restored seven cached packages with zero downloads after one startup
failed ERR_MODULE_NOT_FOUND: web-push. No new download needed. Use installed Chrome
(`channel: 'chrome'`), not a browser download. zsh does not split unquoted `$VAR`
into words: use arrays or xargs. Never foreground a long sleep.

Evidence logs/screenshots: `/tmp/qelvora-lane5-*`. Exact names/excerpts live in
concern notes. Before a long stop: finish checks, update both status files, commit,
push, stop only lane 5 processes/containers and temporary development key files,
then verify ports. Do not claim cleanup before verifying it.

## 7. Next-session kickoff

Copy [lane-5-next-session.md](lane-5-next-session.md) into the next lane 5 session.
It starts with reconciliation, preserves all approvals and directs work toward
the current owner/registration gates. The source-of-truth handoff lives on
`origin/lane-5/reaction-withdrawal`, not necessarily main. No old work should be redone.
