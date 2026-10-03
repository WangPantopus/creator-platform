# Shared recording playback platform availability

W1's personally executed existing Swift-package check on30ddc312 failed because the shared recording player called AVAudioSession on macOS27. The shipping iOS app and the macOS foundation package are both declared targets. A single platform helper now configures AVAudioSession only on iOS; the same calls still precede iOS playback. AVAudioPlayer, immutable capture, asset/file provenance, current-session checks, expiry, cancellation and byte disposal keep their original ordering.

No tests, snapshots, SDK version or assertion are changed. The failed check is retained as a failure. Existing Swift checks and a normally signed shipping iOS build must qualify the actual repaired source; this compilation repair does not establish personal recording/provider acceptance.
