# Lane 1 · WP 1.6 · The Note-reply queue (E1.7) and the clean-reply screen (R1)

Written 2026-10-16 by lane 1. The founder chose R1's proposed default on 2026-10-16 (counsel to
confirm): a Note reply with no crisis or self-harm language, no threat, slur or harassment term
from a reviewed list, and no links or contact details is delivered without a person; anything
else waits for ops; crisis language opens a case at once (INV-19).

## 1. Finding: the reply queue is not installed anywhere

The trust side of the Note-reply queue is migration `0156_w8_reply_review`
(`apps/backend/migrations/0069_w8_reply_review.sql`). It is **held**: `infra/migrations.json`
lists it as `reserved_unapplied` ("genuine app queue/decision/delivery integration remains
required"). So today:

- Content has no reviewer for a reply, and every Note reply stays pending for good. No case is
  opened, so ops cannot allow or flag it either.
- Lane 5's scenarios stand in for the reviewer by writing `allowed` straight into
  `creator.content_reply_review`.

Tried on lane 1's stack (main at `dea51a4ff`): `0069_w8_reply_review.sql` applies cleanly on top of
all registered migrations, and the reply projection role's catalogue is then complete. The stack
then refuses to start (`assertGenerationWaveRoleSafety`: the database has a migration no wave
lists). Activation is a registry and wave change, which is the integrator's.

**Ticket (integrator):** activate `0156_w8_reply_review` in a wave: allocate it, add the wave and
review files with regenerated pins, qualify the role safety of `creator_trust_reply_projection`,
then flip the registry entry. Lane 1 then proves E1.7 on it and builds R1 on top (sections 2
and 3). Lane 5's "real clean-reply review" ticket waits on the same activation.

## 2. The R1 design (ready to build once 0156 is active)

Screening happens in the database, so the guarantee of 0069 ("only a recorded decision delivers
a reply") still holds: a compromised backend cannot claim that a reply is clean.

- **One pending migration** (`modules/trust/pending-reply-screen.sql`), owned by
  `creator_trust_owner`, which leaves the reply projection role and its pinned catalogue untouched:
  - `creator_trust.reply_screen_term(term, category 'crisis' | 'harm')`, readable and writable
    only by the owner;
  - `creator_trust.screen_note_reply(case, text)`, `SECURITY DEFINER`, runnable only by
    `creator_runtime` (revoked from PUBLIC). It accepts only the reply author's own current
    request transaction (the same rule as `review_note_reply`), and checks the text against the
    hash that `review_note_reply` already verified from the stored reply, so the text cannot be
    swapped;
  - narrow owner policies: resolve an open version-1 `reply_review` case as `allow_reply`, insert
    its `allowed` decision, insert `crisis` cases and three event types.
- **The screen**, on the reply lower-cased and split into words:
  - a crisis term: the reply stays pending and an urgent `crisis` case opens in the safety queue,
    naming the reply's case (never its text);
  - a harm term, or a link, email address, phone number or @handle: the reply stays pending, and
    the case timeline says why ("Held for review: a listed term" or "a link or contact details");
  - anything else: the case is resolved as `allow_reply` by a fixed "automatic screen" reviewer
    id, with the event `reply_auto_allowed`. `review_note_reply` then returns `allowed`, and content
    delivers it in the same request.
- **Backend** (`modules/trust/reply-review.ts`): after `review_note_reply` answers `pending` for a
  new case, call the screen inside a savepoint, then read the review again. Any failure rolls
  back to the savepoint and the reply stays pending (fail closed).
- **Switch:** `TRUST_REPLY_SCREEN=on`. **Default decision: off** until the founder (and counsel)
  have reviewed the term list. Off means every reply waits for a person, as 0069 does.
- **Terms** are managed like ops reviewers (O2): a command run with the migration login, every
  change logged with operator and reason.

Proposed starter list, for review (whole words or phrases):

- **crisis:** kill myself, end my life, suicide, suicidal, self harm, self-harm, cut myself,
  want to die, don't want to live, no reason to live, overdose, hurt myself.
- **harm:** kill you, hurt you, find where you live, know where you live, rape, kill yourself,
  kys, die in a fire, and the common English slurs (the list is kept in the migration, not
  repeated here).

## 3. E1.7, once active

On a lane stack with 0156 active and the screen on, with a Note published by the creator through
the real signing flow and fans in its audience: a clean reply is delivered at once; a reply with a
link is held, the creator never sees it, ops allows it and it is delivered; a reply with a harm
term is held and ops flags it, never delivered; crisis language opens an urgent case; the queue
survives a backend restart; a flood of 200 replies from several fans is screened with no reply
lost or doubled; and with the screen off, every reply waits.

## 4. Status

Not built: R1 would be code that cannot run anywhere until 0156 is active, and lane 1 proves
changes end to end. Lane 1 builds it as soon as the integrator activates 0156.
