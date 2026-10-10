# Lane 5 — Presence and reach

Current state: 2026-10-09. Read [lane-5-handoff.md](lane-5-handoff.md) before
resuming. Work is single-agent. No new unit tests, PR merges, pushes to main,
force pushes, rebases or automatic merges were made by this session.

**The launch work is not all complete.** Unblocked lane 5 changes are implemented;
missing owner connections have tickets and observed failures. Migration
registration, other lanes' code and remaining founder decisions gate the rest.

Main is `21b3d4836` (integrator's #381, Anthropic adapter), merged normally into
`lane-5/reaction-withdrawal`. Earlier branches retain their recorded bases.

**Merge-order correction:** #372 merged to main at 23:17:30 UTC; #373 merged into
the already-closed delivery branch at 23:17:44 UTC. Main lacks the mute fix.
#385 carries both mute SQL and notice-record SQL and remains first for registration.
The founder requested all PRs open in the final handoff, so #397–#400 are now
drafts too. This waives the hold on opening those four proposals only; migration
review/registration remains serial, and no merge permission is granted.

| Work                                     | Branch / PR                                                                                 | Current result                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Notes/reactions in the thread; producers | #365, #366 merged                                                                           | Built; do not redo                                                                        |
| Delivery queue and retry                 | #372 merged                                                                                 | Built; #373 merged only into its branch                                                   |
| Mute and owner notice records            | `notice-snapshots`, [#385](https://github.com/WangPantopus/creator-platform/pull/385)       | Open, first migration registration; lanes 3/4 owner calls still needed                    |
| Public post withdrawal                   | `public-withdrawal`, [#388](https://github.com/WangPantopus/creator-platform/pull/388)      | Draft; five API checks pass                                                               |
| Public page cache/rendering              | `public-page`, [#389](https://github.com/WangPantopus/creator-platform/pull/389), base #388 | API/browser/restart/outage pass; authoring/capacity missing                               |
| Human-only share cards                   | `share-card`, [#392](https://github.com/WangPantopus/creator-platform/pull/392)             | Approved correction built; three refusal checks pass; positive owner path not run         |
| Launch kit                               | `launch-kit`, [#393](https://github.com/WangPantopus/creator-platform/pull/393)             | API/checklist pass; share button fails on missing BFF route                               |
| Android offline push                     | `push-offline`, [#394](https://github.com/WangPantopus/creator-platform/pull/394)           | Eight gateway cases + restart pass; real devices not run; iOS held                        |
| Digest owner handoff                     | `digest-owners`, [#395](https://github.com/WangPantopus/creator-platform/pull/395)          | Two stock checks expose missing connections; five workflows not run                       |
| C9 metrics owner handoff                 | `metrics-contract`, [#396](https://github.com/WangPantopus/creator-platform/pull/396)       | Three pass, one failure: attribution/follow exist but metrics do not                      |
| Invite note and approved form            | `invite-entry`, [#397](https://github.com/WangPantopus/creator-platform/pull/397)           | Fresh API 8/8, form 3/3; migration queued; first AI answer recovery fails                 |
| Profile fields                           | `profile-fields`, [#398](https://github.com/WangPantopus/creator-platform/pull/398)         | Migration queued; stock startup fails catalogue review; API not run                       |
| Creator web push                         | `web-push`, [#399](https://github.com/WangPantopus/creator-platform/pull/399)               | Six gateway cases + restart + three stock registration cases pass; browser worker missing |
| Reaction withdrawal check                | `reaction-withdrawal`, [#400](https://github.com/WangPantopus/creator-platform/pull/400)    | Approved reader built; six cases + restart pass; migration/privacy review queued          |

Branches have the prefix `lane-5/`. All open PRs except #385 are drafts. The
handoff maps branch heads, concern notes, exact rerun commands and owner tickets.
The ready-to-copy kickoff is [lane-5-next-session.md](lane-5-next-session.md).
Publication brought #397–#399 forward from main by ordinary merge, with no product
change. Their older workflow evidence was not rerun for this handoff. New draft CI
was still starting/running at its initial check; do not interpret that as green.

Founder approvals are carried forward: option A; mute reader; Notes at read time;
earlier Notes for new members; no reaction undo; silent edits; no follower/group
fan-out; invitation label/hint; human-only share cards; web-push download; limited
reaction reader. **iOS retention stays held** until lane 7 supplies safe background
presentation. Do not ask these questions again.

Still waiting: biography/date copy; real domain/app identifiers (Q4); aggregate
privacy review (Q5); metrics cohort assignment and a durable replay contract.
Existing copy and privacy thresholds stay in force. No guessed cohort or authority.

The latest reaction work uses the real server/PostgreSQL, existing identity,
passkey and owner-outcome fixtures, and a controllable push recorder. Withdrawal
before the final check produces `suppressed`, zero submissions. Missing SQL waits;
recovery and process restart do not duplicate. Existing audience/lifecycle/reaction
checks passed 26/26 (undo excluded), and notice checks passed 5/5. See
[reaction evidence](lane-5-reaction-withdrawal.md).

After merging main, the six new cases and restart passed again; existing backend
tests passed 157/157 in 212.17 seconds, seven typecheck tasks and changed-source
lint passed. Final cleanup verified no lane 5 containers, hosts or listeners on
56450–56459. Temporary development keys were removed; nothing remains running.

Not all star rows are green: share E5.7 positive creation/revocation and profile/
capacity parts of E5.5 remain unproved. Real devices, Studio browser push, digest
counts, sixteen metric events and the ten-fan view remain **not run**. Launch-kit
sharing, missing arrival/follow metrics, profile catalogue startup and first-answer
restart are observed failures. An invite burst returned two unexpected 503s at
load 23–25; a clean 8/8 repeat does not establish their cause. No guard, review
checksum, money rule or failed expectation was bypassed.
