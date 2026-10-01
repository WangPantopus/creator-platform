# Existing macOS capture repair

Personally adapted the capture-only producer correction from W7 immutable `64330399332c74ef6c87117a0daac78d4a587beb` into W1's existing `NativeSnapshotTests.swift`. The capture renders the logical canvas at the original2x reference pixel scale before AppKit caches its layers, compensating a1x backing display; it allocates an sRGB bitmap and closes every capture window. Enlarging already cached1x pixels cannot recover sharp text.

The original110 reference PNGs were preserved. The entire existing comparison closure is byte-identical to W1 HEAD before this repair: exact dimensions and the same99.85%/eight-channel sRGB bound; neither threshold nor failed-image handling was relaxed. This repairs existing check code and adds no new test case/suite.

Existing selected `NativeSnapshotTests` completed on macOS26/Intel with all3 methods passing (110 original comparisons), zero failures,42.323s, at16:29:24 PDT September30. Command used `swift test --package-path apps/ios --scratch-path /private/tmp/creator-w1-continuation-swift-build --filter NativeSnapshotTests`, with a W1-specific snapshot-artifact directory and no record mode. The current package resolved the committed pins on this check; no dependency lock change was adopted.

This is macOS fixture/check evidence, not iOS interactive or independent source-design acceptance. Native controls, physical devices/system sheets, accessibility/200% type and exact-head hosted CI remain outstanding.
