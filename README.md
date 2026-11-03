# Qelvora

A Pantopus app where each creator has an authorized, clearly labeled AI that
talks one-on-one with every fan and remembers them. The real creator stays
present through short Notes and reactions, and fans can pay for the creator's
personal attention, charged only if the creator accepts: a signed written reply
at launch, with voice notes and calls planned for later. Fans always know whether
they are talking to the AI or the person.

"Qelvora" is a placeholder name; see [docs/NAMING.md](docs/NAMING.md) for how to
replace it.

## Development

Start at [docs/README.md](docs/README.md): it says where to start and maps every
living doc. The current state is in [docs/STATUS.md](docs/STATUS.md).

The implementation uses Node.js, Next.js, native SwiftUI and native Kotlin/Compose.
Run `pnpm install && pnpm dev` for the local web and backend hosts, or bring up a
complete local stack with `node infra/local/stack.mjs up --lane N`. The design
review catalog is at `/design`. Real identity and providers are not connected yet:
the local hosts use a development identity and fake providers.

See [setup](docs/engineering/setup.md), [the local stack](docs/engineering/local-stack.md)
and [design verification](docs/engineering/design-verification.md).

## Repository

| Path | Contents |
| --- | --- |
| [docs/README.md](docs/README.md) | Where to start, and the map of every living doc |
| [docs/STATUS.md](docs/STATUS.md) | The current state on one page |
| [docs/BRIEF.md](docs/BRIEF.md) | The design brief: a condensed summary of the product, identity system, screens, copy and decisions |
| [docs/LAUNCH_PLAN.md](docs/LAUNCH_PLAN.md) | The launch scope and the road to the pilot |
| [docs/DESIGN_PLAN.md](docs/DESIGN_PLAN.md) | The design plan, what exists and what is missing |
| [docs/NAMING.md](docs/NAMING.md) | Placeholder-name rules and the rename checklist |
| [docs/source/](docs/source/) | The source documents: Product Design, Domain Model and Behavioral Contract, System Architecture, and the Second Review |
| [docs/research/](docs/research/) | Phase 1 UX research, exported from the [research doc](https://claude.ai/code/artifact/11bc3a89-d2f4-4399-8e3b-ecfbb2c6f803) |
| [docs/engineering/](docs/engineering/README.md) | Setup, the local stack, migrations, CI and release |
| [docs/archive/](docs/archive/) | History: the lanes, workstreams, implementation notes, dated reports and handoffs |
| [design/phase2-directions/](design/phase2-directions/) | Phase 2 visual directions, from the [directions canvas](https://claude.ai/artifact/MyZ9H9crjcdKqE196Pk6su) |
| [design/design-system/](design/design-system/) | Phase 3 design system in direction D · Atelier, from the [Qelvora design system](https://claude.ai/artifact/AyfModKVToY2VeqMACNxFU) |
