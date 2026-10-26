# Open PR reuse audit — October 25, 2026

The founder asked that existing work be checked before continuing. GitHub returned
**65 open pull requests, including 21 drafts**, in one complete `per_page=100`
response. All65 heads were fetched/read locally and checked against final #514
(`47188ddba`), final #515 (`7eefeaf5d`) and current #516 (`6023517ad`).
No PR was merged, closed or retargeted by this audit.

## What must be reused

Twenty-one older PR heads are exact ancestors of both #514 and #515. They include
#511 and its20 listed constituent open heads. Their source is already integrated;
open status alone does not mean the work is missing. Memory/context proposals
#490/#492 are included as source but remain inactive, requiring separate qualified
waves. #451's workspace-lock SQL is already registered as0252.

The three current integration PRs #514/#515/#516 remain preserved. The remaining
41 PR heads carry work outside #514; many overlap one another in cumulative
stacks. Non-ancestry is not a recommendation to blindly apply whole branches.
`git cherry` found no patch-equivalent commits for those41 heads against #514,
but semantic overlaps still require the reconciliation below.

The native stack through #508 contains all23 lane7 heads and74 nonmerge patches
outside both #514 and #516. #452 already implemented native Notes/reactions with
older caching rules. #516's newer five-second access window and atomic concealment
must survive reconciliation; #452 retains valuable ordering/accessibility/scroll
scenarios. #462 overlaps newer C1 adult-refusal handling. Preserve current identity,
session and authority checks when reusing either stack. #394 is a separate patch.

Share-card work already exists in #392 and #459. Use their original source and
adapters before filling native grant/handle/composition gaps. #400 already covers
background reaction-notice suppression; do not rewrite it as a new implementation
or combine its extra SQL into0254. #488 already contains Studio live updates.
#512/#513 contain the remaining scenario correction and My AI split; the split
must retain #514's later FAQ draft restoration fix.

## The next denial wave is distinct

Across every one of the65 live heads:

- #515 alone registers0253; #514/#516 stop at0252; no head registers0254.
- `0089_w8_creator_fan_denial.sql` is byte-identical everywhere, SHA-256
  `0a738e0a29c77e65274931d4054b5db26a340b8c10a498e8c016457ab1a22860`.
- No head contains the new creator/fan catalogue guard file. All-ref history
  searches found no earlier `assertCreatorFanDenial` or
  `creatorFanDenialCatalogue` implementation.

The original SQL and SQL-by-name callback already exist and are being reused.
Only additive registration, exact executable/ledger/catalogue admission, fresh122
and independently restored121→122 qualification, and actual signed workflow
acceptance are new. Historical W8 purpose-denial work is already in the baseline;
the old reply-review branch has broader historical work and is not declared
wholly redundant.

Before this audit, new local0254 implementation and rollback measurements had
started, and a reaction-mode extension to existing native operated scenarios was
committed to #516. All work was preserved. No0254 migration was activated and no
runtime/native reaction acceptance was claimed. The audit permits the narrow
qualification to continue without recreating the SQL or existing UI.

## Complete live inventory

“Included” below means exact head ancestry in #514/#515, not merged to main.
“Reuse” requires review and actual qualification; draft/ready state is not approval.

