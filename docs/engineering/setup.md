# Foundation development

This is the first implementation slice of the full build, in `creator-platform`
before Pantopus integration. Node.js/Express, Next.js, SwiftUI and Kotlin/Compose
are the chosen stack. Existing product and source designs remain authoritative.

Install Node 22 or newer and the pnpm version pinned in package.json, then run:

```sh
pnpm install
pnpm generate
pnpm dev
```

`pnpm check` verifies generated resources, strict types, lint, tests and builds.
`pnpm test:visual` checks all exported artboards and component compositions in
Light and Night, plus the foundation and auth boundaries. The design
gallery is reference content, not completed feature functionality.

The application has no independent account system. Pantopus identity integration
is deferred by the user, so sign-in fails closed until its adapter is configured.
The backend must never connect using an owner, superuser or Supabase service role.
Provider names, billing amounts and licensing terms remain their documented open
decisions; no real payment or provider is enabled by a sample screen.

## Shared sources

- `config/brand.json`: the temporary product identity.
- `config/copy.json`: fixed copy and interpolated sentences.
- `design/handoff/tokens.json`: colors, dimensions and typography, including the
  instructed Night corrections and named measurements from reference layouts.
- `packages/api`: API schemas and their generated OpenAPI contract.

Run `pnpm generate` after changing these resources. Generated Swift/Kotlin and
web token/copy files are checked into Git and checked for drift in CI.

## Product rename

The final name is intentionally undecided. Preview a future rename with
`pnpm brand:rename NewName --dry-run`; run the same command without `--dry-run`
to replace the three placeholder spellings across tracked and non-ignored text
files and their filenames in one operation. Pantopus is retained.
Then install dependencies and regenerate. External domains, store identities,
provider dashboards and existing passkeys need the checklist in `docs/NAMING.md`.

## Native hosts and tests

Use `swift test --package-path apps/ios` for protocol, identity, generated
contracts and 110 macOS snapshot assertions. Generate the iOS host with
`xcodegen generate --spec apps/ios/project.yml`; its `QelvoraApp` scheme includes
simulator UI tests. DEBUG arguments `--catalog-component Message` and
`--appearance night` open deterministic component/theme previews.

With an Android SDK installed, run:

```sh
apps/android/gradlew -p apps/android :app:assembleDebug :app:verifyPaparazziDebug
```

An attached emulator can run
`:app:connectedDebugAndroidTest`. The Android host also opens catalogs with
DEBUG intent extras. See native READMEs for complete commands.

Local Postgres checks require `CREATOR_TEST_DATABASE_URL` pointing to the
dedicated fixture database. They create migration/test fixtures there and must
never target a production database. Without that explicit URL, local integration
tests report skips; CI requires it and fails otherwise. The full check command
passes it through Turbo and runs integration tests without caching.

The current behavior, screenshots and outstanding acceptance work are recorded
in [BUILD_LOG](../BUILD_LOG.md) and the implementation verification documents.

## Definition of done

A screen requires a reviewed visual diff against its supplied artboard in both
themes, working module-backed behavior, accessibility checks and applicable
flow tests. A preview or a screenshot baseline alone does not establish completion.
Native device calls, store billing, provider behavior and pilot performance remain
unverified until those slices run on their real boundaries.
