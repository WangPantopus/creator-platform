# W7 — existing CI repairs, September 30, 2026

Continues `codex/w7-handoff` from `d9157eb`. The founder explicitly requested
repairing failing code or CI checks and continuing until completion. This
authorizes maintenance of the existing checks; no new test suite or test case
was added, and no check was skipped or disabled. Product acceptance remains
separate from these regression checks.

## Diagnoses and repairs

- Foundation run36703549395 failed all five jobs; Trust release compilation
  passed. Backend logs identify invalid C11 context and an obsolete schema.
  The valid sign-in fixture now supplies a registered UUID context. The
  integration suite retains its disposable-name guard, rebuilds all three
  registered schemas, and invokes the exact immutable deployment registry.
  No test-only grant or applied migration was changed. Handles use canonical
  underscores. All18 tests pass, including all10,000 isolation cases and
  30,000 observed assembler statements. Local Docker execution of those cases
  took306.869s, so their former120s timeout is now600s; coverage is preserved.
- Android runtime's failed touch assertion actually reported **no matching
  arrival node**. The app correctly omits creator context without an owner
  source. The existing component check now explicitly mounts its Welcome
  arrival fixture, as the existing catalog check already does. Runtime
  execution of this repair is pending.
- Android unit checks failed only the Light/Night Composer and ended Composer
  captures. The independent behavioral requirement is BUILD_PROMPT §9:
  “the free-conversation-ended composer keeps \"Ask Maya to step in\".” The
  implementation already follows this requirement. Four goldens were reviewed
  and updated; originals and the measured three-panel diffs are preserved in
  `android-before/` and `android-diffs/`. No tolerance changed and no unrelated
  baseline was replaced. Existing unit/Paparazzi verification now passes.
- Swift package compilation failed because Trust, Growth preferences and
  Commerce applied iOS-only keyboard modifiers to macOS views. Each modifier
  is now conditionally compiled for iOS, preserving the shipping behavior.
  Local compilation succeeds and15 non-snapshot tests pass. All110 macOS
  snapshots differ on this Intel/macOS26.5/Xcode26.5 host from the documented
  macOS27/Xcode27 goldens, including a one-channel background rounding shift.
  They were **not** rerecorded. The matching CI runner must adjudicate them.
- Web auth fixtures now use C11's Home fallback, explicit invalid-return
  error, registered UUID context and rejection of arbitrary draft strings.
  The existing pixel checks target the typed design routes with identical
  reference content; live routes require current canonical owner data and
  cannot invent Maya metadata. Original goldens, independent references and
  zero-pixel limits are unchanged. Removed a redundant nested alert role in
  Welcome; the auth check selects the actual failure notice separately from
  Next's route announcer.
- Visual tools can use leased `WEB_VISUAL_PORT` and `REFERENCE_PORT` values.
  Current run uses3009/3107 and `.next-w7-visual`, because3000/3101 belong to a
  different worktree. No peer process or output was modified. All64 screen
  and53 component comparisons pass in both themes. Both live auth-contract
  checks, the provider-unconfigured check and creator-home comparisons pass.
  Local strict goldens show single-pixel Welcome/Handle differences and a
  Handle Night source comparison difference; the matching CI run remains the
  authority for those OS-specific goldens. No tolerance was loosened.

## Verification and leases

Saved logs: `backend-tests.log`, `android-snapshots.log`, `typecheck.log`,
`lint.log` and `format.log`. Typecheck7/7, source ESLint and full formatting
pass. The existing generation/API checks were green on the starting revision;
generated resources and immutable migration sources are unchanged here.

Backend tests used only W7's dedicated PostgreSQL17/pgvector container on55447,
database `creator_w7_test_foundation`, with non-owner `creator_runtime` and
FORCE RLS. Interactive `creator_w7_resume` was not dropped or migrated.
Android uses the existing isolated SDK/JDK21/Gradle paths. A new disposable
`CreatorPlatform_W7_CI_20260930` AVD on5572 is reserved for existing runtime
checks, separately from W7's app-data device5570. ADB operations use5047 and
the exact new transport. Production, peer devices and peer database state
remain untouched. The temporary Xcode package resolution and Next generated
environment file are restored to committed source after checks.

W7 is not release-ready: canonical owner/provider integrations and the full
acceptance matrix in the preceding handoff remain open. No paid AI call or
secret-file read occurred. Next steps are pushed-head CI, principled repairs
to any remaining failures, and the remaining current-owner integrations.
