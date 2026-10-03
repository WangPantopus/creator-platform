# W3 increment 33 — You layout and larger text

Primary owner personally implemented and operated this increment on October 2, 2026. Branch: `codex/w3-you-layout-fidelity`; implementation: `7282c795` (earlier normal-text native operation: `030406b5`). See `shipping-builds.json` for full source identifiers and actual shipping binary hashes.

## Change

Web and Android now follow `design/phase4b-fan-account/You.dc.html`: 390-point phone, 16-point gutters, 28-point header inset, 24-point section spacing, two actual metrics and the six grouped account rows. The intro follows the rows. Metrics come from the real same-account commerce overview: captured monthly amount, saved limit and saved membership count. An unavailable read shows an unavailable value. Development identity stays labeled development. The fictional design's $30, $60 limit, membership and receipt examples are not substituted for current data.

The web list styles now apply only to Your account, preserving the component's bottom tabs. Web row heights were personally measured as 56 points at 390 points wide. Native rows preserve a 56-point minimum and grow for wrapped text. Larger text uses one metric column on Android and accessibility Dynamic Type on iOS; web reflows metrics when its available CSS width is below 320 points. Labels are not shrunk. Foreground, account and view-revision guards also cover the new commerce projection; backgrounding clears it. The response must match the freshly read fan identity.

## Personally operated

All operations used the W3 API at `127.0.0.1:4103` (`10.0.2.2:4103` from Android), source `d4a5c749`, and its existing `creator_w3` database. The backend stayed running throughout these journeys. Both clients loaded the persisted fictional `kilnfire` account and its saved intro, actual $0.00 captured amount, unset spending limit and zero saved memberships.

- Built-in browser, 390 × 844: operated Me and privacy into the actual empty directory, Help and safety into Support and reports, and the bottom You tab back into the same freshly loaded account. Light and Night inspected. The final Light/privacy operations used `7282c795`; earlier Night inspection at `187d5416` has the same normal-width layout. All six web rows measured 56 points and all four tabs remained visible, with 48-point targets.
- Android shipping app, owned `Qelvora_W3_API34`, serial `emulator-5584`, physical 1170 × 2532 at density 480 (390 dp): operated the Light normal-text privacy row at `030406b5`, then the final `7282c795` Night privacy row with the real system `font_scale=2.0`. The initial two-column large-text layout split MEMBERSHIPS; that observed defect was fixed and the final single-column labels were personally inspected. Tapping Me and privacy reached the readable disclosure and actual No conversations yet result at the larger text setting. No ANR appeared in these operations.
- Restored the emulator's original physical display settings and unset font scale, shut down only serial 5584, and released its exact-owned slot 2. No peer device, port or container was touched. W1 briefly held the shared Studio GUI; W3 paused its own input until W1 explicitly released targeted headless input. W3 used only the handoff-authorized `adb -s emulator-5584` input and never operated Studio.

Evidence: `web-light-you.png`, `web-night-you.png`, `web-privacy-operated.png`, `web-help-operated.png`, `android-light-you.png`, `android-privacy-operated.png`, `android-night-200-you.png`, `android-night-200-privacy-operated.png`.

## Build and verification

Final Android `:app:assembleDebug` and iOS shipping `QelvoraApp` builds passed at `7282c795`. Each heavy build acquired and released W1's atomic helper independently; no overlapping W3 native builds. Web typecheck and focused AccountScreen ESLint passed. No new test code was written. The iOS application was compiled with ad-hoc simulator signing; that is not evidence of a creator signature or an operated journey.

## Limits and remaining W3 work

Device Hub still times out, so no iOS button, VoiceOver or larger-text acceptance is claimed. Explicit permission for the alternative idb control method has been requested and is pending. The built-in browser's zoom shortcut left its measured font size and viewport unchanged; actual web 200% zoom remains unverified. TalkBack was not operated. Android's shared Requests tab label wraps at the larger system text setting; W1 received the actual observation.

These are real empty-directory account journeys, not populated memory, consent, audit, export, generation or thread acceptance. The OpenAI private env is still absent, the migration/producer wave and strict W2 synthetic-license rechecks are pending, and positive fan generation remains unavailable. There are no fabricated provider approvals, human signatures or financial receipts. W3 A–I is not complete.

Original merge order remains #45 → #24 → #36 → #63. At the latest exact-head audit, #45 `b36022a79654ad6b205e33d14dc8af1291cfe93d` and #24 `5c33e70e761f40c164627c438217bdfa2fec89f6` each have completed successful backend/web and Android runtime jobs; actual completed logs were read. Their Mac jobs remain queued and their workflows have no successful overall conclusion. Neither was merged by W3.
