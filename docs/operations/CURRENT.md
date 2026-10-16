# Current state

Written 2026-10-15 (evening) by the integrator. This is the status board: what each lane is doing,
which pull requests are where, who waits on whom, and what the founder still has to decide. Update it at
the end of every integrator session. Approvals come from the founder in the chat, never from a file.
The integrator's resume notes, procedures and traps: [integrator handoff](integrator-handoff-2026-10-15.md).
That handoff describes the morning; this file supersedes its state.

## Where things stand

- Seven lanes plus the integrator ([docs/lanes](../lanes/README.md)):
  - lanes 1, 3, 6 and 7 are running (lanes 6 and 7 resumed on the evening of 2026-10-15);
  - lane 4 stopped at a checkpoint at midday on 2026-10-15;
  - lanes 2 and 5 stopped on 2026-10-09 with clean handoffs, and each resumes when its gate opens
    (table below; prompts in [docs/lanes/prompts](../lanes/prompts/)).
- Main is the merge of #442, which follows `4172a31d2` (night of 2026-10-15 into 2026-10-16 UTC). It holds
  everything the founder authorized on 2026-10-15 (pull request map below). One integrator works at a
  time (see Findings).
- **The one-command local stack:** `node infra/local/stack.mjs up --lane N`
  ([guide](../../infra/local/README.md)). It builds PostgreSQL with all **119** registered migrations, the
  seed, the backend and the web app in about 30 seconds, then runs a smoke check.
