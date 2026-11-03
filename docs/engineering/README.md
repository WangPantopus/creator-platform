# Engineering how-tos

How to build, run, check and ship Qelvora. For what to build, start at the [docs index](../README.md).

| Page | What it covers |
| --- | --- |
| [setup.md](setup.md) | Tools, first run, the checks, native hosts, archived branches, and this Mac's known traps |
| [local-stack.md](local-stack.md) | The one-command local stack (`infra/local/stack.mjs`) |
| [migrations.md](migrations.md) | How a migration is registered today, and the Wave 6 plan |
| [ci.md](ci.md) | The CI jobs, what each proves, and where CI is going |
| [release.md](release.md) | Release gates, store submission, rollout and rollback, the trust image |
| [backend.md](backend.md) | The backend's foundation: authority, the database and durable delivery |
| [design-verification.md](design-verification.md) | How the web and native visual comparisons work |

Two more how-tos stay at their old paths because code links to them:
- [Claude as the generation provider](../operations/anthropic-provider.md): the key, the capped
  gateway and the switch;
- [native verification limits](../implementation/native-foundation.md).

The lane runbooks that scenarios and code still point at, such as the
[catalogue pins procedure](../lanes/status/lane-2-catalogue-pins.md) and the
[native harness runbook](../lanes/status/lane-7-harness.md), also stay at their paths.
