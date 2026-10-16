# Lane 7 evidence: WP 7.1 (the fake-API harness)

Three pictures, each iOS on the left and Android on the right, scaled to 800 px high. All were taken
on `qelvora-lane7-ios` and `qelvora-lane7-android` against the lane 7 fake API, signed in by the debug
hook (`--harness-actor devon` / `harness_actor=devon`). Nothing here is the real backend.

| File                   | What it shows                                                                                                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `7-1-home.png`         | Home, Light, signed in as the fan "Devon": the same six conversations on both apps. iOS shows each person's last message as a preview; Android shows only a button label (a platform difference, not fixed here)                   |
| `7-1-night.png`        | Maya's thread, Night: the identity strip, a signed reply, an "Answered publicly." line, the step-in button and the composer, on both apps                                                                                          |
| `7-1-largest-text.png` | The same thread at the largest text size. iOS truncates the strip, the composer and the tab labels and leaves almost no room for the thread; on Android the identity strip has scrolled out of view. Baselines for WP 7.3 and 7.11 |

Produced with `tests/scenarios/lane-7/run-app.mjs ... --shot` and `side-by-side.mjs`. `manifest.json` lists each file
with its size and SHA-256.

## WP 7.2 (system navigation)

| File                  | What it shows                                                                                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `7-2-android-run.txt` | The output of `tests/scenarios/lane-7/e7-2-navigation.mjs`: all 21 flows (N1 to N21) on the Android emulator, one run, all passed. A text log, not a picture: the screens are what each line says it saw. Repeated after merging main; N13 uses the corrected API request path |

`7-2-ios-run.txt` records the approved XCUITest operation of 13 real-app navigation flows, all passing with no skips. It includes screen and fake-API checks after the edge-swipe fix. Full screenshots, accessibility trees and sanitized request attachments remain in the off-repository xcresult bundle; the navigation report distinguishes these results from the earlier manual checks.

`7-2-real-stack-run.txt` records the focused navigation flow on both apps against the real
API and PostgreSQL, plus ownership/state and wrong-person denial checks. Identity and the
model provider are synthetic. It includes the cold-link failure and successful fix rerun.

`7-2-gates.txt` records local native suites, release-hook absence, the harness contract check,
and repository gates. Expected skips and checks not run are named explicitly.

## WP 7.4 P1 (Notes and reactions in the thread, C4)

| File                       | What it shows                                                                                                                                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `7-4-p1-pair-light.jpg`    | Maya's thread in Light, iOS left, Android right: the all-members Note (broadcast glyph, the server's label "Maya · to all members", the body, "Signed by Maya") and the reaction chip (heart, "Maya reacted to your reply") between the messages by time |
| `7-4-p1-pair-gray.jpg`     | The same pair in grayscale: word and glyph still say who is speaking without color                                                                                                                                                                       |
| `7-4-p1-largest-night.jpg` | Night at the largest text: a long Note with emoji, Hebrew and Arabic, its label reachable on both apps                                                                                                                                                   |

`7-4-p1-run.txt` records the operated runs on both apps against the fake API (R1.1 to R1.9, D3T), the
62-check contract run, and what was not run. Nothing here is the real backend.

## WP 7.4 P3 (the creator's seal)

| File                        | What it shows                                                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `7-4-p3-names.jpg`          | A first conversation with "🌿 fern studio", iOS left, Android right: the header avatar and the step-in seal show "F" (the emoji is skipped)   |
| `7-4-p3-largest-before.jpg` | Before, at the largest text (iOS AX5, Android font scale 2.0): the "M" on the step-in seal grows past its circle on both apps                 |
| `7-4-p3-largest-after.jpg`  | After, the same text sizes on Kiln Club's thread: "K" stays inside the circle on the step-in button and Send; "Send" stays on one line on iOS |

`7-4-p3-run.txt` records the operated seal flows on both apps against the fake API (S3.1 to S3.3), the
gates, and what was not run. Nothing here is the real backend.

## WP 7.4 P6 (the provider sentence before the first message)

| File                       | What it shows                                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `7-4-p6-sentence-pair.jpg` | Lena Park's first-conversation screen, iOS left, Android right: the fixed sentence, verbatim, because the one provider keeps and trains on nothing |

`7-4-p6-run.txt` records the operated consent flows on both apps against the fake API (P6.1 to P6.5),
the gates, and what was not run. Nothing here is the real backend.

## WP 7.4 P7 (the 18+ refusal)

| File                | What it shows                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `7-4-p7-before.jpg` | Before, iOS left, Android right: an account flagged under 18 is told "Your session is kept on this device" and offered Retry           |
| `7-4-p7-after.jpg`  | After: the designed under-18 state (D-11), the wordmark and the two fixed sentences and nothing else; the session is gone on both apps |

`7-4-p7-run.txt` records the survey, the operated flows on both apps against the fake API (P7.1 to
P7.3), the gates, and what was not run. Nothing here is the real backend.

## WP 7.4 P4 (citations)

| File                      | What it shows                                                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `7-4-p4-refused-pair.jpg` | A refused passage, iOS left, Android right (after the fix): "Source unavailable · No longer accessible to you" over the intact thread and its draft |

`7-4-p4-run.txt` records the survey, the Android defect before and after, the operated flows on both
apps against the fake API (P4.1 to P4.3), the iOS freeze found on the way, and what was not run.
