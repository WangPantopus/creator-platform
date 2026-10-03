# Independent native content reads

Application source: `965c6f00`.

Actual Android operation at the earlier `b61f04cd` exposed the issue: an unavailable reply service failed the whole content refresh. iOS had the same composition. Both shipping wrappers now independently read current content, private replies and Thanks between actual account-bound preference reads. Failed optional reads clear their remote rows/cursor and disable their own mutations; they cannot create a false empty-feed or consent-version success. Same-account unsent input is preserved. Actual account-change error codes, including 409, clear authority. The existing five-second freshness expiry and background concealment remain.

Implemented: both native wrappers. Runnable: normally signed shipping iOS build plus strict deep signature verification pass; Android assembleDebug passes with JDK21, no daemon and max-workers2. Builds were sequential under W1's actual atomic heavy-build helper from `94258f0e`; the matching lease was released. No unit/UI test code was added.

- APK SHA-256: `f45dd3bc793a88f204de1c1ca034448a76776b2e35ae14caabf4837a61c1f000`.
- iOS debug dylib SHA-256: `8b99315c51a9c0b377a3466b7e104fc5b3511ab74955669944623843d2287e7c`.
- Build logs: `/private/tmp/creator-w5-android-native-loading-build.log` and `/private/tmp/creator-w5-ios-native-loading-build.log`.

Integrated/verified: builds only for this increment; its actual native UI operation and the eligible signed-content/consent/reaction flows remain pending. The earlier Android entry captures verify only their stated earlier source. Release-ready: no; all nine W5 packages continue. No signature, proof, provenance, approval or privacy receipt was fabricated.

## Personally operated Android965

Personally installed the SHA-matching shipping965c6f00 APK in owned CreatorPlatform_W5_API34 (2cores/2048MB), with canonical API4105 hostb1ab8f81 on the actual57 schema. CUA operated the retained kilnfire account, Light/Night cold deep-link returns to the unpublished draft, and You confirmed @kilnfire in both themes. Content was403unavailable; real own replies were200empty and Thanks200null. No optional producer failure was mistaken for published access.

Personally paused only the owned API for45seconds. Actual CUA capture during the pause shows Checking current access, concealed mutation controls and timeout status; after resume the route returned to403content unavailable and You retained @kilnfire Night. An earlier15-second pause was observed after recovery and is excluded. This denied route had no private editor, so no native unsent-input or positive consent/reaction/reply acceptance is inferred. Adjacent965 captures are actual CUA pixels.

The device was normally shut down after matching its AVD/slot custody; only W5's slot was released. iOS965 build remains unoperated. Personal Android operation found that both clients ignored the fetched mute preference and hardcoded their action; a separate source increment will fix and operate that defect. Creator remains DEVELOPMENT-ONLY SEEDED VERIFIED, no proof/passkey.
