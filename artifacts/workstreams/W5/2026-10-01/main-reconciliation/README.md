# PR9 reconciliation with current main

The original W5 branch is reconciled with `ebb24c7e640d972933ca907a673bb879b8190a56` (merged W3 PR8 and W8 PR15). The original implementation and evidence remain on `codex/w5-studio-content`.

The exact published W8 adoption operator was first exercised on an independently restored copy, then applied to the original database after closing W5 traffic and independently restoring a second fresh backup. All 35 old migration records and all 281 existing rows across 136 tables were preserved; 48 ledger records now contain the canonical aliases and six missing active migrations. The ordinary runner recognizes all 40 canonical migrations without replaying SQL. Private backups, row fingerprints, operator receipts and credentials remain outside Git.

Reconciliation keeps current main server assembly, W1 session/origin/account protections, W3 audited canonical timeline reads, W4 offer-pending queue state, W8 reply-review schema checks and all peer artifacts. W5 adds its complete draft/media/content consumer work and current-role/privacy fences. Canonical generated clients retain all main operations plus W5 commands. Original W5 evidence is retained; conflicting prior-main W5 evidence is archived in `prior-main-evidence` so neither observation is silently lost.

Backend/web production builds, types, generated consistency and scoped lint passed. Native builds and operated combined application acceptance are pending at this checkpoint. Genuine creator signing remains blocked by the user's explicit instruction; no hardware proof, media provenance, approval/payment/delivery or privacy receipt is fabricated. This checkpoint resolves source conflicts and is not a release-readiness claim.
