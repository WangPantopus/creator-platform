# Creator-only ownership for domain transactions

`apps/backend/src/modules/identity/creator-scope.ts` exports `CreatorIdentityAuthority` and a branded, process-local `CreatorScope` carrying creatorId/accountId/development. It does not create a fan/thread, publish a license, grant audience rights or confer worker discovery authority.

Construct with `(pool, {mode, assertAllowed})`. The pool must be the configured non-owner runtime pool. `mode` is trusted host identity configuration; the mandatory `assertAllowed(actor, creatorId, client)` checks current W8 restrictions using the caller's transaction client. No production no-op restriction callback is supplied here.

- `open(actor, creatorId, requirement = "owned")` checks adult eligibility, current HTTP session when present, and exact own creator-profile row under a shared lock, then issues an immutable scope.
- `withCreator(scope, work, requirement = "owned")` rejects reconstructed/cross-issuer scopes and rechecks current session, profile ownership and restrictions while holding the creator row through the domain transaction. Both creator/account GUCs are local and restored after the restriction producer.
- `owned` permits pending owners to work on private drafts/uploads. `verified` additionally requires current verified identity and completed signing recovery. Domain owners still require their own object, purpose, audience, license and single-use exact signature checks where applicable.
- Scopes are not durable credentials. After restart, resolve current authorized ownership through the proper host/purpose issuer; do not deserialize a browser scope. The issuer supplies no anonymous enumeration or identity session bypass.

Read-only local diagnostics used the retained synthetic pending creator and current development session on W1's non-owner DB: owned transaction kept both GUCs; verified operation denied403; copied scope denied403; different issuer denied403; injected restriction denied; other account denied404; a retained revoked session denied401. Injected diagnostic callbacks are not real W8 approval. No profile/session/SQL migration was changed by these diagnostics, and no new test suite was added. TypeScript/lint/format checks passed.

W6 may consume this boundary for creator-wide assets. W2's existing structurally similar repository scope remains its producer-owned contract until an explicit adapter/import is published. W5 creator-subject signing continues through `SignedSubjectPolicy.prepare` and `consumeCreatorSignedAct` in the publication transaction. Deployed production restriction/role pools and provider acceptance remain outstanding.
