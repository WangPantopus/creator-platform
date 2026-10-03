# W3 increment67 — corrected privacy cursor source pin

After the handoff checkpoint, W2 review found that PR182 head22faa61b still pinned the older0206 source despite its corrected original-ownership SQL. W3 personally reproduced the mismatch: the unchanged corrected SQL is27923 bytes, SHA256 `73474526575ecbdec8b5452039f953d5af35357f5ba1922d300394791b94aa06`; the exported constant still held `bd2b0a5c7574d085e9b23d79db181f04c0699c74f12810f15dd75f1dc2ede067`. Both prepare and catalogue verification consume this constant, so a genuine corrected installation would be rejected.

Only the TypeScript source pin is corrected. SQL bytes, catalogue guards, independently reviewed definition requirements, held registry status and immutable ownership constraints are unchanged. Existing historical increment63 records retain their accurate older source checksum.

Personally verified the actual imported module constant against SHA256 of the raw SQL bytes without touching a database. Shipping backend build, scoped ESLint, Prettier check and git diff --check passed. No new test code, PNG or diagnostic JSON was committed.

This purpose remains uninstalled. No current task, SQL installation, prepared owner, cursor exhaustion, separate COMMIT, app/UI journey or W2/W8 approval is claimed by this correction. All W3 runtime and copies remain stopped/closed as recorded in increment66. Publish on the existing focused PR182 and normally integrate into the W3 feature host, preserving its immutable review base. Actual current-head CI and the remaining owner reviews/activation/positive and negative jobs are required; W3 A–I is not complete.
