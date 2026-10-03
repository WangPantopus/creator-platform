# Current Team view

Personally implemented `e53e5951051f1c71a38f829a3855a3585155d288` and
integrated captured main `42040362fba654957a38a33b494b2081aaee1c30` at
`ce8bea30c7aef07d8956b632a88672a884a569ff`. No new tests, role-update
endpoint, owner authority, SQL activation or acceptance record was added.

Team previously read its member/invitation list only on mount and presented
invitation/removal controls to any Studio role. It now renews the actual list
every four seconds and on focus/return, binds reads to the expected current
account, cancels/invalidates hidden or departed reads and conceals lists and
controls when their five-second check expires. A failed read clears displayed
records and provides Refresh team. Unsaved invitation input remains in the
mounted tab through a transport outage. Identity changes still use the shared
Studio/session boundary and server authorization.

Invitation/removal controls appear only for the actual creator view. Every
management action also checks current creator/account/visibility/deadline
before calling the existing owner route; this client precondition grants no
server authority. A confirmed invitation clears its form and says explicitly
that the invited account must accept. Team members receive an explanation of
creator-only management. The existing server list limits and owner role-edit
API remain unchanged; a genuine editable-role successor is still W1 work.

Implemented: current list, cancellation/concealment and creator-only controls.
Runnable: web types, scoped ESLint, Prettier and diff checks pass on the new
source. The first type check rejected an unsupported notice tone; neutral fixes
it and the repeated check passes. Production build and personal operation of
this increment remain pending.
Integrated: existing canonical Studio list and W1 invitation/removal routes;
no synthetic membership or positive role approval was manufactured.
Verified: source checks only. Real invitation/acceptance/removal, wrong-role
and open-view revocation, web390/1280 Light/Night and outage/recovery remain
unverified for this new increment.
Release-ready: false. All nine original W5 packages remain incomplete.
