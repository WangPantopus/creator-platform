# Qelvora

Qelvora is a Pantopus app (placeholder name) where each creator has an authorized,
clearly labeled AI that talks one-on-one with every fan, while the real creator
stays present through Notes and reactions and fans can pay for the creator's
personal attention.

`CLAUDE.md` and `AGENTS.md` carry the same rules; change both together.

## Start every session here

Start at [docs/README.md](docs/README.md), which says where to start and maps every
living doc, and read [docs/STATUS.md](docs/STATUS.md) for the current state and what
is next. STATUS replaces `docs/operations/CURRENT.md` and the dated handoffs, which
are history in [docs/archive/](docs/archive/). The [launch plan](docs/LAUNCH_PLAN.md)
is the road to the pilot, and the [consolidation plan](docs/CONSOLIDATION_PLAN.md)
stays the detailed reference until phase 0 closes. Refresh the Git/GitHub
observations before resuming. Since 2026-11-01, work runs as one coordinating
session plus one work session per task (see STATUS). The lane docs in
[docs/archive/lanes/](docs/archive/lanes/README.md) remain the reference for each
area's scenarios.

1. Read [docs/BRIEF.md](docs/BRIEF.md): the condensed product, identity system,
   screen inventory, copy system, decision log and open questions.
2. Check [docs/DESIGN_PLAN.md](docs/DESIGN_PLAN.md) for the current phase, what
   exists and what is still missing.
3. Go to the source documents in [docs/source/](docs/source/) for anything
   detailed. They are authoritative; when the brief and a source disagree, the
   source wins and the brief gets corrected.
4. Before changing code, read [docs/engineering/](docs/engineering/README.md):
   setup, the local stack, migrations, CI and release.

## Rules

- **Naming:** the product is always `Qelvora` / `qelvora` / `QELVORA`, following
  [docs/NAMING.md](docs/NAMING.md) exactly (one unbroken word, no possessive, no
  abbreviation). "Pantopus" is the parent company and the shared account; never
  rename it. Sample content (Maya, Kiln Club, @kilnfire, Devon, Priya, Glazeco) is
  not product naming.
- **The identity system comes first.** Every design must make "who is speaking"
  answerable in under a second, with a word, a glyph and a color per authorship
  state, never color alone. When two rules conflict, the earlier design principle
  in the brief wins.
- **Copy is part of the contract.** Use the fixed sentences verbatim and never use
  the forbidden words (Brief section 11).
- **Invariants are not negotiable in design.** If a design needs an invariant
  (INV-01 to INV-25) to bend, raise it with the founder instead of designing
  around it.
- **Keep the docs current.** After each milestone, tick it off in
  `docs/DESIGN_PLAN.md`, add artifact links, and add decisions to the brief's
  decision log. Update `docs/STATUS.md` in place instead of writing a dated
  handoff.
- **Keep evidence small.** At most 1 MB per pull request and 300 KB per file under
  `artifacts/`: a README, a manifest with checksums, and only the screenshots that
  carry a decision. Raw logs and bundles stay outside git
  ([the evidence-budget check](docs/engineering/ci.md)).
