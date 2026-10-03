# W2 permanent local cleanup and fresh successor setup

The human requested permanent removal of disposable W2 resources after the handoff. This record supersedes local checkout/build paths and check-container assumptions in earlier W2 records. The complete assignment and all source/proof limits in the [October2 handoff](W2-creator-ai-20261002-mac-studio.md) and [successor prompt](../prompts/W2-resume-20261002-mac-studio.md) remain unchanged.

## Code custody

All source was verified clean and reachable from fetched remote refs before removing its checkout. Unfinished generation work is pushed at `72888e63be92ecba193d4b8b5fe4d5e97e36b8d4`, `origin/codex/w2-generation-inputs-20261002`, draftPR132. It remains held. Focused PR194/195/199 and handoff202 are normally merged. Export source1ef70cb1 is on its remote branch and main; handoff d92944b4 is on main. Detached privacy checkpointfb1cbca and earlier Claude W2ae267abc are also reachable remotely. No branch or remote PR was deleted or falsely merged for cleanup.

This documentation-only cleanup increment is published separately. Its exact final PR/head/merge and CI disposition are recorded in that PR. Current main may include later peer checkpoints; fetch it rather than assuming an earlier SHA.

## Removed disposable resources

- Seventeen explicitly inventoried W2 `/private/tmp` native build/DerivedData/Gradle output and capture directories: allocated-size sum7,097,458,688bytes (6.61GiB). This includes obsolete candidates and diagnostics, plus the canonical Android and shipping iOS build trees after useful binaries were preserved. Earlier `/private/tmp/w2-ios-*` and `/private/tmp/w2-android-*` artifact paths in historical receipts are retired. Small private operator scripts/logs/receipts are retained; they are not application runtime data.
- W2 checkout dependencies, `.next`/custom `.next-w2-*` caches, `.gradle`, native build output and generated Xcode projects disappear with the retired checkouts. Ignored-file inventories contained only reproducible outputs; the one private untracked custody tool was preserved before deletion.
- Disposable container `creator-platform-w2-check-20261001` and its exclusive anonymous volume `1aeb04e277689a2ec69f78598527824742fc9a2b9662fb528ddf5867eb4b8f66` were removed. No other container used that volume. This was a disposable check database, not the canonical data volume. Port55449 has no retained W2 check service; create a fresh isolated check runtime when needed.
- Clean W2 checkouts retired: `w2-coherent-export`, `w2-privacy-wave-review`, and earlier `estimate-rescue/creator-platform/creator-ai-knowledge-runtime-8bcbbf`. The final cleanup also retires `02b6/creator-platform` and `w2-migration-review/creator-platform` after this documentation is pushed/published and they are confirmed clean. Managed checkout directories are removed through their lifecycle tool; the remaining clean Git worktrees are removed normally. Remote code and tiny Git recovery metadata remain available, without retaining checkout dependencies/builds.
- The W2 Computer Use kernel was reset. W2 API/web/idb companion/builds/emulators/simulator were already stopped. Shared app processes were not killed.

The five checkouts had approximately4.6GiB of local source/dependencies/generated output before removal. These are local allocated-size measurements, not a claim about exclusive physical blocks or a machine-wide free-space delta on this shared APFS host.

## Retained deliberately

The stopped `creator-platform-w2-20261001` container, named volume `creator-platform-w2-pg-20261001`, all canonical/closed review databases, validated backups, designated private env/secrets, and source-approved private tools remain. The shared pgvector/pg17 image, global pnpm/Gradle caches, SDKs, simulator/emulator runtimes, Homebrew/idb and other workstream resources remain. W2 simulatorBC8 and Qelvora_W2_API34 device data/session state remain, both stopped. No Pantopus, Supabase, W8 or other peer resource was removed.

