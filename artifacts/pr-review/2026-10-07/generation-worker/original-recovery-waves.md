# Retained original W2 archive: sequential recovery waves

Source `4f5b1413` preserves the three reviewed wave packets and validates their complete registered100-source chain. It executes only the selected wave; the canonical pre-generation privacy catalogue is used only before the generation wave. Its original closed-database, current backup, independent restore, role/security, ledger, data, sequence and sole-COMMIT checks remain.

The actual recovered original W2 candidate advanced through these individually backed-up operations:

| Operation                               | Actual sources applied                               | Original rows preserved |
| --------------------------------------- | ---------------------------------------------------- | ----------------------- |
| Original28 → canonical40 (merged PR328) | 12 plus independently source-derived original grants | 1,001                   |
| Canonical40 → canonical57               | 17                                                   | 1,001                   |
| Canonical57 → canonical61               | 4                                                    | 1,001                   |
| Canonical61 → registered100             | 39                                                   | 1,001                   |

Each transition retained every prior migration record/checksum/timestamp and original business column/row, role and sequence. New source-defined roles were created only by their actual SQL. Skipping directly from40 to the privacy61 wave refused and left all six custodies unchanged. Applying the initial wave to the completed100 database also refused unchanged; generation replay applied zero SQL.

The final candidate contains100 migration records,176 business tables and1,001 rows. The original running deletion request remains running. A genuine post100 custom-format backup is1,750,719 bytes, SHA-256 `51ab9b64a590cfd468fcc1df1ddb1f9b02b4bfdfa347b3194799b430a993a8bc`. Its independent closed restore matched all six digests:

| Custody        | SHA-256                                                            |
| -------------- | ------------------------------------------------------------------ |
| ledgerSha256   | `d1ce2bc26f43b97d6fe66a82e916b41989ff2a422c83dd70f0f97cf1bb62139e` |
| schemaSha256   | `b18b6cb0f70284d783274135033aa014c48218197b233de4ec4b4ebaf747150e` |
| rolesSha256    | `53fc55601035472c89dc503929a8c71801ce62c7b03b033ce69473c742bd7412` |
| securitySha256 | `d747c93f6da7f2a38c8beef1adaffabc761f0195ac990300e8ecc26479e1729f` |
| sequenceSha256 | `f8972cca80cce94d0073109accf305795e50315aade9cd9dbb0b18a50dc6ed71` |
| dataSha256     | `6fef769f4336fc86e28390993d0c07a06212797f28499a4010b4cd5c4b5a17c0` |

For pg_dump's omitted explicit owner-only ACL representations, only the original source's owner-default entries were restored after checking equal effective owner-only permissions and exact owner. No additional capability was granted. Final schema, roles and effective security also match the independently activated generation reference; ledger/data/sequence digests retain the original W2 archive's different history and rows.

All original raw28 copies, canonical40 copies, intermediate backup restores and final100 copies remain closed with the owner-controlled marker and connection limit zero. No application clients were enabled. Private dumps, manifests, receipts, credentials and SQL remain outside Git.

Validation: actual selected wave operations and refusals above, independent post100 restore and replay, backend shipping build under the shared W2 token, typecheck, scoped ESLint/Prettier and diff check. No new tests. The independent main recovery source has its own successful build/nine existing contracts and both exact-head CI web/backend runs passed18 existing tests plus production builds; compilation passed. Focused PR328 normally merged `51d8f940` to `c85d7dd3`, whose tree exactly matches the operated source. Native/visual jobs were pending at that merge, not passed. Draft132 integrates main at `fc4d5a9f`.

This is recovery/activation evidence. Full privacy registration, all-eight export/purge, expiry/reconciliation/restore replay, provider/worker delivery and product release remain unfinished. The still-reserved Content0198 export source is a separate prerequisite; matching generation metadata does not activate it.
