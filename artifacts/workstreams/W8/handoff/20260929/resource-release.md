# W8 resources released after handoff

The user requested a PR to main and release of W8's local resources after the handoff. [Draft PR #7](https://github.com/WangPantopus/creator-platform/pull/7) is created and attached. The comprehensive resume prompt was already pushed in0e6083e; this follow-up updates it for the released resources. [Machine-readable receipt](resource-release.json) records the verified actions.

Released personally:

- W8 API4108 and Next3008 processes and their owned helper; neither port has a remaining listener.
- iOS simulator DBA500E9-A3E5-4424-83D6-ED4178991663: shut down/deleted; absent from the device registry, data directory and associated logs.
- Android emulator-5568: confirmed AVD CreatorPlatform_W8, stopped; its AVD directory and.ini removed. The serial is absent from adb.
- Isolated iOS source/DerivedData, Android source/build/private Gradle cache, web source/.next, pinned temporary Git snapshot and redundant baseline source archive, plus temporary builds/logs/screenshots/operator configs/session credentials and exact W8 package-resolution locks.84 paths removed. The recorded isolated directory allocations were about3.1GiB, plus the separate iOS simulator data and baseline archive; actual net free-space change was not measured.
- No W8 browser tabs remained in the in-app browser or Chrome inventory. Shared Device Hub/browser applications were left available to peers.

Shared repository sources, existing node_modules, SDKs/system images/runtimes, global package caches and peer resources are preserved. W8 used the shared pgvector image; no actual W8 trust Docker image was built. A shared image cannot be treated as exclusively disposable.

**Docker cleanup remains blocked:** both local socket ping and W8-container inspection return503, “Docker Desktop is unable to start.” No global restart, VM/disk deletion, broad prune or uninspected volume deletion was performed. The W8 container, its live data/volumes and image references could not be verified or removed. After Docker Desktop is recovered by its owner, inspect only creator-platform-w8-local and its mounts, preserve needed current data/backup, remove that container without deleting volumes needed for continuation, and remove only exclusive unreferenced W8 images. Preserve shared images in use by peers. If the live database cannot be recovered, the old synthetic deletion backup and newer journal are the remaining restore demonstration inputs, not a complete current DB backup.

Only small private recovery files `/private/tmp/creator-w8-before-deletion.dump` and `/private/tmp/w8-deletion-journal.json` remain mode0600, alongside the small Git receipt. Their contents are not in Git. Historical screenshots/receipts and source/build hashes stay in the repository as evidence. No source or existing test code was removed or written.

**Successor:** the former W8 process/device/build/port leases are released. Read this record before the historical runtime table. Inspect current ownership, reserve fresh isolated ports/devices/build directories, install from the frozen lock and rebuild from the feature-branch tip. Do not attempt to reuse deleted simulator UUIDs, AVDs or temporary copies. Resolve Docker availability narrowly, then retake current W1 authority/C11 acceptance and finish all remaining original W8 packages. Resource cleanup does not change the workstream's partial-integration/not-release-ready status.
