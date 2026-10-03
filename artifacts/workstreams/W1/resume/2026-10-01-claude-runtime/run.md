# W1 runtime restoration and operated web journeys — October 1, 2026 (Claude session)

Status: **partial**. Runtime restored on fresh canonical state; web identity journeys operated in Mobile Safari; three shell defects fixed; native builds/journeys **not run** in this session. Nothing here is release evidence.

## Source and machine

- Machine: Mac Studio (not the iMac that ran the Codex handoffs). macOS 27.0 (Darwin 27.0.0), 12 CPUs, 32 GB RAM. Xcode 27.0 (27A266a), iOS 27.0 simulator runtime, Node 24.13.0, pnpm 12.5.1, OpenJDK 21.0.10, Android SDK platform 35 / build-tools 34–35 / system image android-34 google_apis arm64-v8a, XcodeGen and Docker Desktop 29.8 present.
- `~/.config/creator-platform/w1-resume-20261001` and `cleanup-20261001` **do not exist on this machine** (the retained private material lived on the iMac). Fresh development state was provisioned and labeled as new.
- Source operated: W1 stack tip `07a8b48a` (PR51 head after this session's PR42 format fix merged forward) plus the uncommitted changes later committed as `codex/w1-session-truth-20261001`, plus locally applied PR40 (`integration.ts` idle pool listener, already merged to main as `19a3d297`) and W7 PR31's Growth worker pool listener (not committed by W1; W7 owns it).

## Runtime (all W1-owned, loopback only)

| Resource | Value |
| --- | --- |
| Database | Docker `creator-platform-w1-cc` (pgvector/pgvector:pg17), volume `creator-platform-w1-cc-data`, `127.0.0.1:55441`, database `creator_w1` |
| Migrations | `apps/backend/scripts/migrate-trust.ts` applied all **40** canonical registry migrations (0001…0043) with checksums on a fresh database; reserved 0044–0060 untouched |
| Roles | `creator_runtime`, `growth_worker`, `creator_trust_runtime`, `creator_trust_worker` given generated passwords; all NOSUPERUSER/NOBYPASSRLS/NOINHERIT. Deployment grant decision: `GRANT growth_runtime TO creator_runtime WITH INHERIT TRUE, SET FALSE` (never `growth_worker`), required because the canonical host passes the interactive pool to Growth and `GrowthDatabase.ready()` demands runtime membership without worker membership |
| Private config | `~/.config/creator-platform/w1-cc-20261001/{migration,roles,runtime}.env`, directory 0700, files 0600, never printed or committed |
| API | `node --import tsx apps/backend/src/server.ts`, port 4111, `NODE_ENV=development IDENTITY_ADAPTER=development GROWTH_ENABLED=true`, `IDENTITY_SESSION_KEY` must be **base64 of 32 bytes** (hex fails) |
| Web | `next dev --webpack -p 3011`, `QELVORA_API_URL=http://127.0.0.1:4111 WEB_ORIGIN=http://localhost:3011 CREATOR_NEXT_OUTPUT=.next-w1cc-dev` (production `next start` intentionally refuses the development identity redirect) |
| Production web build | `CREATOR_NEXT_OUTPUT=.next-w1cc-build pnpm build` passed (6 turbo tasks, ~13 s) |
| Health | `/health`: foundationReady=true, identity configured (development), generation unconfigured, registered conversation, creator-ai, media, content, studio, growth; commerce absent (no Stripe sandbox env) |
| Simulator | `Qelvora W1 iPhone 17` `F802B3F6-9B90-4CE9-9A62-62A16E2A54AC`, iOS 27.0 (shared budget simulator slot 1) |

Canonical checks on the stack tip: `generate:check` (12 resources, 98 operations), `typecheck` (7 packages), `lint` pass; `format:check` failed only on `apps/web/app/verify/[id]/page.tsx` (introduced on PR42's branch) and passes after the fix.

## UI control

- Built-in browser pane: navigation and DOM reads work, but **clicks and screenshots fail while this session is not displayed** ("Browser pane is not displayed, so the page is not compositing frames"). `open_session_in` only acts while the session is on screen.
- Claude in Chrome: no connected browser.
- **Working path:** Mobile Safari inside the W1 iOS simulator, operated with the iOS Simulator tool (tap/text/screenshot are headless). Device points = screenshot pixels ÷ 3.
- Next dev quirks observed: first compile of a route and every source edit trigger "Fast Refresh had to perform a full reload", which can swallow an in-flight navigation/form post and reload the previous URL (this is the most likely explanation of the retained Team "draft resets" seen during Fast Refresh; confirm against a production build).

## Operated journeys (Mobile Safari, iPhone 17 simulator, Light)

1. Signed-out `/` → Welcome (`01`). The 844 px reference height put "Continue with Pantopus" under Safari's floating toolbar. Fixed with `min-height: min(844px, 100svh)` (`02`).
2. Continue → development chooser lists actors one–seven (`03`).
3. Actor seven (under 18): API `POST /v1/identity/complete` → `403 adult_eligibility_required`; transaction rolled back; **0 `identity_session`, 0 `fan_profile` rows**. Before the fix Welcome said only "Sign-in could not complete"; after the fix it shows "This app is for adults — This app is available to adults aged 18 and over." (`04`).
4. Actor one: session row created; redirected to Handle. Handle `Continue` was also under the toolbar → same svh cap (`05`). Safari auto-zoomed on focus because `.qv-input` is 15 px (`06`) → iOS-Safari-only 16 px rule added. Handle `w1_actor_one` persisted; Home "Your people" empty state reached (`07`).
5. Database outage (`docker stop`): before PR40 the API process **crashed** on an idle pg client error. With the idle listeners the API stayed up and answered 503. `/home` showed W7's "Temporarily unavailable" (`08`); `/identity/account` showed the new root boundary "We can't reach your account right now — Your session is kept on this device" instead of signed-out Welcome (`09`).
6. **OPEN:** after `docker start`, tapping Retry produced no new server render in Next dev (Safari); a Safari reload then landed on Welcome with "Arrival link unavailable" (`10`) although the session row was still unrevoked and refreshable (access token >15 min old, so the restore/refresh path ran). Restore did not rotate the token. Needs diagnosis: `retry()` behavior in a production build, the restore → refresh response right after a database restart (likely a 5xx treated as signed-out inside `/api/auth/restore`), and why the final URL carried `invalid_return`.

No timings here are latency measurements; dev-mode compiles dominated every step.

## Not done in this session

iOS/Android builds and installs, all native journeys, native storage/rotation/purge, public Signed destinations, Team, passkeys, Studio, design comparisons, accessibility passes, rename, CI-green chain merges. See the continuation handoff for the ordered plan.
