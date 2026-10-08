# Product finish plan — October 8, 2026

This is the execution plan for the resumed `637b` checkout. It carries forward
the complete [project checkpoint](project-continuation-2026-10-07.md),
[session handoff](session-handoff-2026-10-08.md) and original
[source reconciliation](pr-reconciliation-2026-10-07.md). Those documents retain
the detailed history and evidence; this plan does not replace or discard it.
The product is substantially implemented and remains incomplete.

## Continuing execution

The user authorized continued implementation, commit/push, milestone PRs and
merges when ready, with actual launched web/iOS/Android acceptance and no new
unit tests. Existing required checks still run. All ten milestones below remain
part of the scope; a bounded native repair does not replace the safe-upgrade work.

PR #336 merged at `78c42fc3a5051b259473ad1e598e140e6391d210`; its five post-merge
Foundation jobs passed. The next branch is `codex/native-connected-journey-20261008`.
Copy 43 is reopened through its original custody helper and used by the compiled
backend, actual web sessions and dedicated native simulators. The initial eight
generation/33 usage record receipt remains unchanged after native reads.

The [connected native milestone](../../artifacts/pr-review/2026-10-08/native-connected-journey/README.md)
repairs initial reply visibility, Android saved navigation and empty-composer
presentation, and the welcome action during sign-out cleanup. Its evidence is
backed by passing iOS Night and Android Light/Night connected UI journeys.
It is limited to the operated flows; new native sends, interruption/keyboard/largest
text, physical devices and the rest of the finish criteria remain outstanding.

PR #337 merged at `715cc0728d417f40e97d41eec64cab6e4121cd6f`; all ten head
checks and all five post-merge checks passed. The [native send increment](../../artifacts/pr-review/2026-10-08/native-message-reliability/README.md)
now passes actual sends, retained drafts and keyboard/reconnection checks on
both native apps, including Android account reconfirmation. All eighteen actual
operations and failures remain preserved. Copy 43 has seventeen delivered and
one original zero-provider failed operation; its original eight operations and
33 usage rows are unchanged. This bounded milestone does not qualify the missing
existing-version upgrade, full native acceptance or useful-response latency.

PR #338 merged at `8f39888953f4016b2059d2dceeb5867e8765748f` after all ten
reviewed-head checks passed. Both owned native devices are now stopped with
state preserved. Work continues on `codex/conversation-shadow-producer-20261008`.
The trusted producer remains unconnected: new separate-purpose consent,
sanitization and source mapping are implementation work, not qualified replay.
The comparison consumer also needs to refuse retained evidence when its
original trusted feed is disconnected. All ten milestones below remain open.

## Refreshed starting point

- Continuation branch: `codex/shadow-evidence-lifetime-20261008`, retaining
  handoff commit `a6d483c60` above merged #335 at `13a2e03a0`.
