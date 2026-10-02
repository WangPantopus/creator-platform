# W5 continuation (b) evidence — 2026-10-01, Mac Studio host

These files record what was actually operated in the handoff session. They do not show any W5 package as complete. The handoff is [W5-continuation-2026-10-01-b.md](../../../../../docs/workstreams/handoffs/W5-continuation-2026-10-01-b.md).

**Environment:**

- main `d6ea70e4`; the handoff is based on `db1252df`.
- Fresh canonical DB `creator_w5` on 127.0.0.1:55435 with 40 migrations.
- W5 development host on API 4105 and web 3005.
- Synthetic development actors, with handles created through the real onboarding UI.
- The creator verification is **development-only seeded state** (SQL, 2026-10-01T20:44:26Z). It is not verification acceptance.
- No genuine signing, payment, media, review, delivery or privacy receipt exists or was simulated.

| File                                                         | Shows                                                                                                                                                                           | Claim limit                                                                                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `captures/notes-before-verification-390-light.png`           | Studio Notes at 390 Light. Replies are still loading for the pending creator.                                                                                                   | Only that the shell and Notes render. The content read later returned 403 `creator verification and recovery are required`.                                       |
| `captures/compose-audience-size-gutter-defect-390-light.png` | Compose for the seeded-verified creator at 390 Light                                                                                                                            | Documents a defect: "Current audience size is unavailable." has no 16px gutter. Also shows the segment and primary-action differences from `NoteCompose.dc.html`. |
| `captures/ios-dev-actor-picker-light.png`                    | Shipping iOS app (ad-hoc signed, strict codesign OK) on simulator `78C3590E-…`, iOS 27.0, launched with `--api-url http://127.0.0.1:4105`, after tapping Continue with Pantopus | The native app reaches the W5 API's development actor picker. No authenticated native content was operated.                                                       |
| `operator/browserd.mjs`                                      | Interactive headless operator, one isolated profile per actor                                                                                                                   | A tool for manual operation while the in-app Browser pane is hidden. It makes no assertions and is not a test.                                                    |
| `observations.json`                                          | Structured run facts, blockers and peer answers                                                                                                                                 | Sanitized. No secrets, cookies or private fan text.                                                                                                               |
