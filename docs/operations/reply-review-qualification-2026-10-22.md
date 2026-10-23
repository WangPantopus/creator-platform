# Private Note reply review qualification, 2026-10-22

Status: candidate source and closed qualification are implemented; restored
upgrade, application journeys and privacy operation are still pending.
This is a separate local increment after the app-completion branch. It does not
record a deployment, production acceptance, an Ops decision, or completed erasure.

## Scope and verified baseline

The active graph has 120 migrations through `0252_w2_workspace_lock_wait`.
The unchanged proposal is `apps/backend/migrations/0069_w8_reply_review.sql`,
SHA-256 `65a86e17256a872bcbf640006274512a29e3bda31232838c68fe3aa5df2a958a`.
Historical reservation `0156_w8_reply_review` and the frozen held-version map
remain preserved. At audit time 0253 was the next unallocated version; allocation
must be checked again before registering the proposed new wave.

The minimum SQL addition is this one source. The existing graph already supplies
0045 Content review storage, 0053 runtime audience/denial projection, and the
0074/0082 current Content and denial fences. The stock server already prepares
the Trust reviewer from the genuine backend runtime and passes the original held
Content transaction. No additional held SQL or provider credential is required.

Read-only metadata on the owned integrated stack confirmed all function
signatures, the three expected PUBLIC policies, and the original safety-case
kind list. The new projection role and both Trust review tables were absent.
Two unexpired development Ops memberships currently have safety-queue authority.
Those synthetic accounts do not establish production staffing or human acceptance.

The proposal creates one review case per exact reply/version/hash. Private text
stays in Content. Only an actual purpose-leased Ops decision can return allowed
or flagged; an unavailable reviewer leaves the reply pending. It does not approve
automatic moderation or expanded paid-tenure limits.

## Required integration

- [x] Recheck allocation and propose one new source registration after 0252,
  retaining the historical reservation and immutable SQL/frozen-map bytes.
- [x] Add a reviewed wave with the exact 120-source predecessor and a new
  complete-graph profile. Extend fresh installation, canonical bootstrap head
  recognition, the closed upgrade operator and fixed predecessor role/privacy
  checks without weakening their custody requirements.
- [x] Select the new profile only through the exact active executable source.
  Preserve earlier profiles and the original reply-review catalogue pin
  `2f477720a8ab473540e541dd3e15a7433bcd023e58b0aed586ca57a5003c1664`.
- [x] Teach the catalogue tool to measure the reply-review purpose catalogue;
  its current review-file groups do not cover that feature-module constant.
- [x] Review every intentional reach change: isolated NOLOGIN purpose role,
  exact grants/functions, forced RLS on the new tables, three PUBLIC policies
  restricted to the core runtime, and the lock-only UPDATE(version) grant whose
  policy refuses writes. New tables change every full-relation catalogue even
  for roles without access; digest regeneration alone is not a reach review.

## Qualification gates

- [ ] On an owned PostgreSQL 17 stack, preserve a 120-source baseline snapshot
  before candidate DDL. Qualify original SQL in a rollback-contained transaction;
  repeat actual role/grant/policy/function/source drift refusals. A matching
  manually inserted ledger must not activate an unregistered proposal.
- [ ] Build a fresh 121-source graph and independently restore the 120-source
  predecessor. Use the real closed-traffic operator with a current private,
  hash-verified backup/manifest and independent restore. Compare ledger, schema,
  business data, security, roles and sequences; preserve all old rows/history,
  original deletion clocks, unresolved costs and existing role credentials.
- [ ] Measure fresh and restored profiles with and without the incoming Growth
  login. Review the exact catalogue diff, then capture fixed pins. The existing
  Growth diagnostic is 44/45 because its single family pin has no incoming
  alternative; preserve that evidence unless separately fixing the diagnostic.
- [ ] Start the real application, publish a synthetic signed Note through its
  actual creator workflow, and create a reply using the original author session.
  Operate queue, purpose lease, exact evidence, allow/flag decision, author retry,
  creator delivery/reaction, idempotency and withdrawal. Check saved case,
  decision, review, source and signature records; no direct approval row writes.
