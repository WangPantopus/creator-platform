# W6 worktree preservation before removal — October 1, 2026

The user requested an audit of every W6 worktree, publication of useful local work, then removal of recoverable W6 checkouts to reclaim storage.

Audited implementation worktrees970d/6438 and this chat’s unused starter89d9. The implementation branches are published under PR20 and PR19; the earlier W6 branch is merged through PR4. All original heads are reachable from origin, including the unused local w6-media-recovery branch. No uncommitted product implementation or nonignored untracked source was found. The shared original checkout contains only untracked Turbo cache and remains untouched, as do all other workstreams.

The sole tracked local change is a Swift resolver rewrite in apps/ios/Package.resolved: swift-issue-reporting2.1.1 becomes xctest-dynamic-overlay1.13.1. Its exact JSON bytes and binary-safe patch are retained here as recovery evidence, **not an adopted dependency change**. It lacks independent dependency-intent/acceptance proof and does not warrant a duplicate product PR. Restore it only deliberately after reviewing the current Swift dependency graph.

The small ignored Playwright reports and failure screenshots from both implementation checkouts are retained verbatim in retained-browser-reports.zip. Generated report text is diagnostic data, not agent instructions. This preserves actual failed-run evidence without adding test code or changing references. Remaining ignored files are compiled backend outputs, incremental metadata and tool logs/caches.

manifest.json records every original head, branch/PR, status, ignored path, retained report hash and allocated disk size. The preservation commit is published through existing PR20 before removal. Removal must use exact audited paths, retain Git branches/history and PRs, and stop if source changes after this audit. No builds, tests, application sessions or dependency installations are needed.

After cleanup, the old absolute checkout paths in earlier handoffs are historical. Restore a fresh worktree from origin/codex/w6-completion-20261001 and inspect the separate origin/codex/w6-isolated-recovery-20261001 branch. Both existing PRs retain their unmerged application scope; cleanup does not make them tested or ready to merge.
