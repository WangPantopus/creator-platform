# Privacy download recovery

An actual completed creator export returned401 after the original five-minute
verification window elapsed. The browser replaced the privacy page with an
unhelpful HTTP error. Document-navigation failures now return to the privacy
page with an accessible notice and the existing Continue with Pantopus action.
Successful downloads still stream normally; API clients retain their JSON/status.
Expired artifacts and other download failures have distinct recovery copy.

The initial implementation exposed Next's loopback alias normalization:
127.0.0.1 became localhost and lost its host-bound session/continuation cookies.
That [failed attempt](export-download-verification-recovery-01.png) is preserved.
A relative303 Location keeps the browser's exact origin and allows the original
sign-in flow to work without changing cookies or verification policy.

The [actual operation](export-download-recovery-operation.json) followed a real
expired download → [notice with original request](export-download-verification-recovery-02.png)
→ development identity chooser → same creator → original Conversation download.
The [returned page](export-download-recovered-01.png) no longer has the stale notice.
The198,980-byte download is identical to its prior successful artifact, SHA256
`a3d5e49ea90b5acab919fc9b05527aac53df8f51c2923f3f6ebf23b5a8a30104`.
No new export, provider call, consent or historical clock change occurred.

An unauthenticated API request separately retains401 JSON and no redirect;
[headers](download-api-unauthenticated.headers) and
[response](download-api-unauthenticated.json) are preserved. This is an API
negative check, separate from actual browser operation.

At source `3cbac7be7`, scoped ESLint/Prettier, web typecheck and the production
Next16.3.7 build pass (32 static pages). The build used a separate output directory
so the launched development app remained available; its generated type-import
paths were restored afterward. No new unit tests. Runtime operation uses the
local development identity and Next dev; production identity, native privacy UI,
expired artifact operation and full privacy/product acceptance remain open.
The [complete finish plan](../../../../docs/operations/product-finish-plan-2026-10-08.md)
remains active.
