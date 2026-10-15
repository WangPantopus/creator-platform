# Lane 1 · WP 1.5 · Signing fixes

Written 2026-10-15 by lane 1. Three items from the lane brief (launch review, section 7, rows 8
and 9, and the Android passkey limit). The signing panel is fixed in lane 1's code; the stuck Note
needs a lane 6 change (a verified patch is below); the founder decided the other two on
2026-10-15, and the recovery split is built.

## 1. A pending publication stays stuck after the five-minute window (row 8)

**What happens.** When a creator signs a Note and the publish answer is lost (the network drops,
the tab is closed), the Studio's composer keeps a "pending publication" so the same signed command
can be retried without signing twice (`apps/web/features/studio/notes/Compose.tsx:92-96, 814-860,
886-905`). The backend accepts a signature for five minutes
(`apps/backend/src/modules/identity/subjects.ts`, `consumeCreatorSignedAct`). A retry after that is
refused with `signed_act_required`, and nothing is published. But the composer never clears the
pending publication: the retry and check buttons stay, every edit and sign control is disabled by
`!!pendingPublication`, and the creator cannot sign again. Only clearing the browser's session
storage gets them out. Reproduced in a browser (section 4).

**Fix, lane 1 (this pull request).** The shared signing component
(`apps/web/features/identity/signing.tsx`) had the same trap for the other six signing screens
(approved draft, correction, packet accept, thread reply, Note reaction, call offer): any failure
after the passkey assertion left it "unknown" and disabled for good. It now returns to "ready to
sign" when the failure is `signed_act_required`, because the owner checked the signature in the
publishing transaction and published nothing. A lost response, or `signed_act_consumed` (the
signature may have been used), stays unknown, as before. It also exports
`signatureRefused(failure)` so a domain can apply the same rule.

**Fix, lane 6 (ticket).** In `Compose.tsx`, clear the pending publication when a retry or a status
check finds the signature refused, so the composer offers signing again:

```diff
+import { signatureRefused } from "../../identity/signing";
 ...
                 onClick={() =>
                   void action.run(async () => {
                     const { id, ...command } = pendingPublication;
-                    await studioRequest(
-                      "content",
-                      `${creator.id}/${id}/publish`,
-                      command,
-                      creator.viewerAccountId,
-                    );
+                    try {
+                      await studioRequest(
+                        "content",
+                        `${creator.id}/${id}/publish`,
+                        command,
+                        creator.viewerAccountId,
+                      );
+                    } catch (failure) {
+                      // Nothing was published; this signature can never be
+                      // used again. Offer a fresh signature on the same draft.
+                      if (signatureRefused(failure)) clearPending();
+                      throw failure;
+                    }
                     clearPending();
                     onDone();
                   })
                 }
```

The message the creator then sees is the backend's existing one for `signed_act_required`; the
pull request does not add copy.

## 2. Passkey recovery marks every past signature revoked (row 9)

**What the code did.** Starting recovery revoked every passkey and set `key_revoked` and
`creator_revoked` on every past signature of the creator (`passkeys.ts`, `recover`). Revoking one
passkey set `key_revoked` on every signature made with it (`revoke`). The public verification page
then showed "Signing key revoked" (the key flag takes precedence) on every Note, reply and share card
the creator ever signed (`apps/web/app/verify/[id]/page.tsx:49-50`), though nothing showed that any
of them was forged.

**Decision (founder, 2026-10-15).** Split a lost device from a compromised one. A lost device
retires the key and past signatures stay valid; a compromised device keeps today's revocation.

