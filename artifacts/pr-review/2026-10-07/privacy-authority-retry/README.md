# Retry temporary database failures without weakening privacy authority

Actual Content export on draft132 exposed a PostgreSQL55P03 table-lock failure nested beneath `privacy_original_family_unavailable`. The original worker treated every such wrapper as permanently unavailable metadata, so a temporary conflict became a blocked task.

Main source `8e93a7070fc0a62b6c195bf810d4333231be7db4` recognizes only actual PostgreSQL `DatabaseError`55P03/40001/40P01 causes reached through the two known original task/family authority wrappers. It retains the original error code and bounded retry/backoff/eight-attempt behavior. A new claim runs all authority, source and lease checks again. Unknown causes, cleanup aggregates and permanent permission/catalogue failures keep their existing disposition. No authority check, task scope, COMMIT condition or success receipt is changed.

Personally operated the independent main source on a labelled canonical61 application copy restored from the closed original archive, with all six custody digests matching before application operation:

- Canonical development identity HTTP and the original privacy endpoint created an actual export job; no session, task or lease row was inserted by the operator.
- A separate database connection locked the already claimed Identity task row. The original held0087 fence refused with55P03, preserving `privacy_commit_fence_unavailable`; the source rolled back and the diagnostic lock released. The worker reclaimed the same task and completed its original Identity export on attempt2.
- Actual BYPASSRLS drift on the original fence role still produced a blocked task on attempt1, without data or receipt. The role was restored, and the private task scope remained empty.
- Host shutdown completed with zero other clients, the connection limit0/restored-closed marker reinstated and all temporary passwords removed.

The final original hook observations were30ms for refusal and100ms for successful retry, not p95 results. An earlier successful diagnostic used a mistyped release label; the corrected complete run above uses the actual full source SHA. The separate draft132 operation also passed populated Content export/retry/account separation and real family-role drift refusal.

Main production backend build, scoped lint/format/types and nine existing contracts (74ms) pass. An initial contract command had a shell PATH error before running tests; the corrected invocation passed. No new repository tests. Exact-head CI and normal merge are pending. This worker repair does not complete all-eight privacy, deletion, generation or release acceptance.
