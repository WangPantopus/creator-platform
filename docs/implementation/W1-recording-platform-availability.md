# Shared recording playback platform availability

W1's personally executed existing Swift-package check on30ddc312 failed because the shared recording player called AVAudioSession on macOS27. The shipping iOS app and the macOS foundation package are both declared targets. A single platform helper now configures AVAudioSession only on iOS; the same calls still precede iOS playback. AVAudioPlayer, immutable capture, asset/file provenance, current-session checks, expiry, cancellation and byte disposal keep their original ordering.

No tests, snapshots, SDK version or assertion are changed. The failed check is retained as a failure. Existing Swift checks and a normally signed shipping iOS build must qualify the actual repaired source; this compilation repair does not establish personal recording/provider acceptance.

Actual repaired source8beca854 passes all18 existing Swift checks and all three unchanged snapshot checks in91.1s, followed by a normal signed shipping iOS build in167.7s and strict codesign verification. Main67cb1ec0 is normally integrated at1c1af339; the complete apps/ios tree is byte-identical to the qualified8bec tree. The final current-head checks are recorded in the PR. Hosted queued jobs remain pending, not passes. Personal recording/provider and cold-destination acceptance remain separate qualifications.
