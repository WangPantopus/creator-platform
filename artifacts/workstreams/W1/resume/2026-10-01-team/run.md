# W1 Team read recovery — October 1, 2026

The actual Team page enabled Create invitation after its access read failed, once a fictional public handle and Triage were entered. Keyboard submission was denied by the server because the creator is pending, but focus fell to the page. No invitation was created.

The repair gives the page explicit loading, ready and unavailable read states. Member/invitation records are shown only after a successful read, and Create requires a successful read and current verified-creator presentation. The server remains the authority. Retry remains focusable during loading, serializes through the existing action guard, and recovers focus only when the activated Retry lost focus to the page. Hidden/inert controls cannot receive that recovery. Three canonical copy keys are generated for all clients.

Visual review also found the default browser link color on the author card. The Team account link now inherits the card's text token, retaining its underline and existing focus outline. Actual computed colors were Light rgb(244,241,234) on rgb(28,27,25), and Night rgb(35,28,22) on rgb(237,227,211). Tab reached the real Account link in desktop Light and phone Night. Phone focus visibility above fixed navigation still needs a viewport-specific check; a full-page screenshot is not sufficient acceptance.

## Personally operated results and unresolved failure

Development browser retries against the real pending-creator denial and a supported exact Team-GET network block retained the handle/Triage selection and Retry focus in Light/Night, at phone and desktop dimensions. Clearing the block returned the real denial and Create stayed disabled. Nothing was replayed automatically.

The form also reset twice during the development/build window. Repeated Fast Refresh notifications were observed while build outputs changed; that is a possible contributor, not an established explanation. Both empty-field captures are retained, including `draft-reset-phone-night-final-dev.jpg`. Input retention is not fully accepted until a stable final app run resolves this discrepancy.

The final production build is reachable by read-only HTTP diagnostics, but both documented browser-tab entry points return ERR_BLOCKED_BY_CLIENT for the canonical localhost page. Stopped-service tabs are connection-error pages rejected by the tool's URL policy. Switching the owned server from an IPv6-only listener to IPv4 did not restore browser control. No browser policy bypass, alternate UI automation, hidden storage manipulation or fabricated response was used. Final production Team operation remains open.

The fresh original W1 interactive database still has two pending creators, one local challenge and zero approved creators, submitted/reviewed proofs, invitations, memberships, keys or signed acts. Positive invite/accept/remove/expiry/reinvite/race and protected-creator-confirmation journeys require actual approved creator authority. No approval or role was invented to enable them.

## Supporting compilation and delivery limits

Canonical generation/check, web typecheck, scoped ESLint/formatting, backend build, final production web build and normal shipping iOS Simulator/Android debug builds pass. The first typecheck rejected the unsupported loading Notice tone; it was corrected to the exported neutral variant. Native builds ran serially with two jobs/workers. Android completed 10 tasks with 27 up-to-date in 52 seconds. Xcode used its compatible local dependency resolution; tracked Package.resolved and Next's generated declaration noise were restored exactly to HEAD.

Native controls remain disabled, and no native operation is claimed. No tests, API/schema/migration/authority changes, original artboard or reference changes were introduced. The earlier fresh rename checkpoint remains supporting evidence for its recorded source; current Team-copy rename compilation is still open. Code Review cannot return exact-head CI until GitHub is connected. This increment remains draft, with no merge or full H08/H15/H17/H20 acceptance claim.

[Exact source/build/capture hashes and qualifications](run-manifest.json) and [read-only persisted aggregates](database-summary.json) identify the evidence. Private configuration, databases, logs and keys remain outside Git.
