# Native C4 conversation presence qualification — 2026-10-22

Native fan conversations now read `/v1/content/:creatorId/presence` separately from stored conversation messages, then merge authorized Notes and the fan's own creator reactions by `occurredAt` / `createdAt`. Both clients use the generated Content contracts, the exact server author label, broadcast/heart glyph, and a separate signature control. The body opens the existing Note/private-reply route; the signature opens public verification.

## Authority and lifecycle

- Content requests carry `x-qelvora-expected-account`; conversation requests keep their existing account header. Both clients compare their credential before and after the request and reject oversized responses.
- Content has its own opaque cursor. An eligible page may be empty and still have an older cursor. The reader retains the current head and the four most recently requested older pages (at most 250 items), reauthorizes those pages concurrently, and can continue paging beyond that window. Results keep cursor order, deduplicate overlapping IDs head-first, and replace the window atomically only after every page passes one shared read-start deadline. A failed request or lifecycle cancellation cancels its sibling requests. Automatic refresh does not disable the Earlier control.
- Content bodies stay in memory. They never enter the conversation offline snapshot, resume state, or stored-message list. Loss of foreground, account/session, conversation authority, or current Content authorization conceals the body. A failed or over-budget refresh clears the whole retained Content window.
- The two-second refresh and five-second display freshness budget follow the existing native Content reader (`ContentFeature.swift` / `ContentFeature.kt`). Network time counts against the budget. Healthy refresh keeps the current body visible; this is UI freshness behavior, not a new retention policy.
- Accessibility exposes the server author first and then the full Note body, including line breaks and Unicode. Signature and body controls are separate, with the existing creator-card contrast tokens and minimum touch target.

## Real stack evidence

Read-only checks used the integrated API on port 56631. The existing development identity and membership grant are synthetic boundaries; the Note was published through the actual creator passkey ceremony by the web presence journey. No content row or signature was fabricated for these reads.

| Fixture                | Identifier                                                                      |
| ---------------------- | ------------------------------------------------------------------------------- |
| Maya                   | `20000000-0000-4000-8000-000000000001`                                          |
| Member account / fan   | `10000000-0000-4000-8000-000000000006` / `205e09a9-d4de-4170-9b85-1212acffcbde` |
| Outsider account / fan | `10000000-0000-4000-8000-000000000005` / `5524820a-74b5-411d-afa4-0ac8a570a4ea` |
| Note / signed act      | `2910d98f-0dd8-41ff-a896-5fb31cf0eb38` / `c2ddf773-beec-41bd-af1a-b739d6412c81` |

Observed text: “Native presence 9af2de: signed and shared with all members.” followed by “The kiln opens at nine 🔥”.

- iOS `testContentPresenceOnRealStack`: **1 passed, 0 failed, 0 skipped**, 47.915 seconds. It checked member visibility across seven seconds of healthy refresh, complete author-first accessibility, separate public verification and private-reply navigation, and outsider exclusion. The member and outsider screenshots were inspected; the [member capture](../../artifacts/qualification/native-presence-2026-10-22/ios-real-member-note.png) is retained.
- Android real stack: member visibility across more than 7.5 seconds, complete author-first accessibility, Note/private-reply navigation, and outsider exclusion passed. A final pass adds explicit signature navigation after the contrast and scroll follow-ups.
- The integrated stack intentionally holds migration `0156_w8_reply_review`. Its actual private reply remains pending and reaction signing is refused. The fixture reaction below proves native rendering and lifecycle only; it does not prove Trust review, creator signing, or migration activation.

## Operated fixture coverage

The existing lane-7 harness now has an opt-in C4 feed control. Opting in replaces its legacy stored Note/reaction examples with separate Content items, so a visibility assertion cannot mistake an old stored-message example for a current Content card. Other scenarios retain their original fixtures. The Content route checks the expected account, and unseeded accounts receive no fixture content.

`Lane7StackNavigationFlow.testContentPresenceLifecycleInHarness` and `tests/scenarios/lane-7/native-presence.mjs` operate the actual apps. They cover Note/own-reaction rendering, healthy refresh, failure/recovery, an empty first page with a cursor, removal of Note and reaction after refresh, background/foreground loss, slow response expiry, session revocation, account switch, and a seven-cursor chain beyond the retained five-page window. The expanded journey also injects a failing sibling alongside a delayed body page and observes that HTTP connection closing before its response, then a slow sibling alongside successful pages to reject partial or late restoration. They do not add product unit-test files or bypass backend review/signing gates.

The expanded iOS lifecycle journey passed **1/1, zero skips**, 126.206 seconds, including seven older cursor advances and the concurrent sibling checks. The harness observed the three delayed-body connections closing after 301, 309, and 318 milliseconds, before their four-second responses; no body returned to the UI. Android's final expanded journey and real signature check are in progress at this checkpoint.

## Reproduction and current limits

Builds use `scripts/with-heavy-build-lock.mjs`. iOS `xcodebuild build-for-testing` passed for arm64 and x86_64; Android `./gradlew --offline :app:assembleDebug` passed. No new dependencies or generated contracts changed.

For iOS, add the documented `QELVORA_PRESENCE_*` environment values to the built XCTest run and select the two opt-in methods in `Lane7StackNavigationFlow`. `QELVORA_PRESENCE_HARNESS_API` points to an owned lane-7 harness. The real method needs stack API, creator, member fan, outsider fan, and Note text values and performs reads only.

For Android, start an owned lane-7 harness and explicitly select an owned emulator:

```sh
LANE7_ANDROID=emulator-5586 \
QELVORA_PRESENCE_API=http://127.0.0.1:56646 \
node tests/scenarios/lane-7/native-presence.mjs
```

`native-presence.mjs real` additionally requires `QELVORA_PRESENCE_CREATOR`, `QELVORA_PRESENCE_NOTE_TEXT`, `QELVORA_PRESENCE_MEMBER_ACTOR`, `QELVORA_PRESENCE_MEMBER_FAN`, `QELVORA_PRESENCE_OUTSIDER_ACTOR`, and `QELVORA_PRESENCE_OUTSIDER_FAN`. Reverse the selected loopback port through adb before launching. The script writes compact screenshot/tree evidence under `/tmp/native-c4-android-*`; it never modifies the real fixture.

Owned devices are the iOS simulator `CC067095-D127-4FFD-941A-CE445A547889` and Android AVD `qelvora-signin-20261022` on `emulator-5586`. Original user simulators and emulators were not used. Full local logs/results are `/tmp/qelvora-native-presence-*`; later evidence increments record completed expanded runs. Live hosting remains undecided.
