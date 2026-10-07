# Trust configuration handoff cleanup

Source `0007ed1e` on main `c3212577`; equivalent integration repair `bba7d535` on draft132. During actual Content host operation, invalid release metadata was correctly refused, but two already acquired Trust PostgreSQL backends remained connected after the configured host failed. The runtime had not returned its `stop()` owner, so outer cleanup could close only core.

The host now owns configuration cleanup until runtime preparation succeeds. Refused identity/environment validation or runtime preparation settles the protected artifact store and each distinct owned Trust pool, preserving the original failure alongside cleanup failures. Explicit caller-owned pools remain with their caller; the original core pool stays with outer host cleanup.

Personally operated on the independent main source using real core/API/worker password pools against the closed canonical61 archive copy:

- Invalid release refuses and closes all owned pools and original core.
- Identity/environment mismatch refuses at the host boundary and closes all pools.
- A real worker BYPASSRLS drift after configuration preparation is refused by the runtime's own database role check; all pools close and the original role is restored.
- With `closePoolsOnStop=false`, both caller-owned pools remain usable after release refusal and are then closed by their actual owner.
- An already-ended actual API pool produces a cleanup error; the original release failure and cleanup failure both survive, while worker and core still close.
- Valid composition serves health200 and readiness503 under the original restored-closed marker; repeated shutdown settles once.

Each case ends with zero other database clients. Original-null passwords are removed, connection limit returns to0, the restored-closed marker remains, and all six ledger/schema/roles/security/sequences/data digests match before and after (1,001 business rows). No sessions, privacy tasks, consent, provider calls or domain data were manufactured. The earlier diagnostic assumption that INHERIT alone would fail this runtime check was incorrect; its run preserved all six digests and is retained privately. The final case uses the actual BYPASSRLS predicate enforced by that check.

Main shipping backend build under the shared W2 lock, scoped lint/format/diff checks and nine existing contracts (74ms) passed. No new repository tests. Exact-head CI and normal merge remain pending. This narrow startup cleanup is independent of draft132's Content source activation and export work; it does not qualify full privacy or generation release.