| PR | State | Existing branch | Disposition |
| --- | --- | --- | --- |
| [#516](https://github.com/WangPantopus/creator-platform/pull/516) | Draft | `codex/native-presence-2026-10-22` | Continue existing PR; strict freshness reader supersedes #452 reader. Actual reaction acceptance pending. |
| [#515](https://github.com/WangPantopus/creator-platform/pull/515) | Draft | `codex/reply-review-2026-10-22` | Preserved qualified121 predecessor; new0254 stacks here. |
| [#514](https://github.com/WangPantopus/creator-platform/pull/514) | Draft | `codex/app-completion-2026-10-22` | Preserved current application integration; includes #511 and its20 constituent open heads. |
| [#513](https://github.com/WangPantopus/creator-platform/pull/513) | Open | `lane-3/b8-split-creator-ai` | Reuse existing My AI split; retain newer FAQ restoration fix from #514. |
| [#512](https://github.com/WangPantopus/creator-platform/pull/512) | Open | `lane-3/f7-hold-counted` | Reuse existing authority scenario correction; no product implementation needed. |
| [#511](https://github.com/WangPantopus/creator-platform/pull/511) | Open | `lane-3/merge-wave-2026-10-16` | Included in #514 and #515 by exact ancestry; do not recreate. |
| [#509](https://github.com/WangPantopus/creator-platform/pull/509) | Open | `lane-1/status-merged` | Status documentation only; reconcile after actual integration. |
| [#508](https://github.com/WangPantopus/creator-platform/pull/508) | Draft | `lane-7/status-7-12` | Cumulative native stack tip; reuse unique patches after reconciling #514/#516. |
| [#507](https://github.com/WangPantopus/creator-platform/pull/507) | Draft | `lane-7/studio-link` | Reuse existing native Studio links from cumulative stack. |
| [#506](https://github.com/WangPantopus/creator-platform/pull/506) | Draft | `lane-7/polling-offline` | Reuse polling/offline/frame changes; reconcile with #516 freshness. |
| [#505](https://github.com/WangPantopus/creator-platform/pull/505) | Draft | `lane-7/accessibility` | Reuse existing accessibility improvements and operated evidence. |
| [#504](https://github.com/WangPantopus/creator-platform/pull/504) | Draft | `lane-7/copy-lookups` | Reuse existing copy lookup changes; preserve current generated contracts. |
| [#503](https://github.com/WangPantopus/creator-platform/pull/503) | Open | `lane-7/status-7-4b` | Cumulative native status; documentation, not another implementation. |
| [#502](https://github.com/WangPantopus/creator-platform/pull/502) | Open | `lane-7/packet-terms` | Reuse packet terms UI from cumulative native stack. |
| [#501](https://github.com/WangPantopus/creator-platform/pull/501) | Open | `lane-7/long-session` | Reuse long-session reminder from cumulative native stack. |
| [#500](https://github.com/WangPantopus/creator-platform/pull/500) | Open | `lane-7/named-pickers` | Reuse named pickers from cumulative native stack. |
| [#499](https://github.com/WangPantopus/creator-platform/pull/499) | Open | `lane-7/notification-rows` | Reuse notification rows from cumulative native stack. |
| [#498](https://github.com/WangPantopus/creator-platform/pull/498) | Open | `lane-7/chat-link` | Reuse chat-link routing from cumulative native stack. |
| [#497](https://github.com/WangPantopus/creator-platform/pull/497) | Open | `lane-7/composer-states` | Reuse composer state handling; reconcile current session/sign-in code. |
| [#496](https://github.com/WangPantopus/creator-platform/pull/496) | Open | `lane-7/comparison-placeholder` | Reuse comparison placeholder removal from cumulative stack. |
| [#495](https://github.com/WangPantopus/creator-platform/pull/495) | Open | `lane-3/f6-terminal-lock-retry` | Included in #514 and #515 by exact ancestry; do not recreate. |
| [#494](https://github.com/WangPantopus/creator-platform/pull/494) | Open | `lane-3/f5-gateway-deadline` | Included in #514 and #515 by exact ancestry; do not recreate. |
| [#493](https://github.com/WangPantopus/creator-platform/pull/493) | Open | `lane-7/android-follow` | Reuse missing scroll-follow intent fix; preserve current presence reader. |
| [#492](https://github.com/WangPantopus/creator-platform/pull/492) | Open | `lane-3/f18-context-exclusions` | Included in #514 and #515 by exact ancestry; do not recreate. |
| [#491](https://github.com/WangPantopus/creator-platform/pull/491) | Open | `lane-3/b5-memory-prompt` | Included in #514 and #515 by exact ancestry; do not recreate. |
| [#490](https://github.com/WangPantopus/creator-platform/pull/490) | Open | `lane-3/b5-memory` | Included in #514 and #515 by exact ancestry; do not recreate. |
| [#489](https://github.com/WangPantopus/creator-platform/pull/489) | Open | `lane-3/a5-ack-safety` | Included in #514 and #515 by exact ancestry; do not recreate. |
| [#488](https://github.com/WangPantopus/creator-platform/pull/488) | Open | `lane-6/no-polling` | Reuse existing Studio live-stream implementation and scenarios; reconcile newer Studio code. |
| [#487](https://github.com/WangPantopus/creator-platform/pull/487) | Open | `lane-4/decides-in` | Reuse pending public decision-range SQL; separate qualified migration wave. |
| [#482](https://github.com/WangPantopus/creator-platform/pull/482) | Open | `lane-3/a7-paint-frames` | Included in #514 and #515 by exact ancestry; do not recreate. |
| [#477](https://github.com/WangPantopus/creator-platform/pull/477) | Open | `lane-3/b3-citations` | Included in #514 and #515 by exact ancestry; do not recreate. |
| [#473](https://github.com/WangPantopus/creator-platform/pull/473) | Open | `lane-3/b1-guard` | Included in #514 and #515 by exact ancestry; do not recreate. |
| [#471](https://github.com/WangPantopus/creator-platform/pull/471) | Open | `lane-7/thread-freeze` | Reuse plain-stack iOS freeze fix after reconciling current timeline. |
| [#468](https://github.com/WangPantopus/creator-platform/pull/468) | Open | `lane-3/b4-retrieval` | Included in #514 and #515 by exact ancestry; do not recreate. |
| [#466](https://github.com/WangPantopus/creator-platform/pull/466) | Open | `lane-7/status-7-4` | Cumulative native status only. |
| [#465](https://github.com/WangPantopus/creator-platform/pull/465) | Open | `lane-7/citation-refusal` | Reuse Android citation refusal handling. |
| [#464](https://github.com/WangPantopus/creator-platform/pull/464) | Open | `lane-3/a4-fewer-transactions` | Included in #514 and #515 by exact ancestry; do not recreate. |
| [#462](https://github.com/WangPantopus/creator-platform/pull/462) | Open | `lane-7/adults-only` | Reconcile existing adults-only UI with newer #514 C1 refusal state; avoid duplicate state machine. |
| [#460](https://github.com/WangPantopus/creator-platform/pull/460) | Open | `lane-7/provider-consent` | Reuse existing provider consent UI. |
| [#459](https://github.com/WangPantopus/creator-platform/pull/459) | Draft | `lane-4/share-card-owners` | Reuse Commerce share owner adapters and pending status SQL; qualify independently. |
| [#457](https://github.com/WangPantopus/creator-platform/pull/457) | Open | `lane-7/step-in-seal` | Reuse creator initial on step-in seal. |
| [#456](https://github.com/WangPantopus/creator-platform/pull/456) | Open | `lane-3/f9-orphaned-reply-call` | Included in #514 and #515 by exact ancestry; do not recreate. |
| [#455](https://github.com/WangPantopus/creator-platform/pull/455) | Open | `lane-3/f8-reconcile-own-answer` | Included in #514 and #515 by exact ancestry; do not recreate. |
| [#452](https://github.com/WangPantopus/creator-platform/pull/452) | Open | `lane-7/notes-reactions` | Overlaps #516 C4. Retain #516 five-second atomic concealment; reuse older ordering/accessibility/scroll scenarios. |
| [#451](https://github.com/WangPantopus/creator-platform/pull/451) | Open | `lane-3/f15-workspace-lock-wait` | Included in #514 and #515 by exact ancestry; do not recreate. |
| [#446](https://github.com/WangPantopus/creator-platform/pull/446) | Open | `lane-3/b9-small-fixes` | Included in #514 and #515 by exact ancestry; do not recreate. |
| [#444](https://github.com/WangPantopus/creator-platform/pull/444) | Open | `lane-3/a2-wake-on-accept` | Included in #514 and #515 by exact ancestry; do not recreate. |
| [#441](https://github.com/WangPantopus/creator-platform/pull/441) | Open | `lane-3/b2-faq-publish` | Included in #514 and #515 by exact ancestry; do not recreate. |
| [#439](https://github.com/WangPantopus/creator-platform/pull/439) | Open | `lane-1/passkey-retirement` | Reuse passkey retirement source and pending SQL; preserve newer identity checks. |
| [#438](https://github.com/WangPantopus/creator-platform/pull/438) | Open | `lane-3/a6-hold-sizing` | Included in #514 and #515 by exact ancestry; do not recreate. |
| [#436](https://github.com/WangPantopus/creator-platform/pull/436) | Open | `lane-3/a6-ack-disconnect` | Included in #514 and #515 by exact ancestry; do not recreate. |
| [#433](https://github.com/WangPantopus/creator-platform/pull/433) | Open | `lane-3/a6-interrupted-cost` | Included in #514 and #515 by exact ancestry; do not recreate. |
| [#425](https://github.com/WangPantopus/creator-platform/pull/425) | Draft | `lane-4/inbox-login` | Reuse pending isolated inbox-login SQL; separate qualified wave. |
| [#401](https://github.com/WangPantopus/creator-platform/pull/401) | Open | `lane-7/keyboard-drafts` | Reuse encrypted draft/composer improvements; reconcile #514 sign-in and #516 timeline. |
| [#400](https://github.com/WangPantopus/creator-platform/pull/400) | Draft | `lane-5/reaction-withdrawal` | Reuse existing queued reaction-withdrawal reader/worker/scenarios; separate SQL wave. |
| [#399](https://github.com/WangPantopus/creator-platform/pull/399) | Draft | `lane-5/web-push` | Reuse existing encrypted creator web-push delivery; provider credentials still separate. |
| [#398](https://github.com/WangPantopus/creator-platform/pull/398) | Draft | `lane-5/profile-fields` | Reuse existing public profile field proposal; separate SQL/composition review. |
| [#397](https://github.com/WangPantopus/creator-platform/pull/397) | Draft | `lane-5/invite-entry` | Reuse existing invitation notes and retry-safe entry changes. |
| [#396](https://github.com/WangPantopus/creator-platform/pull/396) | Draft | `lane-5/metrics-contract` | Metrics ownership documentation and operated scenario; no new metrics implementation. |
| [#395](https://github.com/WangPantopus/creator-platform/pull/395) | Draft | `lane-5/digest-owners` | Digest owner documentation and operated scenario; retain missing owner gates. |
| [#394](https://github.com/WangPantopus/creator-platform/pull/394) | Draft | `lane-5/push-offline` | Reuse separate Android offline push-ID patch. |
| [#393](https://github.com/WangPantopus/creator-platform/pull/393) | Draft | `lane-5/launch-kit` | Reuse existing launch-kit endpoint/UI. |
| [#392](https://github.com/WangPantopus/creator-platform/pull/392) | Draft | `lane-5/share-card` | Reuse human-only share-card correction before owner/native integration. |
| [#389](https://github.com/WangPantopus/creator-platform/pull/389) | Draft | `lane-5/public-page` | Reuse existing bounded public creator cache; stacked on #388. |
| [#388](https://github.com/WangPantopus/creator-platform/pull/388) | Draft | `lane-5/public-withdrawal` | Reuse existing public withdrawal delivery and UUID fixes. |

## Execution order after audit

Finish0254 and the signed Note → private reply → purpose-leased Ops approval →
creator reaction workflow, then qualify the existing held follower source0185 in
its own wave. Reuse #392/#459 for share cards next. Reconcile the native cumulative
stack, #488 and the remaining existing proposals in the handoff order. Existing
source does not replace fresh/restored custody, current-session authority, privacy
checks or real operated acceptance. No new unit tests, forced pushes, applied-SQL
rewrites, clock changes or hosting decision are part of this audit.

This is an overlap/reuse inventory, not a full security review or acceptance of
all65 PRs. Live metadata, head SHAs, changed files, ancestry and patch comparisons
were retained privately under `/tmp/qelvora-studio-reply-1025/`; the large API
response and artifact blobs are not duplicated in Git.