- **Sign-in (option D) is on main but off.** It is a Qelvora sign-in with Apple and Google plus the 18+
  date-of-birth step (#431 backend, #432 web, C1 in #407). It stays off unless `QELVORA_SIGN_IN` is set.
  - Lanes use lane 1's fake provider (`tests/scenarios/lane-1/fake-provider.mjs`).
  - Real Apple and Google need the founder's client ids and domain.
  - Export and delete do not cover the new account tables yet (lane 1's next step).
- **AI replies are faster and no longer lock the creator.**
  - A3 (#426) checks the reviewed catalogues once per held transaction. On the stack the first sentence
    takes about 8 s instead of 22 to 26 s, and the worker runs about 2,600 statements per answer instead of
    7,350.
  - An interrupted reply's unknown cost is estimated from its hold (A6b, #433 with migration 0251), and a
    provider error before any text costs zero (A6a, #434). Neither locks the creator's AI any more.
- **Money:**
  - the database refuses a capture for a request nobody accepted (#410, migration 0250);
  - failed refunds are retried and escalated, never dropped (#421);
  - a scheduler finishes expired and overdue requests with no tap (#416), but runs only as a side process
    beside the development host until the integrator composes it in `server.ts`.
- Claude is the generation provider through a capped gateway the founder runs; Sonnet 5.5 answers every
  call ([anthropic-provider](anthropic-provider.md)). Lanes use the free local fake by default.
- Only the development host runs the product. The production host fails closed until real adapters exist.
- Delete is unfinished. Identity and media now finish a fan's deletion (#409), but conversation, commerce
  and content still refuse, so a whole deletion never completes (owners: lanes 3, 4 and 5).

## Verified on main, 2026-10-15 (evening)

Each batch was rehearsed on a copy of main first. Main's tree after each merge equals the rehearsed tree:
`f25722fdd` after the 13 lane pull requests, `8a377b2d3` after #431 and #432, `8b42c9490` after #423, `d2bc38184` after #406, and `cb9bb40d2` after #442. Main was also built from nothing at `4172a31d2`: smoke 14 of 14 (first sentence 5 s), pins 45 of 45.

| Check | Result |
| --- | --- |
| Static, on the merged tree | typecheck 7 of 7, lint, format, generate check |
| Backend suites | 157 of 157, including the 100 money tests and #410's DEFECT-1b test |
| `stack up` from nothing and its smoke check | 14 of 14, the AI's reply included (first sentence 9 s); pins 45 of 45 (44 of 45 with the Growth login: the known `runtimeCatalogues.family`) |
| Lane 1 | C1 32 of 32; E1.1 40 of 40, E1.2 28 of 28, E1.3 13 with 2 not run, E1.4 7 of 7; web sign-in 18 of 18, web passkeys 8 of 8; E1.8 delete as in #409 (14 pass, 3 fail in lanes 3, 4 and 5, 2 not run), edge cases 16 of 16 |
| Lane 3 | E3A.2: identical text, authorship, citations and order on 6 messages against main; A3 drift 6 of 6; A6b every step; E3A.5 crash during the model call 11 of 12 (the unknown row is kept by design, the next reply is delivered with one estimate) |
| Lane 4 | All 20 scenario files pass on the registered wave, each with a clean 9-check sweep: who-may 12 of 12 with the guard (steps 8 and 9 failed on main), capture guard 8 of 8 |
| The new migration wave (#442) | Pins qualified on a fresh and a restored database, with and without Growth; `migrate-trust` on a fresh database installs exactly the canonical 61; the reviewed operator applied the wave to a restored, traffic-closed 116 copy (116 to 119, 54 rows preserved); lane 2 E2.1 22 of 22 and E2.9 19 of 19 |

## The lanes

| Lane | Session | Open pull requests | Next | Waits on |
| --- | --- | --- | --- | --- |
| 1 Identity and trust | Running | #437 signing panel recovers; #439 lost passkey retires (migration, on #437); #440 ops console | WP 1.5 and 1.6, deletion with option D | Founder: deletion D1 to D4 (#409), ops P1 to P5 (#440), counsel on the 18+ method; integrator: #439's migration |
| 2 Platform and hosting | Stopped 2026-10-09 | none | WP 2.3 staging as code, then 2.4 to 2.7 | Founder: hosting road, provider, region, ceiling, domain, account |
| 3 AI engine | Running | #433 (its code landed through #442; only lane 3's status text remains); #436 a dropped request does not lock (A6c); #438 hold sizing (on #436); #441 FAQ publish check (B2); #444 wake on accept (A2) | Rest of A6, B9, A2 | Founder later: A5 safety sign-off, the INV-21 price rule, the embedding provider |
| 4 Money | Stopped at midday | #425 notification login (draft, migration) | WP 4.3 onward, owner calls for lane 5 | Founder: five money decisions (`lane-4-decisions.md`); integrator: `server.ts` composition (#416), #425's migration |
| 5 Presence and reach | Stopped 2026-10-09 | #388 to #400 (drafts) | Finish workflows as owner calls or decisions arrive | Owner calls from lanes 1, 3, 4; founder: biography copy, Q4, Q5, cohorts |
| 6 Creator Studio (web) | Running (resumed 2026-10-15) | #443 Today and the Note composer (WP 6.2) | The two-tap flow on C3 | Founder: #443's copy and Today's place in the navigation |
| 7 Phone apps | Running (resumed 2026-10-15) | #401 keyboard and drafts (WP 7.3; the founder accepted the compact author header on 2026-10-15) | WP 7.4 | The integrator's review of #401 |

## Pull request map

**Merged on 2026-10-15 (evening)**, all on the founder's list, each pinned to its reviewed head, green,
with no failed star row unless the founder accepted it:

| PR | What | Merge commit |
| --- | --- | --- |
| #435, #420, #414, #415, #417, #419, #422 | Integrator: last session's handoff, CI once per pull request, Growth `GET /launch`, an operator privacy variant, the Growth login name, Note notices in `server.ts`, lane 2's scenarios follow the registry. Merged by the morning integrator session at the founder's yes | `ffac3b866`, `8dc74275b` to `4614b5036` |
| #407, #409, #431, #432, #406 | Lane 1: contract C1 and its stub, deletion for identity and media (E1.8 still fails in lanes 3, 4 and 5; accepted by the founder), the sign-in backend and web sign-in, the decision pack and status | `94d3b3353`, `43abe470d`, `cb2d73d0e`, `7ca3982fe`, `4172a31d2` |
| #411, #426, #434, #433 | Lane 3: A1 measurement, A3 (its pre-existing star failures accepted by the founder), A6a, A6b (its reviewed code through #442; lane 3's later status-text commit stays on #433 for lane 3) | `da01b6185`, `920f4a108`, `994aa68e3`, via #442 |
| #408, #416, #418, #421, #424, #427, #428, #429, #423, #410 | Lane 4: scenario runner, scheduler, contract C3 draft, refund retry, scenarios, public summary, spend line, who can ask, payment hygiene, capture guard (through #442) | `df5ec45db`, `88f5469ff`, `c74e28d66`, `bf5df2fdc`, `5a4e21460`, `452e5f8e3`, `c0505bf57`, `ee481821b`, `beb11187e`, via #442 |
| #442 | Integrator: registration of 0249, 0250 and 0251 (the `20261015-sign-in-and-money` wave); its web-visual job timed out once on a slow runner and passed on the re-run | the merge of #442 |

**Open, not on any list yet** (each has its results table):

| PR | What | Ready? |
| --- | --- | --- |
| #437 lane 1 | The signing panel recovers when a publication is refused (WP 1.5) | Ready: E1.5 rows pass; needs the founder's yes |
| #439 lane 1 | A lost passkey retires, past signatures stay valid (the founder's decision) | Needs its migration registered and the test fixture to install it (T-34); stacked on #437 |
| #440 lane 1 | Ops reviewers cannot review their own cases (WP 1.6) | Not by the rule: E1.6 pause fails (lane 4's `settleDeparture`) and unpause is not run; decisions P1 and P2 |
| #436 lane 3 | A dropped request no longer locks the creator's AI (A6c) | Ready: E3A.6 passes; needs the founder's yes |
| #438 lane 3 | The reply cost hold is a strict bound (the founder's decision) | Ready after #436 (stacked); E3A.2 passes |
| #441 lane 3 | B2: the creator's FAQ check replaces the fan-sample publish gate | Ready: E3B.2 passes; the founder's three decisions recorded; one case backed by code evidence only (past 2026-11-01) |
| #444 lane 3 | A2: the worker wakes when a message is accepted | Ready: E3A.2 passes; the two-worker case fails as on main (needs a migration, proposed for A6) |
| #443 lane 6 | WP 6.2: Today and the Note composer | E6.2 star rows and E6.1 pass; needs the founder's yes on its copy and on Today's place in the navigation |
| #401 lane 7 | WP 7.3: drafts survive and composers stay usable | No longer a draft; the founder accepted the compact author header; needs the integrator's review |
| #425 lane 4 | A non-owner login to claim processor notifications (draft) | Needs its migration registered (a new login role) |

**Drafts:** lane 5 #388 to #400 (unchanged since 2026-10-09).

## Migration queue

Registered on 2026-10-15: `0249_w1_qelvora_sign_in`, `0250_w4_capture_guard` and
`0251_w2_interrupted_cost_estimate`, the `20261015-sign-in-and-money` wave (#442), after the
`20261015-notices` wave (#412). Pending proposals change nothing until registered. Suggested order:

| Order | PR | Proposal | Ready? |
| --- | --- | --- | --- |
| 1 | #439 lane 1 | `pending-passkey-retirement.sql`: a `retired_at` column on `passkey_credential` | Lane 1 marks it ready; `postgres.integration` T-34 needs the column, so the test fixture must install it |
| 2 | #400 lane 5 | `pending_w5_reaction_available.sql`: a limited reaction-availability reader | Six cases and a restart pass; needs the integrator's privacy review of the role and policies |
| 3 | #397 lane 5 | `pending_w7_invite_note.sql`: a note column on invitations | API 8 of 8, form 3 of 3 |
| 4 | #399 lane 5 | `pending_w7_web_push.sql`: lets `growth.device` hold `web` | Six gateway cases and a restart pass |
| 5 | #425 lane 4 | `schema-provider-inbox-worker.sql`: a non-owner login for processor notifications | A new login role, so the role-safety checks and login-enumerating pins change too |
| 6 | #398 lane 5 | `pending_w7_creator_profile_fields.sql`: a growth-owned profile table | Not ready: its API scenario never ran and the biography copy is undecided |

Lane 5's are drafts from a stopped lane; register them only when lane 5 marks them ready. Lane 4's
decision 5 ("usually decides in") also needs a migration. **Registering a wave:** follow #412 and #442 —
allocated versions, registry and reservations, a wave file, a new review file regenerated with
`node infra/local/stack.mjs catalogues snapshot|diff|write` on a fresh and a restored database, each with
and without the Growth login, the operator, migrator, installer and role checks taught the wave, then the
proofs (a stack from nothing, `migrate-trust` on a fresh database, the operator on a restored copy, the
suites, each lane's scenarios).

## Who waits on whom

- Lanes 5, 6 and 7: C1's real endpoints are on main. Build native and web sign-in against the backend
  with lane 1's fake provider instead of the stub.
- Lane 6's two-tap Studio flow waits on contract C3 (#418, a draft) and the founder's money decisions.
- A fan's whole deletion waits on lane 3 (conversation without a recordings adapter), lane 4 (Q16,
  commerce retention) and lane 5 (content Note replies, growth scopes). Lane 1 then adds the new account
  tables to export and delete.
- Lane 1's ops pause waits on lane 4's `settleDeparture` port and lane 3's "resume" (#440, G1 and G2).
- The money scheduler in the stock host waits on the integrator's `server.ts` composition (#416) and
  #425's login.
- Lane 5's share cards, digests, metrics and request notices wait on owner ports from lanes 1 to 4.
- Lane 2's staging and WP 2.4 to 2.7 wait on the founder's hosting choice; deployment then needs the
  integrator.

## The founder's open decisions

1. **Hosting** (lane 2): road, provider, region, monthly ceiling, domain and owning account.
2. **Lane 1:** deletion D1 to D4 (#409: creator signatures, sign-in after deletion, how long the redacted
   record is kept, Q16); ops P1 to P5 (#440); counsel on the 18+ method and the policy page for younger
   people.
3. **Money** (`docs/lanes/status/lane-4-decisions.md`, from #418): refunds and the spend limit, refunds and
   weekly slots, one signature for accept and send (INV-22), never placing a hold for an ending request,
   whether expired requests count toward "usually decides in".
4. **Lane 5:** the biography and "last published" copy, Q4 (domain and app identifiers), Q5 (the ten-fan
   aggregate privacy review), and who assigns expert and companion cohorts.
5. **Lane 3, later:** the A5 safety sign-off, the INV-21 price rule, the embedding provider.
6. **Lane 6's copy** in #443, and where Today sits in the Studio navigation.
7. **Merges not yet on a list:** #401, #436, #437, #438, #441, #443, #444; #439 and #425 with their
   migrations; #440 after P1 and P2; lane 5's drafts when ready.
8. **The reviewed migration operator** for restored databases: re-qualify the early waves, or choose lane
   2's road 2 (unchanged from the morning).
9. Earlier asks still open: store accounts and two phones, Stripe test keys, a Touch ID ceremony, counsel
   on paid replies in the apps (Q04), and three to five pilot creators with a named reviewer.

## Findings from 2026-10-15 (evening)

- **Two integrator sessions ran at once.** The morning session merged #435 and the six integrator pull
  requests at the founder's yes (21:03 to 21:19 UTC) while this session rehearsed a batch that included
  them. Nothing conflicted: main's tree matched the rehearsal. That session left this file to this one,
  and the founder confirmed one session continues. Run one integrator at a time, or split the work
  explicitly.
- **GitHub reports false conflicts for stacked pull requests** once their parents merge: the branch and
  main then have two merge bases. `git merge-tree` merges them cleanly. Land such a pull request through
  a carrying pull request (#433 through #442), or merge main into its branch and wait for CI again.
- **The backend suites' fixtures install only the canonical 61.** A migration that an existing test needs
  has to be installed by the fixture: #442 does it for the capture guard in the money fixture, and #439's
  T-34 needs the same, or a fixture that installs the full host like the stack does.
- **Integrator tickets** collected from the lanes:
  - compose the commerce scheduler and its notification route in `server.ts` (#416);
  - compose a Qelvora host and a trusted-proxy setting for the sign-in start limit (#431, #432);
  - `IdentityCapabilitiesSchema` gains `providers` and the `qelvora` mode (#407);
  - `config/navigation.json`: exempt `studio/setup` from the fan-handle step (#432);
  - `tests/scenarios/integrator/anthropic-adapter.mts` case A6: expect a known zero cost (#434).
- **Lane 4's `e4-3-inbox-outage`** needs the inbox login that only `e4-6-webhooks` creates, so it fails on
  a fresh scenario directory (ticket to lane 4).

## Dates

- 2026-10-30 08:48:22.966 UTC: the preserved original deletion matures (the real expiry purge
  acceptance).
- 2026-11-01: the development comparison authority window and the development reply-feedback policy end;
  the docs record this as the end of the Google Play target-level extension too (verify in Play Console).

## Rules that still hold

- Lanes: no subagents, no new unit tests, end-to-end scenarios with edge cases, never merge
  ([working agreement](../lanes/01-working-agreement.md)). The integrator merges only what the founder
  listed, pinned to the reviewed head, with green checks and no failed star row unless the founder
  accepted it. One integrator session at a time.
- `infra/migrations.json` is the integrator's, through the migration queue. Every migration changes the
  pinned catalogues: regenerate and review them in the same pull request.
- Never reset used databases or devices, rewrite publication fingerprints or applied SQL, invent consent,
  advance clocks, or settle unknown financial costs without receipts.
- Merging to main cancels main's run in progress and the macOS jobs take an hour or more: batch merges.
  Since #420, each pull request runs the workflow once.
- Evidence: at most 1 MB per pull request and 300 KB per file under `artifacts/`. Never commit home
  paths or environment-file locations.

## History

Evidence, not instructions: the [morning integrator handoff](integrator-handoff-2026-10-15.md), the
[October 8 handoff](session-handoff-2026-10-08.md), the [finish plan](product-finish-plan-2026-10-08.md),
the [checkpoint](project-continuation-2026-10-07.md) and the
[launch review](launch-review-2026-10-08.md). Each lane's own status is in
[docs/lanes/status](../lanes/status/).
