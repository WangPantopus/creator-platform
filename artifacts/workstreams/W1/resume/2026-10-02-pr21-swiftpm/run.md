# PR21 hosted SwiftPM compilation repair

Actual PR21 headadb15c11e037d87dbaaad9cd06bdb234fe122b17 hosted ios-foundation job110841847815 failed compilation at NativeAvailability.swift138: TextField had no textInputAutocapitalization on the macOS SwiftPM target. App tests and snapshot comparisons were not reached. Android foundation completed successfully; visual/native queued jobs are not passes.

W1 personally changes all3 availability fields to the already existing qDisableAutoCapitalization helper. Its explicit os(iOS) branch retains the shipping iOS input behavior and returns the view unchanged on macOS. No availability, provider, permission or snapshot contract changes.

Locally on Mac Studio/Xcode27, actual Swift parse passes and the full existing swift test package suite passes18 checks/17.577s, including all3 NativeSnapshotTests at unchanged Light/Night references and tolerances. The heavy build ran under W1's atomic shared-machine lease and released it normally. No simulator or alternative UI input was used and no current native journey acceptance is inferred. No new unit tests were added. Hosted verification remains required at the new published head.
