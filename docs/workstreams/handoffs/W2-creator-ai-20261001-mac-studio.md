# W2 handoff — October 1, 2026, Mac Studio session

This is the newest W2 continuation entry point. It supersedes the host, runtime and PR-state facts in [the earlier October 1 handoff](W2-creator-ai-20261001.md). That handoff still holds the full assignment: nine packages, R01–R14, C05/C08/C09/C10, O01/O15 and W2 contributions to O08/O10/O19/O21. Use the [successor prompt](../prompts/W2-resume-20261001-mac-studio.md). Full W2 remains incomplete.

## 1. The host changed: read this first

- The earlier Codex continuations ran on `Yingpengs-iMac.local` (Intel).
- This session ran on `Yingpengs-Mac-Studio.local` (Apple M2 Max, 32 GB, macOS 27.0 26A428, Xcode 27.0 27A266a, Node 24.13.0, pnpm 12.5.1, Docker Desktop 29.8.0).
- On this Mac, `~/.config/creator-platform/` did not exist, so all of these were absent:
  - the validated `w2-creator_w2_resume.pgdump` (650,776 bytes, SHA256 `a021c261…`) and the older SQL gzip;
  - `w2-receipt.json`, `w2-runtime.env`, `w2-provider.env` and `w2-debug.keystore`;
  - `secrets/openai.env`.
- Following the earlier instructions, nothing searched for credentials elsewhere.
- **Human action needed:** copy `~/.config/creator-platform/cleanup-20261001/` and `~/.config/creator-platform/secrets/openai.env` from the iMac to the same paths on this Mac, or supply a new key file. Until then the archive restore and every real-provider path stay blocked on this host: embeddings/indexing, evaluations, previews, style cards, known/unknown accounting and p95 timing. Other agents on this Mac (W3) report the same missing key.
- The designated `/Users/yingpengwang/.codex/worktrees/w2-resume/creator-platform` does not exist here. This session worked in its own isolated worktree, `/Users/yingpengwang/estimate-rescue/creator-platform/creator-ai-knowledge-runtime-8bcbbf`.
- A successor may use any clean isolated worktree from current `origin/main`. Never edit `/Users/yingpengwang/creator-platform` working files.

## 2. Delivered in this session

