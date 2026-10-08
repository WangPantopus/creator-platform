# Creator comparison view lifetime — immediate handoff

Studio previously kept source-derived comparison text after going offline or a
failed permission read. The repair clears results and aborts pending reads on
offline, visibility, focus and identity changes, bounds reads to five seconds,
prevents overlapping polls and ignores abandoned responses. Returning to the view
requires a new original-server read. Creator configuration/drafts are preserved.

Actual launched Chrome verification: [old offline exposure](creator-comparison-offline-before-web.png),
[immediate offline concealment](creator-comparison-offline-cleared-web.png), and
[failed-read concealment](creator-comparison-read-failure-cleared-web.png). Reconnecting
and removing request blocking restores results only after a fresh read. All browser
network overrides were restored. Background qualification was attempted but the
automation kept document.visibilityState visible; do not claim that operation.
Late-response and identity-expiry races still need dedicated actual qualification.

Scoped ESLint/Prettier, web typecheck and Next production build pass. The attempted
optimized host used the saved development environment; compiled production guards
correctly refused local HTTP sign-in. It is not authenticated production acceptance.
That host was stopped and the original Next development host restored on3119.
The browser was left at the sign-in error page; follow its normal retry flow now
that the development host is back. No auth guard was weakened.

The user requested an immediate handoff before populated creator export/withdrawal
work began. Original v2, two comparison results, one current consent/sample and all
historical evidence remain. No new unit tests were added. Native acceptance belongs
to the preceding upgrade milestone. [Validation and source hash](evidence-index.json).
