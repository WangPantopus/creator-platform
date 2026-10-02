# W1 canonical Home host composition — October 1, 2026

The merged Growth owner already exports `canonicalConversationHome`, but the actual server passed no Home owner and selected the explicit unavailable default even when Growth was configured. The server now constructs W3's real ConversationFeature before Growth and supplies that existing reader with the same AccessService/Database, canonical signing verifier and a parameterized public creator-handle lookup.

The producer still reads at most two 50-row account-directory pages, rejects incomplete/mismatched fan or cursor results, obtains each current issued fan thread scope and reads private messages through the actual Database. Signed creator/approved presentation uses the existing verifier; malformed or denied families do not become public creator authority. The handle query reads only canonical public identity metadata under the immutable public-identity policy. No thread or consent is created by this composition.

Backend TypeScript/bundling, affected ESLint/formatting and diff checks pass. There is no client/shared/API/resource change requiring another native or web build. No tests, schema/migration, role grants, auth/signing/provider policy or original reference changes were introduced.

This is source composition with supporting compilation, not operated Home acceptance. Current W1 runtime has not enabled Growth or acquired a dedicated worker credential/key. It requires `GROWTH_ENABLED=true`, a reviewed distinct non-owner/non-bypass Growth worker connection, safe runtime-role membership/privileges and a persisted managed 32-byte key. Other Growth owners remain unavailable. Genuine production identity/trust, licensed conversations, delivery/share/privacy/provider inputs are separate gates.

[Actual read-only role preflight](role-preflight.json) found the current non-owner/NOBYPASSRLS/NOINHERIT core role has no Growth membership or schema/preference privileges. Canonical Growth runtime/worker roles exist and retain their safe role flags. No ad-hoc grants, password changes or worker reuse were made to bypass the required reviewed pool configuration.

Supported browser control currently refuses canonical localhost navigation, and native controls remain disabled. Empty and authorized-history Home operation, account/expiry/revocation/erasure recovery and retained-history navigation when public creator availability changes remain open. Exact-head Code Review CI still needs a GitHub connection. The increment remains draft; no full H09/H13/H20 or release acceptance is claimed.

[Exact source hashes, compiled artifact and required next actions](run-manifest.json). No private credential, key, fan content or fabricated authority is recorded.
