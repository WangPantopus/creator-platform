# Decision pack: who may a notification worker ask?

Lane 5, WP 5.2. **Decided 2026-10-08: option A** (the founder). Built in `lane-5/notice-snapshots`:
`modules/growth/notices.ts` (`GrowthNotices.emit` and `withdraw`, the reader and the dispatcher),
the table in `modules/growth/migrations/pending_w7_notice_snapshot.sql`, export and erasure
coverage, and scenarios `e5-4-owner-snapshots` (12 of 12). The owners' two calls are tickets to
lanes 3 and 4 in [the status file](lane-5.md). The original analysis follows unchanged.

## What works, and why

Notes and reactions are told from the creator's own session, and checked at send time
against facts the content module publishes about itself (the public content index, the
creator's profile). That needs no worker authority. It is in the 5.2 pull request and proved
end to end.

## What does not, and why

Answers (`ai_reply`, `approved_draft`, `personal_reply`), request status (`request_status`,
`new_packet`, `creator_offer`), commitment due and call reminders each read **private rows**
(thread messages, packets, commitments) twice: when the engine creates the notice and again
right before it sends. The producers and the owner checks are written and look correct
(`modules/growth/canonical.ts`, `modules/commerce/notifications.ts`). They cannot run
because the worker has no authority to read those rows:

- The growth worker and API roles have no access outside the `growth` schema (checked in the
  database: no grants on any `creator` table).
- A `ThreadScope` is issued only to a live signed-in actor (`access/scope.ts`,
  `assertCurrentSession`), and `growth/notification-custody.ts` says private reads need "W1/W8's
  genuine purpose issuer", which does not exist for notifications. The identity module has
  such scopes only for publication, generation and public AI (`identity/*-scope.ts`).
- `canonical.ts` expects the host to hand `resolveScope(event)` a fresh scope for the event's
  thread. A background tick has none to give.

Today these types are inert: nothing fires. That is the launch review's gap 4, and it stays
until one of the options below is chosen.

## Options

**A. Owner notice snapshots (recommended for the pilot).** The owner writes, in the same
authenticated request that changes its state, one small row into a new growth table saying what
a notice may say right now: version, author kind, creator name, a safe preview, destination,
and whether it is still current. It updates or withdraws the row when its own state changes
(a message deleted, a request withdrawn). The worker reads only that row. Cost: one growth
migration (mine), and one call in each owner's write path (tickets to lanes 3 and 4). Privacy:
nothing private enters growth beyond the safe preview the notice already shows. No new
privileged role.

**B. A notification purpose scope in the identity module (lane 1).** A new `identity` scope
plus migration and role, in the same shape as publication and generation. Every owner's existing
`notificationState` then works unchanged. Cost: the largest and most security-sensitive; lane 1
owns it; export and delete catalogues change.

**C. Narrow `SECURITY DEFINER` read functions per owner**, in the style of
`commerce_paid_audience_count`. Cost: one migration and one role per owner, with catalogue churn
each time.

## What I need

A choice of A, B or C, or "defer these types until after the private web alpha". My
recommendation is A now and B later if more owners want live reads. With A I would build the
table, the engine change and the in-app path first, and the owners' two-line calls follow as
tickets. Until you choose, I will not touch lane 3's or lane 4's files or invent worker
authority.
