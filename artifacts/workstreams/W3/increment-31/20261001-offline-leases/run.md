# Increment31 — five-second conversation read leases

Source: `a80f6547dc5409cc773fce3fe40cb60034eaf790` on `codex/w3-offline-lease`, stacked on the coherent You/privacy source. This is implementation and partial operation evidence, not completed packageA/B/I or W3 acceptance.

## Implementation

The additive canonical offline operation accepts only a genuine fan request and its currently held thread/session scope. It requires the in-transaction denial port, current named-provider consent and W2 licensed-source readiness. The issuer reads the actual request's session row on that held client, fixes one issue timestamp, and expires no later than five seconds or session expiry. The lease binds account, opaque session-family hash, issuer, creator/fan/thread, revision, control epoch, cursor, policy versions and exact visible message versions. It excludes off-the-record messages and recording URLs/blobs, trims oldest text to a bounded page, and permits no sends.

Web stores only AES-GCM ciphertext in sessionStorage with a nonextractable in-memory key. iOS uses a device-only, unlocked Keychain key and a protected file excluded from backup. Android uses AndroidKeyStore AES-GCM and a no-backup file. Cold starts cannot reuse the previous process's clock/authority. Account, issuer, session, thread, foreground loss, rejected authority, expiry or clock uncertainty conceal/purge. Monotonic time and a conservative 100 ms margin keep display within the server deadline; uncertain wall-clock movement rejects a read. Stale asynchronous cleanup is generation/view checked. Cached reads suppress live indicators and all sending; retry retains only this view's unsent draft.

The contracts and Swift/Kotlin models were regenerated with the canonical generators; no shared defaults or required-nullable behavior was intentionally changed. W1's shared-generator review is pending. No unit or other new test code was written.

## Personally performed verification

- Backend and web typechecks passed. Both actual shipping builds passed on the final source above, under sequential atomic heavy-build leases with exact-owner cleanup. The first iOS attempt failed on an extra first-conversation initializer argument; it was corrected and both repaired/final builds passed. See `shipping-builds.json` for actual binary hashes and source.
- Built-in browser at 390 pt: personally reopened genuine persisted `@kilnfire`, then clicked Me and privacy. The current account/intro remained and the directory honestly showed No conversations yet. Screenshot is an operated empty-state receipt. API4103 was the same owned PostgreSQL backend, still the previously started fail-closed runtime at `d4a5c749`.
- Android5584: personally cold booted the owned 2-core/2048 MB/no-snapshot-save emulator under slot1, installed the built app, restored genuine persisted `@kilnfire`, and tapped Help and safety. The app reached actual Help and reports and honestly reported the unavailable support endpoint. These two screenshots use the first repaired source `f3ba0816`; the final source was then rebuilt, installed and personally re-operated: actual Help and safety reached Help and reports and the same unavailable endpoint. `android-final-help-operated-light.png` records that final-source operation. No approved offline lease existed on this account, so populated encrypted reads/expiry/revocation have not been operated.
- iOS E375: installed and launched the shipping app against API4103; it stayed open and rendered genuine `@kilnfire`, actual $0.00 exposure and saved-membership count 0. This confirms the prior undefined-style crash is gone. The screenshot is explicitly startup observation only. DeviceHub native CUA selection timed out after five seconds; no native button-operation or iOS journey acceptance is claimed. Own simulator was shut down and slot3 released afterward.

## Remaining gates

The OpenAI private environment is still absent. W8 registry/runtime-denial activation, W2 licensed/journal/accounting privacy readiness, W6 recording composition, W1 lifecycle integration and actual current-head CI remain separate requirements. The offline issuer is deliberately not enabled in server composition yet. No lease, signature, provider/policy acceptance, evaluation or generation result has been fabricated. No reserved migration was manually applied. No timing targets were inferred from these operations.

A design-font audit also found that `.qv-meta` requires the canonical mono11/14 `data-sm` style; the crash-removing caption changes will be refined in a separate focused metadata increment before UI-fidelity acceptance.
