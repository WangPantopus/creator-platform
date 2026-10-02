# Current Note reply limits across clients

Implemented source `616ebf4a527556218f60831296567bffb579eeab` connects web, shipping iOS and shipping Android to W5's account-bound current reply-policy route. The server uses only W4's confirmed continuous tenure reader. Unknown recognition has no badge; unavailable optional policy retains the 4,000-character baseline. A limit decrease preserves unsent words, permits shortening and disables sending while the draft is over the current limit. Malformed or inconsistent policy cannot expand the limit. Account changes and authority denials conceal the content and its policy.

Runnable: web, backend and API type checks and targeted lint/format checks passed. The actual shipping iOS app built with Xcode, passed strict deep ad-hoc code-sign verification, and Android `assembleDebug` passed with JDK 21. The builds ran sequentially under the shared heavy-build lease, which was released. No unit or UI test code was added.

Build outputs at source `616ebf4a527556218f60831296567bffb579eeab`:

- Android APK SHA-256: `88d777a486a0085d56cd7c295b5537b3e968b9017fbe0acca6011874cf11f9c9`.
- iOS shipping debug dylib SHA-256: `3b1904c3305d351b7ff1422c95c13eccccbac8697b1ea17c71d8d4dfbe5a1d6c`.

Integrated: the real web proxy and native requests use the existing current-session boundary, a final actual account/mute reread and the server's current policy. No local paid-history calculation, mock account, synthetic signature or client-selected perk is used.

Personally verified on web at this source: 390 and 1280, Light and Night, no horizontal overflow, and no Note, reply input or recognition revealed while actual scope authority is missing. At `2026-10-02T11:07:42.084Z`, kilnfire's actual session returned 200; the policy returned 503 `scope_denial_unconfigured`; the app's actual `x-qelvora-expected-account` header bound to wheelhouse returned 403 `content_account_changed`. See `actual-web.json` and the four screenshots. Exploratory requests with an unrecognized header are explicitly excluded from wrong-account evidence.

The database is the actual fresh 57-migration W5 development database. There are no confirmed paid periods, memberships, private replies or published content; 0088 is not active and the stored reply constraint remains 4,000. The creator is DEVELOPMENT-ONLY SEEDED VERIFIED (2026-10-01T20:44:26Z), without proof or passkey. Native build success is not personal native operation; positive badge rendering, longer-reply submission, retention across a real paid-policy decrease, private-reply isolation, signing and delivery remain unverified.

Release-ready: no. Genuine signing, W8's approved activation order, real paid-period records and complete personal native acceptance remain prerequisites.
