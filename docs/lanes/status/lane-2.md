# Lane 2: Platform and hosting status

Updated: 2026-10-09, by the resumed lane 2 session
Working on: resume audit complete; documentation awaiting the integrator, branch `lane-2/resume-status-20261009`
Done: WP 2.1 is on main. WP 2.2, WP 2.9 and the WP 2.3 hosting options were completed in session 1, but their merged pull requests did not land on main (see below)
Next: integrator repairs the stack landing; founder chooses hosting, or explicitly assigns WP 2.8 (load and soak)
Blocked on: hosting road, provider, region, domain, account and monthly ceiling; integrator stack repair and implementation of the approved readiness/catalogue changes

## Resume here

### What changed since the first handoff

Fetched all remotes with pruning, read the first handoff and its linked notes, the lane rules,
charter, contracts, coverage, `CURRENT`, and the three memory entries named in the resume prompt.
GitHub's pull request metadata and Git ancestry disagree only if "merged" is mistaken for
"on main": **all four pull requests are merged, but only #367 reached main**.

The reference main for this audit is `c0b4ac0f030a893dfc92457f0f4348dd87174398`.

| PR                                                                | Work                   | Merged into                 | On main? | Original reviewed head                     |
| ----------------------------------------------------------------- | ---------------------- | --------------------------- | -------- | ------------------------------------------ |
| [#367](https://github.com/WangPantopus/creator-platform/pull/367) | WP 2.1 local stack     | `main`                      | Yes      | `fa18f6037cc48225dfe38c6f3e2fff93b5ff7dc6` |
| [#370](https://github.com/WangPantopus/creator-platform/pull/370) | WP 2.2 production host | `lane-2/stack-from-scratch` | No       | `dadffbced2ab1cf92403bde1b39f79440e1f702e` |
| [#377](https://github.com/WangPantopus/creator-platform/pull/377) | WP 2.9 catalogue pins  | `lane-2/production-root`    | No       | `4bb548e9011be2934880992c943bee6b6ab7d686` |
| [#378](https://github.com/WangPantopus/creator-platform/pull/378) | WP 2.3 hosting options | `lane-2/catalogue-pins`     | No       | `69ca75941dcaad02dda700d548971006a5bbd9a9` |

All reported checks succeeded: 11 each on #367, #370 and #377; 10 on #378. No issue comments,
reviews or inline review threads were returned for any of the four. No founder decision was
found there. These are completed PR check results, not a claim about main's CI. CI was not polled.

**Ticket to the integrator:** land the reviewed WP 2.2, WP 2.9 and WP 2.3 work on main, in that
order, using replacement pull requests that preserve history and one concern per pull request.
The old PRs are already merged, so retargeting an open PR is no longer the repair. Use the original
heads above: several branch tips now include the next PR's merge. Lane 2 has not merged,
retargeted or rewritten anything. Preserve this newer resume audit when resolving status-file
conflicts, and reconcile `docs/operations/CURRENT.md` after landing.

Evidence: `git merge-base --is-ancestor <merge-commit> origin/main` exits 0 for
`3500f917d0fb2e2066697ca13adb86e2ca52451c` (#367), and 1 for
`7afd645dc0e894e74c1578a0c8aa5e8de2fde178` (#370),
`b64b008d225a8ed614ef2f673e0c99e72da66b30` (#377), and
`3a4fe22830c9567e987758aa7deae6e5afbb0c5b` (#378).

### Keep the original evidence; do not redo it

The complete first handoff and three notes remain at the reviewed hosting-options commit.
Use these links until that work reaches main:

- [Session 1 handoff, scenario results, traps and tickets](https://github.com/WangPantopus/creator-platform/blob/69ca75941dcaad02dda700d548971006a5bbd9a9/docs/lanes/status/lane-2.md).
- [WP 2.2: production host and C2](https://github.com/WangPantopus/creator-platform/blob/69ca75941dcaad02dda700d548971006a5bbd9a9/docs/lanes/status/lane-2-production-root.md).
- [WP 2.9: catalogue pins](https://github.com/WangPantopus/creator-platform/blob/69ca75941dcaad02dda700d548971006a5bbd9a9/docs/lanes/status/lane-2-catalogue-pins.md).
- [WP 2.3: hosting options](https://github.com/WangPantopus/creator-platform/blob/69ca75941dcaad02dda700d548971006a5bbd9a9/docs/lanes/status/lane-2-hosting-options.md).
- [Full local-stack guide at that commit](https://github.com/WangPantopus/creator-platform/blob/69ca75941dcaad02dda700d548971006a5bbd9a9/infra/local/README.md).

The founder's [one-page hosting options](https://claude.ai/artifact/QwDJv6WYbo8bdpaKCHUqkB)
are unchanged. This audit changed no price or hosting recommendation and did not repeat the research.

Session 1 passed E2.1 (22 steps), E2.2 (144 steps) and E2.9 (19 steps); none was re-run in this
documentation-only resume audit. E2.2's fully open host and build-revision binding remain not run.
E2.9 demonstrated five export domains, not delete or all eight domains. E2.3 through E2.8 remain
not run. Re-run commands are in the linked handoff; use a checkout containing the relevant work.

### Founder decisions in this resumed session

- **Approved:** lane 1 may explicitly mark calls and voice as `not_offered`, so those rows do
  not block pilot readiness. This approval does not permit suppressing failures for an offered
  capability. Ticket: lane 1, Trust readiness/probes; lane 2, `infra/environments.json` after the
  environment declaration contract is agreed. The integrator coordinates the shared contract.
- **Approved:** the integrator may review and implement catalogue fingerprints that ignore
  relations a role cannot reach. Ticket: integrator, `apps/backend/src/core/purpose-catalogue.ts`,
  scoped filtering and regenerated reviewed pins, with real-database verification that new
  reachable relations still change the fingerprints. See WP 2.9's findings and limits.
- Both approvals came directly from the founder in this chat. Neither change is implemented
  by this documentation pull request. The original WP 2.2 and WP 2.9 notes predate these approvals.

### Decisions still pending

- Hosting: road 1 (keep the reviewed migration tool) or road 2 (integrator changes it), provider,
  region, monthly ceiling, web/API domain and owning account. The recorded default is road 1,
  Fly.io Ashburn with Crunchy Bridge in AWS us-east-1, conditional on the scratch-database
  superuser check in the hosting note. No account, secret, purchase or deployment is authorized.
- WP 2.8 needs an explicit "Next for lane 2" or assignment naming it. WP 2.4 through 2.7
  wait for hosting. No new work package was started during this audit.

### Machine and checkout at this resume

This session uses its supplied Codex worktree. The old `lane-2/hosting-options` branch remains
attached to the previous session's worktree; it was read through Git, and that worktree was not
touched. The new documentation branch was cut from the fetched `origin/main`.

The checkout started clean. No lane 2 listener was reported by
`lsof -nP -iTCP:56420-56429 -sTCP:LISTEN`; the lane 2 temporary state directory was absent.
Docker inventory could not be verified: `docker ps -a --filter 'name=qelvora-lane2-'` failed with
"Cannot connect to the Docker daemon". Therefore no claim is made about retained containers or
volumes. Nothing was started, so there is no process or stack from this session to tear down.

The node/pnpm recipe remains the one in working agreement section 3.7 and the memory entry.
The GitHub CLI was installed but absent from PATH; the existing binary worked. The app's PR
check tool instead returned "Connect your GitHub account to continue". No credentials or
environment files were read. Use an explicit worktree `cd` for every shell call.

Local checks for this documentation change: `pnpm typecheck` succeeded (7 tasks, 6 cached);
Prettier and `git diff --check` passed. ESLint reported that Markdown has no matching
configuration, so it did not lint this file. Dependencies were installed from the offline
store (393 reused, zero downloaded). No application scenario or existing backend suite was run.

Remember: at most five data requests per fan per hour; a delete locks that fan out of that
creator; catalogue mismatch can latch the backend closed until restart. Replies were flaky
under load in session 1. Measure before promising load numbers. Do not run the E2.1 battery
casually: it uses additional lane ranges. Use only lane 2's own resources for new work.

## How to run it

`node infra/local/stack.mjs up --lane N`, then `smoke`, `status`, `down`. Full guide:
[infra/local/README.md](../../../infra/local/README.md). Scenario scripts are in
`tests/scenarios/lane-2/`: `smoke.mjs`, `seed-maya.mjs`, `e2-1-cold-start.mjs`.

## Scenarios

| ID                            | State                                                                                                                                                                                                                                                                                                                                        | Re-run                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| E2.1 ★ cold start, edge cases | Pass: 22 of 22 steps (cold start 32 s, repeat, port taken, Docker unreachable, killed mid-run, stop and up, two stacks, foreign objects, teardown). The acknowledgment passed in every run (227 to 914 ms). The AI reply is advisory: delivered in 3 of 11 full runs at load average 9 to 62, so it is not a reliable exit check on this Mac | `node tests/scenarios/lane-2/e2-1-cold-start.mjs`, `node infra/local/stack.mjs up --lane 2` |
| E2.2 ★ production host        | Session 1: 144/144 passed on the reviewed branch; not re-run in this resume audit                                                                                                                                                                                                                                                            | See the linked session 1 handoff; requires WP 2.2 code                                      |
| E2.9 ★ catalogue pins         | Session 1: 19/19 passed on the reviewed branch; delete and three export domains not shown; not re-run in this resume audit                                                                                                                                                                                                                   | See the linked session 1 handoff; requires WP 2.9 code                                      |
| E2.3 to E2.8                  | Not run                                                                                                                                                                                                                                                                                                                                      | Hosting or explicit WP 2.8 assignment pending                                               |

## Findings and tickets to other lanes

| To                 | File                                                                                                                                                                            | Change                                                                                                                                                                                                                                                                                           | Why                                                                                                                                                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Integrator         | `apps/backend/scripts/activate-wave.ts`, `apps/backend/src/modules/trust/privacy-catalog.ts` (`assertPrivacyTaskCatalog`, `assertPrivacyExtensionForReview`)                    | The content wave (101) has no review variant, so its post-apply check falls through to the final-state catalogue and throws `privacy_original_family_unavailable`. A fresh database cannot reach the full host through the reviewed operator at current `main`                                   | The stack works around it for empty databases only (`apps/backend/src/operations/local/fresh-install.ts`). Any database with data that needs the later waves is stuck                                                                                                                                                          |
| Integrator         | `apps/backend/scripts/migration-generation-roles.ts` (line 215)                                                                                                                 | The reviewed generation-purpose catalogue rejects the `growth_api` login that `db/growth-api-pool.ts` requires: "Generation-purpose wave catalogue changed"                                                                                                                                      | Two reviewed pieces disagree about the Growth API login. The stack's `--growth` skips the migration re-check once the history is complete                                                                                                                                                                                      |
| Integrator         | `package.json` (root)                                                                                                                                                           | Add scripts such as `"stack": "node infra/local/stack.mjs"` so lanes can run `pnpm stack up --lane N`                                                                                                                                                                                            | `scripts/*` and the root manifest are the integrator's                                                                                                                                                                                                                                                                         |
| Lane 3             | `apps/backend/src/modules/identity/generation-scope.ts`, `apps/backend/src/workers/generation*.ts`, `apps/backend/src/modules/commerce/generation-safety-terminal-catalogue.ts` | One generation transaction runs about 60 full catalogue verifications (about 900 statements) inside the fixed 5 second scope window (`generation_scope_matches`, `created_at>clock_timestamp()-interval '5 seconds'`). Verify once per transaction or cache, or widen the window                 | Measured at 5.1 s when the first error fired. On a busy Mac replies fail (`generation_scope_changed`, `generation_denied`), and one failure can leave an uncertain provider cost that refuses that creator's later replies ("Current creator budget or uncertain provider cost prevents admission") until the stack is rebuilt |
| Lane 3             | `apps/backend/src/workers/generation.ts`                                                                                                                                        | The idle worker repeats the terminal-discovery catalogue check every second: the database container sits near one full core per stack at idle                                                                                                                                                    | Seven stacks on one Mac                                                                                                                                                                                                                                                                                                        |
| Lane 3             | `apps/backend/src/realtime/gateway.ts`, `apps/backend/src/modules/conversation/service.ts` (thread read)                                                                        | The gateway's 2 s authority deadline closed a socket with 1013 about 2 s after subscribing (load 9 to 14); one interrupted reply coincided with three "could not obtain lock on row in relation thread" errors while a client polled the thread every second; I did not prove the poll caused it | Clients that poll or hold sockets can break the reply they are waiting for                                                                                                                                                                                                                                                     |
| Lane 3, lane 6     | `apps/web/features/conversation/ConversationScreen.tsx`                                                                                                                         | The thread screen stayed on "Loading your messages…" at load 30 although its thread request returned 200; the page polls `/api/platform/identity/session` hundreds of times. Hypothesis: the identity heartbeat re-keys the screen before it settles                                             | The web thread could not be operated end to end on this Mac                                                                                                                                                                                                                                                                    |
| Integrator, lane 5 | `infra/migrations.json` reserved entries, `apps/backend/src/workers/start.ts`                                                                                                   | The publication worker cannot start on `main`: it needs migrations 0073 and 0201, the publication scope SQL and a `creator_publication_worker` login, none of which is in the registered graph                                                                                                   | Note publication cannot be operated end to end until they are registered                                                                                                                                                                                                                                                       |
| Lane 5             | `apps/web/app/creators/[handle]`, the public creator projection                                                                                                                 | With `--growth` the backend serves Maya's public page (200, published), but the web page shows "Public AI information is updating" for a companion AI with 0 public sources                                                                                                                      | A seeded public source or a different empty state may be wanted                                                                                                                                                                                                                                                                |
| Lane 6             | `apps/web/next.config.ts` or `.gitignore`                                                                                                                                       | `next dev` rewrites the tracked `apps/web/next-env.d.ts`                                                                                                                                                                                                                                         | The stack hides and restores it; a lasting fix is the web owner's                                                                                                                                                                                                                                                              |

## Notes for whoever resumes this lane

- Fakes used by the stack, all at the outer edge: the development identity (accounts 1 to 7), a local model fake
  (`infra/local/fake-edge/model.mjs`, redirected by a Node preload that refuses to load outside a loopback
  development process). No payment processor or push gateway is run; payments are not composed.
- Never run `pkill -f` by pattern on this shared Mac. Session 1 reported running one (`pkill -f "src/server.ts"`) early,
  when only its own, already crashed, process was believed to match; it could in principle have matched another session's
  server. Stop only your own processes, by recorded pid or a verified listening port inside lane 2's range.
- The database container sets `jit=off` and no parallel workers; the stack runs `ANALYZE` after an install. Neither
  changed whether replies succeed.
