# Lanes: how the work is split and how each lane is briefed

Seven lanes run in parallel, plus the integrator. This folder is the briefing pack: what every
lane needs to see the whole picture, do its part well, and not collide with the others.

| # | Lane | Brief | Prompt to paste |
| --- | --- | --- | --- |
| 1 | Identity and trust | [lane-1-identity-trust.md](lane-1-identity-trust.md) | [prompts/lane-1.md](prompts/lane-1.md) |
| 2 | Platform and hosting | [lane-2-platform-hosting.md](lane-2-platform-hosting.md) | [prompts/lane-2.md](prompts/lane-2.md) |
| 3 | AI engine (tracks A and B) | [lane-3-ai-engine.md](lane-3-ai-engine.md) | [prompts/lane-3.md](prompts/lane-3.md) |
| 4 | Money | [lane-4-money.md](lane-4-money.md) | [prompts/lane-4.md](prompts/lane-4.md) |
| 5 | Presence and reach | [lane-5-presence-reach.md](lane-5-presence-reach.md) | [prompts/lane-5.md](prompts/lane-5.md) |
| 6 | Creator Studio (web) | [lane-6-creator-studio.md](lane-6-creator-studio.md) | [prompts/lane-6.md](prompts/lane-6.md) |
| 7 | Phone apps (iOS and Android) | [lane-7-phone-apps.md](lane-7-phone-apps.md) | [prompts/lane-7.md](prompts/lane-7.md) |

## How it runs

- **Seven sessions, started by hand by the founder,** each in its own git worktree and each
  working alone: no subagents. The prompt to paste into each is in [prompts/](prompts/).
- **The integrator** is a separate session. It reviews pull requests, merges in batches, owns the
  shared files and the migration queue, keeps [CURRENT](../operations/CURRENT.md) and tells the
  founder what is running and what is next.
- **Sessions cannot see each other.** Messages travel through the founder, pull request comments
  and each lane's status file.
- **Nothing is proven by unit tests.** Every lane proves its work with end-to-end scenarios that
  include edge cases ([working agreement](01-working-agreement.md) section 3); each lane brief
  lists its scenarios.

## Reading order for every lane

1. [00-charter.md](00-charter.md): the picture, what can never bend, what is decided, who owns what.
2. [01-working-agreement.md](01-working-agreement.md): how we work, verify, report and ask.
3. [02-contracts.md](02-contracts.md): the seams between lanes.
4. Your lane brief, then only the files it lists.
5. [03-coverage.md](03-coverage.md) when you want to know where a finding went.

## How a lane starts and works

1. The founder opens a new session and pastes the lane's prompt.
2. The session branches from `main`, reads this pack, posts a plan of under 300 words and starts.
   It does not wait for a reply unless it hits a stop-and-ask trigger. *To make a session wait for
   your go after its plan, add this line to its prompt: "After posting your plan, stop and wait
   for my go before you change anything."*
3. It works one pull request at a time, each carrying a results table of the scenarios it ran, and
   keeps `status/lane-N.md` current.
4. The founder tells the integrator to check the lanes. The integrator reviews, re-runs scenario
   scripts, and merges in batches (a merge to `main` cancels the run in progress, and the macOS
   jobs take over an hour).
5. Every time a session stops, it ends with **Working on / Waiting on / Next**.

**Resuming.** Paste the same prompt into a new session. Its resume check reads the status file and
the lane's open pull requests and continues from there.

**More work later.** When a session has finished its list or the integrator reassigns work, send:

> Next for lane N: do work package <WP> from your brief: <what and why>. The rules are
> unchanged (no subagents, no new unit tests, end-to-end scenarios with edge cases, never merge).
> Return the final report in the working agreement's format.

## Splitting a lane across two sessions (optional)

Lanes 3 and 7 are the longest. If the founder runs each as two sessions (3A and 3B; 7 iOS and 7
Android), add this to each prompt and keep everything else: the branch prefix and status file
below, and half the lane's ports.

| Session | Scope | Branch prefix | Status file | Ports | Containers |
| --- | --- | --- | --- | --- | --- |
| 3A | Track A, work packages A1 to A7 | `lane-3a/` | `status/lane-3a.md` | 56430 to 56434 | `qelvora-lane3a-` |
| 3B | Track B, work packages B1 to B9 | `lane-3b/` | `status/lane-3b.md` | 56435 to 56439 | `qelvora-lane3b-` |
| 7 iOS | The iOS track of every work package | `lane-7-ios/` | `status/lane-7-ios.md` | 56470 to 56474 | `qelvora-lane7-ios-` |
| 7 Android | The Android track of every work package | `lane-7-android/` | `status/lane-7-android.md` | 56475 to 56479 | `qelvora-lane7-android-` |

Each pair states the behavior spec in its pull requests, and the integrator checks parity.

## Status

Each lane keeps `status/lane-N.md` current in its pull requests (working on, done, next, blocked
on, scenarios, tickets). The integrator aggregates them into [CURRENT](../operations/CURRENT.md)
and tells the founder, in the chat, what is running and what is next every time work stops.
