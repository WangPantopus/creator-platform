# C10: Creator Studio data (provider: lane 6)

Status: **agreed for review** (shipped in `[lane 6] 6.2`). Consumers: lane 3 (AI status),
lane 4 (queue and capacity), lane 5 (Notes, replies, digest). Source of truth in code:
`apps/web/features/studio/today/Today.tsx` (what Today reads) and
`apps/backend/src/modules/studio/service.ts` `audiences()` (audience reach).

## What Today reads, one place each

Today is where Studio opens (`/studio/{creatorId}` and `/studio/{creatorId}/today`). It
writes nothing. Each part is read from the one place that owns it, once when Today opens and
again when the creator comes back to the tab (`focus`, `visibilitychange`). **Nothing on Today
polls on a timer.** Each part settles on its own, so one unavailable producer shows its own
message and never hides the others.

| Part               | Read                                                                                 | Field used                                                                 | Owner                          | Who sees it                                    |
| ------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------- |
| Latest Note        | `GET /v1/content/{creatorId}/studio?state=published&limit=20`                        | the item with `document.kind = "note"` and the latest `publishedAt`        | lane 5 (content)               | creator, drafter, publisher, scheduler, triage |
| Unread replies     | `GET /v1/content/{creatorId}/studio/replies?filter=unread&limit=50`                  | `items.length`; `nextCursor` shows "50+"                                   | lane 5 (content)               | creator, triage                                |
| Requests waiting   | `GET /v1/studio/{creatorId}/queue?limit=1`                                           | `requests`, the same number the Requests badge shows                       | lane 6 module over lane 4 rows | creator                                        |
| Capacity this week | the same response                                                                    | `capacity[]`: `title`, `weekly_limit`, `used + reserved`                   | lane 4 (Offers)                | creator                                        |
| AI status          | `GET /api/studio/ai/state` (the My AI read)                                          | `paused`, `liveVersion.number`; refused unless `creator.id` is this Studio | lane 3                         | creator                                        |
| Digest             | **not read yet**: the weekly digest has no producer (launch review, moment 3, gap 7) | —                                                                          | lane 5                         | — (WP 6.7)                                     |

"New Note" (creator and drafter) opens `/studio/{creatorId}/compose?from=today`; Cancel and a
finished Note come back to Today. `from=today` is the only value allowed, on the composer only
(`config/navigation.json`). Notes is one tap from Today: a "Notes" link beside "Your latest
Note", for every role that sees that part (founder, 2026-10-15: Today replaces Notes as the
first Studio tab; the tab bar change is the integrator's, in `packages/ui-web`).

## What the composer reads: audience reach

`GET /v1/studio/{creatorId}/audiences` (schema `StudioAudiences`) now also says whether anyone is
in each audience right now:

```
{ audienceCountsAvailable, members: Reach, tiers: [{ id, name, reach: Reach }], groups }
Reach = "some" | "none" | "unknown"
```

- **Only the creator's own session** gets `some` or `none`. A team member gets `unknown` for
  every audience; a fan gets `403 creator_role_required`; a signed-out visitor `401`.
- `some` means at least one current membership: `active`, `grace` (until `grace_end`) or
  `cancelled` (until `period_end`), the rule `content/notices.ts` uses to tell a Note's audience.
  It is an existence check: no count, no recipient.
- **Known limit.** A fan's read also needs that member's current access grant
  (`commerce/audience-memberships.ts`), and row security shows a grant only inside its own
  creator and fan pair. So `none` is exact, while `some` can include a member whose grant lapsed.
  W4's narrow count (`creator.commerce_paid_audience_count`, held migration 0155) is exact and
  should replace this check once it is registered.
- Followers and groups are `unknown` here (followers are not readable until the follow migration,
  see C4).
- The composer shows "No one is in this audience right now. No one will be told about this Note;
  members who join later can read it." under the audience and again on the review sheet, only
  for a Note whose audience is `none`. It does not block signing: a Note is read at read time, so
  a member who joins later sees it (checked in E6.2-19).

## Asks to the consumers

- **Lane 3:** a light AI status read (live version number, paused) so Today does not load the
  whole My AI state.
- **Lane 4 and the integrator:** register 0155 so reach can use the exact narrow count.
- **Lane 5:** a weekly digest read for Today (WP 6.7); and `content/notices.ts` tells members
  whose access grant has lapsed about a Note they cannot open (its fan-out has no grant check;
  the read does).
