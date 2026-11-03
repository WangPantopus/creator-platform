# CI

What runs on a pull request, what each job proves, and where CI is going. The workflows are
`.github/workflows/ci.yml` and `.github/workflows/trust-release.yml`. They are the source of truth,
and their comments explain each choice; this page says what they do.

## Foundation checks (`ci.yml`)

| Job                  | Runs          | Runner                                          | What it runs                                                                                                                                                            |
| -------------------- | ------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `changes`            | Always        | Ubuntu                                          | Lists the changed paths and decides which gated jobs the change needs ([below](#which-jobs-a-change-runs))                                                              |
| `evidence-budget`    | Pull requests | Ubuntu                                          | `scripts/check-evidence-budget.mjs`: evidence stays out of Git, so any file added or changed under `artifacts/` fails it; deletions pass                                |
| `web-and-backend`    | Always        | Ubuntu, with a PostgreSQL 17 + pgvector service | `pnpm install --frozen-lockfile` and `pnpm check`: generate check, typecheck, lint, format check, the tests (including the backend suite on PostgreSQL) and every build |
| `web-visual`         | Gated: visual | macOS (`xcode-27`)                              | `pnpm test:visual`: the Playwright comparison of the design boards and components with the web app, in Light and Night ([design verification](design-verification.md))  |
| `ios-foundation`     | Gated: native | macOS (`xcode-27`)                              | `swift test` for the Swift package and its snapshots, then the app's UI tests on an iPhone simulator, the iPhone 18 Pro when the runner has one                         |
| `android-foundation` | Gated: native | macOS (Intel)                                   | `assembleDebug`, the unit tests and the Paparazzi screenshot check                                                                                                      |
| `android-runtime`    | Gated: native | Ubuntu, with an emulator                        | `connectedDebugAndroidTest` on API 34                                                                                                                                   |

`changes` and `web-and-backend` run every time, and `evidence-budget` runs on every pull request.
The four gated jobs run when `changes` says the change needs them, and on every full run.
`android-runtime` runs on Ubuntu, but it builds and tests the Android app, so it is gated with the
native jobs. A job skipped by its `if:` reports success: a gated job that a change doesn't need
still passes, and so does `evidence-budget` on runs that aren't pull requests.

### When it runs

- **Pull requests:** when one opens, and each time its branch changes. A pull request's branch runs
  only as a pull request; pushes run only on `main`.
- **Pushes to `main`:** every merge. `main` takes changes only through pull requests
  ([branch protection](#branch-protection)).
- **Every night at 12:17 UTC:** a full run of `main`. That is this repository's quietest CI hour, and
  the odd minute avoids the rush of scheduled runs on the hour.
- **On demand:** `workflow_dispatch` ("Run workflow" in the Actions tab) starts a full run.

A newer run cancels an older one still running for the same pull request, or for the same branch and
trigger. Push runs on `main` are the exception: each one is keyed by its commit, so they never cancel
each other. A push run checks only what its own merge changed, so cancelling it would leave that
merge unchecked until the nightly run.

### Which jobs a change runs

`changes` lists every changed path and checks it against two groups. A gated job skips only when
every changed path is known not to affect it.

| Group  | Gates                                                        | What it claims                                                                                                                                                                                                                                                                                                                                                                      |
| ------ | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native | `ios-foundation`, `android-foundation` and `android-runtime` | What the two apps build and test: `apps/ios/` and `apps/android/`. The generators that write into both apps, `scripts/generate-shared.mjs` and `scripts/generate-native-api.mjs`, and what they read: `config/`, `packages/api/generated/`, `design/handoff/tokens.json` and `design/design-system/project/components/bundle.js`                                                    |
| Visual | `web-visual`                                                 | The web app and what its comparison reads: `apps/web/`, `packages/`, `tests/visual/`, `scripts/visual-*`, `playwright.config.ts`, `design/`, `assets/` and `config/`. The toolchain that installs and runs them: the root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json` and `tsconfig.base.json`, every `apps/*/package.json`, `.npmrc` and `.pnpmfile.cjs` |

A path can be in both groups, such as anything under `config/`. A path that a group claims runs that
group even inside a folder that otherwise skips: `apps/backend/package.json` runs `web-visual`,
because `pnpm install` reads every workspace manifest.

**These paths skip,** because no gated job reads them:

- the folders `docs/`, `artifacts/`, `tests/scenarios/`, `infra/` and `apps/backend/`, with any
  `.gitattributes` inside them;
- the root files `AGENTS.md`, `CLAUDE.md`, `README.md`, `.gitignore`, `.prettierignore` and
  `eslint.config.mjs`;
- four scripts: `scripts/check-evidence-budget.mjs`, `scripts/shared.test.mjs`,
  `scripts/rename-brand.mjs` and `scripts/with-heavy-build-lock.mjs`;
- in `.github/`: `CODEOWNERS`, Markdown files, `ISSUE_TEMPLATE/`, the pull request templates,
  `FUNDING.yml` and `dependabot.yml`.

**These paths run everything:** anything under `.github/workflows/` or `.github/actions/`, and any
`.gitattributes` outside the folders above, because they change how jobs run or how files are
checked out. Any other path that no group claims and no list skips runs everything too.

**What a run compares:**

| Run                             | Compared with                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pull request                    | The merge base of its head and the default branch, not the pull request's own base. A stacked pull request then counts the changes below it, and a retargeted one can't keep a stale result |
| Push to `main`                  | The commit before it. If a push run never finishes (cancelled, an outage or `[skip ci]`), the nightly run is the backstop                                                                   |
| Nightly, or `workflow_dispatch` | Nothing: it checks everything                                                                                                                                                               |

**When `changes` can't decide, everything runs.** If it can't compare the commits or list the
changes, every gated job runs. The same happens when any of its steps fails or times out: the gated
jobs run even when `changes` itself failed.

Matching ignores case, because the macOS runners would check a path such as `Apps/ios/` out into
`apps/ios/`.

The step summary of `changes` says what was decided and why, in one line, such as
`Native jobs run: false. Visual job runs: false. Basis: compared <base> with <head>.` The basis
names the two commits compared, or why everything ran: a full run, a comparison that wasn't
possible, or the first path that no group claims.

### Adding a path

- A new file or folder that a gated job reads goes into that job's group, in the same pull request.
- A new folder that no gated job reads goes on the skip list.
- Anything else runs everything. That is safe, but slow.

A change to `ci.yml` runs everything, so a change to the groups is itself checked by the full matrix.

### The nightly run

The coordinator reads the nightly result, and starts a work session the same day for a real
failure. A flaky check is fixed the day it appears.

### Timing

Measured on the pull request run of #530,
[run 41566516221](https://github.com/WangPantopus/creator-platform/actions/runs/41566516221), which
ran the full matrix on this workflow:

| Job                  | Time        |
| -------------------- | ----------- |
| `changes`            | 9 s         |
| `evidence-budget`    | 14 s        |
| `web-and-backend`    | 3 min 22 s  |
| `android-runtime`    | 5 min 54 s  |
| `android-foundation` | 8 min 8 s   |
| `web-visual`         | 9 min 15 s  |
| `ios-foundation`     | 20 min 30 s |

- From the first job's start to the last job's end the run took 20 min 42 s, set by
  `ios-foundation`. Counted from when it was queued, it took 22 min 42 s: it first waited about 2
  minutes for the older run it replaced to finish cancelling.
- The gated jobs started 11 to 15 seconds after `changes` did, because they wait for its decision.
- No job waited more than 6 seconds for a runner, so these are working times, not queue times.

## Trust release compilation (`trust-release.yml`)

Runs by hand, and on pull requests that touch the trust and operations backend, migrations, the ops,
support, trust and status web pages, `infra/` or the workflow itself. It runs `generate:check`, the
backend and web typechecks and builds, and then states that compilation is not release readiness
([release](release.md)).

## Branch protection

`main` has been protected since 2026-11-03, with the founder's yes:

- **Every change goes through a pull request.** No approval is required: every session runs as the
  founder's account, and GitHub doesn't let an author approve their own pull request.
- **The required checks below must pass.**
- **The rules apply to admins too,** so no session can push to `main` directly.
- **A branch doesn't need to be up to date with `main` before it merges.** The push run on `main` and
  the nightly run catch breakage that shows only when changes combine.
- **No force pushes,** and `main` can't be deleted.
- **Merge commits only:** squash and rebase merging are off for the repository.

### Required checks

The required checks are the six job names of `ci.yml`, pinned to GitHub Actions (app id 15368):
`evidence-budget`, `web-and-backend`, `web-visual`, `ios-foundation`, `android-foundation` and
`android-runtime`. All six can be required because a skipped job reports success.

- **Never `changes`.** It only decides what runs, and when it fails, every gated job runs instead.
- **Never `compile` from `trust-release.yml`.** That workflow has a workflow-level `paths:` filter,
  so on other pull requests it reports nothing, and a required check that never reports blocks the
  merge.

**Don't use `[skip ci]`.** If a pull request's head commit message contains it, or another of
GitHub's skip markers such as `[ci skip]` or `[no ci]`, the workflow doesn't run. The required
checks then never report, and the pull request can't merge. A marker in a pull request's title
skips the push run on `main` after the merge instead, because the merge commit's message carries
the title.

## Where CI is going

From the [consolidation plan](../CONSOLIDATION_PLAN.md), sections 5 and 6. The founder approved the
plan, and on 2026-11-03 settled two of its section 6 working rules: the required checks
([above](#branch-protection)), and tests, which are end-to-end only, with no unit tests. Whether
scenarios run in CI is still open, and so is whether the existing suites keep running in CI as
regression gates. Today they do.

- **Done in #530, merged on 2026-11-03:** the macOS jobs run only when their paths change, and the
  full matrix runs every night.
- **Still open: a required gate in under 15 minutes,** with a scenario smoke on a fresh stack.
  `web-and-backend` already runs the rest of that gate (generate, typecheck, lint, format, the
  backend tests on PostgreSQL and the build); it took 3 min 22 s in the [measured run](#timing).
- **Still open: scenarios run in CI** on a disposable stack. Today they run by hand. This is one of
  the working rules the founder has not decided yet.
- A flaky check gets fixed the day it appears.
