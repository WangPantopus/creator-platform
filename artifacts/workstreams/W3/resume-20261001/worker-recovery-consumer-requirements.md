# W3 autonomous recovery: consumer requirements for canonical producers

This is a read-only requirements proposal against main `4c2ea26867d27ba7466e0ac7446216fe0a49b24f`, normally integrated at `fc167eb90a3a4fd662af8ffe6b4976b38926be7e`. The W3 generation, access and database source relevant to this proposal is unchanged through the incoming W2/W4 integration; zero-byte incoming contract diffs are preserved in privacy-refresh. It grants no authority, defines no new issuer or runtime interface, and changes no database policy. W1 confirms that no applicable published worker/current-check contract exists. W3 must not turn an interactive session scope into autonomous worker authority.

## Existing durable work and consumer behavior

`ConversationService.send` in `apps/backend/src/modules/conversation/service.ts` commits the idempotent fan message, acceptance event, empty AI message, allowance reservation, `creator.generation` row and prepared generation-journal initialization on one held transaction. A generation is identified by `id`, `thread_id`, `creator_id`, `fan_id`, `fan_message_id`, `ai_message_id`, `grant_id` and, when configured, `reservation_id`; its current state carries `epoch`, `context_revision`, `worker_token`, `lease_until` and `last_sequence`. A worker must consume this existing work rather than insert another accepted message or reserve another unit.

`ConversationGenerationProcessor.recover` in `generation.ts` currently requires an already issued `ThreadScope`, locks the exact family thread, selects the oldest queued/generating generation whose lease expired, and sets a new token and 60-second lease. If an earlier attempt delivered a prefix, it completes that attempt as interrupted instead of appending a fresh continuation to that immutable prefix. Current retries wait for the persisted lease and keep bounded wakeups; a page visit can schedule recovery. This does not discover durable work after a full host restart.

The current `BoundedWorkerPool` in `apps/backend/src/workers/pool.ts` has generation concurrency 8, queue capacity 64 and per-creator concurrency 2. These are existing implementation limits, not an approved product capacity or performance result. Discovery must respect them and must not introduce an unbounded private-family scan or additional competing queue.

## Required producer operations and custody

| Producer responsibility | Required evidence before W3 consumes it |
|---|---|
| W1 purpose issuance | A genuine durable host/job identity, a process-issued proof for generation recovery only, exact persisted generation and creator/fan/thread identity, finite validity, and explicit permitted operations. No actor fabrication, request-ALS fabrication, reusable interactive token, creator impersonation or broad owner enumeration. |
| W8 database installation | Applicable W3 adoption and canonical migration history; an actual separate non-owner principal with no superuser/BYPASSRLS/ownership, forced RLS, exact grants and PUBLIC/default/function/sequence/membership catalog review. Discovery must reveal only eligible existing work under the approved purpose. |
| W1/W8 held current authorization | Recheck the current exact family, deletion/lifecycle denial, fan and creator identity, pause/control epoch, version/revision and revocation on the same transaction used for claim or write. A previously issued in-memory `ThreadScope` is not durable authority. Canonical denial must fail closed and restore any temporary SQL context. |
| W2 generation authority | Current held-client license, source/version/audience and processor-consent proof, attributed pre-call journal, prepared attempt IDs and verified receipt/family custody. Every sentence and memory extraction must still pass the current existing admission/delivery fences. |
| W4 settlement | Preserve the existing reservation and original reviewed cost-rule version. Terminal interruption/failure/late receipt must reconcile through the actual prepared journal and original-policy reconciliation port, without consuming twice or guessing costs. |
| W8 lifecycle | A real registered denial/expiry/privacy protocol determines whether work may run or must terminate/reconcile. This proposal supplies no retention duration or eligibility exception. |

The producer must publish how stale or terminal discovery results are acknowledged, how a crashed claim is retried, and how duplicate discovery across two hosts is fenced by the persisted generation token/lease and current authority. Discovery cannot report successful delivery or settlement; W3's existing transaction and prepared producers remain responsible for those outcomes. The existing lease and retry timings above describe source behavior only; approval of takeover/exit/timeout policy remains a separate owner decision.

## Acceptance after the real producer is published

Personally operate a licensed fan send through the canonical application, retain its genuine accepted identities, then restart the full owned host with no page/socket visit. Show that the existing generation is discovered, claimed and settled once. Repeat with two competing hosts, an unexpired crashed lease, a delivered prefix, current consent/license revocation, takeover, family deletion and an unknown provider receipt. Preserve exact worker/database roles, applied migration checksums, current authority proofs, original messages and failures. Unit/HTTP-only results, session-triggered recovery, owner-role scans and synthetic scopes do not satisfy this acceptance.

Until these producers and dependent policy inputs exist, autonomous full-process recovery remains open. No consumer placeholder or widening of `AccessService`, `Database`, ALS or RLS is implemented here.
