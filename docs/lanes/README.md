# Lanes: how the work is split and how each lane is briefed

Seven lanes run in parallel, plus the integrator. This folder is the briefing pack: what every
lane needs to see the whole picture, do its part well, and not collide with the others.

| # | Lane | Brief |
| --- | --- | --- |
| 1 | Identity and trust | [lane-1-identity-trust.md](lane-1-identity-trust.md) |
| 2 | Platform and hosting | [lane-2-platform-hosting.md](lane-2-platform-hosting.md) |
| 3 | AI engine (tracks A and B) | [lane-3-ai-engine.md](lane-3-ai-engine.md) |
| 4 | Money | [lane-4-money.md](lane-4-money.md) |
| 5 | Presence and reach | [lane-5-presence-reach.md](lane-5-presence-reach.md) |
| 6 | Creator Studio (web) | [lane-6-creator-studio.md](lane-6-creator-studio.md) |
| 7 | Phone apps (iOS and Android) | [lane-7-phone-apps.md](lane-7-phone-apps.md) |

## Reading order for every lane

1. [00-charter.md](00-charter.md): the picture, what can never bend, what is decided, who owns what.
2. [01-working-agreement.md](01-working-agreement.md): how we work, verify, report and ask.
3. [02-contracts.md](02-contracts.md): the seams between lanes.
4. Your lane brief, then only the files it lists.
5. [03-coverage.md](03-coverage.md) when you want to know where a finding went.

## How a lane starts

1. **Read-back.** The integrator starts the lane's agent with the prompt below. The agent returns
   a plan and writes no code.
2. **Go or correct.** The integrator replies. The founder sees the read-back of any lane that
   asks to change an invariant, a migration, safety posture, money semantics or copy.
3. **Work.** One pull request at a time. Each task ends with a report. The integrator reviews,
   merges in batches, and updates [CURRENT](../operations/CURRENT.md).

### The kickoff prompt (read-back run)

> You are lane N of the Qelvora program ("<lane name>"). Your working directory is an isolated git
> worktree of the repository at `main`. Read, in order: `docs/lanes/00-charter.md`,
> `01-working-agreement.md`, `02-contracts.md`, `docs/lanes/lane-N-<name>.md`, then only the files
> your brief lists. Do **not** write code, edit files or open a pull request in this run. Return a
> read-back report of under 600 words: (a) your mission in your own words; (b) the five things you
> will not touch; (c) your first three pull requests and the files each changes; (d) at most eight
> open questions or assumptions; (e) overlaps or risks you see with other lanes; (f) what you need
> from the founder or other lanes. Be specific, use `file:line` where you can, and say what you
> could not verify.

### The task prompt (work runs)

> You are lane N ... (same opening). The integrator approved your read-back. Do work package
> <WP> from your brief: <one paragraph of what and why>. Follow the working agreement. Open the
> pull requests the brief names, do not merge, and return the final report in the working
> agreement's format.

## Status

Each lane keeps `status/lane-N.md` current in its pull requests (working on, done, next, blocked
on, tickets). The integrator aggregates them into [CURRENT](../operations/CURRENT.md) and tells the
founder, in the chat, what is running and what is next every time work stops.
