# W2 handoff — October 1, 2026

This is the current continuation entry point for **Creator AI, knowledge and model runtime**. Use the complete [copy-paste successor prompt](../prompts/W2-resume-20261001.md). Preserve the original assignment, nine packages, R01–R14, C05/C08/C09/C10, O01/O15 and W2 contributions to O08/O10/O19/O21. Full W2 remains incomplete.

**Workspace release after PR52:** The human requested removal of W2 worktrees to free storage once source custody was checked. The dedicated `w2-resume/creator-platform` worktree and this task's detached `3e07/creator-platform` checkout were clean. Every earlier local W2 implementation branch matched its pushed remote; their code is covered by merged PR1/23/32/38/43 or open PR40. The handoff source is on merged PR52. The only W2 ignored files in the dedicated worktree were generated build/cache/project outputs. Their removal does not delete the original private PG archive or remote branches. **Check whether the designated worktree still exists before following any local command below. If it has been removed, recreate a fresh isolated checkout at that exact path from current `origin/main` using the existing local Git repository, then continue there.** Fetch current main and PRs again. This bootstrap exception may use the existing repository's Git metadata; do not edit the shared checkout's working files. The separately merged storage-release documentation PR records this instruction; neither checkout needs to remain merely to preserve committed W2 source.

## Latest human direction and precedence

The human asks for ambitious, autonomous execution toward the greatest app in the world, with no artificial engineering restrictions or holding back. Personally finish implementation, integration, defect fixing and actual acceptance. Make sound decisions for user experience, security, efficiency, reliability and scalability; do not repeatedly request routine engineering permission or stop at a plan, build, preview or first PR.

The only requested testing limitation is no new unit tests or coverage expansion for its own sake. Use appropriate existing checks and personally launch and exercise end-to-end **web, Android Emulator and iOS Simulator** apps. Compilation, a component catalog or a Welcome screen cannot substitute for integrated app operation. Product evaluation/correction/shadow features remain required.

**Create ready PRs whenever the work is ready, and merge PRs normally whenever the work and validation are ready.** Do not leave completed work indefinitely in draft. Drafts are temporary for unfinished work; inspect current policy and actual failures, fix relevant defects, reconcile main, verify the exact published head, merge without an admin override, and verify the result on main. Do not invent additional permission gates or call queued/failed jobs passed.

This October 1 human direction supersedes temporary “keep runtimes off pending clarification,” the unanswered native-control permission question, obsolete “frozen increment only,” and stricter historical testing restrictions. The successor is authorized to restore the minimum isolated runtime, install necessary official dependencies/tools, use available supported native controls, build and operate owned devices, and continue engineering without reasking those questions. It does not mean that runtimes have already been restored.

Protect saved data/secrets and other owners' resources, preserve canonical authority and truthful evidence, and implement real prerequisites rather than asserting nonexistent signatures, consent, reviewed terms or processor approval. A genuinely missing external decision blocks its dependent production path only; finish independent work and prepare concrete recommendations/backlog entries. Synthetic real OpenAI review, narrow shared integration changes, commits/pushes/PRs/normal merges and direct coordination with seven peers were already authorized. Do not delegate W2 implementation or acceptance.

## Git checkpoint

Only use `/Users/yingpengwang/.codex/worktrees/w2-resume/creator-platform`. Do not modify `/Users/yingpengwang/creator-platform`, the default 3e07 worktree or other Pantopus repositories. Remote: `git@github.com:WangPantopus/creator-platform.git`.

At final handoff preparation, fetch confirms main **`58efc7c5d024d658244dadbb3fdf24cb0a31b3b2`**, including W4 PR39's held creator financial-read guards (`c1c615e6…`) and W8 PR50's documentation handoff. The documentation branch normally fast-forwarded to that main while retaining W2 edits. That is a source checkpoint, not fresh W2 app acceptance. Handoff documentation starts from this main on **`codex/w2-handoff-20261001`**. Recheck main, open PRs, peer contracts and actual local changes before continuing.

