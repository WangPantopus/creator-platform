# Current owner bridges and public withdrawal

Personally reviewed the current W3 account-directory contract on27b9829 and
W5 ContentService/get/publication/lifecycle/consent contracts onaa50642. These
are actual published owner implementations, superseding historical claims that
those APIs do not exist. Their complete branches also contain shared changes
and conflicting predecessor fixtures. A read-only merge-tree review found14
conflicting files for W3 and a much wider divergent foundation for W8; no merge
or peer-resource mutation was performed.

W8's bf44ada registry allocates W5 at0035–0040, W3 at0041–0042 and its relationship
backfill at0043, preserving W7's0032–0034. This resolves the proposed numeric
collision with W5's separate provisional registry. W7 does not rewrite any
applied SQL or allocate competing IDs. The combined host must consume the
reviewed registry and actual owner services. Its production provider/ownership
acknowledgment is separate from allocation or compilation.

## Implemented W7 changes

W5 unpublish/archive keeps the immutable content version. W7's former
`version < incoming` projection update therefore left an equal-version
withdrawal visible. `withdrawContent` now writes a minimal negative tombstone,
including before publication. Equal/older publication replay cannot restore
it; a higher revision can publish. Creator binding is immutable, conflicting
equal-version bodies return409, and each higher revision carries its own
publication timestamp. Creator-erasure fencing and a per-content transaction
lock cover both positive and negative writes. The tombstone contains only
object/creator IDs, version and withdrawn state; no old public or private body.
No schema change was required.

`growth/content.ts` exposes `contentPublicProjection` for W5's durable effect
callback using its structural current `get` contract. It rechecks Studio role,
normal audience/eligibility and the exact W1 immutable command hash/status.
It reads current state instead of replaying an old event body. Private/draft/
scheduled/unpublished state withdraws the public projection. Source intention
does not approve AI context. Quote/packet publications remain blocked and
withdrawn until their fan/commerce retraction-to-publication mapper is installed;
an unavailable effect is not acknowledged as successful distribution. Notes,
reactions, Thanks, source and recipient effects remain separate owner callbacks.

`growth/home.ts` exposes `canonicalConversationHome` for W3's actual `account`
directory. Its100-family bound accepts only opaque metadata; each message
preview requires a freshly issued fan scope plus Database's current-session/
ownership/denial recheck. Empty threads use their real privacy-notice time.
Delivered AI/creator/approved/team/fan authors remain labeled; invalid human
proof replaces the preview with unavailable copy. Deleted families can be
skipped; session/schema/provider failures propagate. W4 requests and W6 calls
remain separate entries to compose through `owners.home`. No text enters W7
analytics and no account eligibility or interactive authority is fabricated.

These owner-side W7 adapters compile but are not installed in the current
development host. No authentic W3/W5 publication/conversation acceptance is
claimed. W1/W8's combined host must supply the actual services, deny callbacks,
bounded current scopes and approved providers. A structural adapter does not
turn missing configuration into an empty successful product.

The runtime now accepts a host-owned asynchronous source enumerator as well as
the original static list. It resolves current authorized scopes on each tick
with a100-source bound; the host must rotate bounded pages instead of forever
returning its first page. Failed enumeration reports unavailable/unknown count
and a redacted failure counter while existing relay/delivery recovery continues
through its independent current-state checks. Absent configuration remains
distinct from a successful known-empty enumeration. No HTTP producer/actor
scope is introduced.

## Verification and CI

The isolated configured-host callback now exposes its existing canonical
`signing` service alongside Access/Database/Conversation. Both adapters can use
that same W1 verifier instead of constructing a parallel signing service. This
is a narrow two-line shared seam edit; W1 integration review is still required
before combined rollout, and no peer checkout is modified. Construct the actual
W3 runtime first and pass its account reader into `canonicalConversationHome`;
compose current W4/W6 entries in the same `owners.home` callback. After Growth
construction, install `contentPublicProjection(growth.service, content,
runtime.signing)` as the public part of W5's effect callback, preserving all
separate source/distribution/recipient receipts.

Backend typecheck, scoped lint/format and shared generation checks pass. Two
new error-copy keys are generated into web/Swift/Kotlin; existing values are
unchanged. The direct PostgreSQL diagnostic passes12 duplicate/conflict/
withdrawal/reorder/creator-binding/concurrency checks as non-owner growth_worker
with NOBYPASSRLS. It is explicitly synthetic, not W5/signature/provider proof;
all created diagnostic rows are removed. Its first invocation failed to resolve
the workspace-only pg package from the repository root; running from the
backend workspace fixed setup before any successful mutations.

The Swift snapshot root also fixes its displayScale environment at2×, so
offscreen raster content cannot inherit the hosted1× display. Swift package and
all existing test targets compile locally with the regenerated copy and this
helper. The compilation-only filtered command matched zero cases; it is not a
new passing snapshot result. Local macOS26 versus reference macOS27 pixel
acceptance remains as recorded in the native capture evidence.

GitHub CLI at the user-installed `~/.local/bin/gh` has repository administration
access. PR2's title/body are updated and still draft. This supersedes the old
connector403 as an operational blocker; no further GitHub-access answer is
required. The connector's own403 remains irrelevant to CLI operations.

Latest15fd650 CI passes backend, all13 web visual/runtime checks, Android
runtime and Trust compilation; Android foundation and iOS remain queued. GitHub's official preview announcement warns
that xcode-27 capacity can cause queues:
[runner-image announcement](https://github.com/actions/runner-images/issues/14404).
No paid larger runner was selected. Foundation concurrency now cancels only
superseded runs for the same workflow/event/branch, preserving push and PR
checks. The signed shipping iOS UI checks run before strict snapshots; snapshot
checks still run after a UI failure, and either failure keeps the job red.
Artifacts preserve both results. The superseded b608 PR run was canceled after
its meaningful completed results were recorded; peer runs were untouched.

No new test case/suite, reference replacement, relaxed tolerance, paid AI call
or release-ready claim. Matching-runner capture and the original owner/provider/
device/design acceptance gates remain open.
