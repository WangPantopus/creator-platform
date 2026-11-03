# Migration queue

The migration queue is every SQL file in the repository that
[`infra/migrations.json`](../../infra/migrations.json) does not register. Such a file is never
installed on any database: not the local stack, not the CI fixtures, not production. Code that needs
it must wait until it is registered ([how](migrations.md)). This page says, for each file, what it
creates, what must come before it, who reads it, and whether it is needed for the pilot, needed
later, obsolete or unclear. Keep it current: a file leaves the queue when it is registered (in the
wave of the feature that needs it) or deleted (with the founder's yes), and a pull request that adds
an unregistered SQL file adds its row here. The founder decides from this page which files to
register, keep or delete. Nothing here registers or deletes anything.

Triaged on 2026-11-03 at `37a47bd84` (registered head `0258_w4_provider_inbox_worker`) by reading
every file and every place in `apps/`, `packages/`, `infra/`, `scripts/` and `tests/` that names its
objects. No file was applied to a database. To list the queue again:

```sh
node -e 'const r=require("./infra/migrations.json"),s=new Set(r.migrations.map(m=>m.path));for(const p of require("child_process").execSync("git ls-files \"*.sql\"",{encoding:"utf8"}).trim().split("\n"))if(!s.has(p))console.log(p)'
```

## Latent failures

No endpoint crashes on a missing queue object: every backend reader that names one checks the
catalogue, the ledger or the registry first, catches the error, or is never built by `server.ts`.
Four places still fail on every real database, three of them in the ops console the pilot needs
(phase 3):

1. **Naming an ops reviewer** (phase 3, "a named reviewer"). The runbook command
   [`trust/ops-members.ts`](../../apps/backend/src/modules/trust/ops-members.ts) has no guard. `list
   --changes` (line 159) fails with "relation `creator_trust.ops_member_change` does not exist",
   `add` (line 104) is refused by row security, and `remove` finds nobody. So on a real database
   only a superuser can name a reviewer. Needs `trust/pending-ops-member-admin.sql`. The local
   stack hides this: its seed inserts the reviewers as an administrator
   (`infra/local/seed-stack.sql:20-24`).
2. **Supervisor audits** (phase 3). `GET /v1/trust/operations/audits`
   (`trust/service.ts:1396-1418`) relies on a row-security policy that only
   `trust/pending-supervisor-audits.sql` adds. Without it a supervisor sees only their own records
   under the banner "Every reviewer's latest 100 case access and action records."
   (`apps/web/app/ops/audits/page.tsx:35`). The result is wrong, and nothing reports it.
3. **Lifting a pause** (phase 3). `POST /v1/trust/cases/:id/lift-pause`
   (`trust/service.ts:797-820`) answers 503 `pause_lift_unavailable` until
   `trust/pending-lift-pause.sql` is registered. This one is guarded by design.
4. **Team triage of a fan thread** (S-C10 Team). A Team member with the triage role who opens a fan
   thread or sends a Team reply (`conversation/feature.ts:847`, `:1191`) goes through
   `trust/scope-restriction.ts:141`, which calls `creator_trust.team_thread_denial`. Only
   `migrations/0084_w8_team_thread_denial.sql` creates it, and the only guard turns the missing
   function into 503 `scope_denial_unconfigured` (lines 103-122). The founder decided on 2026-11-03
   that triage waits until after the pilot. Until then the Studio must not offer the Triage role:
   it is a fixed entry in `apps/web/features/studio/team/Team.tsx:14` and in the native Studio
   team screens, with no switch, so hiding it is a small code change. The API still accepts the
   role (`TeamRoleSchema` in `packages/api/src/identity.ts`, used by the invite and role-change
   routes), so the server must refuse to grant it too, not only the apps. A separate work session
   does both.

Moment 2 also doesn't work without its two queue files, though nothing fails: the memory writer is
never built (no review lists its consumer), and one deleted memory or "don't remember this" makes
the AI drop the thread's whole history, memory and intro (the registered 0179 rule). No test
installs a queue file. The lane 1 and lane 3 scenarios that need one ask for it to be applied by
hand, and they don't run in CI.

Some files would break things if they were registered as written, and their rows say how:
`identity/schema-publication-scope.sql` (0158) would stop Note reply review,
`conversation/migrations/pending_w7_relationship_activity.sql` (0151) would likely stop AI reply
finalization, and the ten files whose SQL names its own reserved version (0199 to 0220) would refuse
to run under a new number.

## Counts

| Class | Files |
| --- | --- |
| Needed for the pilot | 5 |
| Unclear: the founder decides | 2 |
| Needed later | 27 |
| Obsolete | 16 |
| Not a migration | 11 |
| **All unregistered `.sql` files** | **61** |

**Against #527's list of 42.** The 42 files under `apps/backend/src/modules/` are the same on this
base; nothing was added or registered since. The recount finds 19 more outside that folder: 8 W8
migrations in `apps/backend/migrations/` (0073, 0076, 0084, 0150, 0200, 0201, 0205 and 0207, seven
of them reserved), and 11 files that are not migrations (seeds, evidence, a history copy, a recovery
script). #527's heading says 18 reserved, but its list marks 17. Counting the reservations that name
their file only in a header or the held version history (0168, 0172, 0176, 0178), 21 of the 42 hold
one.

## The files

Paths under `apps/backend/src/modules/` start at the module (`commerce/…`); `migrations/` is
`apps/backend/migrations/`. "Added by" is the pull request that brought the file to `main`, with the
date of the commit that added it. "Needs first" names registered versions, or queue files by their
reserved number. Rows are in the order of the [proposed waves](#proposed-waves).

| File | Reserved | Added by | Creates | Needs first | Read by | Class | Why |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `trust/pending-ops-member-admin.sql` | — | #472 (2026-10-16) | Owner policies on `ops_member` and `case_access`; table `ops_member_change`, an append-only change log | 0008 | The runbook `trust/ops-members.ts` (no endpoint) | Pilot: phase 3 | Without it nobody but a superuser can name a reviewer. Latent failure 1 |
| `trust/pending-supervisor-audits.sql` | — | #475 (2026-10-16) | `creator_trust.may_supervise()`; policy `audit_supervisor_read` | 0008 | `GET /v1/trust/operations/audits` (`trust/service.ts:1396`), through row security | Pilot: phase 3 | Without it supervisors silently see only their own records. Latent failure 2 |
| `trust/pending-lift-pause.sql` | — | #478 (2026-10-16) | Effect state `cancelled`; policies `effect_cancel_pause`, `restriction_lift`; the runtime may set `restriction.revoked_at` | 0008, 0010, 0023 | `POST /v1/trust/cases/:id/lift-pause` and the ops case page; guarded (503) | Pilot: phase 3 | A supervisor can't lift a pause. Latent failure 3 |
| `conversation/migrations/pending_w3_generation_memory_proposals.sql` | — | #518 (2026-10-16) | Role `creator_w3_generation_memory`; `generation_memory_proposals()`, a definer function only the generation worker may call, which inserts `memory` rows in state `proposed`; policies | 0001, 0041, 0159 | `conversation/generation-memory.ts:151`, built in `workers/generation-composition.ts:208` only when a review lists `custody.memory`, which none does; scenarios `lane-3/e3b5-memory*.mjs` | Pilot: moment 2 | Memory extraction and "Want me to remember this? Only if you say yes." can't run without it. Its wave also needs the worker receipt and new pins, or every fan turn answers 503 |
| `conversation/migrations/pending_w3_generation_context_exclusions.sql` | — | #518 (2026-10-16) | Replaces `generation_conversation_context()` (0179) and the 0221 policy; nothing new | 0179, 0221; after the memory file | `conversation/generation-context.ts:426`, on every fan turn | Pilot: moment 2 | Without it an exclusion drops all of a thread's history and memory from the AI's context, silently. Needs a `generationDefinitions` entry and new pins |
| `commerce/schema-paid-coverage.sql` | 0155 | #82 (2026-10-01) | Tables `commerce_paid_coverage`, `commerce_paid_coverage_denial`; roles `creator_commerce_count`, `creator_commerce_tenure`; two definer functions; policies | 0001, 0002, 0004, 0008, 0010, 0021, 0027 | `commerce/paid-coverage.ts`, `paid-audience-count.ts` (not built); the export skips it when absent (`financial-export.ts:281`); `commerce/runtime.ts:224-228` refuses to start when store verification is configured without it | Unclear: founder | Paid periods and refunds for app-store memberships. Needed for the pilot if memberships are sold through the App Store and Google Play (D-14) |
| `migrations/0207_w8_development_feedback_lifecycle.sql` | 0207 | #132 (2026-10-07) | Role; `identity_event.policy_version` and `.expires_at`; three indexes; policies; three definer functions; a delete trigger | 0056, 0057 (checksums match) | `trust/development-feedback.ts:68`, only with `NODE_ENV=development` and two development switches (lines 47-53). It gates Helpful / Not helpful and the fan intro offer | Unclear: founder | Development-only by design, and its fixed window (2026-10-02 to 11-01) has ended. If the pilot wants reply feedback and the intro, it needs a production successor |
| `migrations/0084_w8_team_thread_denial.sql` | 0169 | #89 (2026-10-02) | `creator_trust.team_thread_denial()`, a definer function for the runtime | 0001, 0002, 0053, 0074, 0082 | `trust/scope-restriction.ts:141` for every non-participant | Later: Team triage | The founder deferred Team triage to after the pilot (2026-11-03). Latent failure 4 |
| `session/livekit-schema.sql` | 0176 | #67 (2026-10-02) | A login and a role for call callbacks; tables `call_provider_room`, `call_provider_identity`, `call_provider_callback`, `call_callback_scope`; callback functions and triggers | 0001, 0006 | `session/livekit-journal.ts`, which nothing imports | Later: calls | One-to-one calls wait for a call provider (Q06). Its header is the 0092 proposal held as 0176 |
| `migrations/0150_w6_account_call_metadata.sql` | 0197 | #166 (2026-10-02) | Role `creator_call_metadata`; `account_call_metadata()`; five read policies | 0001, 0002, 0006 | `server.ts:169`, guarded: `GET /v1/w6/calls/:sessionId/route` answers 503 | Later: calls | Call route recovery |
| `identity/schema-publication-scope.sql` | 0158 | #67 (2026-10-01) | Login `creator_publication_worker` and role `creator_publication_authority`; table `publication_worker_scope`; six definer task functions; narrows every public policy on four content tables to `creator_runtime` | 0001, 0002, 0008, 0035 | `identity/publication-scope.ts:203`, built only by the separate publication worker, which nothing starts; guarded (503) | Later: publication worker | Text posts and Notes publish without the worker. Revise before registering: narrowing `content_index`'s public read hides it from registered 0253's `review_note_reply`, so every Note reply review would answer "Reply author required" (read from the SQL, not run) |
| `migrations/0073_w8_publication_worker_denial.sql` | 0160 | #67 (2026-10-01) | `creator_trust.publication_worker_denial()`; read policies for `creator_trust_denial` | 0158, 0053 | `trust/scope-restriction.ts:364`, used only by the publication worker | Later: publication worker | It adds to `creator_trust_denial`, whose catalogue the Note-reply tenure check pins, so its wave regenerates that pin too |
| `media/publication-scope.sql` | 0161 | #67 (2026-10-01) | `publication_media_snapshot()`; narrows the public policy on `creator_media_publication` | 0158; 0160 when it runs | `media/publication.ts:198`, built only by the publication worker; guarded (503) | Later: publication worker | Media posts; media is frozen |
| `migrations/0076_w8_public_packet_denial.sql` | 0162 | #114 (2026-10-02) | Three packet denial functions for `creator_trust_denial` | 0053; 0160 when it runs | `trust/scope-restriction.ts:306` (exposed, never called) and `commerce/public-packet-host.ts` (never built); guarded (503) | Later | Public request viewing |
| `migrations/0201_w8_worker_migration_metadata.sql` | 0201 | #169 (2026-10-02) | Lets the logins `creator_publication_worker` and `creator_call_callback_worker` read `schema_migration` versions; nothing else | 0158 and 0176 (both logins) | The publication worker and `session/livekit-journal.ts`, both unbuilt or guarded | Later: publication worker | It can't install without the call schema (0176), so it ties the publication worker to calls |
| `commerce/schema-fulfillment-plans.sql` | 0178 | #157 (2026-10-02) | Tables `commerce_fulfillment_plan`, `commerce_fulfillment_member`, `commerce_group_delivery`, `commerce_review_attestation`; hash and immutability triggers | 0001, 0002, 0004 | Guarded or skipped in `commerce/service.ts:231`, `conversation/service.ts:200` and the export; `commerce/fulfillment-plans.ts` is built only by a loopback development host | Later: group answers | Group answers come after the pilot (launch plan, section 4) |
| `commerce/schema-fulfillment-plan-read.sql` | 0199 | #157 (2026-10-02) | Role `creator_fulfillment_view_authority`; table `commerce_fulfillment_view_scope`; definer functions that open, match and end a view | 0178 | `commerce/fulfillment-view-authority.ts`, never built | Later: group answers | Its SQL names its own version |
| `commerce/schema-fulfillment-original-hash.sql` | 0202 | #157 (2026-10-02) | Role `creator_fulfillment_original_hash`; `commerce_fulfillment_originals_match()` | 0199 | `commerce/fulfillment-original-hash.ts`, never built | Later: group answers | Its SQL names its own version |
| `migrations/0200_w8_fulfillment_view_denial.sql` | 0200 | #223 (2026-10-02) | Role `creator_trust_fulfillment_view_denial`; two denial functions | 0199 | `trust/fulfillment-view-denial.ts`, never built | Later: group answers | Its SQL names its own version |
| `commerce/schema-fulfillment-publication-consumer.sql` | 0204 | #186 (2026-10-02) | Role `creator_fulfillment_publication_metadata`; table `commerce_fulfillment_publication_scope`; eight definer functions; a restrictive policy on `content_revision` | 0178, 0158 | `commerce/fulfillment-publication-catalogue.ts`, never built | Later: public answers | Publishes a group answer as a public answer (D-19, after the pilot). Its SQL names its own version |
| `migrations/0205_w8_fulfillment_publication_denial.sql` | 0205 | #212 (2026-10-02) | Role `creator_trust_fulfillment_publication_denial`; two denial functions | 0204 | `trust/fulfillment-publication-denial-catalog.ts`, used only by unbuilt code | Later: public answers | Its SQL names its own version |
| `identity/schema-publication-preparation.sql` | 0208 | #224 (2026-10-02) | Table `publication_preparation`; eight definer functions; swaps the worker's task issuers | 0158, 0204, 0205, 0167 | `identity/publication-scope.ts:162`, publication worker only; guarded (503) | Later: public answers | It calls 0204 for every task, so even plain posts through the worker would need the group-answer chain. Its SQL names its own version |
| `commerce/schema-fulfillment-publication-original-hash.sql` | 0213 | #132 (2026-10-02) | Role `creator_fulfillment_publication_original_hash`; one definer comparison over 16 tables | 0208, 0158 | `commerce/fulfillment-publication-original-catalogue.ts`, which the publication worker checks at start; its pin is unset, so it always answers 503 | Later: public answers | Its SQL names its own version |
| `commerce/schema-fulfillment-publication-worker.sql` | 0219 | #132 (2026-10-02) | Role `creator_fulfillment_publication_worker`; seven definer functions; replaces 0178's `commerce_group_delivery_exact()` | 0208, 0158; 0220 when it runs | `commerce/fulfillment-publication-worker.ts`, never built | Later: public answers | Its SQL names its own version |
| `conversation/migrations/pending_w3_publication_worker_output.sql` | 0220 | #132 (2026-10-03) | Role `creator_w3_publication_output`; table `publication_worker_system_binding`; definer functions that write the "Answered publicly." message | 0219, 0158 | `commerce/fulfillment-publication-worker.ts:286`, never built | Later: public answers | Its SQL names its own version |
| `conversation/migrations/pending_w7_relationship_activity.sql` | 0151 | #132 (2026-10-01) | `conversation_relationship.activity_at`; a trigger on `message`; policies; an index | 0001, 0002, 0041 | Home (`conversation/feature.ts:548-567`), guarded: without it Home pages by thread id, and `growth/home.ts:211` still sorts each page of 50 by activity | Later | Matters past 50 conversations per fan. Revise before registering: its trigger runs as the caller, and 0203's `generation_terminal_output` updates `message` as a role with no grant on the tables the trigger writes, so AI reply finalization would likely fail (read from the grants, not run) |
| `growth/migrations/pending_w7_home_page_index.sql` | 0153 | #132 (2026-10-01) | Index `growth_content_public_home_page` | 0007 | The Home posts query (`growth/service.ts:682-688`); no code names it | Later | Speed only, not needed at pilot size |
| `commerce/schema-home-request-metadata.sql` | 0166 | #96 (2026-10-02) | Index `commerce_packet_home_activity` | 0004 | `commerce/home.ts:39-77`, which requires it by version, but nothing calls it | Later | Only if Home lists paid requests |
| `growth/migrations/pending_w7_source_scan_checkpoint.sql` | 0152 | #132 (2026-10-01) | Table `growth.source_scan_checkpoint` for `growth_worker` | 0007 | `growth/runtime.ts:83-91`, `growth/sources.ts:70-80`, `growth/service.ts:1824-1835`, each guarded | Later | Without it the creator directory scan starts again from page one after a restart |
| `content/migrations/pending_w7_thanks_window_index.sql` | 0154 | #132 (2026-10-01) | Index `content_thanks_window_page` | 0035 | `content/thanks-projection.ts:141-155`, called only from the unbuilt weekly impact source | Later | Speed only, for the weekly digest (moment 5) once it is built |
| `growth/migrations/pending_w7_account_notifications.sql` | — | #132 (2026-10-02) | Notifications without a creator: `producer_relay.account_id`, two checks, a trigger | 0007, 0032 | `growth/account-notifications.ts:100-119`, guarded; only spending reminders use it, and nothing produces them | Later | Spending reminders as notifications. It is not 0174, which is W4's |
| `content/schema-note-reply-tenure.sql` | 0172 | #118 (2026-10-02) | Raises the `content_reply` text limit from 4,000 to 12,000 characters | 0035 | `content/tenure.ts:330-340`, guarded: the limit stays 4,000 | Later | Longer Note replies, a tenure perk |
| `identity/schema-content-signature-read.sql` | 0225 | #132 (2026-10-07) | Role `creator_content_signature_read_authority`; `hold_content_signature_read()`, for the runtime only | 0167 | `identity/content-signature-read.ts:74`, which nothing calls; its pin is unset | Later | The share card's verification page reads `signed_verification` directly and doesn't need it |
| `conversation/migrations/0083_w3_translation_worker_scope.sql` | 0168 | #132 (2026-10-02) | Table `translation_job`, three indexes, row security with no policy | 0001, 0056 | Nothing (`conversation/translation-job.ts` has no importer) | Later | Translation isn't in the launch plan |
| `agent/migrations/pending_w2_agent_extensions.sql` | — | #6 (2026-09-29) | Tables `ai_cost_hold`, `ai_shadow_evaluation`, `ai_shadow_sample`, `ai_style_embedding` | 0003 | Nothing | Obsolete | Same DDL as registered `0013_w2_agent_extensions`; only comments and the ledger value differ |
| `agent/migrations/pending_w2_shadow_jobs.sql` | — | #6 (2026-09-29) | Two `ai_shadow_evaluation` columns and an index | 0013 | Nothing | Obsolete | Same DDL as registered `0019_w2_shadow_jobs` |
| `agent/migrations/pending_w2_purge_tombstone.sql` | — | #6 (2026-09-29) | Table `ai_tombstone` and purge columns | 0013 | Nothing | Obsolete | Same DDL as registered `0020_w2_purge_tombstone` |
| `commerce/schema-reliability.sql` | — | #6 (2026-09-29) | Table `commerce_provider_inbox`, `commerce_effect.created_at` | 0004 | A comment in `schema-provider-inbox-worker.sql` | Obsolete | Same DDL as registered `0015_w4_reliability` |
| `commerce/schema-disclosure.sql` | — | #6 (2026-09-29) | Packet read, insert and update policies | 0004 | Nothing | Obsolete | Same DDL as registered `0016_w4_disclosure` |
| `commerce/schema-lineage.sql` | — | #6 (2026-09-29) | Table `commerce_authorization_lineage` and its trigger | 0004 | Nothing | Obsolete | Same DDL as registered `0022_w4_lineage` |
| `commerce/schema-generation-audience.sql` | — | #141 (2026-10-02) | `generation_allowance_audience()`, role `creator_w4_generation_audience` | old versions 0072, 0093 | A comment in its renumbered copy | Obsolete | The original of registered 0182; only version strings differ |
| `conversation/migrations/pending_w3_privacy_cursor_export.sql` | 0206 | #132 (2026-10-02) | The conversation export cursor | 0212 | The registry's 0206 entry | Obsolete | The original of registered 0233. It can't apply as numbered, and the registry says not to activate it |
| `conversation/migrations/pending_w3_comparison_samples.sql` | — | #340 (2026-10-08) | Comparison consent and samples | — | The allocation record `infra/migrations/reviews/20261008-comparison-allocations.json` | Obsolete | The original of registered 0239; only version strings differ |
| `conversation/migrations/pending_w3_comparison_privacy.sql` | — | #340 (2026-10-08) | Comparison export and purge | — | The allocation record | Obsolete | The original of 0240 |
| `trust/pending-comparison-export-artifacts.sql` | — | #342 (2026-10-08) | Comparison export artifacts | — | The allocation record | Obsolete | The original of 0241 |
| `trust/pending-comparison-export-attempts.sql` | — | #343 (2026-10-08) | Export attempt recovery | — | The allocation record | Obsolete | The original of 0242 |
| `trust/pending-comparison-export-privacy.sql` | — | #344 (2026-10-08) | Artifact privacy | — | The allocation record | Obsolete | The original of 0243 |
| `conversation/migrations/pending_w3_comparison_writer.sql` | — | #345 (2026-10-08) | Sample write checks | — | The allocation record | Obsolete | The original of 0244 |
| `conversation/migrations/pending_w3_comparison_reader.sql` | — | #346 (2026-10-08) | Comparison reads | — | The allocation record | Obsolete | The original of 0245, which also pins the owner's grants |
| `trust/pending-comparison-artifact-scope.sql` | — | #348 (2026-10-08) | Artifact scope | — | The allocation record | Obsolete | The original of 0246 |
| `infra/local/seed-stack.sql` | — | #367 (2026-10-08) | Development seed rows | the full install | `infra/local/stack.mjs:608` | Not a migration | The local stack's seed. Keep |
| `infra/local/w6/seed-development.sql` | — | #67 (2026-10-01) | W6 development seed | — | `infra/local/w6/README.md` | Not a migration | A seed |
| `infra/local/seed-w3.sql` | — | #67 (2026-10-01) | Seed for the old `creator_w3` database | — | Nothing | Not a migration | An old per-workstream seed |
| `infra/local/seed-w8.sql` | — | #6 (2026-09-29) | Seed for the old `creator_w8` database | — | Nothing | Not a migration | An old per-workstream seed |
| `infra/migrations/history/0045_w5_reply_review.sql` | — | #15 (2026-09-30) | History copy of registered 0045 (same bytes) | — | `infra/migrations/adoptions/w5-20260930.json` | Not a migration | Kept for the W5 adoption record |
| `infra/migrations/recoveries/w2-20261001-grants.sql` | — | #328 (2026-10-07) | Grants for the W2 archive recovery | — | `apps/backend/scripts/recover-w2-archive.ts` | Not a migration | A recovery script |
| `artifacts/…/applied-isolated-migrations/0003_w2_agent_extensions.sql` | — | #1 (2026-09-29) | Evidence copy | — | Nothing | Not a migration | Same bytes as history 0013 |
| `artifacts/…/applied-isolated-migrations/0013_w2_shadow_jobs.sql` | — | #1 (2026-09-29) | Evidence copy | — | Nothing | Not a migration | Same bytes as history 0019 |
| `artifacts/…/applied-isolated-migrations/0014_w2_purge_tombstone.sql` | — | #1 (2026-09-29) | Evidence copy | — | Nothing | Not a migration | History 0020 with an older ledger value |
| `artifacts/…/core-follow-live-raw/core-follow-pg17-function.sql` | — | #132 (2026-10-02) | A function dump | — | Nothing | Not a migration | Evidence from a core Follow check |
| `artifacts/…/core-follow-live-raw/core-follow-pg17-final-function.sql` | — | #132 (2026-10-02) | A function dump | — | Nothing | Not a migration | Same bytes as the file above |

The two `artifacts/` folders are `artifacts/workstreams/W2/source-version/20260929/` and
`artifacts/workstreams/W7/studio-runtime/20261002/`.

## Reserved numbers

`infra/migrations.json` holds 59 reservations. None of them can be used as a version any more:
`migrate-trust` refuses a version below a database's newest one
([`migrate-trust.ts:560`](../../apps/backend/scripts/migrate-trust.ts)), and every database is at
0258. Registering a held file takes the next free number, as 0253 to 0255 did for the files held at
0156, 0173 and 0185. A file whose SQL names its own reserved version (0199, 0200, 0202, 0204, 0205,
0207, 0208, 0213, 0219, 0220) also needs a renumbered copy, as 0233 was for 0206 and 0239 to 0246
were for the comparison files; the original bytes stay. So a reservation now only points at a file
and its reviewed checksum. No code reads the list except one 0045 check in `migration-custody.ts`.

- **Keep** a reservation while its file is in the queue as needed or unclear (28).
- **Release** it when its file is registered, superseded or never written (29).

| Reserved | File | Keep or release | Why |
| --- | --- | --- | --- |
| 0005, 0009 | none | Keep, as history | They record that the W5 and W3 producers' 0005 and 0009 became 0035 and 0041. They hold nothing |
| 0151, 0152, 0153, 0154, 0158, 0160, 0161, 0162, 0166, 0169, 0199, 0200, 0201, 0202, 0204, 0205, 0208, 0213, 0219, 0220, 0225 | the file named in the entry | Keep | Needed later |
| 0155, 0207 | the file named in the entry | Keep | Unclear until the founder decides |
| 0168, 0172, 0176, 0178, 0197 | `conversation/migrations/0083_w3_translation_worker_scope.sql`, `content/schema-note-reply-tenure.sql`, `session/livekit-schema.sql`, `commerce/schema-fulfillment-plans.sql`, `migrations/0150_w6_account_call_metadata.sql` | Keep, and add the path | Needed later. The entries have no path; the file's header or the held version history names it |
| 0156, 0173 | `migrations/0069_w8_reply_review.sql`, `migrations/0089_w8_creator_fan_denial.sql` | Release | Registered as 0253 and 0254 (#520). The entries still say `reserved_unapplied` |
| 0170, 0171 | `identity/schema-public-ai-scope.sql`, `migrations/0086_w8_public_creator_denial.sql` | Release | Registered as 0235 and 0236 |
| 0185 | none in the entry | Release | Registered as 0255, `growth/migrations/pending_w7_core_follow_metadata.sql` (#521) |
| 0239 to 0252 | the registered files | Release | Registered at these same numbers; the 14 entries are leftovers |
| 0206 | `conversation/migrations/pending_w3_privacy_cursor_export.sql` | Release | Superseded by registered 0233 |
| 0164 | `migrations/0052_w8_privacy_export_chunks.sql`, which doesn't exist | Release | No branch ever had the file, and the registry says the design was never built. The export works without it |
| 0193 | none on `main`; `0110_w3_generation_terminal_finalization.sql` on the archived branch `codex/w3-generation-terminal-consumer` | Release | Replaced by registered 0203, whose header names it |
| 0174, 0175, 0190, 0191, 0192, 0194, 0195 | none in any branch | Release | Placeholders for designs never written. The registered generation waves shipped without 0190 to 0195 |

## Proposed waves

The smallest feature waves for the needed files, in order. Each wave regenerates the catalogue pins
and follows [the registration steps](migrations.md#registering-a-file-today); none is registered
here.

**For the pilot**

1. **Ops console** (phase 3; it can go first): `trust/pending-ops-member-admin.sql`,
   `trust/pending-supervisor-audits.sql`, `trust/pending-lift-pause.sql`. They need only registered
   files, create no role and name no version. This lets the founder name and remove reviewers on a
   real database, shows supervisors every reviewer's audit records, and lets a supervisor lift a
   pause. The lane 1 scenarios `tests/scenarios/lane-1/e1-6-*.mjs` prove it.
2. **Memory** (phase 2, moment 2): the memory proposals file, then the context exclusions file, as
   lane 3 asked. This turns on memory extraction after the answer, "Want me to remember this? Only
   if you say yes.", and an exclusion that removes only what it names. The wave also adds the
   `custody.memory` receipt to the generation worker review and W1's consumers, a
   `generationDefinitions` entry for the replaced context function, and new pins (lane 3 counted 13
   changed groups for the memory role). The steps are in lane 3's integrator table
   ([lane-3.md](../archive/lanes/status/lane-3.md)). The founder confirms the INV-15 default first.
3. **Store memberships**, if pilot memberships are sold through the App Store and Google Play:
   `commerce/schema-paid-coverage.sql`, before store verification is configured.

**Later, each with its feature**

- **Team triage:** `migrations/0084_w8_team_thread_denial.sql` alone, when helpers may read and
  answer fan threads. Test Team replies on both phones in the same wave.
- **Calls:** `session/livekit-schema.sql` (0176), then
  `migrations/0150_w6_account_call_metadata.sql` (0197).
- **The publication worker:** 0158 (revised first) → 0160 → 0161 and 0162, then 0201 once 0176 is
  in. The worker also needs code changes: its start check (`workers/start.ts:35`) requires the
  public-answer chain and has no pin, and it checks only `revoked_at`, not `retired_at`.
- **Group and public answers:** 0178 → 0199 → 0202 and 0200; then 0204 → 0205 → 0208 → 0213 and
  0219 → 0220, as renumbered copies.
- **Home and growth at scale:** 0151 (revised first), 0153, 0166, 0152, 0154, and
  `growth/migrations/pending_w7_account_notifications.sql` for spending reminders.
- **The rest:** 0172 (longer Note replies), 0225 (content signature reads), 0168 (translation).

## Not on `main` yet

Five parked pull requests carry SQL that will join the queue when they return
([STATUS](../STATUS.md#parked-pull-requests)). Two are pilot features:

- #400, reaction pushes after a withdrawn reply (moment 3):
  `content/migrations/pending_w5_reaction_available.sql`;
- #459 with #392, the share card: `commerce/schema-share-status.sql`;
- #399, creator web push: `growth/migrations/pending_w7_web_push.sql`;
- #398, profile fields: `growth/migrations/pending_w7_creator_profile_fields.sql`;
- #487, "usually decides in": `commerce/schema-decision-record.sql`.
