# CI

What runs on a pull request, what each job proves, and where CI is going. The workflows are
`.github/workflows/ci.yml` and `.github/workflows/trust-release.yml`.

## Foundation checks (`ci.yml`)

Runs on every pull request, and on every push to `main`. A newer push to the same branch cancels
the older run.

| Job | Runner | What it runs |
| --- | --- | --- |
| `evidence-budget` | Ubuntu | Pull requests only. `scripts/check-evidence-budget.mjs`: files added or changed under `artifacts/` stay at most 300 KB each and 1 MB in total, with no duplicate blobs |
| `web-and-backend` | Ubuntu, with a PostgreSQL 17 + pgvector service | `pnpm install --frozen-lockfile` and `pnpm check`: generate check, typecheck, lint, format check, the tests (including the backend suite on PostgreSQL) and every build |
| `web-visual` | macOS (`xcode-27`) | `pnpm test:visual`: the Playwright comparison of the design boards and components with the web app, in Light and Night ([design verification](design-verification.md)) |
| `ios-foundation` | macOS (`xcode-27`) | `swift test` for the Swift package and its snapshots, then the app's UI tests on an iPhone simulator, the iPhone 18 Pro when the runner has one |
| `android-foundation` | macOS (Intel) | `assembleDebug`, the unit tests and the Paparazzi screenshot check |
| `android-runtime` | Ubuntu, with an emulator | `connectedDebugAndroidTest` on API 34 |

These six are the checks a pull request needs green today. Nothing enforces it yet: `main` has no
branch protection (see [STATUS](../STATUS.md#wave-5-in-progress)).

## Trust release compilation (`trust-release.yml`)

Runs by hand, and on pull requests that touch the trust and operations backend, migrations, the ops,
support, trust and status web pages, `infra/` or the workflow itself. It runs `generate:check`, the
backend and web typechecks and builds, and then states that compilation is not release readiness
([release](release.md)).

## Where CI is going

From the [consolidation plan](../CONSOLIDATION_PLAN.md), sections 5 and 6. The founder approved the
plan; which checks become required, and scenarios in CI, are among the section 6 working rules that
are still open.

- **A fast required gate in under 15 minutes:** generate, typecheck, lint, format, the backend tests
  on PostgreSQL, the build, and a scenario smoke on a fresh stack.
- **The macOS jobs run only when their paths change,** native, shared UI or visual, **plus a full
  run every night.** Today a run waits mostly for macOS runners: 30 to 60 minutes, and the review
  measured a median of 94 minutes in October.
- **Scenarios run in CI** on a disposable stack. Today they run by hand. This is one of the working
  rules the founder has not decided yet.
- A flaky check gets fixed the day it appears.

The Wave 5 CI session is adding the path filters and the nightly run.

### Path groups

<!-- The Wave 5 CI pull request defines the exact path groups. Fill this in from that PR once it
merges: which jobs are required on every pull request, which run only when their paths change, and
the nightly schedule. -->

Not merged yet. The exact path groups for the macOS jobs, and which jobs are required on every pull
request, go here when the Wave 5 CI pull request lands.