| Item | State |
| --- | --- |
| [PR40](https://github.com/WangPantopus/creator-platform/pull/40) idle-pool listener | **Merged** as `19a3d297d3fb7e050452b5ea1d97e813af8cfd84` (head `a791b4e4`, normal merge, main unprotected / rulesets `[]` rechecked). Real before/after outage receipt: [pool-recovery-acceptance.md](../../../artifacts/workstreams/W2/completion/20261001-mac-studio/pool-recovery-acceptance.md). Exact-head `web-and-backend` ×2 and `android-runtime` ×2 passed. The three macOS jobs were still queued at merge; `web-visual` and `ios-foundation` also fail on main itself (see §5). |
| Development synthetic licensing + Studio action-error focus | Branch `claude/w2-development-licensing` from `19a3d297`, PR listed in §7. See §3. |
| Peer coordination | §6. |
| Fresh canonical runtime + validated backup | §4. |

## 3. The new increment, `claude/w2-development-licensing`

**Why it exists.** No real `LicenseVerifier` exists anywhere: Q05's reviewed terms were deferred by the human. `service.license()`/`publish()` refused every development scope, so the canonical Studio → publish → fan pipeline could never be operated end to end, even for fictional creators. W3 asked W2 for exactly this boundary so it can compose fan generation in the canonical host.

What changed:

- **`apps/backend/src/modules/agent/development-license.ts` (new).**
  - `DevelopmentLicenseVerifier` constructs only with `NODE_ENV=development`, `W2_DEVELOPMENT_SYNTHETIC_LICENSING=true`, development identity mode and a loopback HTTP origin.
  - `verify` accepts only:
    - development scopes;
    - counsel version `development-synthetic-unreviewed`;
    - proof `development-synthetic:<creatorId>` for that same creator;
    - `text_ai`, with optional `sponsored_mentions`, and never `ai_voice`, voice consent or estate references;
    - a verified, non-recovery creator owned by the actor.
  - `isCurrent` re-reads creator authority. `isCurrentInTransaction` locks the stored `ai_license` row FOR SHARE on the caller's held client and requires an exact document hash. The creator-profile lock stays with the caller's existing lock order, as in `delivery-authority.ts`.
  - `developmentSyntheticJournalPolicy(host)` returns `{retentionPolicyVersion: "development-synthetic-unreviewed-20261001", assertPrivacyRegistered}` under the same guards. It never claims W8 registered real-fan retention hooks.
- **`service.ts`.**
  - `LicenseVerifier.synthetic?`.
  - `licensingServes(scope)`: development scopes use only the synthetic verifier, other scopes only a real one. That gates `license`, `publish` and `rollback`.
  - The development gate text reads "Record the labeled development license. It is not a reviewed license."
  - New `capabilities.syntheticLicensing`.
- **`packages/api/src/agent/contracts.ts`.** Shared `DEVELOPMENT_LICENSE_TERMS`, `developmentProofReference`, and `StudioState.capabilities.syntheticLicensing` (TypeScript type only; no OpenAPI or generated change).
- **`development-server.ts` (W2's launcher).** Installs the synthetic verifier only when the flag is set.
- **Studio `CreatorAI.tsx`/`creator-ai.css`.**
  - The License screen shows "DEVELOPMENT LICENSE · NOT RECORDED/NOT REVIEWED", explanatory text and a "Record development license" action (90 days).
  - The action is disabled with "Creator verification is pending." when the creator is pending.
  - The development banner now states the actual verification and licensing mode.
  - **Defect fix:** a failed person-initiated action (any `action()` call, or a file-selection error) scrolls the top Notice into view and focuses it, with no animation under reduced motion. Background refresh failures never move focus. Found by operating the Test page: the "Connect an approved model provider…" notice rendered out of view.

Operated on the W2 runtime (API with the flag, Next dev web):

1. While the creator was still pending, the License page showed the disabled action and the pending text, and the banner read "pending verification · synthetic license only".
2. As a synthetic development prerequisite, the fictional creator `kilnfire_w2` (`97152450-4093-4b15-9148-b12c16053956`, development actor one) was marked `verified` by an admin-role UPDATE on the owned `creator_w2` database only. W3 and W5 seed their fictional verified creators the same way. W1/W8 own real verification; this is not a W1 result.
3. A license POST through the real Studio BFF returned 200 `{"state":"active"}`. Studio state then showed the synthetic license, `capabilities.syntheticLicensing: true`, and that the verification and license gates had cleared. The remaining gates were truthful: cost cap, provider, criteria, indexed source and evaluations.
4. Each of these was refused with 403 `license_invalid`:
   - another creator's proof;
   - a claim of reviewed terms;
   - `ai_voice`.

Checks run: backend, web and `packages/api` `tsc --noEmit` pass, and eslint and prettier pass on the changed files.

**Not yet operated:**

- the error-focus behavior in a visible browser (the pane was hidden at the end of the session);
- publication with the synthetic license, which needs a provider for indexing and evaluations;
- the canonical-host composition, which is W3's.

Hosted CI on the PR head must be read before merging.

## 4. Owned resources on this Mac (all stopped normally, data retained)

| Resource | Detail |
| --- | --- |
| DB container | `creator-platform-w2-20261001`, `pgvector/pgvector:pg17` (`sha256:ac08538c…`, arm64), volume `creator-platform-w2-pg-20261001`, `127.0.0.1:55442`, database `creator_w2`, labels `com.qelvora.owner=W2`. Stopped; start with `docker start creator-platform-w2-20261001`. |
| Disposable check DB | `creator-platform-w2-check-20261001` on `127.0.0.1:55449`, database `creator_foundation`, CI's test-only password. Used for existing backend tests (18/18, T-11 10,000 pairs in 135,156 ms). Stopped. |
| Ports | web 3002, API 4102, PG 55442, check PG 55449, design reference 3122 (an ad hoc `REFERENCE_PORT=3122 node scripts/visual-reference.mjs`). All without listeners at handoff. |
| Private dir | `~/.config/creator-platform/w2-mac-studio-20261001/` (0700): `runtime.env` (PG superuser and runtime passwords, 32-byte `IDENTITY_SESSION_KEY`), `pg-superuser-password` (mounted read-only into the container), `creator.env` (`W2_DEVELOPMENT_SYNTHETIC_LICENSING`, `W2_DEVELOPMENT_ACCOUNT_ID`, `W2_CREATOR_ID`), backups. Never print or commit these. |
| Backup | `creator_w2-20261001T205957Z.pgdump`: 537,446 bytes, SHA256 `61ad84f2ff203ada5caf7fc8061f4072a6f9453271ec0866e90ddafd3972de07`, 1,277 TOC entries, ACLs included. A restoration rehearsal into a throwaway database restored 40 migrations, 1 source and 1 license. A receipt sits beside it. |

DB content (fresh canonical database, not the lost checkpoint):

- 40 registered migrations, `0001`…`0043`. Reserved `0048` is unapplied.
- Pending→verified fictional creator Maya `kilnfire_w2`, plus the fan profile `w2_studio_creator` on development actor one.
- One manual text source, "Firing notes: cone 6 glaze schedule": approved at revision 1. Indexing cannot complete without an embedding provider; its final state after the worker started was not observed.
- One active synthetic development license. 0 usage, 0 evaluations, 0 versions.

Launch recipe (equivalent to this session's scratch scripts; load secrets only into the process):

```bash
# API (W2 Studio launcher, canonical W1 sessions + W3 registration)
set -a; . ~/.config/creator-platform/w2-mac-studio-20261001/runtime.env; . ~/.config/creator-platform/w2-mac-studio-20261001/creator.env; set +a
NODE_ENV=development W2_DEVELOPMENT_MODE=true WEB_ORIGIN=http://127.0.0.1:3002 PORT=4102 \
W2_DATABASE_URL="postgresql://creator_runtime:${W2_RUNTIME_PASSWORD}@127.0.0.1:55442/creator_w2" \
node --import tsx apps/backend/src/modules/agent/development-server.ts   # run from apps/backend
# Web
QELVORA_API_URL=http://127.0.0.1:4102 WEB_ORIGIN=http://127.0.0.1:3002 QELVORA_PUBLIC_ORIGIN=http://127.0.0.1:3002 \
pnpm --filter @qelvora/web exec next dev --webpack -p 3002 -H 127.0.0.1
```

Unset `W2_PG_SUPERUSER_PASSWORD` before launching. Add the provider env only after the key exists:

- `OPENAI_API_KEY`
- `W2_SMALL_MODEL=gpt-4.1-mini-2025-04-14`
- `W2_LARGE_MODEL=gpt-4.1-2025-04-14`
- `W2_EMBEDDING_MODEL=text-embedding-3-small`
- `W2_PROVIDER_POLICY_REFERENCE=synthetic-review-only-unapproved-processor-20261001`
- `W2_MODEL_RATES_JSON`: copy the exact rates recorded in `artifacts/workstreams/W2/resume/20260930/cache-accounting-provider.json`, where `cacheWrite` equals `input`.

`store:false` is not approved zero retention, and a new policy reference means a new fingerprint and fresh evaluations.

`next dev` rewrites `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` before committing.

## 5. CI and repository facts

- `main` is unprotected and rulesets are `[]`. Recheck before every merge.
- **`web-visual` fails on main.** `playwright.config.ts` uses an undefined `visualWebURL`, the result of an old W2 merge. The W1 session took ownership and opened [PR59](https://github.com/WangPantopus/creator-platform/pull/59). W6's draft PR19 has the identical hunk.
- **`ios-foundation` fails on main.** 106 snapshot mismatches across 18 tests on hosted Xcode 27 (main run 36881231276). The W4 session's [PR53](https://github.com/WangPantopus/creator-platform/pull/53) changes the capture scale and is being verified with `swift test` on this Mac.
- macOS jobs queue for hours. Ubuntu `web-and-backend` (~2 min) and `android-runtime` (~5 min) are the fast signals.

## 6. Peer agreements made today (Claude sessions on this Mac)

| Peer | Agreement |
| --- | --- |
| **W1** (`Publish full W1 handoff…`) | Owns the `playwright.config.ts` fix (PR59). Fixing `currentSession()`, which turned an outage into a signed-out Welcome screen: it will throw `SessionUnavailableError` (digest `QELVORA_SESSION_UNAVAILABLE`) with a root `app/error.tsx` Retry. W2 needs no change unless it wraps `currentSession()`, in which case it must rethrow. Resources: container `creator-platform-w1-cc`, 55441/4111/3011, simulator "Qelvora W1 iPhone 17", AVD `Qelvora_W1_API34`. |
| **Shared device/build budget** (from W1, adopted) | One machine-wide heavy native build: `mkdir /private/tmp/creator-platform-heavy-build.lock` with an `owner` file of "<stream> <what> <ISO start>", removed when done. At most 2 creator-platform emulators (`/private/tmp/creator-platform-emulator-slot-{1,2}`, 2 cores, ≤2048 MB, `-no-snapshot-save`). At most 3 simulators (`/private/tmp/creator-platform-simulator-slot-{1,2,3}`), shut down when idle >10 min. Explicit UDID/serial only. Swap reached about 42 GB with many devices booted. The Supabase stacks, "Pantopus S1" simulator and `emulator-5558` belong to another Pantopus project; never touch them. W2 planned names: simulator "Qelvora W2 iPhone 17", AVD `Qelvora_W2_API35`. |
| **W3** (`W3: guarded conversation integration…`) | W3 owns fan-generation wiring in the canonical host on branch `codex/w3-generation-host` (new `apps/backend/src/modules/conversation/host.ts` plus `server.ts` registerFeatures). It will consume W2's `DevelopmentLicenseVerifier`, the synthetic publish path and `developmentSyntheticJournalPolicy()`, and build the model only through `modelFromEnvironment()`. W2 owns `createAgentDomain`, model/provider policy, license and journal producers and `agent/conversation-adapter.ts`. W3 seeds fictional verified creators (Maya, Devon on development accounts …0003/…0005) in its own DB. Resources: `creator-platform-w3-20261001`, 55443/4103/3003, simulator "W3 Fan iPhone", AVD `w3_fan_api34`. W3 entry points: `conversation/generation.ts` (`ConversationGenerationProcessor.recover()` held client, `context.current`, `assertDeliveryCurrent`, AbortSignal), `conversation/service.ts:304` `releaseApprovedSentence` (validates citations through the configured adapter), `send()` acceptance-initialized journal, `settle()` `sealIfInitialized`, `conversation/agent-generator.ts`, `conversation/runtime.ts`. `generationAvailable` requires `executionAttributed && journal && seal && (allowance XOR generationCostReconciliation) && citation && assertReady && assertApproved && policy.verified`. |
| **W4** (`Commit original call refunds…`) | 0048 is **final as reserved** (sha256 `16dddc80…`, commit `a010a03`), matching `PreparedGenerationJournal`. 0049 has no FK to it. W4 will tell W2 before registering it; W3 asked W8 to promote 0048 then 0049. Seams on main: `AccessService.reserveAllowance/settleAllowance/recordAllowanceOutput` (`access/scope.ts:301-378`), `CommerceGenerationAllowance.prepare` (`commerce/generation-allowance.ts:317`, unknown receipts keep the hold), `attributedGenerationCostPolicy` (`commerce/attributed-cost-policy.ts:51`, which consumes W2's journal), `createCommerceAudience(...).currentInTransaction` (`commerce/audience.ts:23`, domain tier IDs and a ~5 s lease). **No group producer exists**; unknown group membership yields no group audience. Resources: 55444/4104/3004, simulator "Creator Platform W4", AVD `CreatorPlatform_W4` (port 5564). |
| **W5** | A W5 content development server is running from worktree `w5-creator-studio-handoff-f56a24`. No exchange this session. |

## 7. Branches and PRs at handoff

- `codex/w2-pool-recovery` / PR40: merged as `19a3d297`.
- `claude/w2-development-licensing`: holds this handoff and the increment in §3; its ready PR is linked in the session's final report and in the PR list.
  - **First action:** read exact-head CI. `web-and-backend` is the relevant fast job; `web-visual` and `ios-foundation` are known main failures.
  - Then reconcile main and merge normally.
  - Operate the error-focus fix in a visible browser (Test page → Send to draft AI without a provider → the notice should be in view and focused), in both Light and Night.
- Earlier merged W2 PRs are unchanged: PR1/23/32/38/43. The original branch `codex/w2-creator-ai-handoff` is preserved.

## 8. What remains (unchanged scope, re-prioritized for this host)

1. **Unblock the provider** (human): restore the iMac's private files or supply a key. Then run the canonical sequence on a fictional verified creator: sources → indexing → criteria → ≥6-case evaluation → synthetic license → publish. Record cited previews with known/unknown accounting.
2. Merge the development-licensing PR. Review and consume W3's `codex/w3-generation-host` composition against the agent side: `createAgentConversationGenerator` readiness needs a model, the license verifier with `isCurrentInTransaction`, the audience `currentInTransaction`, conversation `assertProcessorConsent`, and a prepared journal (0048 applied/registered in the dev DB only after W8/W4 registration).
3. Then operate durable cited fan delivery (R03/R09) on web, the iOS Simulator and the Android Emulator under the device budget. Cover:
   - takeover, memory deletion, source revocation, provider timeout;
   - all-attempt known/unknown accounting and W4 weighted settlement (R04);
   - invalidation ≤5 s (R06);
   - p95 workloads (R13).
4. Re-verify W1's session-unavailable fix with a real DB stop on the W2 runtime once it merges.
5. Design and accessibility (R12) on the populated runtime:
   - artboards 4C-07/4D-02/03/04/08/5.4 at equal content;
   - actual 200% text, VoiceOver/TalkBack, reduced motion, offline;
   - success messages are still top-only `role=status`, so consider a Toast for actions lower on the page (the design system allows Toast for confirmations only).
6. R07 export/purge/family jobs, R10 shadow/digest feed (W3/W7) and R11 connectors/voice, as listed in [the finish matrix](../../../artifacts/workstreams/W2/completion/20261001/finish-matrix.md) and [backlog](../../../artifacts/workstreams/W2/completion/20261001/release-backlog.md). These are unchanged by this session.

Deferred human decisions remain prerequisites only for their production paths: Q05 reviewed license, processor/retention (Q02) and Q16 retention.
