# Native Team domain component

W5 owns these domain components. W1 owns their integration into the shipping
daily Studio shell, its actual navigation, identity/profile gates and session
storage. Shared Navigation remains with its current owner. This component does
not register a route or change those roots.

iOS, from the existing `QelvoraUI` library:

```swift
StudioTeamWorkspace(
    session: actualFanSession,
    creatorId: nil, // directory; actual selected creator UUID for Team
    onOpenTeam: { creatorId in /* W1 opens its current Team destination */ },
    onReturnToWorkspace: { /* W1 opens its workspace destination */ }
)
```

Android, `com.pantopus.qelvora.studio.StudioTeamWorkspace`:

```kotlin
StudioTeamWorkspace(
    session = actualFanSession,
    creatorId = null, // directory; actual selected creator UUID for Team
    onOpenTeam = { creatorId -> /* W1 opens its current Team destination */ },
    onReturnToWorkspace = { /* W1 opens its workspace destination */ },
)
```

The shell supplies its genuine current `FanSession`; it must dispose/rekey the
screen on navigation, account/session replacement and route delivery. The domain
component independently binds the supplied session's actual account, session and
destination. It captures requests only through that model's issuer-bound
`captureRequest` (262,144 bytes, four-second request timeout), with original
capture `isCurrent()` bookends. The domain also checks its original local view
generation/account/session/cancellation after the issuer check suspends. It does
not reconstruct credentials or accept an actor/account supplied by a route.

The directory comes from generated `studioSession()`. A Team read uses that
directory, generated `studioTeam(creatorId)`, then another actual Studio session
read on the same genuine captured client. It checks current creator verification,
ownership/roles, the expected account and the viewer's actual active membership.
At most 50 creators, invitations or members are accepted, matching current
canonical producer bounds. Metadata expires five seconds after the initial read
starts, independently checked every 250 milliseconds; reads refresh every three
seconds. Inactive/disposed views cancel their own operations and clear private
state. A transient unavailable read conceals the body and controls while keeping
the same mounted account's unsent role selection for recovery. Actual
401/403/404, changed identity and disposal clear it.
Genuine account checking, busy or error states also conceal the body and actions;
temporary readiness loss alone does not discard the reviewed selection.

Only a current owned verified creator view offers role editing. Writes use the
generated `updateTeamMemberRoles` with the original captured expected-account
header and immutable reviewed `expectedRoles`/desired `roles`. An interrupted
response locks selection; explicit Retry uses that original capture and tuple.
The tuple is locked when dispatch can begin, so a later account check or a result
that cannot be applied never silently enables edits or claims it was saved.
There is no automatic replay or invented idempotency/signature key. If current
membership is neither reviewed nor desired, explicit Review current roles adopts
the actual current set while preserving desired choices. A current desired set
is a real read observation, not acknowledgement of an unknown command.
Both controls and state methods refuse selection changes while that review is
stale; choosing the newly observed set cannot bypass explicit review.

This slice supplies workspace/Team reads, current member roles and role editing.
Pending workspace invitations are displayed from the actual producer. Invitation
acceptance, invitation creation/removal, the broader daily Studio, personal
signing and other native domain workflows remain separate implementation and
acceptance work. Existing web Team acceptance is not transferred here.

Implemented and generated source can be reviewed independently. Shipping root
integration, current native compilation/builds and personally operated
Light/Night, saved return, wrong-account/role/open-view revocation,
stale/duplicate/interrupted action and durable-record acceptance must be recorded
at their exact subsequent sources. Release-ready remains false.
