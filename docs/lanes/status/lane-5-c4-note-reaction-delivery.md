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

The growth engine's event types are `note` and `reaction` (`modules/growth/contracts.ts`).

**Who is told, and when.** From the creator's own session, as soon as her publish, her
reaction or a scheduled run answers her (`contentFeature` then drains her pending effects;
the Studio's `POST /v1/content/{creatorId}/studio/effects/run` retries anything that could
not finish):

- a **Note** tells every current member of the Note's audience (members, or the named
  tiers) except a fan W8 denies (blocked, restricted, deleted), once per Note, in events of
  at most 500 recipients. Later publications of the same Note (edits) tell no one.
  Followers and group Notes tell no one yet (see below).
- a **reaction** tells the one fan whose reply it answers, unless W8 denies that fan or the
  reply was withdrawn.

**What the notice says**, built by `present()` in `modules/growth/notifications.ts`:

|                    | Note                                                                                                    | Reaction                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| sender             | "Maya · to Kiln Club members" (`noteAudience`, audience always present)                                 | "Maya reacted to your reply" (`reaction`) |
| preview in the app | the Note's opening words, up to 240 characters, only when the fan is checked as eligible at that moment | the generic update line                   |
| preview in a push  | the generic update line (`growthHiddenUpdate`), never any Note text                                     | same                                      |
| destination        | `/creators/{handle}/chat`                                                                               | same                                      |
| authorship         | `human`                                                                                                 | `human`                                   |

A push says "Maya replied" only for `human_creator` and `human_call`; these two never do.
Push is off until the fan turns it on, and a fan's own muted creators and disabled types
apply. **No notice or push ever carries any fan's reply text.**

**What is checked, and where.** The fan's notification list asks the thread's own guards
(`ThreadPresence.noteFor` / `reactionFor`) as that fan, so a row can never promise what the
thread would refuse; a fan who has left, been blocked or withdrawn the reply does not see the
row. The growth worker has no fan session and may read nothing outside `growth` (and no
worker scope issuer exists), so at send time it checks only what the content module
publishes about itself: the Note is still published at this version, the creator is still
verified. A Note withdrawn before its push is sent is never pushed. The fan was checked when
the notice was queued, and meets the strict check on every tap.

## Not in this contract (decided later)

Followers and group Notes render the same way in the thread, but followers are unreadable
until the reserved follow migration lands (`canonicalCoreContentFollows` is unavailable), and
group Notes need the original-recipient reader; neither sends a notice yet. Voice and photo
Notes carry no media here yet. There is no way to undo a reaction (the table is insert-only
and no route exists). Two known gaps in who is pushed: a fan who muted a creator's Notes in
the content module is still pushed (the mute is private to the fan and unreadable from the
creator's session), and a reaction push can still go out after the fan withdrew the reply.
Both are held in `tests/scenarios/lane-5/e5-4-known-gaps.mjs`; see the status file.