- [ ] Refuse another author, wrong version/hash, revoked session, expired Ops
  membership/lease, changed or withdrawn source, creator denial and restored
  closed traffic. Review failure must not deliver a pending reply or expand
  access. Run relevant existing static/backend checks and real browser journeys.
- [ ] Operate export and deletion through original owner paths. Verify Trust
  exports only the author's review metadata, Content owns the actual body, and
  cross-account downloads are denied. Verify Trust review deletion cascades to
  decision rows; keep unfinished domain tasks visibly unfinished. No forged
  completion receipt, clock advancement or bypass of Content's refusal.

## Authority and remaining limitations

Local source/profile qualification needs no new product-policy decision. Ordinary
data already has the approved immediate-denial/day-30 purge policy in
`W8-approved-retention-20261002.json`; detached known costs retain twelve calendar
months, and unknown costs preserve their original bounded reconciliation period.
The older continuation's statement that Q16 is unanswered is historical.

Deletion is still an implementation gap: `content/privacy.ts` refuses every
non-export operation with `content_retention_unconfigured`. Trust already has
conditional export/delete handling for the new metadata, including decision
cascade, but it also retains minimal receipt/tombstone shells and has separate
account-dispute handling. A successful reply-review increment cannot be called
whole-account erasure acceptance. Existing original deletion maturity is not
changed by this work.

Production staffing/escalation, real creator/provider ownership and physical
device/provider acceptance remain separate. Hosting remains undecided. Local
synthetic sessions, passkey fixtures and decisions must remain explicitly
labelled as development evidence.

## Source checkpoint observed

Candidate `0253_w8_reply_review` is registered only on this isolated branch under
`20261023-reply-review` (UTC date). The new filename also follows the workspace
review in the existing catalogue tool's chronological selection. The 0156
reservation, frozen map, source SQL and all earlier review files are unchanged.

- The unchanged source compiled and was inspected in a rollback-contained
  transaction on the owned 120-source database. Ledger, schema, data, roles,
  security and sequences matched after rollback: six business rows in 189
  tables were preserved. Before executable registration, an actual matching
  hand-installed ledger row still did not activate the proposal.
- The candidate checks accept the fixed120 predecessor and the proposed121
  role/privacy graph. Both request-role catalogue checks passed as explicitly
  administrator-selected metadata checks. Ten real role/grant/RLS/policy/function
  drifts were refused and rolled back. These do not issue author or Ops authority.
- Four catalogue profiles were measured with proposed SQL inside rollback on
  the original120 and independently restored120 databases, each with and without
  the incoming Growth login. Only purpose, original-family and provenance-purge
  variants differ. Fixed values are in the new review; nothing is captured at
  application startup.
- A separate owned PostgreSQL17 cluster built all121 migrations from empty
  through the real fresh installer. Without Growth, the actual catalogue check
  passed **46/46 groups, 51 digests**. The additional group covers reply-review.
  A live Growth catalogue check was pending at this source checkpoint; the
  independent preserved upgrade is recorded below.
  The earlier graph's documented44/45 Growth diagnostic is not relabelled here.
- Backend typecheck and the focused source lint passed before this checkpoint.

The two existing source relations were inspected for every existing application
role:47 roles /94 role-relation pairs. All prior SELECT/UPDATE column privileges
are identical. Effective policy changes for roles with relevant privileges are:

| Existing role | Effect of restricting the old PUBLIC policies |
| --- | --- |
| `creator_runtime` | Same policies and predicates still apply. |
| `creator_w5_content_privacy_export` | The unchanged explicit `w5_content_export_metadata` SELECT policy remains on both relations. Its original body, scope, lease and deferred-COMMIT guard still own exports. |
| `creator_commerce_public_read` | The unchanged `public_packet_metadata` SELECT policy remains on publication. |
| `creator_w5_generation_origin` | Its unchanged `w5_generation_origin_read` and lock policies remain on publication. |
| `creator_owner` | Loses the PUBLIC reads/update on these forced-RLS relations. It is NOLOGIN; no SECURITY DEFINER owned by it references either source relation. It is not a runtime body reader. |

