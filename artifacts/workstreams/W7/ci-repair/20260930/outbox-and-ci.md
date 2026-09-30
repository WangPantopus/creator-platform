# Publication outbox and CI continuation

The W2 publication bridge previously selected the first100 pending AI events
and filtered afterward. A full page belonging to other consumers could prevent
W7 from ever seeing a publication. `AgentLifecycle.pendingEvents` now accepts an
optional event type and applies it before the SQL limit. Its default behavior,
creator/account authorization and100-row bound remain unchanged. W7 selects only
`ai.version_published`; it never acknowledges another owner's event.

A direct diagnostic used the existing disposable `creator_w7_test_foundation`
database and the real non-owner `creator_runtime` role. With101 older
`source.updated` events followed by one publication, the ordinary first page
contained100 source events. The publication lane selected its one event and
acknowledged only that event. All101 source events remained pending. Diagnostic
rows and the temporary AI workspace were removed afterward. This is bounded
owner-API evidence, not an actual publish-to72-hour-outcome demonstration.
No new test case or script file was added. Backend typecheck passes.

Foundation run36753457775 at7f7df95 now passes **web-and-backend** and
**android-runtime**. Trust release compilation36753457816 also passes. The
matching macOS27 iOS job compiles and passes15 non-snapshot checks, but all110
snapshot comparisons fail. The previous workflow uploaded only `artifacts/ios`
while SnapshotTesting wrote failures to an ephemeral directory, leaving no
review artifact. CI now supplies the library's existing `SNAPSHOT_ARTIFACTS`
setting and records the OS/Xcode/Swift versions. Reference images and precision
are unchanged. Simulator UI checks retain normal ad-hoc signing, consistent with
the W7 execution prompt and actual installed-app behavior.

The local API35 diagnostic AVD is separate from W7's shipping-app device. Its
instrumentation reported a process crash and **zero tests**, so it establishes
no runtime acceptance. The device crash buffer contains repeated system
Bluetooth startup aborts; no app stack trace was retained. This is insufficient
to assign the instrumentation failure to an application assertion or prove an
application cause. The existing API34 CI runtime suite passes all its checks.
No peer device or ADB daemon was restarted.

Web visual and Android foundation CI jobs were queued at this checkpoint.
Full owner/provider/privacy/design acceptance still follows the
[acceptance matrix](../../resume/20260930/acceptance.md). No paid AI call.
