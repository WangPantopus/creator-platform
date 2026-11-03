# Resume W2 — Creator AI, knowledge and model runtime (Mac Studio continuation)

Continue W2 through complete implementation, canonical integration, defect fixing and real end-to-end acceptance. We are building the greatest app in the world. Work ambitiously and independently, and make sound decisions for user experience, security, efficiency, reliability and scalability.

Do not restart, narrow the scope, or stop at planning, compilation, a Welcome screen, one preview or one merged PR.

## 1. Authorization and delivery (unchanged human direction)

Already authorized; don't re-ask for routine engineering permission:

- narrow shared changes coordinated with their owners;
- synthetic real-provider verification;
- restoring isolated runtimes, tools and dependencies;
- supported native controls on owned devices;
- commits, pushes, PR creation and normal merges;
- direct coordination with peer owners.

Testing and delivery rules:

- Write no new unit tests and expand no coverage just for a metric. Use the existing checks.
- Personally launch and operate the web (Studio + fan), Android Emulator and iOS Simulator apps. Product evaluation, correction regressions and shadow replay are required app features.
- Open ready PRs, read exact-head CI, reconcile main and merge normally with no admin override, then verify main.
- Drafts are only for unfinished work. Never call a queued or failed job passed, and never hide or waive failures.
- Preserve saved data, secrets, other owners' resources, canonical authority and truthful evidence. Never invent signatures, consent, reviewed licenses, verification, provider approval or zero retention.
- A missing external prerequisite blocks only its dependent production path; continue independent work and record a concrete recommendation.

## 2. Start here

Read completely, in this order:

1. `docs/workstreams/handoffs/W2-creator-ai-20261001-mac-studio.md`: host change, delivered work, owned resources, peer agreements, priorities.
2. `docs/workstreams/handoffs/W2-creator-ai-20261001.md` and `docs/workstreams/prompts/W2-resume-20261001.md`: the full assignment, nine packages, R01–R14, preservation rules and proof limits. Their host-specific paths describe the old iMac.
3. `artifacts/workstreams/W2/completion/20261001/{README,finish-matrix,release-backlog}.md` and `artifacts/workstreams/W2/completion/20261001-mac-studio/pool-recovery-acceptance.md`.
4. `CLAUDE.md`/`AGENTS.md`, `docs/BRIEF.md`, `docs/DESIGN_PLAN.md`, `docs/BUILD_PROMPT.md` (especially §9), `docs/NAMING.md`, `docs/workstreams/{README,STANDARDS,CONTRACTS,VERIFICATION,COVERAGE,DECISIONS,OPPORTUNITIES}.md`, the four authoritative documents in `docs/source/`, `docs/workstreams/{status,coordination}/W2.md`, and the current peer handoffs, contracts and code.
5. `apps/web/AGENTS.md`: Next 16 differs from training data, so read `node_modules/next/dist/docs/` before changing web APIs. Read the installed Turborepo package's bundled docs before changing its configuration.

Keep the stack (Node/TypeScript backend, Next web, SwiftUI iOS, Compose Android) and the `Qelvora` naming rules. The brand stays replaceable.

## 3. Host facts you must re-check

- This is `Yingpengs-Mac-Studio.local` (M2 Max, 32 GB, macOS 27, Xcode 27.0, Docker Desktop). It is not the iMac where the Codex history ran.
- `~/.config/creator-platform/cleanup-20261001/` (the validated 650,776-byte archive and its companions) and `~/.config/creator-platform/secrets/openai.env` were absent here.
- Check whether the human has since copied them. If they are present, verify size and SHA256 (`a021c26165b343c162ccc7dbfdc19dd5e779cdd198ab30439d65e83c626bb69a`) before any use, and load the key only into backend processes. If absent, don't search for credentials. Keep provider and archive paths blocked and continue the independent work.
- Work in a clean isolated worktree from current `origin/main`. Never edit `/Users/yingpengwang/creator-platform` working files, another Pantopus repository, the Supabase stacks, the "Pantopus S1" simulator or `emulator-5558`.
- Several peer Claude sessions (W1, W3, W4, W5) share this Mac. Before claiming ports, devices or build windows, run `ListAgents` and message the peers with `SendMessage`.
- Obey the shared budget:
  - one heavy native build machine-wide (`/private/tmp/creator-platform-heavy-build.lock`, with an owner file);
  - at most 2 emulators (`/private/tmp/creator-platform-emulator-slot-{1,2}`);
  - at most 3 simulators (`/private/tmp/creator-platform-simulator-slot-{1,2,3}`);
  - explicit UDID/serial only, and shut down when idle.
- W2 owns:
  - container `creator-platform-w2-20261001`, volume `creator-platform-w2-pg-20261001`, `127.0.0.1:55442`, database `creator_w2`;
  - API 4102 and web 3002;
  - the disposable check container `creator-platform-w2-check-20261001` on 55449;
  - the private dir `~/.config/creator-platform/w2-mac-studio-20261001/` (runtime secrets plus a validated backup, SHA256 `61ad84f2…`).

  All were stopped normally with data retained. The launch recipe is in handoff §4.

