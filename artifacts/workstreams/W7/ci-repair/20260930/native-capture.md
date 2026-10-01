# Native capture and shipping-flow repair

Foundation run36756295356 at b608de2 passes backend, Android runtime and all13
web checks. The iOS job compiles and passes15 non-snapshot checks, but all110
strict image comparisons fail. Its preserved artifact11118208104 proves the
capture setup mismatch: the committed Welcome image is780×1688 pixels for a
390×844-point view, while the hosted xcode-27 runner produces390×844 pixels.
The runner is macOS27.0 build26A428, Xcode27 on arm64. The reference image's
display-dependent2× bitmap was never specified in the capture helper.

The existing helper now renders into an explicit780×1688 bitmap. It retains
the same390×844-point composition, all110 references and exact pixel matching.
No image is resized or rerecorded, and no tolerance is relaxed. The targeted
local Welcome comparison confirms the dimensions and background colors now
match. Local macOS26.5/Xcode26.5 still differs in text rasterization from the
macOS27 reference; its two failed comparisons remain recorded. Matching-runner
CI must determine the remaining result.

The normally ad-hoc signed shipping iOS UI run previously passed the author
identity check but failed sign-in's old `pantopus-unavailable` identifier in
both themes. Actual screenshots and accessibility output show the current
shipping shell's shared Account status Notice with the correct unconfigured
provider message. The existing assertion now waits for that exact displayed
message; its enabled-button and absent-handle security assertions remain.
Rerunning that existing test on W7's exclusively leased iPhone17 simulator
passes in Light and Night with zero failures. The first filtered invocation
used the wrong target name and could not run; the corrected target is
`QelvoraUITests`, as specified in the existing scheme.

The separate local API35 Android CI AVD crashed before executing any test; its
crash buffer reports repeated Bluetooth controller startup aborts, without a
retained application stack. This does not diagnose an application defect.
Only that new W7 CI AVD was stopped by its verified process ID. The shipping
W7 AVD, peer devices and ADB daemons remain untouched. Both recent API34 hosted
Android runtime runs pass the existing four instrumentation checks.

No new test case or paid AI call. This repairs checks; populated W7 journeys,
providers, physical/background devices and release approval remain open.
