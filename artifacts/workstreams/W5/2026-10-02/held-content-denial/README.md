# Held current-content denial

Source: `c56fe34254038bcb7ef6009a3caa5ff0841fa507`.

Content now asserts the actual W1 request session on its existing domain client, then invokes the optional `assertAllowedInTransaction(client, actor, creatorId)` before tombstone and content locks. W1's signed-subject preparation uses this same seam. The older outside-transaction callback is used only when the held callback is absent; no worker Actor or substituted account is introduced.

Implemented: the W5 service seam. Runnable: backend TypeScript, scoped lint and formatting passed. Integrated: W1/W8 have the published contract; their actual held denial producer and reserved 0074 are not mounted in the W5 local host. Verified: static checks only for this increment. Release-ready: no; held denial, restoration/revocation races and the full nine-package acceptance remain open. No new tests or reserved migration activation.

The local creator remains DEVELOPMENT-ONLY SEEDED VERIFIED, with no proof or passkey; it does not establish genuine signing or verification acceptance.
