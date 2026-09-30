# CI and PR publication triage

Code checkpoint: `fa6af82f7ceb103b77085db2301e9dc6b3da12d7`. Main merge `a96ecbb` cleared the PR conflict: GitHub now reports mergeable, draft, unmerged. Merge readiness remains open.

## Observed GitHub checks

[Foundation checks run 36689759981](https://github.com/WangPantopus/creator-platform/actions/runs/36689759981):

- `web-and-backend`: generated checks, all seven TypeScript tasks and root ESLint passed. `pnpm check` stopped at existing formatting issues in `apps/backend/src/{config,server}.ts`, `apps/web/app/auth/development/page.tsx`, `apps/web/app/globals.css`, and `apps/web/app/unsubscribe/[token]/route.ts`. Tests/build stages after formatting did not execute; targeted local W6 production builds separately passed.
- `ios-foundation`: macOS Swift build failed on the iOS-only `textInputAutocapitalization` in `GrowthPreferences.swift:30`; app build/install stages did not run.
- `android-foundation`: SDK setup failed before compilation because setup-android v3 asks for removed package `tools` by default. The [maintainer's v3 input definition](https://raw.githubusercontent.com/android-actions/setup-android/v3/action.yml) supports explicit `packages: platform-tools`; the [current official action README](https://github.com/android-actions/setup-android/blob/main/README.md#the-deprecated-tools-package) documents that deprecated package's removal.
- `web-visual` and `android-runtime` were still running at the recorded snapshot. No passing result is inferred.

[Trust release compilation run 36689759910](https://github.com/WangPantopus/creator-platform/actions/runs/36689759910) passed.

## Prepared repair; shared files unchanged pending lease

[Expanded nine-file patch](shared-ci-fixes-expanded.patch) supersedes the earlier [seven-file proposal](shared-ci-fixes.patch). Five files receive formatting only, CI requests `platform-tools`, and three Swift files conditionally apply iOS-only input modifiers. The isolated macOS build exposed the same issue in `Commerce/CommerceFeature.swift:120` (`keyboardType`) and `Trust.swift:166` (`textInputAutocapitalization`) after Growth was fixed. All three proposed guards preserve those modifiers on iOS.

The complete expanded proposal passes `git apply --check` against this branch and a macOS `QelvoraUI` build from a separate source copy. The initial seven-file proposal alone leaves the additional Commerce/Trust compilation failures. No test code or tests were changed, no CI check was removed, and no shared producer source was edited in the branch. User was asked for the exact nine-file lease because the W6 resume prompt requires narrow leases for shared W1/W4/W7/W8 edits. Do not apply the expanded patch merely because the earlier seven-file lease was approved.

## PR metadata write

The GitHub connector returned HTTP403 `Resource not accessible by integration` when updating PR title/body. The normal Codex browser is signed out of GitHub and cannot edit the PR. Git push succeeded through the repository's existing transport; PR #4 visibly contains the new merge and W6 code commits. [Prepared replacement PR description](../../../../../docs/workstreams/handoffs/W6-pr-description.md) is saved for application through an authorized GitHub write session. The live PR description remains the historical description; no successful metadata update is claimed.

## Owned runtime release

Stopped only the W6 API/web sessions and verified no listener remains at 4106/3006. Browser microphone requests were cancelled and the temporary viewport was reset. Shared/generated `next-env.d.ts` and SwiftPM dependency resolution changes were restored to the recorded branch content. No simulator, emulator or peer container/process was stopped. Repository dependencies and build caches remain reusable; no private configuration or secret was created.
