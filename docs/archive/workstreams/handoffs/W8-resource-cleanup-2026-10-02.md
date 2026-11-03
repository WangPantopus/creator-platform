# W8 permanent resource cleanup — 2026-10-02

The human explicitly authorized permanent deletion of disposable resources and clean, fully pushed worktrees. This changes host availability, not application source or release readiness.

## Completed build/cache cleanup

Actually removed 24 verified W8-owned generated paths, totalling 5.392 GiB by allocated-file measurement before deletion:

- `/private/tmp/creator-w8-ios-derived` and `/private/tmp/creator-w8-android-build`;
- `/private/tmp/creator-w8-native-e2e-20261002/derived`;
- All eleven W8 checkout Next output directories, checkout-local dependency installs, Android Gradle/Kotlin caches, generated Xcode project/SwiftPM directory and TypeScript incremental cache.

All removed roots were checked for unexpected symlinks, and W8 ports 4108/3008 had no listening services. After deletion the W8 source checkout was 247 MiB, clean, with zero ignored paths. Private native results/logs/attachments remain; the retained native operator directory is 696 MiB. No new dependencies were installed and no build/test rerun is implied by this cleanup.

## Preserved deliberately

- Both stopped W8 database containers, named volumes and all databases. Recreating these containers could lose the installed SQL compiler setup; they occupy no running W8 database memory. Their common pgvector image is also shared infrastructure.
- `~/.config/creator-platform/w8-mac-studio-20261001`, all private env/configuration, backups and custody tools. The 787009-byte native checkpoint still hashes to `f43c42ae2c3f234a55b7b9d2f6eea966ec8b58433c470b4ff0ea32f4ceb91298` after cleanup.
- Private operator directories under `/private/tmp/creator-w8-*`, except their explicitly disposable build outputs. Do not print their env/reference/receipt bodies.
- W8 simulator/AVD userdata and identifiers; devices remain stopped. Shared SDKs, Xcode, JDK, runtimes, global Gradle/package caches, Docker images and peer/Pantopus resources remain untouched.
- Primary checkout and its unrelated untracked work. Other workstreams are handling their own cleanup; W8 does not delete their checkouts.

No Docker prune, volume deletion, database reset, secret removal or application-data erase was performed.

## Source and worktree handoff

All W8 source branches were matched to remote heads and existing PRs: drafts 131/145/192/200/201 retain actual implementation/integration acceptance work; ready 195/199/203 are merged. Closing old 83 did not remove its branch/history. The current cleanup documentation is committed/pushed and receives its own focused PR before checkout removal.

The following clean worktrees are cleared for permanent removal immediately after this documentation checkpoint merges:

- `/Users/yingpengwang/estimate-rescue/creator-platform/w8-trust-operations-3e30cd`: all tracked source and this cleanup checkpoint are pushed. No untracked or ignored files remain.
- `/Users/yingpengwang/.codex/worktrees/60fb/creator-platform`: detached `4edd3d391b7e3e2f0cf08cf4f8adbf79eb924fef`, clean with no ignored/untracked files, verified ancestor of remote main (merged PR69).

Removal keeps the primary Git repository, remote branches, commits, PRs and existing stashes. Do not assume either old worktree exists when taking over. Final removal verification is retained in the private cleanup record and reported to the human; it is not a workstream acceptance claim.

## Next agent restart

Create a fresh W8 worktree from fetched main, or the exact remote draft branch being resumed. Read `W8-continuation-2026-10-02-codex.md` for the full assignment and exact source/dependency state, with this cleanup note superseding its old occupied-checkout/build-path statements.

Recreating the former W8 path preserves absolute imports in retained private operator scripts. If using a different path, retarget those private script imports to the actual source checkout before running them. Install locked project dependencies and regenerate/rebuild current web/native outputs under the existing shared resource limits; no old W8 build output is current acceptance. Read installed Next.js/Turborepo documentation before configuration/command changes. W2 is separately retaining/relocating its final canonical native artifacts; consult its latest cleanup handoff for actual paths and hashes.

Use `docker start` only for the required own preserved container. Keep the closed database markers and labelled synthetic distinction; do not reseed. Secrets, original iMac recovery, Growth configuration, policy/provider/hardware/pilot dependencies and all remaining R1–R10/G0–G5 obligations are unchanged.
