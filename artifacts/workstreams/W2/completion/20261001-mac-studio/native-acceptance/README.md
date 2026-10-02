# W2 native account acceptance — October 2, Mac Studio

Personally operated the real Android app using supported CUA controls in Android Studio’s Running Devices view, bound to **Qelvora_W2_API34 / emulator-5554**, API 4102. The AVD uses two cores and 2,048 MB; no peer emulator or protected device was operated. The initial standalone W2 launch on 5584 was stopped before launching this same owned AVD through the IDE. No concurrent duplicate emulator was retained.

**Observed defect and repair:** Continue with Pantopus → development actor two crashed the app when the required handle screen requested undefined `qText("meta")`. AndroidRuntime reported `IllegalArgumentException: Unknown text style: meta`, `Theme.kt:61`, `HandleForm` at `FanShell.kt:159`. Both handle-form metadata headings now use the existing `data-sm` style, matching the reference `.qv-meta` mono 11/14/0.05em typography. The strict missing-style guard and generated tokens remain intact. W1 was notified; five analogous W3-owned calls were reported to W3 for its repair.

The repaired APK built successfully (11 seconds). After normal install/relaunch, the previously created real development session recovered into the handle form. Through the emulator’s actual Settings UI, Font size was set to maximum; readback was `font_scale=2.0`, with no forced display-density change. This is the OS’s actual text setting, not enlarged screenshot/display output. Android’s platform text-scaling behavior applies; this receipt does not claim that every physical font doubles linearly.

Typed **w2_native_fan** with the visible on-screen keyboard and tapped Continue. Normal app input/clipboard forwarding did not deliver text to this embedded view; on-screen CUA key taps did. The account screen displayed **@w2_native_fan**. Canonical DB readback confirms fan ID `f1c199e1-58e7-4548-9166-86866acb6d63`, development account two `10000000-0000-4000-8000-000000000002`, empty optional intro, and its actual session created at `2026-10-02T05:56:40.559Z`. No token was injected or printed. A force-stop and cold relaunch in Night restored the same account without signing in again; Light and Night account screens remained usable at the actual 2.0 text setting.

[Light account](android-200-account-light.png) · [Night cold relaunch](android-200-account-night-relaunch.png).

## iOS and proof limits

The normally simulator-signed iOS app built, installed and launched on owned `BC8E18B6-620A-4191-8B27-AAB264458081` (Qelvora W2 iPhone 17). Device Hub’s supported `cua.getApp(com.apple.dt.Devices)` timed out (-10005); no interactive iOS acceptance is claimed. Its launch image only showed Welcome. The owned simulator was shut down afterward, preserving peer/protected devices.

Android cited fan delivery, takeover, memory/source revocation, actual outage recovery after the W1 fix, TalkBack, reduced motion, complete native 200% journeys and exact artboard comparisons remain open. Provider credentials and actual journal/host registration are unavailable. This is personally verified synthetic account/profile/cold-relaunch acceptance and a real crash repair, not a completed workstream or production identity/provider proof. No new unit or UI tests were written.
# Native milestone backup

The private 541,338-byte dump `creator_w2-20261002T062500Z.pgdump` has SHA256 `b08b38c30978e74f586041538b584dd43b1abea248c2f14f8e7863d34daac8b8`. Its 1,277 TOC entries were listed and the dump restored with `--exit-on-error` into W2's disposable check database. Actual readback confirmed 40 migrations, revision 15 with 20 examples, one source and development license, zero usage/evaluations/versions, and the fictional fan plus one active session. See [sanitized receipt](backup-receipt.json). The dump and actual owner export remain private.
