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

| File                  | What it shows                                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `7-2-android-run.txt` | The output of `tests/scenarios/lane-7/e7-2-navigation.mjs`: all 21 flows (N1 to N21) on the Android emulator, one run, all passed. A text log, not a picture: the screens are what each line says it saw. iOS was not run |
