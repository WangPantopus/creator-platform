# WP 5.3: Android offline push and C7 delivery boundary

Updated 2026-10-09. Branch `lane-5/push-offline`. Founder approved holding iOS retention until lane 7 supplies safe background presentation. Android carries only an opaque notification ID; its FCM TTL changes from zero to 86,400 seconds. Existing client code fetches current account state before display. Provider acceptance is not proof of device display. [FCM's lifetime documentation](https://firebase.google.com/docs/cloud-messaging/customize-messages/setting-message-lifespan) explains why zero TTL drops messages that cannot be delivered immediately.

## Contract C7

Register through `PUT /v1/growth/devices` with installation UUID, `android` or `ios`, token, current permission, and increasing registration revision. The server captures the real session; a claimed account ID is never enough. Permission denial, session revocation and registration replacement invalidate that binding. The native client must also check its current session and OS permission when receiving a retained ID.

Android receives only `data.notificationId`. Fetch `GET /v1/growth/notifications/:id` with the current account's bearer token. Only that recipient can resolve it; withdrawn owner state makes it unavailable. Never route or display from a cached sender, preview or destination. A failed or unavailable lookup uses the existing safe notifications fallback. Existing quiet hours remain enforced at gateway submission; device presentation after reconnection is a separate lane 7 check and is not proven here.

Gateway receipts are per delivery and registration. Rejected requests may retry. An accepted request with no trustworthy receipt remains `unknown` and is never automatically repeated. All active devices are processed. Invalid FCM tokens are revoked. The production endpoint stays fixed at FCM's HTTPS URL; the optional constructor transport is used only by the local scenario host, with an exact URL assertion.

APNs expiration remains zero. Lane 7 must supply safe background presentation before retention is increased: the current alert payload lets iOS display the sender while the app is not running, before the app can check sign-out or account changes. The founder explicitly approved this hold.

## Evidence

Real PostgreSQL, identity sessions, device registration, signed content publication, producer relay, delivery worker, encrypted registration and native FCM adapter. Outer-edge fakes: development identity, software passkey, completed membership/verification fixtures, local FCM HTTP gateway, gateway expiry clock, and one SQL advance of retry availability. No owner authorization or native adapter is mocked. No new unit tests.

| ID             | Steps                                                     | Expected                                    | Observed                                                                        | Result  | Evidence                              |
| -------------- | --------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------- | ------- | ------------------------------------- |
| E5.3-register  | Concurrent repeat and second installation; short token    | Two rows; boundary refused                  | Three calls made two rows; short token 400                                      | pass    | native scenario log                   |
| E5.3-offline   | Publish members Note while two devices offline; reconnect | Retained opaque IDs, no text                | Two IDs, TTL 86400, no author/body/destination, both released                   | pass    | native scenario log; gateway payloads |
| E5.3-controls  | Denied device, default push off, sign out, invalid token  | No ineligible acceptance                    | Three revoked/denied registrations; one invalid receipt; signed-out request 401 | pass    | native scenario log; PostgreSQL       |
| E5.3-tap       | Recipient, stranger, anonymous; concurrent effect repeats | Only recipient can resolve; no repeat       | 200/404/401; two submissions unchanged                                          | pass    | native scenario log                   |
| E5.3-withdrawn | Unpublish after gateway acceptance; open old ID           | Current lookup unavailable                  | Unpublish 200, old ID 404, no new submission                                    | pass    | native scenario log                   |
| E5.3-expiry    | Stay offline for one fake day                             | No expired ID delivered                     | Two expired; neither released                                                   | pass    | native scenario log                   |
| E5.3-retry     | Gateway 503; recover; advance retry clock                 | One acceptance per device                   | Exactly two after recovery                                                      | pass    | native scenario log; receipt rows     |
| E5.3-unknown   | Gateway accepts but omits receipt; retry engine           | Preserve uncertainty without resend         | One unknown receipt and one gateway acceptance                                  | pass    | native scenario log; receipt row      |
| E5.3-device    | Physical Android, real FCM, app display and tap           | Correct device behavior                     | No physical device or provider account                                          | not run | lane 7 ticket                         |
| E5.3-ios       | Offline iOS retention                                     | Safe background display after account check | Founder approved hold                                                           | not run | lane 7 ticket                         |

Local logs: `/tmp/qelvora-lane5-native-scenario-final.log`, `-host.log`, `-typecheck.log`, `-lint.log`. Eight scenario steps and the separate restart step passed; two not run. Existing backend suites passed: 9 files, 157/157, 187.87 seconds (T-11 132.14 seconds), recorded in `/tmp/qelvora-lane5-native-backend.log`. Typecheck passed 7/7; changed backend source lint passed. Machine load during scenarios was 4.93–7.39 (16 CPUs).

## Remaining owner work and limits

Integrator: `apps/backend/src/server.ts`, compose `NativeDeliveryProvider` with real credential suppliers and approved provider configuration. No production secrets requested or read here. Lane 7: `GrowthNotificationWorker.kt`, `GrowthPush.swift` and platform wiring, prove physical offline delivery, tap fallback, registration rotation, restart, sign-out while offline, and quiet hours at device presentation. The server proof does not replace those checks. DST boundaries and APNs were not run in this change.

## Re-run

With the runtime Node and fallback bin directories on PATH and `npm_config_manage_package_manager_versions=false`, run `sh tests/scenarios/lane-5/setup.sh`, then `LANE5_NATIVE_PUSH=true sh tests/scenarios/lane-5/run-host.sh`. Run `node tests/scenarios/lane-5/e5-3-native-push.mjs`. Stop and restart the same host without resetting its database, then run that script with `--restart`. The restart record in `/tmp/qelvora-lane5-native-proof.json` contains only receipt counts. Stop the host and remove only `qelvora-lane5-db` when done.

## Defects found in this change

The zero Android TTL discarded offline updates. It is now one day for the opaque lookup ID. No additional implementation defect appeared in the native scenario. Device display, provider credentials, iOS retention and DST remain unproved, not inferred from compilation.
