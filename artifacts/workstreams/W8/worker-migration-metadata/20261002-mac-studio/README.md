# Worker migration metadata — closed review, 2026-10-02

Held `0201_w8_worker_migration_metadata` grants only `SELECT(version,checksum)` on the existing canonical ledger to the original isolated publication and callback worker logins. It refuses role membership/settings/ownership, broader ledger capabilities, writes, timestamps and grant options. It creates no roles, aliases, receipts, family capabilities or active registry entries.

The actual frozen role-creation prefixes from W1 publication source `100e3192…` and W6 callback source `d3b16596…` were executed inside rolled-back transactions on the separately restored, closed W8 synthetic61 database. Both administrator-selected worker identities read the real unchanged0103 checksum. This is catalog qualification, not a password login, provider ingress or application effect. Eight actual drift mutations refused and rolled back. Repeating the exact grant body is idempotent. All six independently captured custody hashes match before and after, including61 ledger rows and153 business rows/163 tables. No activation is performed.

W1's exact `a7ce54d1` early core-role preflight was reviewed separately on W8 integration (it is outside this focused proposal): unchanged61 passes; a real temporary `creator_runtime` Growth membership is refused before any wave SQL. W1's server and shared roots remain under W1 ownership.

Consumers must attest the actual registered0201 path/hash as well as their own0158/0161/0176 source on the same held original worker connection. Missing registration or unavailable provider/currentness/C10 policy remains a refusal. Original SQL files and applied migration history are unchanged. No new unit tests, fabricated credentials or paid calls.