**What was built** (pull request stacked on this file's first one):

- A passkey can be **retired** (`passkey_credential.retired_at`, one pending migration). A retired
  key can never sign again: signing checks `revoked_at` and `retired_at` (`signed-acts.ts`,
  `subjects.ts`). Every reader of past acts (the public page, commerce, content, media, the
  signature-read fences) checks only `revoked_at` and the signature flags, so past acts stay valid
  with no other lane's code touched.
- **Lost** (`recover(actor, "lost")`, `revoke(actor, id, "lost")`): every working key is retired,
  open challenges are cancelled, and `recovery_started_at` is set. That alone requires a fresh
  sign-in and fresh, ops-approved proof before the next key. The creator stays verified and
  `recovery_required` stays false, because several readers hide past acts while it is true.
- **Compromised** (the default when no choice is sent): unchanged.
- The setup page asks which happened. With exactly one working key, it asks for a second one in
  the approved wording: "Add a second passkey on another device, so losing one does not stop you
  signing."

**Wording, approved by the founder on 2026-10-15** (in `config/copy.json`, used on the setup page):

| Key                              | Proposed                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `passkeyRecoveryBody`            | Choose what happened. Either way, sign in again and submit fresh creator proof before registering a new passkey. |
| `passkeyRecoveryLost`            | It's lost or broken                                                                                              |
| `passkeyRecoveryLostHelp`        | Your past signatures stay valid. That passkey can't sign again.                                                  |
| `passkeyRecoveryCompromised`     | Someone else may have it                                                                                         |
| `passkeyRecoveryCompromisedHelp` | Every past signature will show as revoked, because no one can tell which were yours.                             |

**Known gap.** The publication authority's applied SQL (`schema-publication-scope.sql:194`)
checks only `revoked_at` when it publishes a scheduled or media Note. An act signed in the five
minutes before its key was retired could still be published by that worker, which is not running in
the pilot. Fixing it needs a new migration replacing that function.

## 3. The Android 8 and 9 passkey limit (minSdk)

**Facts.** The fan app's minimum is Android 8 (`minSdk = 26`,
`apps/android/app/build.gradle.kts:15`). Passkeys need Android 9 (API 28) or later, and the app's
passkey ceremony already refuses below that
(`apps/android/app/src/main/java/com/pantopus/qelvora/identity/PasskeyCeremony.kt:17`). iOS targets
17, and passkeys exist from iOS 16. Under option A (2026-10-09), the native app is the fan app and
creators sign in the Studio in a browser; fans never need a passkey.

**Decision (founder, 2026-10-15):**

- Keep the fan app at Android 8: no fan feature needs a passkey.
- A creator signs on a device with passkeys: Android 9 or later, iOS 16 or later, or a computer
  with Touch ID or Windows Hello.
- On an older phone the Studio already says so and offers nothing weaker ("Passkeys are
  unavailable on this device. Use a supported browser and device; no weaker signature is
  substituted.", `apps/web/features/identity/passkey.ts:32-35`).
- Creator onboarding should mention it once; that is copy for a later Studio change (lane 6).

## 4. Runs

All on the lane 1 stack with the web app, in system Chrome through Playwright. Maya, the
development creator, is verified through the real trust case flow by the development ops
supervisor. A WebAuthn virtual authenticator stands in for Touch ID. The five-minute window passes
on the real clock (no clock edits).

| Case                                                           | What happened                                                                                                                                                                                      | Result                 |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Composer, today                                                | A signed Note's publish answer is cut; after 310 s, "Retry same publication" is refused with `signed_act_required`, nothing is published, and the composer stays pending with no way to sign again | the defect, reproduced |
| Composer, with lane 6's patch (applied locally, not committed) | The same, then the pending publication clears, signing is offered again, and a fresh signature publishes the Note                                                                                  | recovers               |
| Thread reply, today's `signing.tsx` (swapped in locally)       | The passkey is revoked while the signed reply's request is in flight; the backend refuses with `signed_act_required`; the panel freezes on a disabled "Check publication status"                   | the defect, reproduced |
| Thread reply, with the fix                                     | The same; the panel says "Signing could not complete. No publication was started." and signing is enabled again; nothing reached the fan                                                           | fixed                  |
| Thread reply, lost answer, with the fix                        | The request is cut; the panel stays "unknown" (the reply may have been sent)                                                                                                                       | unchanged, as intended |

Losing a passkey (`tests/scenarios/lane-1/e1-5-key-loss.mjs`, two virtual devices): a Note signed
on device 1; "It's lost or broken" retires every key, the Note stays valid in the database and on
the public page, Maya stays verified, and nothing can be signed; device 2 needs fresh proof, then
registers a key and sees the second-passkey prompt; device 1, with its client altered to offer the
retired key, is refused (`creator_passkey_required`); "Someone else may have it" revokes every key
and every past signature ("Signing key revoked").

Scripts: `tests/scenarios/lane-1/e1-5-pending-publication.mjs` (`--expect-recovery` with lane 6's
patch) and `tests/scenarios/lane-1/e1-5-refused-publish.mjs` (`--expect-freeze` against today's
component, `--lost`).
