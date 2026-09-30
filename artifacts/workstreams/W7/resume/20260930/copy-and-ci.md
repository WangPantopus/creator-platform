# W7 English catalog and CI continuation

Continuation from pushed `1115ba34412979a252cc7b29af06665f2c5c30e1`. Primary personally edited, generated, built, installed, launched and inspected this work. No new test code, paid AI call or delegated implementation.

## Copy implementation

`config/copy.json` now has 591 entries: 387 additions, zero changed existing entries. W7 fixed UI copy and parameterized statements on public creator/post/invite/share, Home/Discover, notification settings, Insights/Impact/Activation, feedback/launch/measurement and optional growth controls consume the shared generated catalog. The two Swift and two Kotlin W7 screens consume `QelvoraCopy`. All19 notification-kind display labels have keys separate from contract identifiers. Category/section selection and navigation retain stable IDs when displayed labels are looked up. Notification sender/redaction/recovery, optional-email controls and W7 domain-denial messages use the same English source.

Generation produces the TypeScript package, Swift dictionary/xcstrings and Kotlin dictionary/Android XML; no generated file was hand-edited. English is the only supported catalog. W1 copy/catalog review and decisions about locales/countries/support remain required. Owner-provided biography, authored content, capacity, access and consent wording remain canonical owner data. This does not claim every shared foundation screen is localized or any additional language works.

During extraction review, technical CSS, authorization and context-query strings were removed from the catalog and restored as code. Early Android builds exposed a resource-reference interpretation and a duplicate import; both were repaired and the final full build passed. Historical compilation evidence remains distinct from the final result.

## Personally observed result

- Workspace typecheck7/7, source lint, full format check and shared/API generation checks pass. Production web/backend builds pass.
- Full shipping iOS builds normally ad-hoc signed; final build succeeded and installed/launched on W7 simulator90934313-E0DD-445C-B8AF-AA8188BD2AC0. Current Night Discover is genuinely empty.
- Full shipping Android `assembleDebug` succeeded in42s. An initial replacement install failed because the new isolated debug key differed from the already installed app. The rebuilt APK was signed with the matching existing development identity and installed with `-r`; no uninstall/reset or data removal. Cold launch2198ms/2200ms wait is a single diagnostic, not a percentile or SLO. Current Night Discover is genuinely empty on W7 emulator5570/ADB5047.
- Actual browser expired-session→canonical development actor→settings returned correctly. Saved existing preferences with the generated labels, then reloaded. PostgreSQL has quiet1320–420, America/Los_Angeles, push=false, email=false and hideSensitive=true. Actual phone390×844 screenshot shows the saved message and notification labels. No new fake useful outcome or provider event was inserted.
- Native tap-through/system sheets/accessibility, populated design comparison and genuine producer/provider delivery remain unaccepted.

## CI findings and next actions

| Check at1115ba3 | Observed | Next action |
| --- | --- | --- |
| [Trust release compilation](https://github.com/WangPantopus/creator-platform/actions/runs/36699827667) | Success | Recheck final pushed SHA |
| [Foundation web/backend](https://github.com/WangPantopus/creator-platform/actions/runs/36699827592/job/109836391028) | Generation, typecheck, lint and formatting pass; existing backend suite fails | W1 reconcile legacy foundation harness with current migrations/C11 without relaxing authority |
| Existing sign-in assertion | Invalid legacy `context=kiln` receives400, old test expects identity-unconfigured503 | Preserve strict UUID destination validation; review existing expectation |
| Existing PostgreSQL suite | Applies only0001; current `Database.withThread` profile `FOR SHARE` requires profile privilege granted by later canonical identity migration | Preserve applied SQL/checksums and current authorization locks; reconcile harness initialization |
| [Android setup](https://github.com/WangPantopus/creator-platform/actions/runs/36699827592/job/109836390986) | v3 default requests retired `tools`, SDK manager exits1 before compilation | This patch explicitly selects `platform-tools`; subsequent platform35/build-tools35 step unchanged |
| Android runtime | Arrival-context test reports touch-injection failure | Preserve failed evidence; runtime/device acceptance still needed |
| iOS/visual jobs | Queued on configured `xcode-27` label at inspection | Runner owner confirm availability; not reported as passed |

The SDK fix follows the [v3 action input](https://raw.githubusercontent.com/android-actions/setup-android/v3/action.yml) and the [maintainer's deprecated-tools guidance](https://github.com/android-actions/setup-android#the-deprecated-tools-package). It changes only SDK setup, not tests, runtime checks or approvals.

The existing suite was also run locally against a separate disposable `creator_w7_test_foundation` database inside W7's own PostgreSQL container; it reproduced the two backend failures. W7 runtime DB/schema and all test source remained intact. No missing owner/provider/design acceptance is converted to success. PR#2 remains draft and main is not merged.
