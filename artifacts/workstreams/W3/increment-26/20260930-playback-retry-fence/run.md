# W3 recording retry custody correction

Personally corrected late native playback callbacks/awaited metadata failures so an obsolete recording player cannot clear or update a newer retry. Android also clears downloaded bytes when cancellation occurs before ownership transfer. Both native shipping builds and signature verification passed; no tests or suites were added or run.

The Android APK certificate now matches the already installed W3 app. A data-preserving update succeeded. Actual launch returned Status ok but a Messages ANR covered Welcome; after an authorized Maestro close, a System UI ANR appeared. Closing it produced the personally viewed black screen captured here. A subsequent app relaunch returned Status ok/WaitTime3916ms but the hierarchy remained empty. These are retained verification failures, not interactive acceptance. iOS is built/signed but not yet operated on these final sources.

Source, binary and local build/signature/install/launch log digests are in source-provenance.json. Logs remain in the ignored W3 runtime directory. Only owned Android5572/5043 and additional owned Maestro5037 were used; saved app data and both unrelated generated working files remain intact. Native controls were explicitly authorized by the human user.

PR6 merged into main6661226. W3 is reconciling its current implementation with that verified foundation before PR8 merge. Full licensed/provider/signed-audio/retention/offline/restart acceptance remains open; no production activation is claimed.
