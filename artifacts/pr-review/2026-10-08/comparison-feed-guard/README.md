# Disconnected comparison evidence — October 8

When the canonical host has no trusted comparison feed, retained SQL samples or
a saved pass must not authorize replacing the published AI. Studio now exposes
that missing dependency in its gates, the publication command refuses it, and
the comparison read route returns no saved result text. Creator authentication
still runs normally. First publication is unaffected by this upgrade-only gate.

The same configured feed is passed into AgentService and ShadowReplay. Existing
comparison test setup now supplies that shared feed; no unit tests were added.
All 15 existing shadow evidence/compatibility tests, backend typecheck and build
pass. This closes the disconnected case, not original-owner revocation races
when a future producer is connected.

The compiled `54aea444e59c4bc46a6664229e07026d952abdbb` backend was operated
through the actual local web app. The preserved Maya creator signed in through
the real development identity flow and opened My AI → Test it as a fan. Studio
showed live v1, draft revision 5, the new missing-feed gate, and disabled Compare
versions / Publish v2. No provider request, evaluation, publication or consent
was manufactured for this check. Before/after custody retains all eighteen
generation operations, 69 usage rows, 36,815 microdollars and 51 settled units;
version, evaluation, messages and reservations also match exactly.

[Operation receipt](operation.json) records the source identities and screenshot
digest. The screenshot and full before/after receipts remain in the local
October 8 `native-e2e` operation directory. Native Light/Night, sends, drafts and
keyboard/reconnect evidence remains in [#338's milestone](../native-message-reliability/README.md),
which merged at `8f39888953f4016b2059d2dceeb5867e8765748f` after all ten head
checks passed. This increment changes Studio/backend guards only.

An idle SIGTERM of the former `9f1a50eb4` host reported a generation worker and
backend shutdown failure. Its log and exit status are retained; its exact cause
was not exposed. `68bfa36fb03188c5a79d8090516629240a6866b4` adds bounded causal
categories to shutdown diagnostics without exception messages, stacks, SQL,
connection values or provider content. A subsequent stop while the actual idle
worker was executing SQL exited successfully. This is an observation, not a
claim that the earlier shutdown failure is resolved. Accounting and cleanup
failures still reject shutdown; none are suppressed based only on an aborted
signal.

The original Conversation producer remains work in progress: distinct explicit
fan consent, current processor/source authority, sanitizer qualification,
original provenance, per-call admission, physical expiry, export/deletion and
atomic invalidation of derived results must all be prepared before activation.
No new comparison migration or consent was applied. The complete
[product finish plan](../../../../docs/operations/product-finish-plan-2026-10-08.md)
and real existing-version upgrade remain open.
