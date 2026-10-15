# Current state

Written 2026-10-15 by the integrator. This is the status board: what each lane is doing, which pull
requests are where, who waits on whom, and what the founder still has to decide. Update it at the end
of every integrator session. Approvals come from the founder in the chat, never from a file.

## Where things stand

- Seven lanes plus the integrator ([docs/lanes](../lanes/README.md)). Lanes 1, 3 and 4 are running
  (started 2026-10-15). Lanes 2, 5, 6 and 7 stopped on 2026-10-09 with clean handoffs; each resumes when
  its gate opens (table below; prompts in [docs/lanes/prompts](../lanes/prompts/)).
- Main is `b4306348b` (2026-10-15). Everything the lanes finished up to 2026-10-09 is on it, including the
  eight pull requests GitHub showed as merged although their commits never reached main (#370, #377,
  #378, #373, #371, #374, #375, #376).
- The one-command local stack: `node infra/local/stack.mjs up --lane N` ([guide](../../infra/local/README.md)).
  On main it builds PostgreSQL with all 116 registered migrations, the seed, the backend and the web app
  in about 30 seconds, then runs a smoke check.
- Claude is the generation provider through a capped gateway the founder runs; Sonnet 5.5 answers every
  call ([anthropic-provider](anthropic-provider.md)). Lanes use the free local fake by default.
- Only the development host runs the product. The production host fails closed until real adapters exist.
- The AI's first sentence takes about 23 seconds on the local stack even when the Mac is quiet, and replies
  fail when it is busy: a generation transaction re-checks the catalogue about 60 times inside a fixed
  5-second window. Lane 3's A3 (#426) is the fix; the targets are 4.5 s now and 2.5 s after the switch.
- Delete is unfinished in most domains: identity, content, media and commerce refuse with
  `*_retention_unconfigured` until retention is decided. Lane 1's #409 finishes identity and media.

## Verified on main, 2026-10-15

Main plus #413 has exactly the tree the integrator verified before merging (`219da6165`), and main itself
was rebuilt from nothing afterwards.

| Check | Result |
| --- | --- |
| `stack up --lane 0` and its smoke check, on main | 14 of 14 at load 3, the AI's reply included (first sentence 23 s); pins 45 of 45 |
| Lane 2 E2.1 cold start | 21 of 22 on main; the one failure is the scenario's hard-coded 114 migrations (now 116). With #422: 22 of 22 |
| Lane 2 E2.2 production host fails closed | 144 of 144 |
| Lane 2 E2.9 catalogue regeneration | 19 of 19 with #422 (the scenario still edits the old review file without it) |
| Lane 6 E6.1, main before against after the Studio split | Pass: 80 of 82 shots identical, 2 within tolerance; 636 API calls and 1,090 Tab stops identical |
| Registration of 0247 and 0248 (#412) | Export and delete on a scratch stack; the reviewed operator applied the wave to a restored copy; backend suites 157 of 157 |

## The lanes

| Lane | Session | Open pull requests | Next | Waits on |
| --- | --- | --- | --- | --- |
| 1 Identity and trust | Running | #406 sign-in decision pack, #407 contract C1 and its stub, #409 deletion for identity and media | WP 1.5 signing fixes, WP 1.6 ops console | Founder: three sign-in questions in #406 before WP 1.2 |
| 2 Platform and hosting | Stopped 2026-10-09 | none (#422 from the integrator updates two of its scenarios) | WP 2.3 staging as code, then 2.4 to 2.7 | Founder: hosting road, provider, region, ceiling, domain, account |
| 3 AI engine | Running | #411 A1 measurement, #426 A3 catalogue checks once per transaction | B2, A2, B9, A6 | Founder later: A5 safety sign-off, the INV-21 price rule, the embedding provider |
| 4 Money | Running | #408, #416, #418, #421, #423, #424, #427, #428, #429; drafts #410 and #425 (migrations) | WP 4.3 onward | Founder: the four money decisions in #418; integrator: register #410 and #425 |
| 5 Presence and reach | Stopped 2026-10-09 | #388 to #400 (drafts) | Finish workflows as owner calls or decisions arrive | Owner calls from lanes 1, 3, 4; founder: biography copy, Q4, Q5, cohorts |
| 6 Creator Studio (web) | Stopped 2026-10-09; its chain is merged | none | WP 6.2, Today and the Note composer | Founder's "Next for lane 6" |
| 7 Phone apps | Stopped 2026-10-09; #379 merged | #401 keyboard and drafts (draft) | Resolve the header decision, then WP 7.4 | Founder: the compact author header (#401) |

## Pull request map

**Merged by the integrator on 2026-10-15**, in the founder's order, each pinned to its reviewed head with
every check green and no failed star row:

| PR | What | Merge commit |
| --- | --- | --- |
| #402 | Sonnet 5.5 for every Claude call; the 2026-10-15 kickoff and resume prompts | `46e105326` |
| #403, #404, #405 | Land lane 2's #370 (production host that fails closed), #377 (catalogue pin tool), #378 (hosting options) by merging their original reviewed commits | `8caa189c6`, `bc14f6489`, `ad84df1f8` |
| #380, #384 | Lane 2's resume audit; WP 2.8 load and soak measurements (E2.8 is not a star row and not qualified yet) | `a2bdee60d`, `8074a991b` |
| #382, #383, #386, #387, #390, #391 | Lane 6's Studio split (recovery of #371, #374, #375, #376, then each area); `Studio.tsx` from 4,795 to 408 lines | `7159fd77d` to `9f342e135` |
| #379 | Lane 7 WP 7.2 navigation (its four flagged defaults stand) | `1ebc5e5dd` |
| #385, #412 | Lane 5's mute fix and owner notice records; their two migrations registered as the `20261015-notices` wave | `9928e7451`, `b4306348b` |

#413 (the root `pnpm stack` script) merges when its checks finish, and this document's pull request
after it.

**Open, waiting for the founder** (each pull request has its evidence):

| PR | What | Note |
| --- | --- | --- |
| #414 | Growth web route admits `GET /launch` | Unblocks lane 5's launch kit (#393), which then has its own share-sheet finding |
| #415 | Reviewed operator: a privacy review variant after the Content wave | Fixes the ticket; see Findings for the bigger operator problem |
| #417 | The stack's Growth API login takes the reviewed name | The migration checks then accept `--growth`; an older Growth stack needs `reset` |
| #419 | `server.ts` composes lane 5's Note and reaction notices | Lane 5 still has to run its Note scenarios on the stock host |
| #420 | CI runs each pull request once, not twice | Recommended: the macOS queue held merges for about six hours today |
| #422 | Lane 2's E2.1 and E2.9 follow the registry | Lane 2's files; E2.1 22 of 22 and E2.9 19 of 19 with it |
| Lanes 1, 3, 4 | #406 to #411, #416, #418, #421, #423, #424, #426 to #429 | Not on the integrator's merge list yet |

**Drafts, not merged:** lane 5 #388 to #400, lane 4 #410 and #425, lane 7 #401.

## Migration queue

Registered on 2026-10-15: `0247_w5_note_mute_read` and `0248_w7_notice_snapshot`, the `20261015-notices`
wave (#412). Pending proposals change nothing until registered. Suggested order:

| Order | PR | Proposal | Ready? |
| --- | --- | --- | --- |
| 1 | #400 lane 5 | `pending_w5_reaction_available.sql`: a limited reaction-availability reader (new role, function, scoped read policies) | Six cases and a restart pass; needs the integrator's privacy review of the role and policies |
| 2 | #397 lane 5 | `pending_w7_invite_note.sql`: a note column on invitations | API 8 of 8, form 3 of 3; its one failure (first-answer recovery after a restart) is lane 3's |
| 3 | #399 lane 5 | `pending_w7_web_push.sql`: lets `growth.device` hold `web` | Six gateway cases and a restart pass; the browser worker is lane 6's |
| 4 | #410 lane 4 | `schema-capture-guard.sql`: the database guard for capture | After #408 merges |
| 5 | #425 lane 4 | `schema-provider-inbox-worker.sql`: a non-owner login for processor notifications | After #416; a new login role, so the role-safety checks and login-enumerating pins change too |
| 6 | #398 lane 5 | `pending_w7_creator_profile_fields.sql`: a growth-owned profile table | Not ready: its API scenario never ran and the biography copy is undecided |

Items 1 to 3 can share one wave, and 4 and 5 another. Registering a wave means: allocated versions, a wave
file, its own review file with regenerated pins (`node infra/local/stack.mjs catalogues ...`), the
operator, migrator and installer taught the wave plus a fixed review variant for the state before it,
every purpose-profile variant qualified on a fresh and a restored database, then export and delete on a
scratch stack and the operator on a restored copy. #412 is the worked example.

## Who waits on whom

- Lanes 5, 6 and 7 wait on lane 1's contract C1 (#407 publishes a draft and a stub; build against it).
- Lane 6's two-tap Studio flow waits on lane 4's contract C3 (#418, a draft with founder decisions).
- Lane 5's share cards wait on lanes 1, 3 and 4; its digests and metrics wait on owner ports from lanes 1
  to 4; its Note notices on the stock host wait on #419.
- Every lane's end-to-end replies wait on lane 3's A3 (#426).
- Lane 2's staging and WP 2.4 to 2.7 wait on the founder's hosting choice; deployment then needs the
  integrator.
- The reviewed migration operator for real databases waits on the founder (Findings, first item).

## The founder's open decisions

1. **Hosting** (lane 2): road, provider, region, monthly ceiling, domain and owning account.
2. **Sign-in** (lane 1, #406): the pilot sign-in option, the 18+ method, the account id.
3. **Money** (lane 4, #418): refunds and the spend limit, refunds and weekly slots, one signature for
   accept and send (INV-22), never placing a hold for an ending request.
4. **The compact author header** in constrained phone layouts (lane 7, #401; charter 4.2).
5. **Lane 5:** the biography and "last published" copy, Q4 (domain and app identifiers), Q5 (the ten-fan
   aggregate privacy review), and who assigns expert and companion cohorts.
6. **Lane 3, later:** the A5 safety sign-off, the INV-21 price rule, the embedding provider.
7. **Merges outside the list:** #414, #415, #417, #419, #420, #422 and the lane 1, 3 and 4 pull requests.
8. **The reviewed migration operator** (Findings): re-qualify it for restored databases, or choose lane
   2's road 2.
9. Earlier asks still open: store accounts and two phones, Stripe test keys, a Touch ID ceremony, counsel
   on paid replies in the apps (Q04), and three to five pilot creators with a named reviewer.

## Findings from 2026-10-15

- **The reviewed migration operator cannot take a restored database through the waves.** Walked the way
  it must run (a restored, traffic-closed copy, a private backup, an independent restore), unmodified main
  refuses the very first wave ("Generation-purpose wave catalogue changed"). A restore drops seven explicit
  owner-privilege entries, so a fresh database and its restore differ already at the canonical 61, and
  the early reviews pin only the fresh form. The notices wave does apply this way on a 114 copy. Hosting
  road 1 relies on this operator.
- **The Growth API login name.** The reviewed incoming-Growth variants bind the name
  `creator_review_growth_api`; the stack used `growth_api` (#417). A production host will name its own
  login, which needs its own review or a name-blind catalogue.
- **Lane 5's launch kit:** with the proxy fixed (#414), its share action waits on `navigator.share`,
  which never settles in headless Chrome, so three of its browser steps cannot pass as written.
- **CI:** every pull request branch ran the whole workflow twice and the macOS jobs share very few
  runners, so today's merges waited about six hours for them (#420 halves the load).
- **#399 queues a migration too**, and lane 4 has added two (#410, #425).

## Dates

- 2026-10-30 08:48:22.966 UTC: the preserved original deletion matures (the real expiry purge
  acceptance).
- 2026-11-01: the development comparison authority window and the development reply-feedback policy end;
  the docs record this as the end of the Google Play target-level extension too (verify in Play Console).

## Rules that still hold

- Lanes: no subagents, no new unit tests, end-to-end scenarios with edge cases, never merge
  ([working agreement](../lanes/01-working-agreement.md)). The integrator merges only what the founder
  listed, pinned to the reviewed head, with green checks and no failed star row.
- `infra/migrations.json` is the integrator's, through the migration queue. Every migration changes the
  pinned catalogues: regenerate and review them in the same pull request.
- Never reset used databases or devices, rewrite publication fingerprints or applied SQL, invent consent,
  advance clocks, or settle unknown financial costs without receipts.
- Merging to main cancels main's run in progress and the macOS jobs take an hour or more: batch merges.
- Evidence: at most 1 MB per pull request and 300 KB per file under `artifacts/`. Never commit home
  paths or environment-file locations.

## History

Evidence, not instructions: the [October 8 handoff](session-handoff-2026-10-08.md), the
[finish plan](product-finish-plan-2026-10-08.md), the [checkpoint](project-continuation-2026-10-07.md)
and the [launch review](launch-review-2026-10-08.md). Each lane's own status is in
[docs/lanes/status](../lanes/status/).
