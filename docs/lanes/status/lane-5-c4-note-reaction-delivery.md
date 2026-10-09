# C4: Note and reaction delivery (provider: lane 5)

Status: **agreed for review** (shipped in `[lane 5] WP 5.1`). Consumers: lane 3 (web
thread), lane 6 (Studio previews), lane 7 (iOS and Android thread).
Source of truth in code: `packages/api/src/content.ts` (`ThreadPresence*`), the
service in `apps/backend/src/modules/content/thread-presence.ts`.

## The decision this contract rests on

The Domain Model says a Note is _"stored once; rendered into each eligible fan's
thread at read time as `human_broadcast`"_. So **nothing is copied into a fan's
thread**. The brief's wording ("insert `human_broadcast` messages") cannot work:
the database trigger `creator.require_signed_message` (`0001_foundation.sql:118`,
kept by `0060`) accepts a signed message only when its signature names _that
thread_ and the signed text, once per signature (`UNIQUE(signed_act_id)`). A
Note's signature names the Note and a reaction's names the reply, so a per-fan
row would be refused, and a one-to-many post would be copied N times.

Consequences, all good:

- **Who sees a Note is decided on every read**, by the same rule that lets the fan
  read the Note directly (`ContentService.list`): current membership or tier, not
  muted, not blocked, restricted or deleted, Note still published at its current
  version. Joining later, leaving later, an edit and a withdrawal need no clean-up.
- **No recipient list exists to leak or to chunk** for the thread. (A push needs
  one; that is WP 5.2.)
- A fan with no thread yet still has the Note waiting.

## Read it

`GET /v1/content/{creatorId}/presence?limit=20&before=<cursor>` with the fan's
session. The fan is the caller; there is no `fanId` parameter.

```
200 {
  items:   ThreadPresenceItem[],  // oldest first, like thread messages; at most 50
  nextBefore: string | null,      // pass back as `before` for the next older page
  serverTime: ISO instant
}
```

A page can hold fewer than `limit` items, even none, and still have older pages:
Notes the fan may not see are never counted or shown. Keep following `nextBefore`
until it is `null`. `before` and `nextBefore` are opaque (`<UTC instant to the
microsecond>~<item id>`); pass back exactly what a page returned. Refusals, all
observed: `401` signed out, `400` a bad `limit` or `before`, `403 scope_revoked` a
blocked, restricted or deleted account, `403 audience_unavailable` an unknown
creator (the same answers as `GET /v1/content/{creatorId}`).

### A Note (`authorKind: "human_broadcast"`)

| Field                      | Meaning                                                              |
| -------------------------- | -------------------------------------------------------------------- |
| `id`, `version`            | The Note and its current published version                           |
| `creatorId`, `creatorName` | Who wrote it                                                         |
| `authorLabel`              | The exact line to show: `noteAudience` copy, "Maya · to all members" |
| `glyph`                    | `"broadcast"`                                                        |
| `audience.kind`            | `members`, `tiers`, `followers` or `groups`                          |
| `audience.label`           | The audience, always named (INV-24): "all members", "Gold members"   |
| `audience.glyph`           | `"broadcast"`                                                        |
| `text`                     | The Note, with the creator's name token resolved for this fan        |
| `signedActId`              | Opens the verification page; every Note is a signed act (INV-22)     |
| `occurredAt`               | When it was published (microsecond precision)                        |

A members Note reaches every current member of any tier; a tier Note only members of
the named tiers. The label is built on the server from the current audience and tier
names; clients never assemble it.

### A reaction (`authorKind: "human_reaction"`)

| Field                       | Meaning                                                      |
| --------------------------- | ------------------------------------------------------------ |
| `id`, `replyId`             | The fan's own reply; a reply has at most one reaction        |
| `noteId`                    | The Note the reply answered                                  |
| `authorLabel`               | `reaction` copy: "Maya reacted to your reply"                |
| `glyph`                     | `"heart"` (the authorship mark; `reaction` carries the kind) |
| `reaction`                  | `heart`, `thanks` or `helpful`                               |
| `signedActId`, `occurredAt` | As above                                                     |

A reaction is returned only to the fan whose reply it answers, and only while that
reply is allowed and not withdrawn. **No item ever carries the text of any fan's
reply** (INV-24); this contract has no field that could.

## Rendering rules for consumers

1. Draw the glyph and `authorLabel` beside the body, and name the audience for a
   Note on every surface (thread, notification, search, export, share). Never
   describe a Note as a message ("Maya messaged you" is forbidden copy).
2. Merge with thread messages by `occurredAt` against each message's `createdAt`.
   Presence items have no `sequence` and no control epoch; they are never part of a
   generation, a takeover or a hand-back.
3. A Note is never replied to in the thread composer. Replies go to
   `POST /v1/content/{creatorId}/{noteId}/replies` and are seen only by the creator
   and the trust team, never by other fans.
4. Screen readers hear the label before the body.

## Notifications (the same two kinds, WP 5.2)

The growth engine's event types are `note` and `reaction`
(`modules/growth/contracts.ts`). Payload rules, enforced by `present()` in
`modules/growth/notifications.ts`:

- sender: `noteAudience` ("Maya · to Kiln Club members") or `reaction`
  ("Maya reacted to your reply"); the audience is always present.
- push says nothing a lock screen should not show: the preview is
  `growthHiddenUpdate` unless the fan turned "hide sensitive" off, and never contains
  any fan's text. A push says "Maya replied" only for `human_creator` and
  `human_call`; Notes and reactions never do.
- destination: the creator's thread, `/creators/{handle}/chat`.

The producers, the recipient rule and the worker-side currency check are described
with WP 5.2.

## Not in this contract (decided later)

Followers and group Notes render the same way, but followers are unreadable until the
reserved follow migration lands (`canonicalCoreContentFollows` is unavailable), and
group Notes need the original-recipient reader. Voice and photo Notes carry no media
here yet. There is no way to undo a reaction (the table is insert-only and no route
exists); see the decisions in the lane 5 status file.
