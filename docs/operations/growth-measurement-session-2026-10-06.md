# Reuse the existing Measurement session guards

The previous worker-custody operation exposed a real private-view defect: Measurement retained its proposal form and saved proposals after sign-out. Before editing, compared all 20 open/draft heads and the affected file blobs. Draft #31 at `c052ef67fa85301562b5123b682c88b931107c9a` already contains the Measurement page boundary and scoped ExperimentForm/ExperimentChoices requests. This increment extracts that implementation, preserving the newer #315 FeedbackForm unchanged.

Integration uses the already merged GrowthSessionBoundary and useGrowthSession, retaining both the issued account and session. Server funnel reads carry both preconditions. The existing proxy's missing-tuple refusal extends to private funnel, proposal list/create and Stop requests; public variant reads remain unchanged. Existing layout, copy and controls are preserved. This does not accept the full #31 graph or claim a missing design reference is complete.

## Actual running verification

- Signed in through the real local development issuer as actor three. The existing synthetic creator was temporarily marked verified in the disposable database solely for this operation; no production verification or signed act was fabricated.
- Entered all three proposal fields, then stopped only the review API. The private view became hidden/inert and focused Check current account. Input stayed mounted. Restarting the same API/key restored all three fields automatically and returned focus to Stop criterion. A click attempted after automatic recovery found its old target gone and had no effect.
- Saved the recovered draft through the actual scoped request. Reload showed exactly one new draft. No experiment was activated.
- Removed only the tuple headers from the actual Stop request. The UI showed the existing reopen-view refusal; the proposal database receipt, including xmin, remained byte-identical.
- A second genuine issuer sign-in for the same account disposed the old view and its new unsaved draft. On the new view, substituting the earlier genuine session ID in an actual Stop request returned real 409/session_view_changed, disposed the view and left database receipts byte-identical. No response status/body was invented.
- Reopening with the current session and using the real Stop button persisted stopped. Another-account issuer sign-in also disposed private Measurement content and unsaved input. Finally, real creator sign-out removed all private controls and saved proposals from the old view.
- Cleared temporary Fetch interception. Restored creator verification to pending/version5. Two review proposals remain stopped and unapproved; nine earlier feedback rows are untouched. No public producers, notifications, emails or deliveries were created.

Web typecheck, production webpack build in a separate ignored output directory, scoped ESLint and Prettier passed. No test suite/code was added or manually run. The generated Next environment file was restored. [Evidence, exact overlap inventory, source hashes and receipts](../../artifacts/pr-review/2026-10-06/growth-measurement-session/manifest.json) are retained. API4206, web3106 and the same preserved 61-migration database5546 remain available for continuing review.
