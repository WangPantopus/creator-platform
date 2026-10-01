# W3 increment 12 — captured admission and scoped attribution

Personal owner execution on 2026-09-30 America/Los_Angeles. Predecessor: 7f5f63d8a78a3114933dc420a4a4ea2c9312b87c. PR8 remains draft against the combined foundation. No implementation delegation or new test code.

## Implemented and consumed

- W2 e3ea1480a477d18b76a018d955ebf3fa310adcf0 adds durable pre-call memory/extraction journals and includes their unknown costs in the creator cap. W2 741d8ddf1c04f28299b9684e4ea15113c4c6ab81 carries the actual W3 generation/attempt admission callbacks into main and memory provider journals. Network I/O follows journal commit. Optional extraction usage callbacks are diagnostic only; W3 no longer creates a second usage row.
- W3 retains the exact LiveAgentRuntime and GenerationExecution object for an attempt. Only an actually delivered approved sentence supplies extraction version lineage. Extraction admission checks that sentence against current source/license/version/audience in the same journal transaction. The creator-cap hold remains through extraction and is closed through the same runtime and execution seal. This is creator-cap closure, not a terminal generation-cost receipt or executionAttributed readiness.
- During inspection W3 identified a captured-version/admission gap. W2 published 954b53a471eeca0be27f6cf8693bd742c91e477f: main admission pins the captured version ID/hash and audience revision under the existing held locks. W3 inspected and consumed that immutable follow-up.
- All generation allowance paths now require both executionAttributed and a final seal. An older allowance adapter cannot activate unattributed provider work. Local licensed fan generation remains unavailable while the full producer receipt contract is unfinished.
- W1 authorized the exact optional MessageSchema fields member and authorAccountId and canonical OpenAPI/Swift/Kotlin generation. W3 returns the actual persisted team handle/account immediately and in later reads, fixing the gap reported by W5. No invented member placeholder or signature authority.
- Send-status paths validate the same bounded idempotency-key contract as send, rather than requiring a UUID. Privacy exports include actual authorAccountId. Privacy deletion removes the actual humanReply, team_reply and control:* retry namespaces as well as historical names, preventing private retry responses from surviving message deletion.

## Unallocated SQL proposal

pending_w3_message_lineage.sql SHA256 1044700d59b9dbb2d2b36d890496de0be6fb3d53c4409504f3c7693906866c35 proposes captured agent version, immutable correction target/version and signed-command columns plus explicit fan usefulness feedback. Composite foreign keys bind the exact creator/fan/thread/message/version/agent-version/hash. Feedback has enabled/forced RLS and fan-account ownership checks. No prompt, transcript, memory or inferred satisfaction is stored. No historical lineage is backfilled.

The complete proposal was parsed and executed inside an explicitly rolled-back transaction on W3's disposable 55483 database, with its actual W2 ai_version dependency. Metadata confirmed all five columns and both feedback RLS flags; a second observation confirmed the rollback removed the table and columns. This is DDL validation, not feedback/correction product acceptance. The proposal is unallocated and unapplied. W8 registration/lifecycle and W1's exact named-message trigger review remain required. Existing signature predicates and applied SQL were not changed.

## Verification

- Existing backend suite: 18/18, 10,000 scoped pairs across 1,000 threads, 161.37 seconds, exclusively creator-platform-w3-existing-checks-20260930 / 55483 / creator_w3_foundation_test. This run included schema and message attribution changes; later admission, status and privacy changes additionally passed source type/lint checks. Assertions remain unchanged.
- Final backend TypeScript and scoped ESLint pass after the captured-authority follow-up and status/privacy fixes. Canonical generation check passes: 12 resources, 31 native operations. Web TypeScript passes. Changed source formatting and git diff --check pass.
- Optimized Next production build passes using .next-w3-increment12-build (4.5 seconds compilation, 5.7 seconds TypeScript), separate from the retained .next-w3-dev runtime. No web source changed after that build.
- Swift build with the current generated optional attribution fields passes in 10.49 seconds, scratch /private/tmp/creator-w3-resume-20260930-swift. Existing package warnings remain. No native interactive acceptance is inferred.
- Predecessor 7f5f63d PR run36794999363: web-and-backend and Android runtime succeed. Personally inspected Android job110156299570's actual log: four instrumentation cases, BUILD SUCCESSFUL in2m50s. iOS foundation, Android foundation and web visual remain queued at observation. These results do not validate this increment's future pushed head.

## Runtime and limits

The retained API4103 does not watch source and must be restarted with the final increment before current-path runtime acceptance. Web3003 and owned app DB55443 remain intact. Neither private configuration nor provider credentials are in evidence. Original generated Package.resolved and next-env.d.ts remain excluded from the commit.

The actual fictional preview remains the increment11 observation: first approved3618ms, pipeline6883ms and $0.003646 across six actual durable usage rows. No new provider preview or performance claim was needed for these backend contract fixes. Production approval/license/policy, weighted terminal attempt receipts, purpose-issued restart discovery, canonical migration/lifecycle integration, approved offline-content authority, post context, correction/media associations and full usefulness consumer remain unfinished. Native interactive controls remain unavailable. Full all-client fan delivery/memory, race/restart/last-unit, visual/accessibility and latency acceptance are open; PR8 is not ready to merge.
