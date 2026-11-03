# Design plan: the implementation log, October 2026

Moved verbatim from `docs/DESIGN_PLAN.md` on 2026-11-02, with only its relative links
rebased to this folder. It records implementation work between 2026-10-02 and 2026-10-08,
not design boards. The current state is in [STATUS](../STATUS.md).

W3 implementation checkpoint,2026-10-02: [preserved privacy61 and real fan export](../../artifacts/workstreams/W3/increment-66/20261002-privacy61-handoff/run.md). Personally operated web Light/Night390 with a genuine saved request and four explicit blocked domains; current native builds pass, current native UI and full A–I remain incomplete. [Successor handoff](workstreams/handoffs/W3-mac-studio-2026-10-02.md). The [final source-pin correction](../../artifacts/workstreams/W3/increment-67/20261002-cursor-source-pin/run.md) matches the corrected held privacy SQL without activating it; [abort cleanup correction](../../artifacts/workstreams/W3/increment-68/20261002-cursor-abort-cleanup/run.md) retains the client through cancellation and rollback, with real held-purpose qualification still open. No design/implementation completion checkbox is advanced from this partial acceptance.

## Implementation continuation

- [~] October 8, 2026: launch review and plan. PRs 351 to 353 (comparison export
  reference, creator upgrade evidence, view lifetime) are merged; comparison stays
  installed and off. The [launch plan](../LAUNCH_PLAN.md) sets the order of work (five
  moments, phone apps first, the share card in, the rest planned for later) and the
  [launch review](operations/launch-review-2026-10-08.md) records what the code does
  today. Current state: [CURRENT](../operations/CURRENT.md). No design or implementation
  completion checkbox is advanced.

- [~] October 8, 2026: creator comparison results clear on offline or failed
  permission reads and recover after fresh reads. Launched web checks and production
  compilation pass; remaining lifetime/privacy operations are carried into the
  [immediate requested handoff](operations/session-handoff-2026-10-08-immediate.md).
  [Evidence](../../artifacts/pr-review/2026-10-08/comparison-view-lifetime/README.md).

- [~] October 8, 2026: actual preserved creator revision13→14 comparison, fresh
  six-case evaluation and v2 publication; useful cited fan reply, backend restart,
  reversible rollback/restoration and native Light/Night journeys. Existing E2E
  runners now accept longer iOS labels and keep Android Compose advancing during
  the reading wait. Grounding inconsistency and stale offline comparison text
  remain explicit findings. [Evidence](../../artifacts/pr-review/2026-10-08/comparison-creator-upgrade/README.md).

- [~] October 8, 2026: original comparison export completes all eight domains after
  source-reference and worker-recovery sequencing fixes. Real web downloads match;
  explicit withdrawal removes the sample and affected file, and fresh download
  fails closed. Native withdrawal, creator populated cases and full privacy remain.
  [Evidence](../../artifacts/pr-review/2026-10-08/comparison-export-reference/README.md).

- [~] October 8, 2026: separate comparison choice/question controls pass real web,
  iOS simulator and Android emulator Light journeys. One actual sample and two
  settled provider calls are retained; native repeats reuse it. New export sealing
  exposed a source-reference mismatch; export/withdrawal, Night/accessibility and
  preserved-version upgrade remain open. [Evidence](../../artifacts/pr-review/2026-10-08/comparison-choice-ui/README.md).

- [~] October 8, 2026: activate the exact comparison graph through the original
  closed populated migration/restore chain and launch the real composed host.
  Existing browser conversation and all prior history remain intact. Actual
  comparison controls, provider and native journeys remain next.
  [Evidence and preserved refusals](../../artifacts/pr-review/2026-10-08/comparison-closed-wave/README.md).

- [~] October 8, 2026: scope comparison artifact recovery to original deletion
  sources and permit exact expired legacy cleanup. Six isolated operations pass
  on the fully restored numbered graph; actual activation and journeys remain.
  [Evidence and limits](../../artifacts/pr-review/2026-10-08/comparison-legacy-custody/README.md).

- [~] October 8, 2026: reserve the complete comparison SQL graph, review all
  combined role catalogues and exact restoration, and wire the gated original
  runtime/Trust/export/expiry owners. Activation, legacy file lifecycle and actual
  comparison controls/provider journeys remain open.
  [Evidence and limits](../../artifacts/pr-review/2026-10-08/comparison-runtime-integration/README.md).

