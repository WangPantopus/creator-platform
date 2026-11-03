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
| [STATUS.md](STATUS.md) | The current state on one page. It replaces [operations/CURRENT.md](archive/operations/CURRENT.md), now archived, and the dated handoffs | Updating it in place, in plain words, instead of writing a dated handoff |
| [BRIEF.md](BRIEF.md) | The product summary, the identity system, the screen inventory, the copy system, the decision log and the open questions | Adding a decision-log row when a decision is made. The log is append-only, newest last; a new row names the row it supersedes |
| [LAUNCH_PLAN.md](LAUNCH_PLAN.md) | The five moments, the launch scope, the phases to the pilot with their exits, the pilot gates, and what is planned for later | Changing it when the scope or the order changes |
| [NAMING.md](NAMING.md) | The placeholder name, its three spellings and the rename checklist | Logging anything a text replacement cannot rename |
| [DESIGN_PLAN.md](DESIGN_PLAN.md) | The design phases, which boards exist, the launch surfaces with no design, and the stale boards | Ticking a board only when it exists, with its link |
| [CONSOLIDATION_PLAN.md](CONSOLIDATION_PLAN.md) | The 2026-11-01 review and plan: the detailed reference until phase 0 closes | Its status paragraph only |
| [source/](source/) | The four source documents: Product Design, the Domain Model and Behavioral Contract, the System Architecture and the Second Review | Never: they are kept as written, and the BRIEF records any later decision |
| [research/](research/UX_RESEARCH.md) | The phase 1 UX research | |
| [audit/](audit/AUDIT.md) | The phase 6 design audit | |
| [engineering/](engineering/README.md) | Setup, the local stack, the Claude provider, migrations and the catalogue pins, CI, release and the store privacy answers, the backend and the production host, the native apps and their harness, and design verification | Updating the page whose subject changed |
| [archive/](archive/) | History: the lanes, the workstreams, implementation notes, dated operations reports, the first build prompt and log, and every handoff | Never: it is read-only, and its links are kept as they were. 101 of them are broken: 33 were broken before Wave 5, and 68 broke when the last kept docs moved at its end |

## The one file left in operations/

[operations/W8-approved-retention-20261002.json](operations/W8-approved-retention-20261002.json) is
the approved retention record that the trust code imports
(`apps/backend/src/modules/trust/accounting-retention-policy.ts`). Moving it would change trust code
for no gain, so it stays at its path, byte for byte. Every other operations doc is in the
[archive](archive/operations/).
