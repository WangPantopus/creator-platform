# W2 CI continuation — September 30

The founder explicitly authorized repairing code or justified existing CI checks. This supersedes the historical W2 instruction to leave existing tests unchanged. No new test suite, weaker identity/RLS privilege, modified historical migration, rewritten reference PNG or hidden CI job is introduced.

The previous head `112c04a` ran Foundation checks [36699429399](https://github.com/WangPantopus/creator-platform/actions/runs/36699429399) and failed all five jobs. Trust release compilation [36699429342](https://github.com/WangPantopus/creator-platform/actions/runs/36699429342) passed.

| Failure | Narrow change | Verification state at this checkpoint |
| --- | --- | --- |
| iOS/macOS compile | Consume W1 platform helpers from `e976987` for capitalization/decimal keyboard. | Swift package compiles; delivery/generated/identity tests pass. Native snapshots still need verification. |
| Android SDK setup | Consume W8 workflow from `dc2b281`, retaining all jobs and pinning actions; request `platform-tools` rather than the removed `tools`. | Await new CI run. |
| Android arrival | Existing removal check mounts actual Welcome with explicitly labeled synthetic input; unconfigured app never invents an arrival. | Await emulator CI. |
| Backend sign-in | Use UUID arrival accepted by the shared navigation contract, retain external redirect denial. | Contract tests 9/9 pass. |
| Backend RLS setup | Apply immutable foundation and additive W1 identity migrations in the disposable harness; no test-only grants. | Eight integration cases pass, including real user-verified exact signature. The 10,000-pair property ran out of its two-minute budget on the busy local Docker host; its budget is now five minutes, with all 10,000 cases and 30,000 query observations preserved. |
| Web auth assertions | Registered UUID arrivals, `/home` fallback, `invalid_return` distinction; remove duplicate alert in actual sign-in UI. | Both auth seam tests and real unconfigured-sign-in journey pass locally. |
| Web artboard checks | Explicit catalog fixture routes for artboard pixels; real auth/runtime checks remain separate. Do not populate a live creator without backend authority. | Unchanged reference snapshots and zero-pixel comparison retained; local reference rendering has a one-pixel threshold discrepancy to investigate on CI. |
| Snapshot hydration | Capture with `caret: initial`; Playwright's temporary inline caret mutations otherwise race React hydration and expose an issue overlay. | Affected check being rerun. |
| Native display profiles | Render each reference in its embedded ICC color space. Original PNGs identify an LG display, whereas default local captures identify the iMac. | Eliminates the broad color-space difference; remaining glyph/raster differences still fail strict local checks. No threshold relaxed. |
| Generated output scanned by tooling | Ignore isolated `.next-*` outputs as well as `.next` in ESLint/Prettier. | Root lint/format pass. |

Local checks use only W2 disposable container `creator-platform-w2-checks-20260930`, database `creator_w2_foundation_test`, port 55449. Its password is private and separate from the Studio runtime. Visual app/reference reserve ports 3012/3112 and `.next-w2-ci`, without reusing peer listeners 3000/3101. Root build uses `.next-w2-check-build`. Unrelated databases/services/devices are preserved.

Current remote W3 now includes `approvedConversationGenerator`, scoped atomic memory/context and a conversation runtime factory; its new DDL remains unregistered pending proposals, and production policy/license/settlement/producer registration still gate fan delivery. W2 consent proposals now retain canonical kind/semantic key (rather than forcing consumers to synthesize keys from hashes), and cancellation is rechecked after asynchronous usage recording before proposing memory. W4's current allowance adapter still settles a fixed configured unit amount via a consumed boolean, not the complete actual/unknown-cost policy required by R04. W7 has an owner relay interface; trusted conversation outcomes and shadow sanitizer remain required. These current source facts supersede historical blanket claims that the producer code does not exist.

PR #1 remains draft while CI and release acceptance are incomplete. The OpenAI key permits synthetic provider verification; it does not approve licensing or production retention. This checkpoint does not claim native feature acceptance from catalog tests.