- [~] October 8, 2026: prepare original creator comparison reads with a finite
  SQL COMMIT scope; hold collection, provider admission, replay, display and
  publication on that current source. Eight SQL and four actual consumer source
  operations pass. Full graph/host composition and launched app journeys remain.
  [Evidence and limits](../../artifacts/pr-review/2026-10-08/comparison-held-feed/README.md).

- [~] October 8, 2026: prepare distinct comparison provider admission, source-bound
  cost receipts and original fan sample writes with a commit-time expiry gate.
  Nine isolated SQL operations and backend checks pass; actual producer, creator
  read/publication guards and full app composition remain open.
  [Evidence and limits](../../artifacts/pr-review/2026-10-08/comparison-purpose-admission/README.md).

- [~] October 8, 2026: prepare original Trust export/deletion for private comparison
  artifact provenance, full attempt inventory and physical removal. Six isolated
  source operations pass; activation, actual producer and mature deletion remain
  open. [Evidence and limits](../../artifacts/pr-review/2026-10-08/comparison-artifact-privacy/README.md).

- [x] October 8, 2026: recover an expired-verification download on the original
  application origin, reconfirm the same creator and download the identical
  existing artifact. Preserve the initial loopback-cookie failure; production
  build and actual web journey pass. [Evidence and limits](../../artifacts/pr-review/2026-10-08/privacy-download-recovery/README.md).

- [x] October 8, 2026: repair and operate the original creator-account export
  across all eight domains; verify four downloaded streams and preserve exact
  publication/generation/accounting history. Actual catalogue, Media task and
  page deadline failures are retained with the repairs. Expired-verification
  download recovery, populated media, other scopes and physical deletion remain
  open. [Bounded evidence](../../artifacts/pr-review/2026-10-08/comparison-consent-lifecycle/README.md).

- [x] October 8, 2026: persist private export attempt metadata before source
  bytes; operate actual fan export/download across all eight domains with exact
  prior generation custody. Original-task crash recovery has isolated source
  evidence and remains unregistered. [Evidence and remaining composition](../../artifacts/pr-review/2026-10-08/privacy-export-attempt-recovery/README.md).

- [~] October 8, 2026: prepare source-bound saved comparison export revocation,
  deferred completion and exact physical removal. Isolated SQL/filesystem
  operations pass; unfinished-attempt/orphan recovery and app composition remain
  open. [Evidence and limits](../../artifacts/pr-review/2026-10-08/comparison-artifact-lifecycle/README.md).

- [~] October 8, 2026: prepare separate comparison consent, Conversation source
  mapping, atomic invalidation, real expiry SQL and an extension of the original
  privacy export/deletion owners. Isolated SQL operations pass; actual consent,
  sanitizer/provider admission, saved artifacts and activation remain open.
  [Source and qualification limits](../../artifacts/pr-review/2026-10-08/comparison-consent-lifecycle/README.md).

- [x] October 8, 2026: block replacement publication and retained comparison
  display when the trusted feed is disconnected; verify the gate in the actual
  preserved creator Studio with unchanged generation/accounting history.
  [Bounded evidence and unresolved producer work](../../artifacts/pr-review/2026-10-08/comparison-feed-guard/README.md).

- [x] October 8, 2026: operate bounded new native sends, stable keyboard/drafts and current
  connection/account recovery, preserving every actual provider result and cost.
  Actual iOS Light/Night and Android Light/Night keyboard checks pass; complete
  native acceptance, largest text, physical devices and latency remain open.
  [Native message reliability evidence](../../artifacts/pr-review/2026-10-08/native-message-reliability/README.md).

- [x] October 8, 2026: operate the preserved conversation in launched iOS and
  Android apps, repair initial reply visibility and Android cold navigation,
  and verify citations, consent, theme and account boundaries through actual UI.
  [Connected native evidence and remaining acceptance](../../artifacts/pr-review/2026-10-08/native-connected-journey/README.md).
  Full native feature/design acceptance remains open.

**October 8 resumed plan:** [complete product finish plan and completion criteria](operations/product-finish-plan-2026-10-08.md).
The first increment binds shadow comparison evidence to its exact current sample
cohort. The real privacy producer and actual existing-version upgrade remain
open; this does not advance full journey or design acceptance.

- [x] October 8, 2026: repair shadow sample replacement, bind comparison evidence
  to the current cohort, and reject stale/expired evidence at replay/publication.
  Backend build and all 57 tests pass, including 11 PostgreSQL cases.
  [Bounded evidence and remaining producer work](../../artifacts/pr-review/2026-10-08/shadow-evidence-lifetime/README.md).