Latest private database backup remains `~/.config/creator-platform/w2-mac-studio-20261001/creator_w2-app61-20261002T225356Z.pgdump`,764058B/SHA256 `0266ccf5ff5fb0fd2ea5917e12e15cece4b77bfa4372d380e93f1c79553002ff`,1633TOC/mode0600. Its independent closed restore matched all six custody comparisons,61 migrations/100 business rows/163 tables. Cleanup did not start or mutate the retained database.

Useful binary relocation root: `~/.config/creator-platform/w2-mac-studio-20261001/cleanup-20261002/retained-binaries/`:

- `android-da0a7253-app-debug.apk`: source `da0a7253a632ad1d2deb73dca588defb102300f5`,70,450,775B/SHA256 `8d0c79ce2705c5aebf8d76b3bf9eb98b012a35e973f9b72d131fe48d3994be84`. Copied bytes verified before deleting the build directory. This is the personally operated canonical-navigation artifact, with its original source qualification.
- `ios-shipping-38d8494d-QelvoraApp.app`: retained original shipping artifact from source `38d8494d896366f2fffa66c3caee8d570c84efe8` plus the generated plist described in the native-privacy receipt. That receipt records native trees matching904e5941. Original and copied bundle trees match; strict/deep codesign verifies. Executable SHA256 `82203cba31576a0a3b755682e7dac2e64d419991cf6c636e97e35bdf9c39d3cf`; bundle tree SHA256 `9404531ab1ffc51a72e4dc929039ee0c2155145677143b9f74a5f858702f2ec6` (sorted relative entries, SHA256 file bytes, symlink targets). Current-main build, signature/consent for a creator, or later acceptance is not inferred.

W8 was notified of the relocation and confirmed no active dependency on the deleted build trees.

## Fresh successor setup

Create a fresh isolated worktree from current origin/main using the app worktree tool. Do not restore an old build cache or edit `/Users/yingpengwang/creator-platform` working files. Fetch/inspect draft132 and consume its complete held producers as appropriate; do not merge that draft wholesale or activate reserved migrations from database metadata.

Restore the frozen pnpm12.5.1 workspace dependencies. The shared store remains, so an offline frozen install may work; restore missing dependencies normally if needed. Generate Xcode projects from committed project.yml and use new isolated DerivedData/Gradle outputs under the shared heavy-build/device leases. Rebuild for new source; preserved binaries keep only their recorded historical qualification. No new coverage unit tests are requested.

Start only the retained W2 main database container when needed. Preserve closed original/fresh61 databases; only the validated bounded synthetic app copy may reopen for loopback acceptance. Use the corrected private launcher from `cleanup-20261002/w2-handoff-main-api.sh`, running from the fresh checkout's apps/backend. It uses that checkout's real RELEASE_REVISION and relative development-server module; it reads only designated private env files and deletes the superuser password before application import. `/health` and `/health/ready` are the actual endpoints. Stop services and reclose the bounded app copy afterward as documented in the full handoff.

Private custody tools are preserved at `cleanup-20261002/private-custody-tools/`: `.w2-privacy-wave-snapshot.mts` and its exact two imported custody modules fromfb1cbca. The untracked tool's SHA256 is `763020b0c5ad8811439e98e49b3594585cc9b1ecd106dc4f977c8b0f290073f1`. The preserved backup helper was made relocatable and syntax-checked. For a genuine new backup milestone, after stopping owned clients and restoring dependencies, copy this private tool folder into the fresh checkout at `apps/backend/.w2-private-custody/`, then set `W2_BACKUP_REPO` to that checkout and run the private `cleanup-20261002/w2-app61-backup.py`. Keep that private folder uncommitted. The helper reads designated admin configuration privately, dumps/lists/checksums and independently restores a new closed database with actual owner/ACL custody. Historical `/private/tmp` helpers containing retired absolute checkout paths must be adapted before reuse.

Continue the original whole W2 assignment, current peer integration, real-provider verification when the designated key exists, all-three-client journeys, complete C10, accessibility/artboards and named p95. Cleanup is not feature completion or release approval. The designated key and original iMac archive were absent at the last check; do not search for credentials elsewhere.