| Increment | Preserved branch / exact published head | Delivery |
| --- | --- | --- |
| Original W2 | `codex/w2-creator-ai-handoff` / `9f805888932c63c5a59d1efab29a7a4f47a42a98` | [PR1](https://github.com/WangPantopus/creator-platform/pull/1) merged `0a9a9a74b063ca7ddbd43bbcee6585935ad62ecf` |
| Canonical sessions, storage readiness, import recovery | `codex/w2-completion` / `1b044502a75ce2c701c9e5a4a4d05057c988e5bd` | [PR23](https://github.com/WangPantopus/creator-platform/pull/23) merged `0d1179980e6d0d3640fd226c485c9d2abffb95ab` |
| Companion citations, revision-bound previews, keyboard recovery | `codex/w2-acceptance` / `35dd3a35b1793e5abbdb3868956c9d3cf84401ba` | [PR32](https://github.com/WangPantopus/creator-platform/pull/32) merged `d31afb6e1c972f6a1ce547438b2aa8b575637d74` |
| Real ingestion process recovery/evaluation, transcript wrap | `codex/w2-source-recovery` / `107208526c87ede35b7ebb71a67c4ac7d13720d0` | [PR38](https://github.com/WangPantopus/creator-platform/pull/38) merged `a92b04757378108e3a88b7c03f71e8a68e66c6ec` |
| Cleanup/data-loss documentation | `codex/w2-cleanup-receipt` / `3cfb87888b45560e16d66248f3f0157929099482` | [PR43](https://github.com/WangPantopus/creator-platform/pull/43) merged `ef3619bb35579963c1c86fafa91ad09b3e18552c` |
| Idle PostgreSQL failure listener | `codex/w2-pool-recovery` / `3a76192e5a129dc0c0bb327ff53d46106dd048cd` | [PR40](https://github.com/WangPantopus/creator-platform/pull/40) **open draft**, unmerged, real post-fix acceptance pending |

Do not duplicate/reopen merged PRs. Preserve all branches and uncommitted work; no reset, force push or broad clean. Reuse PR40 for its existing increment, normally integrate fresh main, then create coherent continuation branches/ready PRs for subsequent work. Documentation branch main does not contain PR40's unmerged listener.

## First concrete repair to finish

Cleanup removed PostgreSQL while the backend had an idle `pg.Pool` connection. The API crashed on an unhandled pool error; raw client/error internals are excluded from evidence. PR40 adds five lines to `apps/backend/src/integration.ts`: an early `pool.on("error", ...)` listener emits only a fixed sanitized diagnostic. Existing active query rejection, readiness, authority, role verification and pool lifecycle remain intact. W1 was informed of the narrow shared edit. See [pool checkpoint](../../../artifacts/workstreams/W2/completion/20261001/pool-recovery-checkpoint.md).

After safe recovery, launch the actual backend/web, establish an idle connection, **normally stop only the owned PostgreSQL container while retaining its volume**, observe API survival and truthful unavailable operations, restart PostgreSQL, then operate an authenticated persisted Studio read/preview and inspect known/unknown accounting. Verify no secret-bearing diagnostics or authority bypass. Back up before and after this milestone. Do not reproduce destructive cleanup by removing the volume. Fix any actual defects, finish relevant checks, mark PR40 ready and merge normally when ready; it is not a permanent draft.

### Fresh CI facts, observed 19:31 UTC

[Current exact-head receipt](../../../artifacts/workstreams/W2/completion/20261001/handoff-pr40-ci.json) supersedes earlier queued-status observations for PR40 head `3a76192…`:

- Both web/backend, both Android foundation and both Android runtime jobs passed.
- Both web visual jobs failed. PR run `36878309916`, job `110423341374`, reports `ReferenceError: visualWebURL is not defined` at `playwright.config.ts:14` before cases start.
- Both iOS foundation jobs failed. PR job `110423340809` on hosted Xcode27/macOS27 reports 106 snapshot assertion failures across 18 existing package tests. Reference mismatches are observed; their underlying cause/fix is **not established**.
- Main protection returned `404 Branch not protected`; rulesets returned `[]`. Recheck every future merge. No failure is waived, hidden or converted into a pass by this observation.

Inspect current main and W1 work before repairing shared CI/native configuration; a later canonical fix may already exist. Fix genuine relevant failures without lowering assertions, changing references to hide a defect, skipping jobs or bypassing protections. Historical PR38 backend18/18 and unchanged T-11 51,264 ms remain dated proof, not current native/visual success.

## Data recovery: do not confuse checkpoints

The cleanup coordinator removed W2's live container and volume before a fresh dump. Later ignored `tmp`, partial owner exports, dependencies/builds, SDK/AVD caches and owned simulator data were removed. Latest full database recovery is unavailable. Browser error pages/cached screenshots and tracked receipts are not backups.

Protected original:

`/Users/yingpengwang/.config/creator-platform/cleanup-20261001/w2-creator_w2_resume.pgdump`

- PG17 custom dump; **650,776 bytes**.
- SHA256 **`a021c26165b343c162ccc7dbfdc19dd5e779cdd198ab30439d65e83c626bb69a`**, rechecked during this handoff.
- Its previous successful restoration preserved **123 sources / 105 immutable versions / 20 evaluations / 658 usage rows / 28 original migration rows**.
- Primary companion draft 18, secondary expert draft 6 at actual restore. Historical expert 17 evidence does not mean the backup's current draft is 17.
- Last live pre-loss state: **125 / 105 / 25 / 939**, 40 migrations, companion 19/expert 27. Both paused, pending verification, zero cap, no live license pointer. Five later evaluations and 281 usage records plus source/configuration/lifecycle changes have only partial committed evidence; do not fabricate their historical identities/authority/costs through SQL or fixtures.

Associated private originals in the same cleanup directory: `w2-receipt.json`, `w2-archive-list.txt`, `w2-runtime.env`, `w2-provider.env`, `w2-debug.keystore`, and `creator-platform-w2-resume-20260930.sql.gz`. The SQL gzip is also an older checkpoint (20 evaluations/658 usage/28 migrations); it is not the missing latest database. Preserve originals, avoid printing private contents, never commit archives/configuration/signing material/raw fan data. The later exports removed from tmp are no longer recovery inputs.

Restore the validated archive into a new isolated owned PG17/pgvector database using canonical non-owner/forced-RLS roles. Inspect ledger/catalog first. The prior dump had data/policies but lacked ACL sections: build an empty canonical reference with the existing migration runner, reconcile **ACL only** transactionally, preserve original 28 ledger checksums **and timestamps**, then apply only registered additive migrations. Never replay baseline DDL/policy/data over the restored schema or rewrite applied SQL. Prior 40-migration catalog comparison hash `950ff40baa66407f11a0fcbed4af31bf37e43bafda4cc78b771d80d3d5e90d60` is historical; recompute against current canonical main. The reference shared cluster roles, so it was not an independent role-bootstrap experiment.

W8 reserved 0048 was unregistered/unapplied, checksum `16dddc80bebe32979f822104d8f411e0f545b4e212da6dc147c72f959e660f17`. Check the current registry; allocation alone does not authorize activation without canonical journal/privacy/family/worker lifecycle and W3 acceptance initialization. Request additive allocation for actual new schema needs.

Recreate intended newer settings via canonical product actions with new revision/evaluation identity, rather than asserting full restoration of lost state. Verify RLS/startup denial and publication gates, then take a new private validated dump after meaningful milestones. Never delete a volume until a nonempty archive/list/checksum and successful restoration rehearsal are confirmed.

## Runtime and secrets

Preferred owned review ports: web 3002, API 4102, PG 55442. Check actual listeners, tools/Docker, peer leases and current device inventory before claiming them. Last runtime inspection had no listeners; old owned simulator UUID `90EC068E-4631-4EFC-886A-78800EA30A53` data is absent, old AVD/SDK/tmp paths removed. The new authorization permits rebuilding only needed resources with bounded concurrency, one heavy native build/device window at a time. Stop idle owned services/devices normally, retaining validated data; never prune/reset shared Docker or peer devices.

OpenAI key: `/Users/yingpengwang/.config/creator-platform/secrets/openai.env`. Load directly into the backend process only; never print, copy to browser, dump env, log or commit it. Historical model pins: `gpt-4.1-mini-2025-04-14`, `gpt-4.1-2025-04-14`, `text-embedding-3-small`. Preserve rates and fingerprint semantics; configuration changes require new evaluations. `store:false` does not establish approved zero retention. Keep exact loopback `127.0.0.1` host configuration and canonical session authority.

Native CUA was unavailable; supported official native controls may now be installed/used within the authorized owned-device scope. Do not reinterpret the earlier unanswered tool question as a blocker. Supported UI/API boundaries still apply; do not bypass them or use hidden frontend state as a fabricated backup. A temporary checksum-verified GitHub CLI was used for this documentation delivery, not to restore app dependencies.

## Preserve implemented behavior and proof limits

Keep pipeline `w2-context-guardrails-10`, exact support for each cited sentence in all modes, stale/dirty preview clearing and revision binding, keyboard Cancel/Tab/Escape/focus recovery, source upload bounds/reselection/dedup, canonical W1 sessions/W3 registration and non-owner startup checks. Preserve same-thread exclusive locking before idempotency; durable pre-network provider admission; valid reported usage charged even for invalid output; invalid/missing usage unknown; all-attempt/cache accounting; safety/classification/memory/ingestion costs; captured completion restricted to its original admission; full opaque exclusions; current authority held on the actual W3 execution client and final sealing; no deleted-state resurrection.

Before loss, actual process SIGSTOP/SIGKILL and natural lease expiry yielded attempt 2 recovery of 171 exact revision 3 chunks, then real UI revocation removed them. Unknown admitted usage remained unknown. Fresh expert 27 evaluation `5bb9de9e-10e9-4c72-9a05-001457b0f0ba` passed 7/7; companion 19 `d2543ead-5f44-4125-af64-392f6a9fa70c` passed 8/8. Last actual cited companion preview first 6,134 ms/full 6,182 ms, cost 2,405 USD-micros matched four durable charges. These are dated provider/product results, not current recovered evaluation authority or performance acceptance.

Real desktop/phone Light/Night Studio source/style/test/license/My AI/onboarding, focus/rights/offline/reconnect/reduced motion and wrapping were operated. Actual iOS/Android builds/Welcome launches occurred in the October continuation; earlier September 30 iOS 2/2 and Android 4/4/Night sign-in are historical. **Fresh authenticated licensed native fan delivery, genuine 200% text, VoiceOver/TalkBack and complete fidelity remain unaccepted.** Doubled-display reflow is not 200% text. Two-tab actor proof did not establish separate session cookies. Latest preview UI JSON explicitly lacks captured HTTP response body. Do not upgrade these boundaries in the next report.

Preserved sources/evidence: [October completion index](../../../artifacts/workstreams/W2/completion/20261001/README.md), [finish matrix](../../../artifacts/workstreams/W2/completion/20261001/finish-matrix.md), [decision/integration backlog](../../../artifacts/workstreams/W2/completion/20261001/release-backlog.md), [resource loss](../../../artifacts/workstreams/W2/completion/20261001/resource-loss-checkpoint.md), [process recovery](../../../artifacts/workstreams/W2/completion/20261001/source-process-recovery.md), citation and source-process manifests, provider/evaluation/preview/CI receipts. September 29/30 handoffs and artifacts remain historical context.

## Canonical integrations and remaining acceptance

Read current producer/consumer code and peer statuses; dated missing dependencies are not assumptions about current main. W1 owns identity/verification/bootstrap; W3 durable conversations/delivery/memory; W4 money/grants/membership/settlement; W5 approved Notes/public-answer content; W6 media/transcription/provenance; W7 trusted feed/digest/scheduling; W8 migrations/notices/privacy/export/retention coordination. Do not write W3 messages/memory or W4 money/grant tables directly. Implement W2 adapters and narrow shared composition in coordination with owners; their genuine authority must be held on the actual execution client.

Last peer observations, to recheck: W3 PR36 consumers/final seal existed but authentic licensed fan composition remained unavailable; W5 had no approved Notes/public-answer held-client producer; W8 protected store/job/family/notice authority and retention/journal lifecycle were unconfigured; W7 genuine sanitized feed/digest registration absent. Do not treat empty local conversation storage as a trusted empty feed, or omit required W3 intro/off-record/exclusion/memory/tail merely because optional Notes/public answers are unavailable. W4 PR39 is now main and requires genuine current creator restrictions for financial reads; account-only checks on another connection are insufficient.

The successor prompt enumerates all nine packages and R01–R14. Priority: restore safely and finish PR40; reconcile CI/main; compose actual licensed fan context/delivery and all-attempt weighted settlement where canonical prerequisites exist; then complete evaluation/correction/versioning, sources/connectors, trust/export/purge, shadow/digest, accessibility/design/performance and all client journeys. External prerequisites gate only their dependent path; continue independent work.

Design source dimensions: 4C-07 My AI 390×1300; 4D-02 Sources/4D-03 Style/4D-04 Test/4D-08 License 1280×900; 5.4 onboarding 1280×800; phone gutter 16, desktop sidebar 248. Require matching populated content/theme/scroll, shared tokens/fonts/copy, DG-W2-01…05, keyboard, actual 200% text, reduced motion, VoiceOver/TalkBack and offline/reconnect on real clients.

Performance targets remain accepted-message p95≤300 ms, first approved sentence p95≤2.5 s warm/4 s cold, full reply≤8 s where specified, takeover p95≤500 ms, invalidation≤5 s. Record actual device/network/configuration/concurrency/window; single samples are not p95. Existing T-11 remains 10,000 pairs/30,000 queries/300,000 ms; do not relax it. Separate implemented, runnable, canonically integrated, personally verified and release-ready for every row.

## Direct peer coordination

Human authorization to message these existing peer chats persists; coordination must not outsource W2 implementation or app acceptance. Inspect current titles/statuses before identifying them to the human.

| Owner | Chat ID |
| --- | --- |
| W1 | `01a0f6b3-1ccf-7ab2-b22a-39e62872bf79` |
| W3 | `01a0f6b4-d8e4-7020-aa34-919424057469` |
| W4 | `01a0f499-9762-7ba3-b3b4-fd12eb66c744` |
| W5 content | `01a0f13e-785a-7890-b9b8-d8dfb208f2b9` |
| W5 cleanup coordinator | `01a0f499-bfee-7351-a9e6-04fb34a8fb9b` |
| W6 | `01a0f141-469a-7410-8799-3325a79df2e2` |
| W7 | `01a0f49a-120e-7241-b224-07c7bda9d8d2` |
| W8 | `01a0f49a-35fb-76c2-b1b4-e92b25a8f76d` |

Read applicable AGENTS/CLAUDE and the installed Turborepo bundled docs before changing its commands/configuration. Honor canonical source documents and latest human decisions over obsolete handoff restrictions. Keep the matrix/status/coordination/backlog, sanitized evidence and private recoverable backups current. Open ready PRs, merge ready PRs normally, verify main, and continue until the full applicable work is finished. Report genuine external prerequisites precisely without representing them as engineering permission holds.
