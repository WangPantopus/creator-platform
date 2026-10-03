# Sealed packet publication composition

Implementation source: `625afae81eab5d06b70e12e82a2c6ffc8e157da4`.

Implemented: W5 consumes W4's genuine factory from immutable `5220914d24b4fbd23b5b0b6b85330495519f6618`, including its permission helpers and Studio composition guard. Both W5 entry points reject an unissued or differently pooled source; conflicting source instances are rejected before assembly. The factory holds original participant negatives before positive packet locks and performs its final original signer/consent/payment/document/signature checks after publication work. No viewer permission is substituted for a publication source.

W5 also consumes W7's publication-proof effect consumer from `067a81d85a62676446c5f37969c6615650ef8f76`. It uses the current held owner proof without a fan read and requires a real `published: true` projection receipt. This branch's older Growth producer returns void, so it correctly refuses completion. W7 confirmed that its actual receipt producer also requires its canonical current creator refresh; that complete producer remains an integration dependency. No empty callback or raw inserted row is treated as proof of distribution.

Runnable: backend types, scoped lint/format and generated contract checks pass at this source. Initial compilation caught missing W4 permission exports and the old void Growth result; both were resolved before this checkpoint. No new test code was written. Existing shipping native builds and personally operated web/native evidence belong to their separately recorded source commits, not this backend-only change.

Integrated: actual owner source and consumers are wired as optional dependencies. No `server.ts` edit, migration registration/activation, raw worker grant, synthetic signer, provider key, packet delivery claim or group fulfillment plan was added. Reserved0070/0081 and the genuine same-pool host assembly remain prerequisites for configuring W4's factory. The legacy composite content/Growth development pool does not become canonical owner authority.

Verified: the owned development API started at this exact source. Actual `/health` returned200 with `foundationReady: true`, `ready: false`, development identity and unconfigured generation. Actual `/health/ready` returned503 with its real missing capability list; see `actual-startup.json`. This qualifies startup only, not a positive sealed packet publication, paid consent/capture, signature replay or distribution receipt. No domain record was fabricated.

Release-ready: no. Paid packets have no Stripe sandbox; genuine signing needs W1 ops review plus the human's Touch ID ceremony; future source/signature/denial activation, W7 canonical projection and W4's real0094 group fulfillment plan are still unavailable. All nine W5 packages remain assigned. The creator remains DEVELOPMENT-ONLY SEEDED VERIFIED, without proof or passkey.

Separately, PR80 merged normally at `36fe20f98b40707fbf2d2c6c67509691077071d9`, after all five Foundation jobs passed in pull-request run36977707200 against exact head `b7a72cd10734284d29d70241202764615bc94308`. This merge is not acceptance for this source.
