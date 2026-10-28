# Core follower metadata — additive0255 qualification

This wave follows the operated122 runtime, signed reply/reaction, native and
157-test results in the [continuation report](creator-fan-denial-runtime-2026-10-27.md).
It reuses the held0185 proposal and existing same-client adapter. Runtime and
real followers pagination remain pending at this checkpoint; source preparation
and administrator-selected catalogue checks are not audience acceptance.

## Source and authority

Additive `0255_w7_core_follow_metadata`, wave `20261027-core-follow`, registers
the unchanged file
`apps/backend/src/modules/growth/migrations/pending_w7_core_follow_metadata.sql`
with SHA-256
`29c0261cdfce50be434d8b8b49c21e23df6057613d521c8e40a13c3928d63796`.
All122 earlier registrations, every reservation (including0185 and its historical
mapping), all other registry fields and applied SQL bytes remain unchanged.

The original adapter retains its genuine request/current-session lease, fan and
creator context, literal safe core role, explicit READ COMMITTED transaction,
same-client checks and final lease recheck. The stock host now supplies a
descriptor resolved from executable registration and fixed review metadata.
Every call independently rechecks that registration, ledger, exact function,
structural guard and selected catalogue. A supplied descriptor or manually
installed function/ledger cannot activate an unregistered executable.

The complete pre-existing structural SQL guard was moved without semantic
changes. New catalogue reads use the original client with a bounded driver
budget and canonical search path, restoring the caller's settings only after
settled reads. The real non-owner check caught a `to_regclass('growth.follow')`
lookup that required unavailable Growth-schema USAGE; it was replaced with a
name-based PostgreSQL catalogue lookup. No grant or SQL was changed to make it
pass, and all measured pins stayed identical.

The actual Content owner still supplies its genuine AudienceIdentity scope,
restoration and participant negatives before Follow metadata on the same held
transaction. The callback does not issue that authority. The alternate Content
development server remains unconfigured; operation uses the stock main host.

## Independently reviewed privilege delta

| Surface | Exact intended change |
| --- | --- |
| Role | One `creator_growth_follow_metadata`, NOLOGIN/NOINHERIT, no elevated flags, memberships or settings |
| Namespace | `creator_growth_metadata`, owned by existing `growth_owner`; core/purpose USAGE, no PUBLIC USAGE or purpose CREATE |
| Session metadata | SELECT only `id`, `account_id`, `revoked_at`, `expires_at`; no bearer hash/cipher or table-wide grant |
| Follow metadata | SELECT only `account_id`, `creator_id`; UPDATE only `created_at` for PostgreSQL row-lock permission |
| Follow policies | Account-bound SELECT and lock UPDATE; write `WITH CHECK(false)`; forced RLS retained |
| Function | One Boolean SECURITY DEFINER, exact core/purpose EXECUTE, fixed path/row security; no content body or positive scope |

Every `pg_roles` role was reviewed, including built-ins and unrelated roles.
All existing relation/column/policy/sequence and existing-function reach stays
unchanged. PostgreSQL's `pg_read_all_data`/`pg_write_all_data` gain implicit USAGE
on the new namespace but no Follow EXECUTE. The incoming Growth login inherits
EXECUTE through core membership; the unchanged function requires literal
`session_user='creator_runtime'`, so inherited privilege alone is not admission.
The session table's existing definition, RLS behavior, constraints, indexes and
triggers remain unchanged. New-role reach is checked independently of unchanged
old-role comparisons.

## Source qualification observed

Fresh122 and independently restored populated122 were each measured without and
with a rollback-only incoming Growth login. All49 corresponding profile groups
match between fresh/restored captures. All six custody dimensions match after
rollback: ledger, schema, data, roles, security and sequences. The dedicated
namespace was added to the shared schema-custody reader before final acceptance;
all122 digests stayed byte-identical, while123 now includes its function/schema.
Earlier captures and failed attempts remain separately preserved.

Both final restored source probes passed **30 checks each**, including **25
refusals**:23 structural privilege/function/policy drifts and two ledger drifts.
Positive core-role checks match the measured catalogue; administrator-selected
metadata identity is explicitly not a genuine interactive session receipt.

| Fixed metadata | SHA-256 |
| --- | --- |
| Exact function definition | `1b09d91fe20b712f5452ca5d79fa352f94482283edeaaac4543558975c761a78` |
| Core catalogue, no Growth login | `48020ae2ec5c0a723418afef80e9170ba451eaf87de857582b78da6302377d89` |
| Core catalogue, incoming Growth login | `65c1ad724664ca274c1cbd81c87d7275c0997089365bb7135117ecdc071655db` |

The single `runtimeCatalogues.family` pin remains the no-Growth diagnostic.
Incoming Growth measures a different value accepted by the explicit
`original-incoming` family profile. Do not describe the Growth catalogue check
as wholly matching or replace the diagnostic with a live readback.

## Closed upgrade and preserved resources

The actual closed122→123 operator passed on56780, applying only0255. It retained
all122 historical ledger entries, six original business rows across191 tables,
all64 original roles and the original sequence. The intended new role brings
the total to65;35 purpose roles and the fixed privacy checks passed. Its
catalogue check passed **49/49 groups,56 digests,zero unknown groups** without
Growth. The database remains traffic-closed with `releaseReady:false`.

Final backend typecheck, focused lint/format, whitespace and full prior-source/
reservation preservation checks passed. The157-test run belongs to the earlier
122 checkpoint; it has not been rerun for0255. No unit tests were added.

Private backups, captures, manifests and failed/successful receipts are under
`/tmp/qelvora-core-follow-1027.ZlnjEu/`, outside Git. The no-Growth122 baseline
on56740 and independent restored122 copies on56750 remain traffic-closed with
64 roles. They retain six original rows across191 tables and all122 ledger rows.
The spare bootstrap `creator_stack` on56750 has no API but was not marked closed;
do not confuse it with the explicitly closed restored/verification databases.

Restore initially lost explicit same-owner ACL representation on seven empty
scope tables. The documented owner-only ACL replay on new restored copies made
all six custody hashes equal; originals were untouched. A separate raw restore
on56770 exposed an older reader's OID-ordering of a multi-role policy. That
diagnostic copy is preserved with its container stopped. The upgrade target
`follow_upgrade122` on56780 is now123 and uses the captured
original role creation order so fixed122 checks remain intact. This is a restore
procedure limitation, not a reason to weaken pins or rewrite earlier readers.

Because0255 creates a cluster-global role, the upgrade target is separate from
the preserved baseline and independent verification clusters. A newly created
current archive and distinct restore are required; old/expired manifests are
never reused. `upgrade-target122-pre0255.dump` and
`upgrade-122-to123.json.manifest.json` were consumed by this upgrade; never reuse
them against the now123 target. The archive's freshness window ends at
`2026-10-28T05:43:05Z` (October27,22:43:05PDT), but being unexpired does not make
that old manifest reusable. Fresh123 runtime is reserved for56760–56763 and has
not been created. No old reply actor/database, accepted122 deletion job,
tombstone, signature, backup or clock is reset.

Pending: fresh123 installation/catalogues, genuine same-client/session/fan/
negative runtime admission, real natural expiry,
privacy behavior and the existing52-publication followers pagination. No actual
follower acceptance, whole erasure, physical device or production claim is made.
The prepared runtime script passes syntax/lint/format only. Durable same-stack
resume and private original expiry-token checkpoints are still unfinished and
must precede its first operation; its current preflight refuses existing state.
