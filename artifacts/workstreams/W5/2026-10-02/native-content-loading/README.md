# Independent native content reads

Application source: `965c6f00`.

Actual Android operation at the earlier `b61f04cd` exposed the issue: an unavailable reply service failed the whole content refresh. iOS had the same composition. Both shipping wrappers now independently read current content, private replies and Thanks between actual account-bound preference reads. Failed optional reads clear their remote rows/cursor and disable their own mutations; they cannot create a false empty-feed or consent-version success. Same-account unsent input is preserved. Actual account-change error codes, including 409, clear authority. The existing five-second freshness expiry and background concealment remain.

Implemented: both native wrappers. Runnable: normally signed shipping iOS build plus strict deep signature verification pass; Android assembleDebug passes with JDK21, no daemon and max-workers2. Builds were sequential under W1's actual atomic heavy-build helper from `94258f0e`; the matching lease was released. No unit/UI test code was added.

- APK SHA-256: `f45dd3bc793a88f204de1c1ca034448a76776b2e35ae14caabf4837a61c1f000`.
- iOS debug dylib SHA-256: `8b99315c51a9c0b377a3466b7e104fc5b3511ab74955669944623843d2287e7c`.
- Build logs: `/private/tmp/creator-w5-android-native-loading-build.log` and `/private/tmp/creator-w5-ios-native-loading-build.log`.

Integrated/verified: builds only for this increment; its actual native UI operation and the eligible signed-content/consent/reaction flows remain pending. The earlier Android entry captures verify only their stated earlier source. Release-ready: no; all nine W5 packages continue. No signature, proof, provenance, approval or privacy receipt was fabricated.