**October 8 handoff:** [#335 is merged; successor instructions, remaining acceptance and retained resources](operations/session-handoff-2026-10-08.md). All original PRs are resolved. Product latency, safe upgrades and the broader finish plan remain open.

- [x] October 7, 2026: inventory and continuation decisions for all 18 original draft PRs, with per-file preservation evidence and outstanding acceptance in the [reconciliation ledger](operations/pr-reconciliation-2026-10-07.md).
- [x] October 7, 2026: reused the missing #145 restoration protections in the #132 continuation; [source/built-runtime database fault evidence](../../artifacts/pr-review/2026-10-07/restoration-reconciliation/README.md). This is a bounded runtime repair, not a completed generation journey.
- [x] October 7, 2026: connect installed privacy consumers, original Agent accounting owners and the usage-expiry lifetime in #132; [source/standalone operation and failure evidence](../../artifacts/pr-review/2026-10-07/usage-accounting-host/README.md). Complete privacy and generation journeys remain open.
- [x] October 7, 2026: connect Conversation export and the original protected Commerce stream; source and standalone exports plus a source staging-closure check are recorded in [the bounded evidence](../../artifacts/pr-review/2026-10-07/conversation-commerce/README.md). Preserve the original #262 publication signal checks and account for #262/#301/#302 in #132. Full privacy and publication acceptance remain open.
- [x] October 7, 2026: preserve native Commerce, iOS recorder cleanup and Studio media sources from #284/#303/#305 with current integration repairs and [bounded validation](../../artifacts/pr-review/2026-10-07/native-media-reconciliation/README.md); physical-device and complete journey acceptance remain open.
- [x] October 7, 2026: reconcile #247 terminal cancellation and #192 finite feedback source, including actual sequence-catalogue correction and original Trust boundaries; [preservation evidence and retained gates](../../artifacts/pr-review/2026-10-07/terminal-feedback-reconciliation/README.md). Generation and feedback activation remain closed.
- [x] October 7, 2026: preserve #282 original call offers, signing and exact retries; [source and validation](../../artifacts/pr-review/2026-10-07/call-source-reconciliation/README.md). Successful scheduling/provider/hardware journeys remain open.
- [~] Reconcile and qualify the retained implementations in that ledger's journey order. Design deliverables marked complete below do not establish functional application acceptance. The [project checkpoint](operations/project-continuation-2026-10-07.md) preserves product, architecture and current engineering context.
- [x] October 7, 2026: strengthen output grounding with complete sentence spans and exact authorized quotes; operate six boundary cases and two real fan replies with original accounting. [Evidence and preserved failures](../../artifacts/pr-review/2026-10-07/generation-performance-grounding/README.md).
- [x] October 7–8, 2026: fix the 2,500-token context budget being counted as UTF-8 bytes; retain the source in the actual longer conversation, reduce repeated current-authority reads, and complete revision 14 first publication and three settled fan replies. [Reproduction, live operation and custody](../../artifacts/pr-review/2026-10-07/generation-context-latency/README.md).
- [x] October 8, 2026: preserve published revision 12/13 engine behavior and immutable fingerprints while new drafts use revision 14; bind shadow evidence to both engines and invalidate old comparisons. All 14 historical differential cases pass; the current compiled host serves an existing revision 13 publication without republishing. Equivalent catalogue prefilters retain all checked privilege/policy drift. [Compatibility, live operation and custody](../../artifacts/pr-review/2026-10-08/generation-published-compatibility/README.md).
- [~] Generation latency: latest compiled useful answer is fully visible at 26.992s with a 3.767s HTTP acknowledgement; server acceptance-to-completion is 23.820s. Earlier revision 14 observations (22.512s visible / 1.101s acknowledgement) remain preserved; these are not controlled comparisons or percentile qualification. Retain the 300ms acknowledgement, 2.5s warm/4s cold first useful sentence and 8s completion targets. Existing-version upgrades still require the unconnected privacy-safe shadow feed; historical engine support preserves original limitations until an evaluated upgrade. The [launch review](operations/launch-review-2026-10-08.md) supersedes these figures for planning: the latest measured first stored sentence is 19.1 s, most of the wait (roughly 15 s or more) is platform overhead, and the launch plan's bar is 4.5 s at the start of the pilot.