- Remote `main` remains `13a2e03a0`. No open PRs at the initial refresh. The
  [post-merge workflow](https://github.com/WangPantopus/creator-platform/actions/runs/37749134304)
  has now completed successfully at that exact merge commit, with all five
  Foundation jobs passing. This is separate from validation of this continuation.
- The preserved archive container and all journey copies remain stopped. No
  preserved database was opened for this source increment; a separate disposable
  PostgreSQL container is used for tests. Ports 57304 and 3119 had no listener.
- No original PR is being reopened. No published engine fingerprint, applied
  migration, financial hold, historical clock or consent is being rewritten.

## Order of work and completion criteria

The order follows dependencies. Privacy work needed to make replay safe belongs
in the first milestone; broader privacy acceptance continues in milestone 5.
Each milestone ends with a bounded reviewable source change, appropriate checks,
real operation evidence where required, and an explicit account of what remains.
Compilation, scripted tests, actual operations and release qualification are
separate evidence levels.

| Order | Work                                                   | Present position                                                                                                                | Completion evidence                                                                                                                                                                                                     |
| ----- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Safe comparison evidence and its real privacy producer | Historical engine selection exists; trusted producer absent. Consumer sample lifetime/identity repair is the current increment. | Original Conversation/privacy owner supplies creator-scoped scrubbed samples, current consent and exclusion checks, provenance, withdrawal and physical expiry; no raw fan identifiers reach Agent.                     |
| 2     | Existing creator upgrade                               | First publication works; no real revision 12/13 → 14 upgrade is qualified.                                                      | Actual creator comparison, boundary evaluation and legitimate publication; subsequent fan reply and accounting; restart and permissible rollback, preserving original publication records.                              |
| 3     | Useful response latency and grounding                  | Latest useful visible reply is 26.992s; acknowledgment 3.767s. Targets remain missed.                                           | Request-correlated measurements, production frontend, documented device/network/region/load and cache behavior; p95/p99 for acknowledgment, useful visible first sentence and completion, with supported useful output. |
| 4     | Generation reliability and access                      | Canonical development generation and interrupted-cost recovery have real evidence.                                              | In-flight takeover, rights/consent revocation, sensitive memory, source withdrawal, uncertain retries, cancellation, paid-membership first use and shared-pass accounting.                                              |
| 5     | Complete privacy and recovery                          | Eight-domain fan export works; populated cases and physical deletion remain incomplete.                                         | Actual retention/purge adapters, populated exports, mature deletion and provenance purge, unresolved-cost escalation, detachment, restoration/re-purge and cancellation/EOF/COMMIT checks.                              |
| 6     | Human presence and creator/team work                   | Significant source exists; connected journeys remain unqualified.                                                               | Signed audience-specific Notes, delivery, private replies, exact-version approval, reactions, Team invite/accept/remove and finite feedback/intro consent/withdrawal/expiry.                                            |
| 7     | Commerce and content publication                       | Accounting and substantial commerce/content code exist; complete paid journeys remain open.                                     | Membership, request hold/acceptance/capture, signed delivery, refunds/reconciliation, native callbacks, and original group publisher → Content consumer.                                                                |
| 8     | Recording and real calls                               | Recorder/session implementations are retained; real device/provider acceptance remains open.                                    | Record/play/upload/discard/publish; physical-device interruptions; call scheduling, admission, history, consent, clocks, outcomes, settlement and handback.                                                             |
| 9     | Growth and complete cross-platform experience          | Design references and many screens exist; full journeys are not accepted.                                                       | Populated Home/discovery, sharing/return, push/settings, withdrawal/retraction, export, activation/insights/impact; exact web/iOS/Android states and accessibility.                                                     |
| 10    | Production readiness and pilot                         | Development approvals exist; production remains gated.                                                                          | Production identity/provider/licensing, incident/restore drills and a measured creator/fan pilot. Cloned voice only afterward with explicit license and provenance.                                                     |

## 1–2. Safe upgrades: immediate implementation sequence

The actual chain is `PrivacyParaphrasePort` → `ShadowReplay.collect/start/run`
→ `AgentService.read/publish`. `createAgentDomain` accepts a feed, but canonical
Conversation host composition supplies none. Searches found no implemented
Conversation or Trust sanitizer producer. An ordinary creator scope cannot
substitute for the original fan-data read purpose, and existing feedback consent
does not automatically authorize a different use.

The current consumer has additional defects to fix before connecting a producer:
omitted samples survive later feed responses; comparison fingerprints omit the
sample cohort; and a stored pass can survive the samples' seven-day eligibility.
This continuation binds comparison identity to the exact cohort, replaces cached
candidates from a bounded complete feed response, and checks current eligible
samples at replay stages, result persistence and publication. Empty cohorts
cannot pass. See [increment evidence](../../artifacts/pr-review/2026-10-08/shadow-evidence-lifetime/README.md).

That repair does **not** issue privacy authority or finish the producer. Next:

1. Define and compose the original Conversation-owned selection/read purpose
   with Trust's actual denial/consent lifetime, processor policy, account/thread
   deletion and memory exclusions. Keep creator boundaries and off-the-record
   exclusions; do not settle Q13 by implication. Revalidate at each remote call
   and original commit boundary, including changes during asynchronous work.
2. Implement and evaluate sanitization against identifying/sensitive text,
   quotation and prompt-injection examples. Keep raw material and the deletion
   mapping within its original owner. Opaque sample IDs or sanitizer reference
   strings alone prove neither deidentification nor authority.
3. Link deletion/revocation to the cached sample, persisted comparison text and
   any exports/results that contain it. The source requires a recent seven-day
   cohort of about 200 scrubbed paraphrases kept at most 30 days. SQL eligibility
   filtering is not physical expiry; an owned purge lifetime and real receipts
   remain required. Read/display of old results also needs the original guard.
4. Bind successful publication to the current owner-approved cohort. This
   increment's database sample fingerprint is a necessary identity check, not
   that owner's revocation fence. Keep the missing-feed and empty-cohort gates
   closed; the source does not establish a vacuous zero-sample pass.
5. Operate the preserved revision 13 creator on copy 43 sequentially with any
   copy 45 work. Inspect/reopen through its matching custody helper, build the
   intended source, obtain real browser sessions and perform the genuine UI
   comparison/evaluation/publication. Use a new labelled restore only when
   needed, with a pre-operation receipt; never reset a used copy.
6. Verify the baseline used its saved historical engine, the new version uses
   14, old passes fail, current source rights hold, the fan gets useful cited
   output, costs settle correctly, and restart preserves exact history. Exercise
   rollback only where the original license/source revisions permit it.

## 3–4. Generation performance, usefulness and reliability

First attribute time to the request: click/acknowledgment, worker scheduling,
held-purpose windows and row locks, current-authority work, provider classifier,
embedding, reply and guard, output storage/transport and visible paint. Separate
idle workers and background queries. Use the retained private trace; summed SQL
durations are not causal wall time. Consolidate repeated work only at the
original owner/transaction boundary with equivalent drift and revocation checks.
Keep five-second purposes and the 60-second worker lease.

Measure p95 and p99 against acknowledgment under 300ms, first approved useful
visible sentence at 2.5s warm/4s cold, and completion at 8s. Record actual provider
prefix-cache behavior for warm/cold, a production-built frontend and the load
profile. A fast fallback or text hidden behind the composer is not useful-output
success. Preserve all failures and their provider costs.

Expand grounding coverage for invented mechanisms/benefits, stronger certainty,
mixed factual/refusal sentences, quote manipulation and multilingual cases.
Capture rejected proposals and guard verdicts only through authorized scoped
diagnostics. Retain full-span reconstruction and exact authorized quote checks;
model judgments still have uncertainty. Revisit Notes/public-answer context
against the amended slot-4 contract rather than silently assuming existing
retrieval fulfills every requirement.

Then exercise live takeover, source/license/grant/processor-consent revocation,
sensitive-memory consent and deletion exclusions, uncertain-send idempotency,
cancellation boundaries and paid grants. A free development grant does not prove
paid membership or shared-pass behavior. Preserve the existing zero-output and
partial-output unknown-cost holds until genuine reconciliation resolves them.

## 5. Privacy, retention and recovery

Compose the actual domain retention/purge adapters and original retained-financial
purpose under approved policy `w8-product-retention-20261007-v2`. The missing
adapters are engineering work; the existing approval does not need repeating.
Exercise populated Commerce/Conversation/Growth exports and complete deletion,
provenance purge, unresolved-cost escalation/breach, detachment, recovery,
restoration/re-purge and cancellation/EOF/COMMIT boundaries. Optional external
Commerce sinks remain separately unqualified.

The preserved deletion becomes eligible on **October 30 at 1:48:22.966 a.m.
America/Los_Angeles**. Keep that original time. Use a genuinely mature case to
observe physical deletion; an artificial clock edit is not evidence. The 658
original usage records have no finite due-retention deadline, and there are no
expiry/detached jobs. Idle passes therefore cannot qualify those scenarios.

## 6–8. Human work, payments, content, recording and calls

Use real current creator/fan/team actors for audience-specific signed Notes,
private reply delivery, exact-version review and reactions. Apply held
reply-review/signature SQL only through its reviewed migration process. Resolve
the Team handle-versus-email discrepancy against accepted design. Finish finite
feedback/intro consent, withdrawal, expiry and recovery; the development policy
ends November 1 and is not a production policy.

Connect and operate complete paid journeys: membership and spend limits, request
submission and authorization, creator acceptance/capture, signed delivery,
decline/expiry/refund and reconciliation. Qualify real native store callbacks
under their approved terms. Keep uncertain financial outcomes unknown until
resolved. Verify original group publication through its Content consumer and
current audience/source controls, including withdrawal and retraction.

Exercise recording/playback/upload/discard/publication and interruptions on real
devices. Complete call scheduling and admission, participant history, separate
recording/summary consent, all three clocks and five outcomes, settlement and
explicit handback. Cloned voice remains after the pilot and separately licensed.

## 9–10. Full product experience and release

Operate populated Home and discovery, authorized sharing/deep-link return,
actual push arrival and preferences, reply export, creator activation/insights
and consented impact. Membership leads; the pass follows a meaningful roster
(about 30 active creators as the working threshold). Example names, tiers and
prices remain examples.

For each completed journey, compare the corresponding reference under `design/`
on web, iOS and Android: Light/Night, phone/desktop, 200% web reflow, largest
native text, screen-reader labels and targets, reduced motion, citation
navigation, persistent human action and stable scroll. Gallery checks supplement
these operations. Preserve server-owned authorship and exact human signatures.

Finish production identity, provider retention/training terms, licensing,
incident/restore drills and a measured creator/fan pilot. Only those operations
can close release acceptance. The approved fictional Maya provider scenario is
available for development work now; it does not resolve production terms or new
financial obligations. Q13 and the other explicit open decisions remain listed
in [DECISIONS](../workstreams/DECISIONS.md).
