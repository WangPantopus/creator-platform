# W7 resource release — 2026-09-29

Requested by the founder after creating the handoff. [PR #2](https://github.com/WangPantopus/creator-platform/pull/2) targets main as a draft; the complete [resume prompt](../../../../../docs/workstreams/prompts/W7-resume.md) and [handoff](../../../../../docs/workstreams/handoffs/W7.md) were already committed/pushed in `fb5c3f9ebccfad1d40b49ec9e6681cbc0fb9c302`.

## Released and verified

- Stopped only the verified W7 Next launcher/server (PIDs9940/10281, cwd `/private/tmp/creator-w7-web/apps/web`). No listeners remain on3007/4107.
- Shut down and deleted the exclusively leased W7 iOS simulator `3F2AAE9E-57DF-4977-8166-732B95D52A47`. Its registered device and data directory are absent; this releases its installed apps/data (approximately3.2GiB observed).
- Verified emulator5570 belonged to `CreatorPlatform_W7`, stopped it, then deleted only that AVD with avdmanager. Both its `.avd`/`.ini` are absent, no corresponding emulator process/device remains (approximately1.1GiB observed).
- Removed all W7-only `/private/tmp/creator-w7-*` copies, DerivedData, Swift package/build output, Android APK/build/Gradle cache, Next output/cache, temporary logs/Git indexes and development encryption key, plus exact W7 Swift package locks.36 paths removed; temporary allocated usage measured before deletion was1,544,384,512 bytes (about1.44GiB).
- No W7 browser tabs were present in the active CUA inventory. Existing user/peer tabs were preserved.

Total removed device/build storage is approximately6GB, based on rounded device usage plus measured temporary allocation; concurrent activity/APFS accounting prevents an exact reclaimed-free-space claim. [Device actions](device-actions.json), [removed paths](local-removals.json) and [final local verification](local-verification.json) record the actual cleanup.

## Docker remains pending

Docker Desktop displays **Disk full**: it cannot continue and reports `no space left on device` writing its VM log. Container inspection/list operations time out; the W7 container/mount/image inventory could not be established. The disposable container `creator-platform-w7`, its database/data volume and any exclusively W7 Docker images therefore **are not confirmed removed**. No shared Docker disk, image, volume or cache was deleted, and no global prune was run.

Automatic approval review rejected stopping/restarting Docker Desktop because it is a machine-wide action that could disrupt containers belonging to other workstreams; the founder authorized W7 cleanup, not that broader restart. A specific approval request is pending. Do not bypass that rejection with kill/quit/relaunch workarounds. If approved, restore Docker access, inspect the exact container and its mounts, remove only W7-owned container/data, and remove only dedicated W7 images after checking other container references. Generic PostgreSQL images and Docker Desktop storage are shared dependencies, not automatically W7-owned.

Shared repository source/evidence, peers' containers/devices/processes, root node_modules/pnpm store, global Gradle/Swift caches, Xcode/simulator runtimes and Android SDK/system images were preserved. No global package/library installation was identified as exclusively W7-owned; deleting shared tools would affect continuation by other agents.

## Resume after release

Code, designs, committed handoff and sanitized historical runtime evidence are preserved. **The prior temporary source/build paths, simulator UUID, AVD data, development key and local fixture state are not a live checkpoint to reuse.** Treat recorded launch commands as build recipes after provisioning fresh resources.

Confirm W8/W1 resource leases, recreate dedicated W7 devices/build copies from the preserved current source/shared foundation, and provision a clean W7 database with the registered growth migrations and non-owner roles. The old disposable Docker data remains pending cleanup and its old key is gone: do not generate a new key against surviving encrypted rows or silently adopt that state. Once the old container/data is removed, create a new isolated database/key and repopulate explicitly synthetic development inputs through the product's development controls; they remain non-acceptance upstream fixtures. No source work should be restarted or discarded.
