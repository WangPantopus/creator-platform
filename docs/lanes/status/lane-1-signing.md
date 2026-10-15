# Lane 1 · WP 1.5 · Signing fixes

Written 2026-10-15 by lane 1. Three items from the lane brief (launch review, section 7, rows 8
and 9, and the Android passkey limit). One is fixed here, one needs a lane 6 change (a verified
patch is below) and two need the founder's decision.

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

**What the code does.** Starting recovery revokes every passkey and sets `key_revoked` and
`creator_revoked` on every past signature of the creator
(`apps/backend/src/modules/identity/passkeys.ts:200-220`, the update at line 216). Revoking one
passkey sets `key_revoked` on every signature made with it (line 194). The public verification
page then shows "Creator verification revoked" or "Signing key revoked" on every Note, reply and
share card the creator ever signed (`apps/web/app/verify/[id]/page.tsx:49-50`), though nothing
shows that any of them was forged. A creator who loses a phone looks, to fans, like a creator whose
signatures were never trustworthy.

**Why it is a decision.** What a fan is told about a past signature is the trust posture (INV-22,
D-18). Two honest answers exist:

| Option      | Lost device                                                                                                                            | Compromised device                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| A, today    | Every past signature shows revoked                                                                                                     | Same                                                          |
| B, proposed | The lost keys are retired. Past signatures stay valid ("signed with a key since retired"); new acts need re-verification and a new key | The creator says the device was compromised: today's behavior |

**Proposed default, until you decide:** keep A in code, and do the cheap thing the launch review
asked for:

- **Guidance.** After the first passkey, the setup page asks the creator to add a second one on
  another device, so losing one device does not stop them signing. Proposed wording (needs your
  approval): "Add a second passkey on another device, so losing one does not stop you signing."
  Not added in this pull request.
- **Ops guidance.** Before an ops reviewer approves fresh proof after a recovery, they ask whether
  the device was lost or compromised and record it in the case.

**If you pick B:** `passkeys.ts` gains a "lost" path, the public status gains `key_retired`
(`packages/api/src/identity.ts:191`), and lane 5's verification page gets one new line of copy.
That touches a contract and copy, so it waits for your yes.

## 3. The Android 8 and 9 passkey limit (minSdk)

**Facts.** The fan app's minimum is Android 8 (`minSdk = 26`,
`apps/android/app/build.gradle.kts:15`). Passkeys need Android 9 (API 28) or later, and the app's
passkey ceremony already refuses below that
(`apps/android/app/src/main/java/com/pantopus/qelvora/identity/PasskeyCeremony.kt:17`). iOS targets
17, and passkeys exist from iOS 16. Under option A (2026-10-09), the native app is the fan app and
creators sign in the Studio in a browser; fans never need a passkey.

**Proposed decision:**

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

Scripts: `tests/scenarios/lane-1/e1-5-pending-publication.mjs` (`--expect-recovery` with lane 6's
patch) and `tests/scenarios/lane-1/e1-5-refused-publish.mjs` (`--expect-freeze` against today's
component, `--lost`).
