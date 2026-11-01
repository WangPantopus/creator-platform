# Creator/fan denial runtime continuation — October 27, 2026

This continues the [October 25 handoff](session-handoff-2026-10-25.md) in the
existing `codex/studio-reply-authority-2026-10-25` worktree and draft
[#517](https://github.com/WangPantopus/creator-platform/pull/517). Local development
qualification is in progress; preparation is not acceptance.

## Reverified custody and reuse

GitHub returned 66 open PRs: the previously audited 65 plus #517. All 65 audited
remote branch heads still exactly match the saved October 25 audit. Drafts #514,
#515, #516 and #517 remain open and unmerged, respectively at `47188ddba`,
`7eefeaf5d`, `6023517ad` and initial continuation head `5df85c78f`. #517 remains
stacked on #515. No replacement branch or worktree was created.

All 121 prior executable registrations and their SQL bytes match final #515;
the other migration-map fields, including reservations, are unchanged. The
unchanged denial source still hashes to
`0a738e0a29c77e65274931d4054b5db26a340b8c10a498e8c016457ab1a22860`.

The owned `studio122-1025` DB/API/web/model services survived and are healthy on
56700/56701/56702/56703. The database has 122 ledger entries and Growth. The
live catalogue check passed **46/47 groups, 53 pinned digests, zero unknown**.
The sole mismatch is the already documented `runtimeCatalogues.family`
diagnostic (live prefix `5bf3919378`, fixed pin prefix `a9c5c5ff4b`). The denial
and provenance incoming-Growth pins and accepted original-incoming purpose and
family profiles match. No pin was changed to hide the diagnostic.

On the preserved reply cluster, `studio_baseline121` has 122 registrations and
`studio_verified121` retains 121. Both still have connection limit zero and the
original traffic-closed marker. Original databases, backups, manifests and
deletion history remain preserved. New private receipts use
`/tmp/qelvora-studio-reply-1027/`; no old backup or receipt was overwritten.

## Runtime probe

The existing runtime scenario now builds separate exact, omitted-registration,
wrong-checksum, wrong-path and wrong-owner executable variants. These change only
the embedded executable descriptors, never installed SQL or ledger entries. A
compiled exact-registration control must pass before and after the refusal
variants. Registry bytes, original SQL hash and all installed version/checksum
pairs are compared after the variants.

The initial operated run passed the admission, compiled refusal, lock and
revocation groups, then exposed a harness credential assumption: stock Trust
roles have separate private passwords. The harness now requires the existing
`TRUST_API_DATABASE_URL` and `TRUST_WORKER_DATABASE_URL`, validates exact owned
loopback database and role identity, and never changes credentials. The next
run passed restoration refusal/reopening, then correctly refused the block
request with `404 thread_unavailable` because the new blocking fan had no
conversation. Failed runs remain in the private receipts and are not full passes.

Use the stock private environment file to supply existing role credentials:

```sh
node --env-file="$TMPDIR/qelvora-stack/lanestudio122-1025/backend.env" \
  --import tsx tests/scenarios/lane-2/e2-creator-fan-denial-runtime.mjs \
  --api http://127.0.0.1:56701 \
  --db postgresql://postgres:foundation-test-only@127.0.0.1:56700/creator_stack \
  --runtime-db postgresql://creator_runtime:foundation-test-only@127.0.0.1:56700/creator_stack \
  --out /tmp/qelvora-studio-reply-1027/runtime \
  --allow-owned-block-and-restoration
```

Only this owned fresh122 stack may be used. The final real block belongs to its
separate synthetic actor five. The preserved old reply-stack actor six must
never be reset or reused. No applied SQL, permission, original job, signature,
tombstone or clock is changed by executable-drift qualification.

The completed run passed **15/15 groups** on original fresh122/56700. Real
owner/fan callbacks admitted, cross-pair/missing-creator/outsider calls refused,
and exact compiled admission passed before and after all four descriptor
refusals. Contention refused in 43 ms and left zero advisory locks; release
restored admission. Logout returned 401 and the callback returned
`session_expired`. The closed marker returned `restoration_pending`, and the
original marker restored admission. The separate fan opened a conversation
through the actual begin API with current synthetic provider consent, which
issued one ordinary trial grant. The actual block and exact replay passed;
owner/fan callbacks returned `scope_revoked` while actor six remained admitted.
The successful private log is `runtime-complete.log`.

## Browser prerequisite discovered on the preserved stack

The original56700 browser run created its explicit synthetic membership and
submitted a synthetic proof/report, then refused queue access with
`403 ops_role_required`. All three seeded Ops memberships expired at
**2026-10-27 06:12:49.776103 UTC**. Their queue selections were correct. The
existing audited Ops management CLI depends on an inactive migration, and its
history table is absent. Neither that migration nor a manual renewal was used.

To preserve the original expiry records and all partial workflow evidence, the
continuation creates a separate stock fresh122 stack `studio122-1027` on
DB56710/API56711/web56712/model56713 with Growth. It uses the same #517 source
and normal fresh synthetic seeding. The original56700 stack remains intact.
Runtime and browser acceptance must be repeated on this new owned database;
results from different databases will not be combined into a single fixture.

The new stack installed canonical61 plus61 registered wave sources normally.
Its Growth catalogue check reproduced the same46/47 result and accepted incoming
profiles. The complete runtime probe then passed **15/15 groups** there too,
including the new actual block/replay and unaffected actor six. Receipts are
`fresh122-up.log`, `acceptance-catalogues.log`, `acceptance-runtime.log` and
`acceptance-runtime/runtime-*.json`. Substitute56711/56710 and
`lanestudio122-1027/backend.env` in the runtime command above for this stack.
The new stack's block is separate from original56700's block.

## Signed browser workflow and preserved-fixture acceptance

On56711/56712, the real browser workflow completed synthetic external-proof
submission and purpose-leased Ops verification, virtual-device passkey
registration, signed Note publication, private reply, private evidence lease,
confirmed Ops approval, wrong-author/stale-version refusals and exact-author
retry. Creator feed delivery returned200. The creator then signed a reaction:
the actual reaction POST returned200 and its matching signed row persisted.

The next UI assertion timed out because it used exact plain text for a reaction
link whose accessible label includes verification navigation and whose child
seal contributes visible text. This is not a complete browser acceptance result.
The accepted tuple remains preserved for continuation, replay and native checks:

| Object | Actual56710 identifier |
| --- | --- |
| Note | `588a98e7-3c71-4ef2-a562-48b6b8e9b6b2` |
| Note signed act | `738af0c3-451f-4460-a183-faa8e47799ec` |
| Private reply | `adb46a76-8ba7-4c1d-b1a5-16e9e5dc75c6` |
| Reaction signed act | `10a493ff-9d4d-480a-b0a3-46331d5f7896` |

The original accepted command and result are private in
`acceptance-browser/reply-review-5d3f44b0.json`; no credentials are committed.
Continuation must reuse this tuple, not publish/sign a replacement to hide the
failed assertion. Native and lifecycle qualification remain pending.

The continuation corrected both Content and thread assertions to use the actual
accessible link label (`Open the verification page`). An initial continuation
used an incorrect abbreviated suffix and timed out; it did not replace or
re-sign the accepted fixture. The final continuation passed **7/7 groups, exit0**:

- Bound the original browser origin, stack configuration, session owner,
  approved reply tuple, signed acts and persisted idempotency receipt to56710.
- Fresh genuine creator and reply-author browser sessions read the accepted
  Content reaction and creator feed.
- The exact original command replayed from a fresh current creator API session
  returned200 and the identical result. There remained exactly one reaction and
  one reaction signature. This is a fresh-session replay, not a replay in the
  now-closed original browser session.
- An independently serialized reaction command hashed to
  `df7e088bef1e046282d5824a3d5560441e349f104df73507b299fee6030b87b0`, matching
  stored and public signed-act hashes. Public verification returned valid and
  disclosed no private reply body.
- The actual author opened a conversation through the normal API with current
  synthetic provider consent; its existing membership needed no new trial grant.
  The web thread rendered the real Note/reaction and navigated to the exact
  public signature. Screenshots were inspected.
- Complete compared Note/publication/reply/review/reaction/signature/command
  rows remained byte-equivalent as JSON, including their original timestamps.

Private final evidence is `browser-resume-verified/reply-review-bd188efc.json`
and `native-fixture-bd188efc.json`. That native fixture contains the original IDs
above and its source-evidence checksum. It is not a synthetic reaction fixture.
The existing scenario supports `--resume` for accepted evidence; new receipts
include explicit API/web/database/system-identifier binding. Legacy receipts
additionally require the original private stack environment file:

```sh
node tests/scenarios/lane-6/e6-reply-review.mjs \
  --api http://127.0.0.1:56711 --web http://localhost:56712 \
  --db postgresql://postgres:foundation-test-only@127.0.0.1:56710/creator_stack \
  --out /tmp/qelvora-studio-reply-1027/browser-resume-verified \
  --resume /tmp/qelvora-studio-reply-1027/acceptance-browser/reply-review-5d3f44b0.json \
  --resume-stack-env "$TMPDIR/qelvora-stack/lanestudio122-1027/backend.env"
```

## Same-reaction native and web lifecycle checks

The same accepted fixture passed #516's actual iOS and Android journeys. iOS
used a fresh signed x86_64 build for the observed Intel host and preserved owned
simulator. The initial prepared locator assumed nested signature buttons; the
observed hierarchy showed sibling buttons sharing a row identifier. Only the
scenario was corrected. Its final run passed **1/1, zero failures/skips,53.022s**,
including the full hash visible above the tab bar. Android reused the preserved
APK (product source unchanged) and passed **all7 reported groups, exit0**. No
fresh Android build is claimed; its JDK remains absent.

Both checked actual Note/reaction visibility, healthy refresh, exact public
reaction hash, distinct signature and private-source navigation. Actor five had
the real block created by the runtime probe; native checks explicitly required
the closed-scope response and absence of Note/reaction. This is blocked-outsider
exclusion, not an independent membership-only denial. Normal nonmember modes
remain available. Product source, five-second access window, concurrent reads
and atomic concealment were unchanged. Screenshots were inspected; both owned
devices were shut down afterwards.

Native receipts remain under `native-ios-real-reaction-final/` and
`native-android-real-reaction/` in the private evidence directory. No fixture
reaction or approval was substituted. See #516's updated native qualification
report for build/APK provenance and scenario details.

The existing web `--lifecycle-only` workflow then passed **4/4** on this same
Note: offline conceal/reconnect, pagehide/pageshow, transport failure/retry, and
an actually stalled audience read that could not extend the five-second window.
Its log is `web-lifecycle.log`. Lifecycle/privacy and157 backend tests follow
separately; whole erasure remains unclaimed.

## Actual export and deletion boundary

After both native clients and the web lifecycle finished, the existing reply
privacy workflow passed nine reported groups on56710: runtime hash/version
refusals, revoked-author refusal, actual flagging with a successful creator-feed
read, withdrawal/evidence refusal, complete eight-owner export, owner-output
separation and download authority, streamed artifact integrity, real one-minute
Ops lease expiry, and unpublished-Note refusal.

Export `ce3bb8b6-6996-47f6-8218-dfbfd8e474a4` completed all eight domains. Its
original creation time remained `2026-10-28T04:09:01.393Z`. The existing whole
export recheck streamed Agent, Commerce, Conversation and Growth artifacts and
matched every original byte count and SHA-256; another account received404.
Content contained the private reply body while Trust exposed metadata without
that body or reviewer identity. Private receipts and hashes are in `lifecycle/`
and `lifecycle.log`.

The workflow then unpublished the accepted Note and requested deletion for this
new stack's actor6. These operations occurred only after its accepted reaction
had been verified on web, iOS and Android. Do not reuse/reset this actor or rerun
the browser continuation against its now-withdrawn fixture. The signed acceptance
evidence and original signatures remain preserved.

Deletion `4f6ebc7c-471e-46a0-b134-db72d1f700fa`, created at
`2026-10-28T04:10:02.444Z`, did **not** complete. The scenario exited1 after its
bounded wait. Growth and Media completed; Content reported
`content_retention_unconfigured`, Commerce `commerce_retention_unconfigured`,
Conversation `conversation_provenance_purge_unavailable`, Agent
`accounting_boundary_pending`, Trust `comparison_artifact_purge_pending`, and
Identity `identity_erasure_waiting`. No successful whole-erasure result is
claimed. The job, its timestamps, receipts and tombstones are preserved without
clock changes or forced completion. These are separate existing owner gates,
not evidence that the accepted signed reaction failed.

The157-test backend rerun uses a separate owned PostgreSQL cluster on56720,
`qelvora-regress122-1027-postgres`, so its disposable regression databases and
test-role setup cannot mutate any application or restored cluster.
