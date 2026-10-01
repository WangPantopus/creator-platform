# W8 existing iOS selector correction — proposed, not applied

The actual signed app was installed/launched on fresh W8 iPhone17/iOS26.5. The unchanged two existing UI flows have one pass and one failed case with two assertions, one in each theme. [Actual receipt](../../artifacts/workstreams/W8/takeover/20260930/native-launched/receipt.json), [Light capture](../../artifacts/workstreams/W8/takeover/20260930/native-launched/ios-signin-unconfigured-light.png), [Light AX](../../artifacts/workstreams/W8/takeover/20260930/native-launched/ios-signin-unconfigured-light-ax.txt) and [Night AX](../../artifacts/workstreams/W8/takeover/20260930/native-launched/ios-signin-unconfigured-night-ax.txt) show the correct unconfigured Notice and retained, enabled sign-in action; no handle form is exposed.

FanAppShell supplies Welcome's onContinue callback, so the shell renders its Account status Notice. The test still searches the standalone Welcome provider's private error ID, which is not rendered through this shipping root. No product/identity authority change is proposed.

Only replace the existing assertion's selector at apps/ios/UITests/FoundationFlowTests.swift:16:

- Existing selector: `app.staticTexts["pantopus-unavailable"]`
- Proposed exact visible selector: `app.staticTexts["Account status, Pantopus sign-in is not connected in this local build."]`

Keep the same XCTest assertion and five-second wait. Both Light/Night launches, button existence/hittability/enabled assertions, no-handle assertion, actual screenshots, second message-identity flow, all other checks, goldens, tolerances and security boundaries remain unchanged. No new test or helper is proposed. W2 published this same selector at3f426241186f0e6a549c95fbf10b12ba7d58f47b, but its separate test authorization is not W8 authorization.

The current handoff says “Write no new tests or test code. Preserve existing tests without weakening them.” The human's earlier exception covers exactly five other fixture/setup corrections; this iOS file is outside that exception. Approval for this one concrete selector is required before changing it. Independent app/runtime work continues while that question is pending. Correcting the selector alone will not establish authenticated native Report, privacy system save, full references/accessibility, provider or release acceptance.
