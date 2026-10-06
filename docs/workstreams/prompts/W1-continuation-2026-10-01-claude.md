# W1 continuation prompt — copy and paste to the next primary W1 agent

You are the primary implementation agent for Workstream 1 — platform, identity and app foundations — in `WangPantopus/creator-platform`. Continue the entire original W1 assignment through implementation, integration, personally operated end-to-end verification and delivery. We are building the greatest app in the world: pursue excellent user experience, security, reliability, accessibility, performance and scalability, and carry the work through completion.

## Founder authorization (unchanged, in force)

- No resource holds. Restore dependencies, tools, databases, servers and devices; personally launch and operate the actual web app in a browser, the actual Android app in an emulator and the actual iOS app in a simulator. Builds, installs, screenshots and automated results are supporting evidence; operating the flows is required.
- Do not write new unit tests. Use meaningful existing checks; coverage may focus on affected journeys.
- Make ready PRs whenever coherent work is ready and **merge them whenever ready** — normal merge with an exact-head guard (`gh pr merge <n> --merge --match-head-commit <sha>`), no admin bypass, no force push. Validate and merge the existing PR chain in dependency order and retarget descendants. No further founder permission is needed.
- Make product, UX, security, architecture, efficiency and reliability decisions yourself and record their rationale. Credentials, domain ownership, consent, legal review, provider outcomes and device capabilities must be real; ask only for an exact input you cannot obtain or choose, and keep doing independent work.
- Personally implement and accept W1. Do not spawn subagents or delegate implementation/acceptance without explicit authorization.
- Preserve every other checkout and peer work. Never reset/clean/stash/switch `/Users/yingpengwang/creator-platform` (shared main checkout). Work in your own isolated worktree on `codex/` branches.

## Read first (in this order)

1. `docs/workstreams/handoffs/W1-continuation-2026-10-01-claude.md` on branch **`codex/w1-session-truth-20261001`** (PR66, the newest W1 tip) — exact PR stack, CI facts, machine/runtime recipe, UI-control facts, shared machine budget, peer contracts, open findings and the ordered plan.
2. `artifacts/workstreams/W1/resume/2026-10-01-claude-runtime/run.md` and its screenshots.
3. `docs/workstreams/handoffs/W1-resume-2026-10-01.md` and `docs/workstreams/prompts/W1-resume-2026-10-01.md` (full scope: all seven W1 groups and every H01–H20 obligation, exact design sources, preserved invariants), plus `docs/workstreams/handoffs/W1-platform-identity.md` (H01–H20 table).
4. `docs/workstreams/{README,STANDARDS,CONTRACTS,VERIFICATION,COVERAGE,DECISIONS,OPPORTUNITIES}.md`, `docs/BRIEF.md` (copy rules §11), `docs/BUILD_PROMPT.md` §9, `docs/NAMING.md`, the four `docs/source/` documents, `docs/implementation/W1-identity-authority.md`, applicable `AGENTS.md` (before web edits read the installed `apps/web/node_modules/next/dist/docs/`; before Turbo changes read the installed turbo `docs/`).

## Starting state (verify; it changes quickly)

- PR stack: 16 → 21 → 22 → 26 → 28 → 29 → 35 → 42 → 48 → 49 → 51 → **66**; plus PR59 (Playwright `visualWebURL` CI fix, main) and PR62 (development actors three–six + under-18 actor seven, main). PR16/51/59/62/66 ready; 21–49 drafts. Main has W2's PR40 (idle pool listener) that the stack lacks — merge main into the stack before landing it.
- CI: web-visual fails everywhere until PR59 merges; ios-foundation fails on main until W4's PR53 (`ReferenceScaleWindow`, root-caused to reported 1× backing scale on hosted Xcode 27) is confirmed on a hosted run — **W1 owns NativeSnapshotTests and decides/merges PR53** (W7 PR31 carries the identical change). Inspect checks with `gh pr checks` / `gh run view --log-failed`; queued or cancelled is not a pass.
- Machine (Mac Studio): Xcode 27/iOS 27 runtime, Node 24 + pnpm 12.5.1, JDK 21, Android SDK (platform 35; only `android-34;google_apis;arm64-v8a` image), XcodeGen, Docker. The iMac's private archives do not exist here. W1 secrets: `~/.config/creator-platform/w1-cc-20261001/*.env` (never print/commit). W1 DB container `creator-platform-w1-cc` (pg17+pgvector, 127.0.0.1:55441, `creator_w1`, all 40 canonical migrations, stopped, volume kept). W1 simulator `Qelvora W1 iPhone 17` `F802B3F6-9B90-4CE9-9A62-62A16E2A54AC` (shut down). Ports W1: API 4111, web 3011.
- UI control: the built-in browser pane only accepts clicks/screenshots while the founder is viewing the session; Claude in Chrome had no connected browser; **Mobile Safari in the iOS simulator via the iOS Simulator tool works headlessly** for web journeys. Android: operate the emulator UI with computer-use; use `adb -s <serial>` only for install/launch/logs/deep links.
- Shared machine budget agreed by all streams: one heavy native build via `mkdir /private/tmp/creator-platform-heavy-build.lock` (+ `owner` file); ≤2 emulators via `/private/tmp/creator-platform-emulator-slot-{1,2}` (2 cores, ≤2048 MB, `-no-snapshot-save`); ≤3 simulators via `/private/tmp/creator-platform-simulator-slot-{1,2,3}`; shut devices down when idle; explicit UDID/serial only. Pantopus-project devices/containers are not ours.
- Waiting on W1: W8 is building a reviewed loopback-only trust `local-development` mode + `createDevelopmentTrust(runtime)`; **do not relax trust guards or wire trust yourself** — compose W8's exports into `apps/backend/src/server.ts` when W8 sends them, then operate genuine creator proof review (no product path to a verified creator exists today). Ping the W5 successor when ops review can approve a real proof and when PR35 lands.

## Immediate priorities

1. Fetch, inventory live PRs/CI/main, restart the W1 runtime (recipe in the handoff) or rebuild it from scratch with fresh secrets on another machine.
2. Merge PR59, PR62 and (after hosted confirmation) PR53 when their checks pass.
3. Under the build lock, generate the iOS project from `apps/ios/project.yml` and build the shipping iOS app with normal signing; build the shipping Android app; verify effective API/link-host configuration and real URL handling; fix every compile/runtime defect in the never-compiled PR42/48/49 native source.
4. Operate the combined tip on web, iOS simulator and Android emulator; then ready and merge the chain in order through PR66.
5. Resolve the open outage/restore finding (restore must not treat 5xx as signed out; verify `retry()` in a production build) and the other open findings in the handoff.
6. Continue H02/H03 native storage/rotation/purge/isolation (including issuer/origin binding of stored credentials), H14 public Signed destinations on all clients, H04/H10 with W8's trust composition, H08 Team, DI09 intro offer, one-ID call lookup, Studio phone/desktop and the O19/Q15 native Studio scope decision, H15 design/accessibility, H17 rename, H18 measurements, H19 opportunities and H20 reconciliation — exactly as enumerated in the earlier handoff.

Record every decision, keep `docs/workstreams/status/W1-resume.md`, `docs/workstreams/coordination/W1.md` and sanitized evidence current (revision, environment, device/OS, viewport, theme, provider, personally performed steps, persisted outcome, failures, timings, limitations). Keep credentials, cookies, assertions, private content and keys out of evidence. Separate implemented, runnable, integrated, personally verified and release-ready. W1 is not complete — carry it through.
