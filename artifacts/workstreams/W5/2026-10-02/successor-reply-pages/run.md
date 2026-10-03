# Bounded private reply refresh

Personally implemented by the W5 successor. Product source:
`41bfdd5cac5c58f214bdb42b3bcbedf68d258ecc`, including captured remote main
`af38420d7aa5b07df009a01a4be3e8026f753d2a` and PR207 head
`4a1601de1298a8184b489bc1b940f826be8c445e`.

Notes previously rebuilt every earlier reply page on each four-second refresh.
The creator now views one current authorized page, with Previous/Next navigation
and the actual page count. Only cursor metadata for earlier pages stays in
memory. Refresh performs one reply-page read concurrently with the independent
Note read. Page/filter changes immediately conceal the old page and close any
reaction review. The original five-second lease, account binding and mounted/
generation/visibility checks remain. An old 50-page stopping point is removed;
the actual producer cursor determines whether Next is available.

Web typecheck, scoped ESLint, Prettier and diff checks passed at this product
source. No schema, authority, signature, generated resource or test was added.

Actual owned canonical61/API41055/web30055 operation at41bfdd5c issued one
`studio/replies?filter=all` read per refresh alongside one Studio-content read;
the actual responses were200. Under the observed shared-host load, reads could
outlast the lease. Personally inspected accessible state and a1280 Light image
show the checking state with private bodies concealed. No slow response extended
private access. The image is private at
`/private/tmp/creator-w5-shell-operator/shots/successor-41bfdd5c-notes-slow-current-access.png`.
The browser profile was then closed to reduce shared resource use.

Implemented: bounded visible-page refresh/navigation. Runnable: current types,
lint and format pass. Integrated: existing actual reply endpoint on canonical61;
no held purpose was activated. Verified: only the actual empty-feed requests and
slow-read concealment described above at41bfdd5c. Populated forward/back paging,
filter changes, signed reaction and two-fan isolation remain unverified until a
genuinely signed Note and W8-reviewed replies exist. Native operation and all
nine-package release acceptance remain open. Release-ready: false for W5.

## Production renewal repair, 2026-10-03

At `64db0419c9560ffb4b7b556150c8d795f308d62d`, the production Light view
remained in checking access despite visible-document metadata and fast actual200
role/content/reply responses. Unchanged role reads returned new array instances,
restarting the child load effect and invalidating its pending generation. A new
refresh could then be skipped by the still-pending action. Personally fixed at
`c6850d6e3c2fa7359d1af4957694aba0303b06f4`: depend on the current scalar reply
permission. Account binding, actual permission changes, generation checks and
the five-second lease remain enforced. This source includes captured main
`c56913f6b359d3070bee613d04d31bf67a2fdc57`.

Production Next build, web typecheck and scoped ESLint passed. The owned API41055
and production web30055 were restarted at c6850d6e on canonical61. Personally
operated and inspected390/1280 Light/Night: the actual revision19 unsigned draft
and empty reviewed reply feed remained visible through repeated role renewals;
one bounded reply read accompanied each Note refresh. Private images are under
`/private/tmp/creator-w5-shell-operator/shots/production-c6850d6e-notes-*`.
The files containing `unread` in their names still show All reviewed replies;
keyboard attempts did not produce a durable filter change. Filter acceptance
remains unverified.

Personally paused only the owned API PID33504 with automatic CONT cleanup.
Accessible state concealed Note/reply bodies, then the actual25-second pause
image `production-c6850d6e-notes-actual-concealed.png` showed account/role
reconnection with Studio hidden. After actual resume/health200, automatic current
reads restored the draft and empty feed. An earlier image named `api-pause`
caught recovery and is not concealment evidence. A later Check-current-access
click timed out because automatic recovery had already removed that control.

Implemented/runnable: bounded reads and stable unchanged-role renewal.
Integrated: actual configured development backend, canonical61, no held-purpose
activation. Verified: only the above exact-source unsigned/empty-feed layout,
renewal and outage/recovery observations. Genuine signing, reviewed populated
pages, two-fan isolation, signed reaction and filter acceptance remain open.
Release-ready: false for the complete W5 assignment.
