# Qelvora docs

## Where to start

1. **[STATUS.md](STATUS.md):** where things stand, what's next, the parked pull requests and the
   decisions the founder still owes. One page.
2. **[BRIEF.md](BRIEF.md):** the product in condensed form: the identity system, the screens, the
   copy system, the decision log and the open questions.
3. **[LAUNCH_PLAN.md](LAUNCH_PLAN.md):** what the launch must get right, its scope, and the road
   from the consolidation to the pilot.
4. **[source/](source/)** for anything detailed. The source documents are authoritative: when the
   BRIEF and a source disagree, the source wins and the BRIEF is corrected.
5. **[engineering/](engineering/README.md)** before you change code.

## The living docs

| Doc | What it holds | Keep it current by |
| --- | --- | --- |
| [STATUS.md](STATUS.md) | The current state on one page. It replaces `operations/CURRENT.md` and the dated handoffs | Updating it in place, in plain words, instead of writing a dated handoff |
| [BRIEF.md](BRIEF.md) | The product summary, the identity system, the screen inventory, the copy system, the decision log and the open questions | Adding a decision-log row when a decision is made. The log is append-only, newest last; a new row names the row it supersedes |
| [LAUNCH_PLAN.md](LAUNCH_PLAN.md) | The five moments, the launch scope, the phases to the pilot with their exits, the pilot gates, and what is planned for later | Changing it when the scope or the order changes |
| [NAMING.md](NAMING.md) | The placeholder name, its three spellings and the rename checklist | Logging anything a text replacement cannot rename |
| [DESIGN_PLAN.md](DESIGN_PLAN.md) | The design phases, which boards exist, the launch surfaces with no design, and the stale boards | Ticking a board only when it exists, with its link |
| [CONSOLIDATION_PLAN.md](CONSOLIDATION_PLAN.md) | The 2026-11-01 review and plan: the detailed reference until phase 0 closes | Its status paragraph only |
| [source/](source/) | The four source documents: Product Design, the Domain Model and Behavioral Contract, the System Architecture and the Second Review | Never: they are kept as written, and the BRIEF records any later decision |
| [research/](research/UX_RESEARCH.md) | The phase 1 UX research | |
| [audit/](audit/AUDIT.md) | The phase 6 design audit | |
| [engineering/](engineering/README.md) | Setup, the local stack, migrations, CI, release, the backend and design verification | Updating the page whose subject changed |
| [archive/](archive/) | History: the lanes, the workstreams, implementation notes, dated operations reports and every handoff | Never: it is read-only. Its links are kept as they were, and 33 of them were already broken before Wave 5 |

## Files at their old paths

Some docs are linked or named from code, tests or config outside `docs/`, so they stay where they
are until those references move. Each starts with a banner that says what still points at it.

- Still in use: [operations/anthropic-provider.md](operations/anthropic-provider.md),
  [lanes/status/lane-2-catalogue-pins.md](lanes/status/lane-2-catalogue-pins.md),
  [lanes/status/lane-7-harness.md](lanes/status/lane-7-harness.md) and
  [implementation/native-foundation.md](implementation/native-foundation.md).
- Archived: [operations/CURRENT.md](operations/CURRENT.md),
  [operations/W8-release.md](operations/W8-release.md),
  [operations/request-queue-navigation-2026-10-22.md](operations/request-queue-navigation-2026-10-22.md),
  [lanes/01-working-agreement.md](lanes/01-working-agreement.md), five more in
  [lanes/status/](lanes/status/), [BUILD_LOG.md](BUILD_LOG.md) and [BUILD_PROMPT.md](BUILD_PROMPT.md).
- `operations/W8-approved-retention-20261002.json` is imported by the trust code at build time.
