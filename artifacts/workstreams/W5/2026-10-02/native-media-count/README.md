# W5 native content media count

Source commit: `b61f04cdcd9f54818c8cbc1aac50e913b22cbfe7`.

C08 permits ten media attachments. The iOS and Android fan wrappers previously rendered none when a valid document contained seven to ten. They now render every attachment for a valid set of up to ten, using the existing per-asset access and revision checks. An invalid larger set gets an explicit unavailable notice. No API, media authority, signature, provenance, or ownership policy changes.

## Validation

- iOS shipping app: `xcodegen generate` and `xcodebuild build` for the generic iOS Simulator destination passed; strict, deep ad hoc app-signature verification passed. Log: `/private/tmp/creator-w5-ios-media-count-build.log`. Dylib SHA-256: `77b1c4e7cef033ce459c54e73760ba8fc0cd0d0d3400e2f52cf1d778a7adee92`.
- Android shipping app: `assembleDebug --no-daemon --max-workers=2` with JDK 21 passed. Log: `/private/tmp/creator-w5-android-media-count-build.log`. APK SHA-256: `9c601aa5d3e51175ad3d8d5dbdf49cf2b01c3cb6c2c1ee5d5642d848f1a769fd`.
- Both builds ran sequentially under the acquired W5 heavy-build lease, which was released after completion. No new test code.

## Qualification

Implemented and compiled in both shipping apps. Personally operated seven-to-ten attachment playback is **unverified**: no genuinely signed current W5 publication exists and native UI/device access is pending. The local creator remains **DEVELOPMENT-ONLY SEEDED VERIFIED**, with no proof or passkey. An ad hoc app signature is not a creator signature. The change does not establish full W5 integration or release readiness.
