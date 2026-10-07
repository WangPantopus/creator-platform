# Original W2 archive recovery qualification

The retained October 1 archive was restored twice into isolated closed
PostgreSQL 17 databases. All six custody comparisons matched. An independent
installation of its first 28 canonical sources matched every non-ACL schema
component: 3 schemas, 122 relations, 1,019 columns, 482 constraints, 242 indexes,
204 policies, 8 functions and 7 triggers. The archive omits global roles and ACLs;
the eight roles and the recovery grants are derived from original source, not
claimed to reproduce unavailable historical privilege evidence.

The source-pinned recovery command was personally operated on a separate closed
candidate. Five preflight failures rejected an incorrect database-bound plan,
changed backup bytes, an expired backup, an independent restore role mismatch
and another connected client. All six before/after custody digests were unchanged
after those refusals. The successful operation restored canonical grants and
executed twelve missing source files in one transaction. All 28 original ledger
records and timestamps, original roles/sequences and all 1,001 original business
rows were retained. The resulting 40-source catalogue matched the independent
fresh canonical source reference. A subsequent read-only plan had no SQL, and
applying recovery again refused without mutation.

A genuine post-recovery backup (780,740 bytes;
SHA-256 `1b10bd1b7fe4bc4c54bf35d01eb4cbfa7cb379fe15606ed934045e6e6f837646`)
was independently restored into another closed database. All six digests matched:

| Custody       | SHA-256                                                            |
| ------------- | ------------------------------------------------------------------ |
| Ledger        | `75857176d9ebd965d84b1405b21288ccbb157799c7b7c4985a7a9036ef63618f` |
| Schema        | `c644f2e880991f1478bf372060ff42a95e2cb919fa8ef976d7a9fe37853cd1f9` |
| Roles         | `e8097346607bd048643b6fc395981cc8477e89d3de131158f6aaabbd04f19861` |
| Security      | `f652201d158c77f7c47483b39a112c3415f827de36ccb39c7d8c11b6105cde38` |
| Sequences     | `f8972cca80cce94d0073109accf305795e50315aade9cd9dbb0b18a50dc6ed71` |
| Business data | `bb51c096a0963d4541a53483fa59f60b02572c1ecee0e42dbce6db8e4ee619d5` |

Both copies contain 40 ledger records and 1,001 business rows across 145 tables.
Both retain the original running deletion request and have connection limit zero,
the owner-controlled traffic-closed marker and no other clients. Raw archives,
SQL, credentials, manifests and operation receipts remain private. No original
archive/copy was overwritten, and no original migration checksum was rewritten.

This proves only the bounded archive recovery. Later waves, complete privacy
registration, generation/provider integration and production release remain
unfinished. No application traffic was authorized. See the
[operator runbook](../../../../docs/operations/W2-original-archive-recovery.md).
