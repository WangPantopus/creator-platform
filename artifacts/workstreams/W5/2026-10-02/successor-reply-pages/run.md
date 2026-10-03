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
