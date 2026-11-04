# Engineering how-tos

How to build, run, check and ship Qelvora. For what to build, start at the [docs index](../README.md).

| Page                                               | What it covers                                                                                                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [setup.md](setup.md)                               | Tools, first run, the checks, native hosts, archived branches, and this Mac's known traps                                                             |
| [local-stack.md](local-stack.md)                   | The one-command local stack (`infra/local/stack.mjs`)                                                                                                 |
| [anthropic-provider.md](anthropic-provider.md)     | Claude as the generation provider: the key, the capped gateway and the switch                                                                         |
| [migrations.md](migrations.md)                     | How a migration is registered today (the generator, `reviewed.json` and the pin script `wave-pins.ts`), and the Wave 6 plan                           |
| [migration-queue.md](migration-queue.md)           | The Wave 6 triage of every unregistered SQL file: what each creates and needs, and whether the pilot needs it, later work needs it, or it is obsolete |
| [catalogue-pins.md](catalogue-pins.md)             | Regenerating and reviewing the catalogue pins when a migration changes them                                                                           |
| [ci.md](ci.md)                                     | The CI jobs, what each proves, and where CI is going                                                                                                  |
| [release.md](release.md)                           | Release gates, store submission, rollout and rollback, the trust image                                                                                |
| [data-safety.md](data-safety.md)                   | What the database stores, for the App Store privacy label and Google Play's Data safety form                                                          |
| [backend.md](backend.md)                           | The backend's foundation: authority, the database and durable delivery                                                                                |
| [production-host.md](production-host.md)           | The production host that fails closed, its settings and readiness, and the adapter contract C2                                                        |
| [native-foundation.md](native-foundation.md)       | The native component foundation, its runtime boundaries and the limits of the native checks                                                           |
| [native-harness.md](native-harness.md)             | Running the phone apps signed in against the fake API, without the full stack                                                                         |
| [native-device-checks.md](native-device-checks.md) | The lane 7 device checks run on `main` (2026-11-04): each result, the follow-ups they found, and how to run them again                                |
| [design-verification.md](design-verification.md)   | How the web and native visual comparisons work                                                                                                        |
