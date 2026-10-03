# Shared native resource custody — October 1, 2026

Mac Studio budget remains one heavy native build, at most two emulators (two cores, at most2048MiB, no snapshot save), and at most three simulators. Device leases use `/private/tmp/creator-platform-emulator-slot-{1,2}` and `/private/tmp/creator-platform-simulator-slot-{1,2,3}`. Always use explicit serial/UDID and shut down owned devices when idle. Pantopus-project resources and every other checkout are preserved.

Use the shared atomic wrapper for a heavy build:

```sh
node scripts/with-heavy-build-lock.mjs --owner W1 -- xcodebuild <arguments>
node scripts/with-heavy-build-lock.mjs --owner W1 -- ./gradlew <arguments>
```

It acquires the existing `/private/tmp/creator-platform-heavy-build.lock` with atomic mkdir before any owner write or child launch. Occupied custody returns75 and changes nothing. The owner includes a fresh UUID; cleanup requires the same directory inode/device and exact owner contents. Commands spawn as argv without a shell, inherit existing output/environment, and receive forwarded interruption. Changed custody or interrupted hard-kill leaves the lock for an explicit owner/process audit. No wrapper automatically declares an occupied lock stale or kills a peer.

Rationale: separate stream shells twice continued after failed mkdir and overwrote custody; another earlier shell removed a failed-acquisition lock. Exact-owner traps correctly retained the overwritten lease, which W7 subsequently recovered by original inode/receipt and absence of an active build. W1 personally implements this shared platform helper; no implementation or acceptance is delegated. Syntax/lint/format and an actual successful acquire → child exit0 → exact cleanup operation pass. No new unit tests or CI runner change.

The wrapper enforces build custody only. Emulator/simulator slot acquisition and actual device inventory still require explicit operator review; a successful build does not establish personally operated app acceptance.
