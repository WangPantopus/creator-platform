# Setup

How to get a working checkout, run the checks, and avoid this Mac's known traps. The stack is
Node.js and Express for the backend, Next.js for the web, SwiftUI for iOS and Kotlin/Compose for
Android, in one pnpm workspace. The product and source documents stay authoritative; this page is
only how to build it.

## What you need

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 24 (CI); 22 or newer works | `package.json` `engines` |
| pnpm | 12.5.1 | `packageManager` in `package.json`. See "This Mac" if it is not installed |
| Docker | Desktop, running | For the local stack and the backend's PostgreSQL tests |
| PostgreSQL image | `pgvector/pgvector:pg17` | Pulling it is a download that needs the founder's yes |
| Xcode | 27.1, with the iOS 27.0 and 27.1 runtimes | iOS only. Also `xcodegen` |
| JDK and Android SDK | CI uses Java 21 and compile SDK 35 | Android only. [apps/android/README.md](../../apps/android/README.md) has the commands |
| `gh` | any recent | For pull requests |

## First run

```sh
pnpm install --frozen-lockfile
pnpm generate
pnpm dev
```

`pnpm dev` starts the web and backend hosts. For a complete stack with a database, the workers and
the development creator Maya, use the [local stack](local-stack.md) instead. The design review
catalog is at `/design`.

## Checks

- `pnpm check` runs what CI's `web-and-backend` job runs: `generate:check`, every typecheck, lint,
  `format:check`, the tests and every build.
- The backend's PostgreSQL tests need `CREATOR_TEST_DATABASE_URL` pointing at a disposable
  PostgreSQL 17 with pgvector. They create fixtures there, so never point it at a database you need.
  Without the URL they are skipped locally; in CI a missing URL fails the suite. `node
  infra/local/stack.mjs env` prints a URL for a running local stack.
- `pnpm test:visual` runs the Playwright visual suite ([design verification](design-verification.md)).
- Native: `swift test --package-path apps/ios` for the Swift package, and the Gradle tasks in
  [apps/android/README.md](../../apps/android/README.md). The limits of the native checks are in
  [native verification limits](../implementation/native-foundation.md).
- What CI runs, and when, is in [ci.md](ci.md).

## Shared sources

Generated files are committed and checked for drift in CI. Run `pnpm generate` after changing any of
these:
- `config/brand.json`: the placeholder product identity ([naming rules](../NAMING.md));
- `config/copy.json`: the fixed copy and interpolated sentences;
- `design/handoff/tokens.json`: colors, dimensions and typography;
- `packages/api`: the API schemas and the generated OpenAPI contract.

To preview a rename of the placeholder name, run `pnpm brand:rename NewName --dry-run`, then
follow the checklist in [NAMING.md](../NAMING.md).

## Sign-in

The local stack signs in with the synthetic development identity. Qelvora sign-in with Apple and
Google plus the 18+ step (option D) is built and switched on with `QELVORA_SIGN_IN`; the lane 1
scenarios run it against a fake Apple and Google (`tests/scenarios/lane-1/fake-provider.mjs`). Real
Apple and Google credentials don't exist yet. The backend never connects as an owner, a superuser
or an RLS-bypassing role.

## Native hosts

- **iOS:** generate the project with `xcodegen generate --spec apps/ios/project.yml`; the
  `QelvoraApp` scheme includes the simulator UI tests. DEBUG launch arguments open the component
  catalog and force an appearance ([apps/ios/README.md](../../apps/ios/README.md)).
- **Android:** `apps/android/gradlew -p apps/android :app:assembleDebug :app:verifyPaparazziDebug`
  with an Android SDK installed; `:app:connectedDebugAndroidTest` needs an emulator.
- Both apps can run signed in against the lane 7 fake API through a DEBUG-only harness
  ([harness runbook](../lanes/status/lane-7-harness.md)).

## Definition of done for a screen

A screen needs a reviewed visual diff against its board in both themes, working module-backed
behavior, accessibility checks and the flows that apply to it. A preview or a screenshot baseline
alone does not establish completion. Device calls, store billing, provider behavior and pilot
performance stay unverified until they run on their real boundaries.

## This Mac

- **`gh`** is at `/opt/homebrew/bin/gh`, which is not on the default shell `PATH`.
- **pnpm 12.5.1** is not installed globally. Install it into a scratch folder
  (`npm install --prefix <dir> pnpm@12.5.1`), or once globally.
- **Docker:** its CLI plugins are symlinked into the mounted Docker installer image, which makes
  `docker info` hang.
  - Workaround: point `DOCKER_CONFIG` at a folder whose `config.json` is `{"auths":{}}`, and set
    `DOCKER_HOST=unix://$HOME/.docker/run/docker.sock`.
  - Permanent fix: quit Docker, eject the installer image, and start Docker from Applications.
- **iOS:** use an iPhone 18 Pro on iOS 27.0. iOS 27.1 offers only the iPhone Duo, which sometimes
  can't be found once it has booted (CI picks the iPhone 18 Pro for the same reason).
- **Android:** there is no Android SDK here, so CI builds Android.
- **Tools rewrite tracked files.** `swift test` and `xcodebuild` rewrite `apps/ios/Package.resolved`,
  and `next dev` rewrites `apps/web/next-env.d.ts`. Restore both before committing. The local stack
  hides `next-env.d.ts` from Git while the web app runs and restores it on `stop` and `down`.
- **zsh:**
  - write `${ref}:path`, not `$ref:path` (`:a` and `:h` are modifiers);
  - unquoted variables don't split into words;
  - there is no `timeout` command.
- **CI** waits mostly on the macOS runner queue: a full run takes 30 to 60 minutes. The app's PR
  monitor watches it; don't poll.
