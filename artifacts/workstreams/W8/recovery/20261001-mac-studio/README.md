# W8 PR17 re-verification on the Mac Studio — 2026-10-01

This run re-verifies [PR17](https://github.com/WangPantopus/creator-platform/pull/17)'s source on current main. It does **not** repeat the original-host data recovery recorded in [the earlier evidence](../20261001/README.md); see the custody finding below. The [receipt](receipt.json) records the exact revision, environment, steps, observations and limits.

## Custody finding: the preserved inputs are not on this host

This session runs on a different machine (`Mac14,13`, macOS 27.0) from the one that produced the 2026-10-01 handoff. None of the recorded private recovery locations exist here:

- `~/.config/creator-platform/cleanup-20261001/` (manifest plus both cluster-SQL archives)
- `~/.config/creator-platform/w8-local/`
- `~/.config/creator-platform/recovery-20261001-active/` (`post-recovery-runtime.dump`, preserved snapshot, runtime env)
- `~/.config/creator-platform/secrets/openai.env`

A bounded search of the home directory and mounted volumes found none of them. The W4 and W5 owners independently reported the same absence for their own archives, and W4 locates the old backups on the iMac's `~/.config/creator-platform`. PR17's `creator-platform-w8-recovery-20261001` container and volume are not on this host either.

So nothing here restores, replaces or re-derives the preserved W8 runtime (210 rows, 146 tables), the Foundation adoption result, the cases, block, tombstone, blocked jobs or the deletion journal. Those remain recorded only by the original-host receipt. Recovering them needs the iMac's private directory copied here; the required-inputs register asks for it.

## What was verified instead

The run uses a separately named **synthetic** environment, labeled as such everywhere:

| | |
| --- | --- |
| Container | `creator-platform-w8-macstudio-20261001`, `pgvector/pgvector:pg17` (digest `ac08538c…`), PostgreSQL 17.11, loopback 55438 |
| Database | `creator_w8`: fresh canonical registry (40 checksum-matching migrations), W8 synthetic seed, plus 0043's idempotent backfill for the seeded threads |
| Closed copy | `creator-platform-w8-closed-20261001`, loopback 55439. Restored from a fresh custom-format backup of the synthetic database (2,223 ms), with all 146 tables' row counts identical. The closure marker is installed by the owner role |
| Runtime | `local-server.ts` at `e7de7a18`, three non-owner pools, private env outside Git; web on 3008 |

**Open synthetic database** (no marker):

- `/status` at 1280 × 900 Light and Night reports `restoration denial · available / not restored local harness`.
- A synthetic fan's account export is accepted (202) at 390 × 844 with no horizontal overflow. Its domain tasks show the true states: six complete, content `domain_hook_unavailable`, growth `privacy_artifact_unconfigured`. No download is offered.

**PR17 privacy-form fix:** when `/api/trust/capabilities` is aborted or returns 503, the submit control stays disabled ([abort, Night](capability-abort-phone-night.jpg)).

**Closed copy, started with both `RESTORED_*` environment flags omitted:** the database marker alone closes the host.

- Liveness 200. Readiness 503 with `restoration_denial: unavailable / restored_traffic_closed`.
- Identity capabilities report sign-in unavailable with zero actors.
- Help and status remain public.
- Every private route returns a correlated 503 `restoration_pending`, including:
  - trust capabilities
  - privacy jobs (GET and POST)
  - reports
  - local sessions
  - identity continue
  - thread listing
- A WebSocket upgrade is refused with 401. The privacy worker does not start; its non-owner role is still checked.

**Closed copy, in the browser:**

- [Status Light](closed-status-desktop-light.jpg) and [Night](closed-status-desktop-night.jpg) show the unavailable restoration capability.
- [Privacy Light](closed-privacy-phone-light.jpg) and [Night](closed-privacy-phone-night.jpg):
  - show no local-actor selector;
  - display the restoration message with its reference;
  - keep the submit control disabled;
  - stay 390 px wide.
- That reference (`d47adba2…`) resolves to one redacted log line: method, fixed route label, 503, error code. It contains no path, body or content.
- Ordinary sign-in refuses and keeps `returnTo=/support/privacy` ([capture](closed-signin-phone-light.jpg)).

**Native, closed copy (iOS Simulator "Creator Platform W8", iPhone 17, iOS 27.0, launched with `--api-url http://127.0.0.1:4108`):**

- `/support/privacy` falls back to Welcome with no development actor chooser ([capture](ios-closed-privacy-signin-light.jpg)).
- `/trust` exposed a real defect: crisis help showed "Could not complete" ([before](ios-closed-trust-night-before-fix.jpg)). Both native clients loaded `capabilities` before `help`, so the closed host's 503 on capabilities hid public help.
- The fix, in `Trust.swift` and `Trust.kt`, changes the load order:
  - help loads independently;
  - capabilities are read only on the privacy route and are cleared when that read fails, so a stale "configured" value can't enable submission;
  - account-data failures stay scoped.
- After a rebuild, iOS shows crisis help with the help response's "regional resources not configured" line and no error ([after](ios-closed-trust-night-fixed.jpg)).
- The Android change compiles into the debug APK. The Android emulator journey was **not operated** in this run: it was stopped under the shared Mac Studio device budget before the fix existed, so it remains the first acceptance item.

## Limits

- This is synthetic data, so it is not evidence that the preserved W8 state survived or was restored.
- No domain purge, completed C10, provider, staging, hardware, store or pilot acceptance is claimed.
- The 2,223 ms local logical restore is not an RPO/RTO measurement.
- The local actor selector and synthetic confirmation are development-only. They are not canonical Pantopus identity evidence.
- No tests, goldens, tolerances, applied SQL or canonical registry entries changed.
