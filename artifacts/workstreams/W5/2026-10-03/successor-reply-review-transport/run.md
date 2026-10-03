# Reply review original settlement — October 3, 2026

Personally implemented source `ca591d95f7f7a0c69c7c3d30ebe62e6ed223d643`
on captured remote main `5c08634b7542fef95dd6c176030a785845250c62`.
W5's review helper previously attempted savepoint rollback after every producer
error. A PostgreSQL response timeout can leave the original command unsettled;
fallback cleanup must not queue more SQL or report a successfully pending reply.

The consumer now uses the existing `querySettlementUncertain` classifier and
lets the original uncertain error or cancellation reach the transaction owner.
Known completed failures still restore the savepoint and retain quarantined
review behavior; negative4xx still escapes. Cleanup failure preserves both
actual errors. Successful RELEASE failure cannot re-enter producer fallback.
No review state, fan permission or signature policy changed.

Reused owner source is explicit: W1 PR74
`81a401bd938c9c7bb1e1e72dea9798cc6e77f95f` supplies the byte-identical
`identity/transaction.ts` and `identity/request-context.ts`. The original
transaction uses unchanged `ContentHeldClient`, its actual five-second host
budget and awaited settlement. Pool acquisition remains the configured host's
responsibility. The prior W5 `6fcc02c57aa84e56fb3d1e662f5e18e5a268c9be`
role-check restore guard is reused. W8 PR200
`50165fe6d78be5f3288cbb41f8d792abaf3a1df6` supplies only the exact
`trustReplyError` cause-preservation leaf; its prepared reviewer/root/SQL wave
is not copied or activated. Public error status/message stay unchanged and the
actual original cause remains private and nonenumerable.

Backend build/types, affected lint/format/diff and all nine existing backend
contract checks pass. No new unit, UI or E2E tests were written.

At exact sourceca591d95, personally operated two primitive reads on owned PG17
canonical61 through the actual installed pg, real `creator_runtime` connection
and unchanged `ContentHeldClient`. The real client read timeout occurred
in61.666ms; the genuine Trust adapter retained its cause and the shared
classifier returned uncertain=true. Original client settlement completed;
an independent read300ms later found its PID absent. The real40ms server
statement timeout returned57014 in45.738ms, retained its cause and classified
uncertain=false; ordinary rollback kept the healthy pooled PID. Cause was
nonenumerable in both cases. The actual role/database/61 ledger remained.
The original pool closed normally afterward.

These reads use no product reply, Actor, task, reviewer callback, document,
decision, signature, approval or receipt. They do not invoke the private reply
helper or qualify its actual application journey. Client socket closure does
not establish immediate backend cancellation. No held migration/role/registry
or business state was activated. The private0600 operator receipt is outside
Git at `~/.config/creator-platform/w5-20261003/reply-review-transport/errors-ca59.json`,
SHA256 `25f15132112d55060157bcc4a4c5ccda2b75677a27fe1c179586abaa75ef8a25`.

Implemented: W5 original review/savepoint guard plus genuine owner cleanup
leaves. Runnable: build and actual named PostgreSQL primitives. Integrated:
exact existing owner leaves, while genuine prepared0156/root activation and
current shipping-app qualification remain separate. Verified: static checks
and the two named primitive outcomes only. Release-ready:false. Actual signed
Note, recorded Ops review, two-fan privacy, duplicate/withdrawal/reaction,
current browser/native acceptance and finite C10 remain open. All nine W5
packages remain incomplete. No heavy/API/browser/device lease is held.
