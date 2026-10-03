# Current library search and exact saved kind

Personally implemented by the W5 successor. Search source
`1bd6546538b5c915a16c47bd1ab1ccad2c530bfe` separates reads from mutation busy
state, aborts obsolete reads and binds the result to the current account,
creator, state and query. A 200 ms debounce clears the old list immediately;
only the latest read can replace it. Refresh and current-search Retry are
explicit. More follows the actual cursor and cannot overlap a read/mutation.
The search limit matches the API's 180 characters.

Source `6c74b487712fb3699fdf2f947e935239ec5c3ed9` puts Refresh beside the
filters. Source `5405c48c012f21226d81da3d2f224ecf677ad3aa` opens a saved Note
with the Note editor. Previously Library opened it with the Post editor and
offered Public/groups/format controls even though its saved kind was Note.

Actual canonical61/API41055/web30055 operation at1bd65465 loaded the existing
unsigned Note, returned no matches for an unmatched query and then returned
the actual matching Note for a different query. A brief owned API pause and
query changes returned the latest search; this does not prove overlapping
requests, because the debounce could have suppressed the first query.

At6c74b487, personally inspected390/1280 Light/Night library images show the
saved revision10/schedule and wrapping controls. The desktop Refresh target
measured44px high. Private images are at
`/private/tmp/creator-w5-shell-operator/shots/successor-6c74b487-library-{390,1280}-{light,night}.png`.
At5405c48c, actual fresh navigation opened the Note with Your Note and
Followers/All members/Tiers, without Post/Public/group controls.

At `4693cf0817f65571a7fa106693aea8dff80dc062`, with owned API at the same source,
a paused web process caused a real response timeout. The UI kept the local
text and displayed revision11; a later database read independently confirmed
the command had committed revision12. Session expiry then required actual
development sign-in. A subsequent save held by a temporary operator row lock
returned503 and rolled back; releasing that lock and explicitly retrying saved
revision13. The UI and database agree on revision13. This verifies bounded
timeout/input retention and failed-command recovery; it does **not** verify a
retry of the already committed revision12 command. No raw draft was stored in
browser storage, no transaction result was fabricated, and the temporary
operator transaction was rolled back and closed.

Shipping iOS build passed at
`6ac33b0e117c3c7626be7d451151b3c4f06a4a8e`; strict codesign passed. Actual binary
SHA256 `ec5bd3aebc2c42b7b968dead4861789a40779e2828cd7d27346c787e26fd302b`,
debug dylib SHA256
`8d4ae3588b7ce65800a3d8e068d07c226af0352225e9bf0510fe97d048cdb15b`.
Shipping Android assembleDebug passed at4693cf08 with actual
`http://10.0.2.2:41055` configuration; APK SHA256
`8258a69a6197be07f687c559f0df0c748891d8c21dcb413b852eb06cfda6637c`.
Each build acquired and released its own global heavy-build lease. Builds are
not personal native operation or acceptance of later source.

Implemented: current search/read recovery and saved-kind editor selection.
Runnable: web/backend types and scoped lint/format are checked again after
reconciling current main; shipping builds are qualified only above. Integrated:
the existing canonical endpoints and versioned draft commands, with no held
SQL activation. Verified: only the exact-source actual operations above.
Genuine signing, populated paging, two-fan privacy, positive group/paid/media/
AI/live paths and current native operation remain open. Maya remains a
DEVELOPMENT-ONLY SEEDED VERIFIED creator without genuine proof or passkey.
Release-ready: false. All nine packages remain assigned.