## 4. First actions

1. Fetch `origin/main` and the PR states.
   - [PR40](https://github.com/WangPantopus/creator-platform/pull/40) is merged (`19a3d297`).
   - Find [PR65](https://github.com/WangPantopus/creator-platform/pull/65) (branch `claude/w2-development-licensing`). Read its exact-head CI, reconcile main and fix real failures.
   - Operate the action-error focus fix in a visible browser in Light and Night, at 1280×900 and 390-wide.
   - Merge it normally.
2. Check the peers' current state:
   - W1 PR59 (`playwright.config.ts` `visualWebURL`) and W1's `SessionUnavailableError` change ([PR66](https://github.com/WangPantopus/creator-platform/pull/66); W1 notes that `/api/auth/restore` still treats a 5xx refresh as signed out and that `retry()` did not re-render in Next dev). Re-verify it with a real normal stop of W2's DB while Studio is open.
   - W4 PR53 (iOS snapshot capture scale).
   - W3 `codex/w3-generation-host` / draft PR63: `composeConversationHost(runtime, config, { licenseVerifier, journalPolicy, ... })` consuming W2's development license, synthetic publish path and `developmentSyntheticJournalPolicy()`.
   - Registration of reserved 0048/0049 by W8/W4. 0048 is final, sha256 `16dddc80…`.
3. If a provider key is available, operate the full canonical sequence on a fictional verified creator (Studio UI, not SQL):
   - text and uploaded sources with rights;
   - indexing;
   - criteria, style and rules;
   - a ≥6-case boundary evaluation plus a correction;
   - the development license;
   - publish, then rollback.

   Use these settings:

   - Models: `gpt-4.1-mini-2025-04-14`, `gpt-4.1-2025-04-14` and `text-embedding-3-small`.
   - Policy reference: `synthetic-review-only-unapproved-processor-20261001`.
   - Rates: exactly those in `artifacts/workstreams/W2/resume/20260930/cache-accounting-provider.json`.

   Then record cited previews with durable known/unknown accounting.
4. With W3's composition merged or available, personally operate durable cited fan delivery on web, iOS Simulator and Android Emulator. Cover:
   - separate actor sessions;
   - takeover, memory deletion, source revocation, provider timeout and cancellation;
   - all-attempt journal receipts and W4 weighted settlement;
   - invalidation within 5 s;
   - crisis, sponsorship and membership boundaries.

## 5. Complete the remaining scope

Close every row R01–R14 and all nine packages as specified in the earlier prompt. Package 9 includes the protected export/purge/family jobs and human voice before any AI voice.

Re-prioritized gaps:

- R03/R04/R09: provider, W3 host composition, 0048 registration, W4 group producer (none exists).
- R05: real Q05 license verifier, deferred by the human. The synthetic development license serves fictional development creators only.
- R06/R07: W8 notice, effect and protected-store registration.
- R08: fresh evaluations and corrections, republish and rollback across clients.
- R10: genuine sanitized W3/W7 feed and digest; empty storage is not a trusted empty feed.
- R11: sanctioned OAuth/captions, W6 consent and transcription.
- R12: populated DG-W2-01…05 fidelity against artboards (4C-07 My AI 390×1300; 4D-02/03/04/08 1280×900; 5.4 at 1280×800; gutter 16, sidebar 248), Light/Night, keyboard, actual 200% text, reduced motion, VoiceOver/TalkBack, offline.
- R13: named p95 workloads. Accepted-message ≤300 ms, first approved sentence ≤2.5 s warm / ≤4 s cold, full ≤8 s, takeover ≤500 ms, invalidation ≤5 s. Single samples are not p95. T-11 stays 10,000 pairs / 30,000 queries / 300,000 ms.
- R14: reviewed diffs, operated clients, current checks, ready PRs, normal verified merges.

Preserve every earlier repair and proof limit listed in the earlier prompt, including:

- the same-thread lock before idempotency;
- durable pre-network admission;
- reported usage charged even when output is invalid, with missing usage left unknown;
- all-attempt/cache accounting;
- complete opaque exclusions;
- held-client authority and final sealing;
- no resurrection;
- pipeline `w2-context-guardrails-10`;
- per-sentence citation support;
- revision-bound previews;
- import recovery;
- canonical sessions and RLS startup checks;
- keyboard recovery.

Never directly write W3 messages or memory, or W4 money or grant tables.

## 6. Keep records current and report truthfully

After each increment, update:

- `docs/workstreams/status/W2.md` and `docs/workstreams/coordination/W2.md`;
- the finish matrix and backlog;
- a sanitized receipt under `artifacts/workstreams/W2/`: source SHA, host, actors, device, theme, viewport, provider config, actions, persisted outcomes, measurements and limits.

Take validated private backups (dump, list, checksum, restore rehearsal) after meaningful milestones.

Distinguish implemented, runnable, canonically integrated, personally verified and release-ready. The final report covers:

- what reached main, plus branches, PRs and SHAs;
- operated web, iOS, Android and provider journeys;
- measurements;
- remaining defects and unverified paths;
- deferred human decisions;
- saved data and resources.