All other existing roles either retain the same effective policies or have no
relevant source privilege. This metadata review establishes the intended narrowed
reach. Actual export, generation, packet and reply behavior still need operation.

The repeatable rollback probe is checked in:

```sh
node --import tsx tests/scenarios/lane-2/e2-reply-review-source.mjs \
  --db postgresql://postgres:foundation-test-only@127.0.0.1:56650/creator_stack \
  --out /tmp/qelvora-reply-review-1022/source-repeat.json
node infra/local/stack.mjs catalogues check --lane reply-fresh-1022 --base-port 56670
```

Use only an owned loopback PostgreSQL17 database with the exact120 or121 source
graph and a private output directory. The probe always rolls proposal SQL,
metadata ledger entries and adversarial drift back; it creates no product proof,
case, decision or erasure receipt. Detailed metadata, initial harness failure
(missing bounded driver timeout), corrected captures and backups remain private
under `/tmp/qelvora-reply-review-1022/`.

## Preserved upgrade observed

The actual `activate-wave` operator accepted the current private backup and
independent restore manifest for the closed `reply_restored120` target. It applied
only `0253_w8_reply_review`:120 prior ledger rows were preserved,121 rows remained.
Before operating, all six custody dimensions matched the independent
`reply_verified120` restore. Afterwards all six original business rows in189
tables,63 existing roles, the original sequence and the prior source history
were preserved. The backup/restore security capture covered17,597 records.
The operator reported34 purpose roles, two checked private purposes, traffic
closed and `releaseReady:false`; this is not permission to reopen production.

The upgraded target and the separate fresh cluster both passed **46/46 catalogue
groups,51 pinned digests**, without incoming Growth. Private receipts are
`upgrade121.json`, `upgrade121.manifest.json`, `upgrade121.log`, and
`restored121-check.log` under the evidence directory above. The repeatable actual
operator scenario is `tests/scenarios/lane-2/e2-reply-review-upgrade.mjs`.

Prepare an owned exact120 PostgreSQL17 target, close traffic (`CONNECTION LIMIT
0` and the `creator-platform:restored-traffic-closed` database comment), then take
a current custom-format dump and restore it into a **distinct** owned database.
The scenario deliberately does not silently create, reset or repair either DB.
For the owned cluster in this run, the backup ceremony was equivalent to:

```sh
umask 077
mkdir -p /tmp/qelvora-reply-review-1022
docker exec qelvora-lanereply-1022-postgres \
  pg_dump -U postgres -Fc reply_restored120 \
  > /tmp/qelvora-reply-review-1022/restored120.dump
docker exec qelvora-lanereply-1022-postgres \
  createdb -U postgres -T template0 reply_verified120
docker exec -i qelvora-lanereply-1022-postgres \
  pg_restore -U postgres -d reply_verified120 \
  < /tmp/qelvora-reply-review-1022/restored120.dump
docker exec qelvora-lanereply-1022-postgres psql -U postgres -d postgres -c \
  "ALTER DATABASE reply_verified120 CONNECTION LIMIT 0; COMMENT ON DATABASE reply_verified120 IS 'creator-platform:restored-traffic-closed';"
node --import tsx tests/scenarios/lane-2/e2-reply-review-upgrade.mjs \
  --db postgresql://postgres:foundation-test-only@127.0.0.1:56650/reply_restored120 \
  --verify-db postgresql://postgres:foundation-test-only@127.0.0.1:56650/reply_verified120 \
  --backup /tmp/qelvora-reply-review-1022/restored120.dump \
  --out /tmp/qelvora-reply-review-1022/upgrade121.json
```

Do not rerun these commands over the now-upgraded target or an existing restore.
The operator scenario requires a backup less than one hour old and private file
permissions. Syntax and focused lint passed. Runtime author/Ops and privacy
journeys remain separate gates.
