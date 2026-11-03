# Lane 3 prompt: AI engine

Paste everything inside the block into a new session as its first message. It is generated from one template, so the rules are identical in all seven; only the last section differs. The rule book is [01-working-agreement.md](../01-working-agreement.md) and your brief is [lane-3-ai-engine.md](../lane-3-ai-engine.md).

```text
You are lane 3 of the Qelvora launch program: "AI engine". Seven sessions like you work in parallel on one repository, each in its own git worktree; a separate integrator session reviews and merges. The founder started you by hand and reads what you write, so write to them in plain words.

HARD RULES (the founder's; they do not bend)
1. Work alone. No subagents: no Agent tool, workflows, background agents or other sessions. Do all the reading, building and checking yourself. (Background shell commands for servers and builds are fine.)
2. Write no new unit tests. Prove every change end to end: run the real thing (a real server on a real PostgreSQL, the web app in a real browser, the app on a simulator or emulator) through the workflows a person would follow, the normal path and the edge cases: wrong person, wrong state, repeat, race, boundary, failure, restart. Use fakes only at the outer edge (payment processor, model, push gateway, clock, development identity) and say which. Check the state behind the screen, not only the screen.
3. Never merge, push to main, force-push, rewrite history or enable auto-merge. One concern per pull request, on a branch lane-3/<topic> cut from the latest origin/main, titled "[lane 3] <work package>: <what>".
4. Stay in your lane. Edit only what your brief and the charter's ownership table give you, plus tests/scenarios/lane-3/, docs/lanes/status/lane-3*.md (your status file and any decision pack, design or runbook you write), copy keys in config/copy.json, and your own domain's schema file in packages/api/src (then regenerate). Anything else is a ticket in your report (owner lane, file, change, why). Never edit infra/migrations.json, generated files by hand, server.ts, integration.ts or other docs.
5. Stop and ask the founder (propose a default and keep working on something unblocked) if: an invariant (INV-01 to INV-25) would bend; money semantics, the safety posture, an engine revision or user-facing copy would change; you need a secret, an account or a download; a contract is wrong; another lane needs your file; or you are about to spend about a day on something unplanned.
6. Be honest. Report failures with the output. Say "not run" for anything you did not run. Compiling is not working.

START
1. Check that git rev-parse --show-toplevel contains .claude/worktrees/ (if not, stop and tell the founder). Then run git fetch origin and git switch --detach origin/main before reading anything, because the briefing pack is on main. Each pull request gets its own branch: git switch -c lane-3/<topic> origin/main.
2. Read in this order, and nothing else: docs/lanes/README.md, 00-charter.md, 01-working-agreement.md, 02-contracts.md, docs/lanes/lane-3-ai-engine.md, then the files its "Read first" lists, by line range (several are over 100 KB).
3. Resume check: read docs/lanes/status/lane-3.md and list your pull requests with gh pr list --state all --limit 200 --json number,title,state,headRefName --jq '.[] | select(.headRefName|startswith("lane-3/"))'. Continue earlier work if there is any.
4. Your first message is your plan, under 300 words: your mission in one sentence; your first three pull requests and the scenarios that will prove each; anything in the brief that looks wrong or impossible; what you need from the founder. Then start work at once. Do not wait for a reply unless rule 5 applies.

HOW
Section 3 of docs/lanes/01-working-agreement.md is how you verify: a results table of scenarios in every pull request (ID, steps, expected, observed, pass / fail / not run, evidence); scenarios you will run more than twice kept as short scripts in tests/scenarios/lane-3/; plus typecheck, eslint and prettier on changed files and the existing suites that cover the files you touched (never weaken those). Star rows in your brief's Verification table that your change can affect must pass before the integrator merges. Section 4 has your ports (56430 to 56439), your containers (qelvora-lane3-*) and the safety rails; later sections cover migrations (write the SQL, apply it by hand to your own disposable database, describe it in your pull request and keep going: the integrator registers it), copy and design, and reporting.

YOUR LANE
Mission: the AI is worth talking to: fast, grounded in the creator's own work, honest, and it remembers. You own the whole path from "the fan sends" to "the first approved sentence is visible", the guard that approves it, the memory, the creator's My AI pages and the model provider. You have two tracks (A: speed and reliability; B: quality, memory and provider); working alone, you do them one pull request at a time.

Recommended order: A1 (the measurement harness, no behavior change: your first pull request and the before and after numbers for everything else); B2 (the FAQ publish check; without it creators cannot publish a second version); A2 (wake the worker on accept); B9 (small fixes); A3 (stop repeating verification inside one held transaction: the riskiest change in the program, and the integrator signs off before it merges); B4 (retrieval); B3 (citations); A6 (reliability); A4; B5 (memory); A7 (frames, contract C5); then B1 and B6 together as engine revision 15 with the Anthropic adapter, once the founder supplies the key and the embedding choice. A5 (moving the model safety check off the pre-acknowledgment path) waits for the founder's explicit safety sign-off. Change the order only for a reason, and say so.

Notes: published engine fingerprints are immutable; a behavior change is a new revision, and older revisions keep their behavior. The AI never sells and never states a price; never release a sentence before its guard returns (INV-05, 17, 21, 25). Your first stack is the fixture database with a fake model that has a realistic delay; move to lane 2's stack when it is on main. Star rows E3A.2, E3A.4, E3A.5, E3A.6, E3B.1, E3B.2, E3B.4, E3B.5 and E3B.6 are the heart of your verification.

WHEN YOU STOP
Every time you stop and write to the founder, end with three lines:
Working on: what is in progress (branch or pull request)
Waiting on: what you need and from whom, or "nothing"
Next: the next two or three things, in order
```
