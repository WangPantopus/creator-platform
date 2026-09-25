#!/usr/bin/env python3
"""Writes components/<Comp>/README.md and preview.html for the Qelvora design system."""
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'project', 'components')

TEMPLATE = """<!-- @dsCard group="{group}" height={height} -->
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>{name} · preview</title></head>
<body>
<div id="root"{root_cls}></div>
<script>
  var Q = window.Qelvora, h = React.createElement;
  function cap(t) {{ return h('div', {{ className: 'qv-meta', style: {{ marginTop: 4 }} }}, t); }}
  function plate(kids, pad) {{ return h('div', {{ className: 'qv qv-on-maya', style: {{ background: 'var(--maya-surface)', color: 'var(--on-maya)', borderRadius: 'var(--radius-lg)', padding: pad || 16, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', '--qv-cut': 'var(--maya-surface)' }} }}, kids); }}
{pre}  ReactDOM.createRoot(document.getElementById('root')).render({expr});
</script>
</body>
</html>
"""

C = []  # (name, group, height, root_cls, pre, expr, readme)

def add(name, group, height, expr, readme, root='qv-stack', pre=''):
    C.append((name, group, height, root, pre, expr, readme))

# ---------------------------------------------------------------- Identity
add('Mark', 'Identity', 200, r"""h(React.Fragment, null,
    h('div', { className: 'qv-row', style: { padding: 0, gap: 20 } }, [['ai', "Maya's AI"], ['approved_draft', 'Approved draft'], ['human_creator', 'Maya'], ['human_broadcast', 'Note'], ['human_reaction', 'Reaction'], ['team', "Maya's team"], ['correction', 'Correction']].map(function (k) {
      return h('div', { key: k[0], style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 76 } }, h(Q.Mark, { kind: k[0], size: 20 }), h('span', { className: 'qv-help' }, k[1]));
    })),
    cap('On Maya’s surface'),
    plate(['human_creator', 'human_broadcast', 'human_reaction', 'correction'].map(function (k) { return h(Q.Mark, { key: k, kind: k, size: 20, onMaya: true }); })))""",
"""The authorship mark: the glyph that says which author wrote what follows before a single word is read. Each author has exactly one mark: a ring with a center dot for Maya's AI, a filled seal with her initial for Maya, the ring and seal overlapping for an approved draft, a seal with broadcast arcs for a Note, a heart for a reaction, a dashed square for her team and a folded card for a correction.

## Props

- `kind`: `ai`, `approved_draft`, `human_creator`, `human_broadcast`, `human_reaction`, `team` or `correction`.
- `size`: the glyph size in px.
- `onMaya`: set when the mark sits on `maya-surface`, so Maya's marks switch from `maya-ink` to `maya-accent`.
- `initial` and `live`: passed to the seal for `human_creator`.

## When to use

Inside AuthorLabel, notification icons and any tight place where one author must be named. Always pair the mark with the author's word: the mark supports the label and never replaces it.

## Do and don't

- Do let marks inherit `currentColor` so they take the author's color.
- Don't use a mark as a bullet, a decoration or an empty-state illustration.
- Don't give the AI anything seal-like, and don't give Maya a ring.
""")

add('Seal', 'Identity', 110, r"""h('div', { className: 'qv-row', style: { padding: 0, gap: 24 } },
    h(Q.Seal, { size: 16 }), h(Q.Seal, { size: 22 }), h(Q.Seal, { size: 30 }), h(Q.Seal, { size: 44 }),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } }, h(Q.Seal, { size: 30, live: true }), h('span', { className: 'qv-help' }, 'Live: Maya is in the conversation')),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } }, h(Q.Seal, { size: 30, initial: 'D' }), h('span', { className: 'qv-help' }, 'Devon')))""",
"""The creator's seal: a filled `maya-accent` disc with her initial in Newsreader italic, the one ornament in the system. It stands for the person and nothing else.

## Props

- `initial`: the creator's initial. Default "M".
- `size`: the diameter in px. Use 16 inside labels, 22 in strips and reactions, 30 in buttons and 44 on hero moments.
- `live`: turns on the house lights, a `ground` gap, a `maya-accent` ring and `glow-maya`. Use it only while she is actually in the conversation.

## When to use

Wherever Maya herself acted: her messages, the step-in button, the signed marker, reactions, receipts and the "Maya is here" line.

## Do and don't

- Do keep the initial in `on-maya-accent` so it holds contrast in both themes.
- Don't put a photo inside the seal. Her photo belongs on her home page; the seal is her signature.
- Don't show `live` on anything that was recorded or sent earlier.
""")

add('Avatar', 'Identity', 96, r"""h('div', { className: 'qv-row', style: { padding: 0, gap: 28 } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } }, h(Q.Avatar, null), h('span', { className: 'qv-help' }, 'Maya')),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } }, h(Q.Avatar, { live: true }), h('span', { className: 'qv-help' }, 'Maya, in the conversation')),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } }, h(Q.Avatar, { initial: 'D' }), h('span', { className: 'qv-help' }, 'Devon')))""",
"""The creator's 38px tile: her initial on `maya-surface`, used where a list or header needs to name a creator at a glance. It is a monogram, not a photo, so it can never be mistaken for a live person picture.

## Props

- `initial`: default "M".
- `live`: the house lights, only while the creator is in this conversation.

## When to use

Thread headers, conversation lists, the Requests tab and studio rows that name a creator.

## Do and don't

- Do pair it with the creator's name in `title` beside it.
- Don't use it for the AI. The AI has no face; the header subtitle says "Official AI".
- Don't animate it.
""")

add('AuthorLabel', 'Identity', 340, r"""h(React.Fragment, null,
    h(Q.AuthorLabel, { kind: 'ai', time: '14:32' }),
    h(Q.AuthorLabel, { kind: 'approved_draft', time: '11:20' }),
    h(Q.AuthorLabel, { kind: 'human_creator', time: '14:38' }),
    h(Q.AuthorLabel, { kind: 'human_broadcast', time: '09:12' }),
    h(Q.AuthorLabel, { kind: 'human_reaction' }),
    h(Q.AuthorLabel, { kind: 'team', member: 'Priya', time: '16:05' }),
    h(Q.AuthorLabel, { kind: 'correction' }),
    cap('On Maya’s surface'),
    plate([h(Q.AuthorLabel, { key: 1, kind: 'human_creator', onMaya: true, time: '14:38' }), h(Q.AuthorLabel, { key: 2, kind: 'human_broadcast', onMaya: true }), h(Q.AuthorLabel, { key: 3, kind: 'correction', onMaya: true })]))""",
"""The author's mark and fixed word, set above or inside every message so the author survives screenshots, search and notifications. The words are fixed: "Maya's AI", "Prepared by AI · approved by Maya", "Maya", "Maya · to Kiln Club members", "Maya reacted to your reply", "Maya's team · Priya" and "Maya's note on this AI reply".

## Props

- `kind`: the author (see Mark).
- `name`: the creator's name. Default "Maya".
- `audience`: for a Note. Default "Kiln Club members".
- `member`: for the team. Default "Priya".
- `time`: shown in `data-sm` after the label.
- `onMaya`: set on `maya-surface`.

## When to use

At the top of every incoming message and every card that carries someone's words. The fan's own messages carry no label.

## Do and don't

- Do keep the words exactly as written. The fixed-copy list is part of the contract.
- Don't shorten "Maya's AI" to "AI" or "Assistant", and never write "bot", "chatbot" or "virtual".
- Don't place the label only in the thread header.
""")

add('IdentityStrip', 'Identity', 300, r"""h(React.Fragment, null,
    h(Q.IdentityStrip, { state: 'ai' }),
    h(Q.IdentityStrip, { state: 'human' }),
    h(Q.IdentityStrip, { state: 'team' }),
    h(Q.IdentityStrip, { state: 'paused' }),
    h(Q.IdentityStrip, { state: 'updating' }))""",
"""The strip under the thread header that says who reads the fan's next message. It never scrolls away, and it changes within 500 ms whenever the speaker changes.

## Props

- `state`: `ai` ("You're talking to Maya's AI · Maya steps in on request"), `human` ("Maya is here"), `team` ("Maya's team is here"), `paused` or `updating`.
- `name`: default "Maya".

## When to use

In every thread, directly under ThreadHeader, pinned at `z-strip`. It is a `status` region, so screen readers announce each change.

## Do and don't

- Do announce the same change with a SystemLine in the thread.
- Do use the `human` state only while Maya is actually present. It turns on her surface and the house lights.
- Don't hide the strip on scroll, in landscape or at large text sizes.
""", root='qv-stack qv-phone')

add('ThreadHeader', 'Identity', 150, r"""h(React.Fragment, null,
    h(Q.ThreadHeader, null),
    h(Q.ThreadHeader, { live: true }),
    h(Q.ThreadHeader, { name: 'Devon', subtitle: 'Official AI · companion mode' }))""",
"""The thread header: back, the creator's avatar, her name and a subtitle that says what this thread is ("Official AI · Kiln Club"). While Maya is present, the subtitle reads "In this conversation" in `maya-ink` and her avatar lights up.

## Props

- `name`: default "Maya".
- `subtitle`: default "Official AI · Kiln Club".
- `live`: Maya is in the conversation.

## When to use

At the top of every one-to-one thread, followed by IdentityStrip. The info button opens "About this conversation", which explains the AI, memory and requests.

## Do and don't

- Do keep "Official AI" in the subtitle whenever the AI is answering.
- Don't put the creator's photo here; the avatar is her monogram.
- Don't add call or video buttons. Calls are requests with a price, not header actions.
""", root='qv-stack qv-phone')

add('SignedMarker', 'Identity', 120, r"""h(React.Fragment, null,
    h('div', { style: { display: 'flex', gap: 24, flexWrap: 'wrap' } }, h(Q.SignedMarker, { time: '14:38' }), h(Q.SignedMarker, { time: 'OCT 4', extra: 'Written reply' })),
    plate([h(Q.SignedMarker, { key: 1, time: '09:12' }), h(Q.SignedMarker, { key: 2, extra: '312 members' })]))""",
""""Signed by Maya", the marker on every act made under her name: her replies, approved drafts, Notes, reactions, corrections and voice notes. It is a link to the verification page, where anyone can check that she really signed it.

## Props

- `name`: default "Maya".
- `time`: when she signed.
- `extra`: a second meta item such as "312 members" or "Recorded by Maya".
- `href`: the verification page.

## When to use

At the foot of any content Maya authored or approved. It takes `maya-ink` on neutral grounds and `maya-accent` on her surface.

## Do and don't

- Do keep it tappable (24px minimum height) and keep its label: "Signed by Maya. Open the verification page".
- Don't show it on AI messages, team messages or system lines.
- Don't use it as a badge of popularity or status.
""")

add('SystemLine', 'Identity', 170, r"""h(React.Fragment, null,
    h(Q.SystemLine, { variant: 'date' }, 'Today'),
    h(Q.SystemLine, { variant: 'presence', time: '14:38' }),
    h(Q.SystemLine, null, "Maya left the conversation · you're back with Maya's AI"),
    h(Q.SystemLine, null, 'Your request was sent · REQ-0412'))""",
"""A centered line that announces a change of speaker, a date or an event in the thread. No change of speaker is ever silent.

## Props

- `variant`: `plain` (a sentence in `ink-muted` between hairlines), `presence` (the "Maya is here" pill with her seal and the house lights) or `date`.
- `name`, `time`: for `presence`.
- `children`: the sentence for `plain` and `date`.

## When to use

When Maya arrives or leaves, when her team joins, when a request is sent or delivered, and between days.

## Do and don't

- Do write the arrival and the departure: "Maya is here", then "Maya left the conversation · you're back with Maya's AI".
- Don't let anything from the AI appear between a presence line and her departure line.
- Don't use system lines for marketing or tips.
""", root='qv-stack qv-phone')

# ---------------------------------------------------------------- Conversation
add('Message', 'Conversation', 1640, r"""h('div', { className: 'qv-thread qv-phone' },
    h(Q.SystemLine, { variant: 'date' }, 'Today'),
    h(Q.Message, { kind: 'fan' }, 'My satin white keeps crawling at the rim. Cone 6, dipped.'),
    h(Q.Message, { kind: 'ai', time: '14:32', citation: h(Q.CitationChip, { title: 'Dipping glazes without drips', meta: 'Kiln Club video · 4:12' }) }, 'Crawling at the rim usually means the coat went on too thick there. Maya shows her single-dip method in this video.'),
    h(Q.SystemLine, { variant: 'presence', time: '14:38' }),
    h(Q.Message, { kind: 'human_creator', live: true, time: '14:38' }, "Single dip, count to three, and let it drip off. Then sponge the rim. You'll see the difference in one firing."),
    h(Q.Message, { kind: 'fan', after: h(Q.ReactionChip, null) }, 'Trying it tonight.'),
    h(Q.SystemLine, null, "Maya left the conversation · you're back with Maya's AI"),
    h(Q.Message, { kind: 'team', time: '16:05' }, "Your seat for Saturday's glazing workshop is confirmed."),
    h(Q.Message, { kind: 'ai', time: '16:20', sponsor: 'Glazeco' }, "For a cone 6 satin white, Maya starts from Glazeco's satin base in her videos."),
    h(Q.SystemLine, null, "You've been talking with Maya's AI for a while. It's an AI, and it will be here when you're back."),
    cap('Delivery states'),
    h(Q.Message, { kind: 'fan', delivery: 'pending' }, 'Here is my test tile.'),
    h(Q.Message, { kind: 'fan', delivery: 'failed' }, 'Here is my test tile.'),
    h(Q.Message, { kind: 'ai', delivery: 'accepted', actions: false }),
    h(Q.Message, { kind: 'ai', delivery: 'streaming', actions: false }, 'Cone 6 oxidation is where most'),
    h(Q.Message, { kind: 'ai', delivery: 'interrupted', actions: false }, 'Cone 6 oxidation is where most satin glazes'),
    cap('Approved draft: split (default), gradient, stacked'),
    h(Q.Message, { kind: 'approved_draft', time: 'OCT 4' }, 'Thin the glaze to 1.45 specific gravity and wipe the top 5 mm before firing.'),
    h(Q.Message, { kind: 'approved_draft', treatment: 'gradient', time: 'OCT 4' }, 'Thin the glaze to 1.45 specific gravity and wipe the top 5 mm before firing.'),
    h(Q.Message, { kind: 'approved_draft', treatment: 'stacked', time: 'OCT 4' }, 'Thin the glaze to 1.45 specific gravity and wipe the top 5 mm before firing.'))""",
"""One message in a thread, drawn with its author's four cues. The fan's messages sit right on `surface-sunken`; the AI's on its `ai-surface` panel with the ring and "Maya's AI"; Maya's on her plate in `voice-lg` with the Signed marker; approved drafts split the AI's panel over her band; the team's on `team-surface`.

## Props

- `kind`: `fan`, `ai`, `human_creator`, `approved_draft` or `team`.
- `children`: the text. Maya's words render in Newsreader; everything else in Geist.
- `time`, `name`, `member`.
- `delivery`: for the fan, `pending` ("Sending") or `failed` ("Not sent" and Retry); for the AI, `accepted` (typing dots), `streaming` (a caret) or `interrupted`.
- `citation`: a CitationChip inside the AI's panel.
- `live`: house lights on Maya's message while she is present.
- `treatment`: for approved drafts. `split` is the default; `gradient` and `stacked` are kept for comparison testing. Use one treatment across the product.
- `after`: content under a fan message, such as a ReactionChip.
- `actions`: `false` hides "This helped" and "Report" under an AI message.
- `sponsor`: for an AI message that mentions a listed sponsor; adds "Paid partnership: Maya is paid by {brand}." inside the panel.

## When to use

For every message in a one-to-one thread. Group messages from the same author within two minutes and repeat the label after any change of author.

## Do and don't

- Do keep the label inside the message, never only in the header.
- Don't set AI output in the serif, even when it quotes Maya.
- Don't show prices, purchase suggestions, "unlock" or "upgrade" inside an AI message.
- Don't animate sending or scrolling.
""", root='')

add('Note', 'Conversation', 760, r"""h(React.Fragment, null,
    h(Q.Note, { time: '09:12', media: 'Photo · three test tiles on the kiln shelf', audienceSize: '312', replyId: 'note-reply-1' }, 'Opened the kiln this morning. The new celadon test came out the color of shallow water. The recipe goes into the Kiln Club library on Friday.'),
    h(Q.Note, { time: 'SEP 28', reply: false }, "The studio is closed next week while I teach in Portland. My AI keeps answering, and I'm pausing requests until the 14th."),
    h(Q.Note, { retracted: true }))""",
"""A Note: Maya's one-to-many post, on her plate with a folded corner and the broadcast mark. It always names its audience ("Maya · to Kiln Club members"), even when it greets the fan by name.

## Props

- `children`: her words, in `voice-lg`.
- `audience`: default "Kiln Club members".
- `audienceSize`: optional; shown beside the Signed marker as "312 members".
- `time`, `media` (a caption; shows a labeled placeholder until a real photo exists).
- `reply`: `false` hides the private reply field.
- `replyId`: a unique input id.
- `retracted`: shows "Maya removed this Note".

## When to use

In the Posts section of a creator's page and on Home. Notes never appear inside a one-to-one thread as if they were direct messages.

## Do and don't

- Do keep the reply notice: "Only Maya and her team see replies to Notes."
- Don't write "Maya messaged you" for a Note in notifications; write "Maya · to Kiln Club members".
- Don't use `glow-maya` on a Note. A Note is signed, not live.
""", root='qv-stack qv-phone')

add('ReactionChip', 'Conversation', 170, r"""h(React.Fragment, null,
    h(Q.Message, { kind: 'fan', after: h(Q.ReactionChip, null) }, 'Trying it tonight.'),
    h('div', null, h(Q.ReactionChip, { name: 'Devon' })))""",
"""The small pill that shows Maya reacted to a fan's message: her seal, a heart and the words "Maya reacted to your reply". It is one of her lightest ways to be present.

## Props

- `name`: default "Maya".

## When to use

Under the fan's message it reacts to (pass it as `after` on a fan Message), and as a NotificationRow of kind `reaction`.

## Do and don't

- Do keep the words; a heart alone is not a label.
- Don't allow reactions from the AI. Only Maya reacts.
- Don't stack several reactions; she has one.
""", root='qv-stack qv-phone')

add('CitationChip', 'Conversation', 230, r"""h(React.Fragment, null,
    h('div', null, h(Q.CitationChip, { title: 'Dipping glazes without drips', meta: 'Kiln Club video · 4:12' })),
    h('div', null, h(Q.CitationChip, { title: 'Cone 6 satin white recipe', meta: 'Kiln Club library', stamp: 'PDF' })),
    h('div', null, h(Q.CitationChip, { title: 'Studio tour, spring 2025', unavailable: true })))""",
"""A source Maya's AI used, shown inside its panel and linking to the source: a stamp, a title and a meta line. Citations let the fan check the AI against Maya's own material.

## Props

- `title`, `meta`: the source's name and its kind or length.
- `stamp`: short mono text such as "PDF"; defaults to a play glyph for video.
- `href`: the source.
- `unavailable`: the source was removed or the fan no longer has access ("No longer accessible to you").

## When to use

Inside an AI Message, through its `citation` prop, whenever the answer draws on an approved source.

## Do and don't

- Do cite only approved sources the fan can open.
- Don't use a citation to sell a locked source. When the fan has no access, say so plainly.
- Don't place citations on Maya's own messages.
""", root='qv-stack qv-phone')

add('MemoryChip', 'Conversation', 250, r"""h(React.Fragment, null,
    h(Q.MemoryChip, { text: 'You fire cone 6 in an electric kiln at home.' }),
    h(Q.MemoryChip, { variant: 'ask', text: "You're working toward a satin white that doesn't crawl." }))""",
"""What Maya's AI remembers about the fan, shown where it is used, and the question the AI asks before it remembers anything. Memory is opt-in and always editable.

## Props

- `text`: the remembered fact, in the AI's words.
- `variant`: `saved` (default; "Remembered: …" with Edit and "Don't remember this") or `ask` ("Want me to remember this? Only if you say yes.").

## When to use

Under the AI message that used or proposed a memory, and in the fan's memory list under You.

## Do and don't

- Do say "Maya's AI remembers", never "Maya remembers".
- Don't show memory chips in an off-the-record conversation; nothing is remembered there.
- Don't make "Remember" the visually stronger choice.
""", root='qv-stack qv-phone')

add('Correction', 'Conversation', 280, r"""h(Q.Correction, { aiText: "Maya's celadon is fired at cone 6.", aiTime: '09:40', time: '11:02' }, "My AI got this wrong: my celadon is fired at cone 10, in reduction. I've fixed its notes.")""",
"""Maya's signed correction, attached under the AI reply it corrects. The AI's original stays visible above so the fan can see what changed.

## Props

- `aiText`, `aiTime`: the AI reply being corrected.
- `children`: the correction in her words, in `voice-md`.
- `time`: when she signed it.
- `name`: default "Maya".

## When to use

When Maya reviews a conversation and finds her AI said something wrong. The correction reaches the fan as its own notification.

## Do and don't

- Do keep the label "Maya's note on this AI reply" and the Signed marker.
- Don't delete or rewrite the AI's original text.
- Don't let the team write corrections under Maya's name.
""", root='qv-stack qv-phone')

add('ContextCard', 'Conversation', 170, r"""h(React.Fragment, null,
    h(Q.ContextCard, { title: "Maya's reel · Opening the October kiln" }),
    h(Q.ContextCard, { source: 'From her newsletter', title: 'Five glazes I keep coming back to' }))""",
"""The post a fan arrived from, attached to their first message so the AI knows what they are asking about. The fan can remove it before sending.

## Props

- `source`: default "From Instagram".
- `title`: the post's title.

## When to use

Above the composer when a fan opens a thread from a shared link or a post.

## Do and don't

- Do keep the remove button with its label "Remove this post from your first message".
- Don't attach it silently; the fan sees exactly what is shared.
""", root='qv-stack qv-phone')

add('VoiceNote', 'Conversation', 420, r"""h(React.Fragment, null,
    h(Q.VoiceNote, { time: 'OCT 5', duration: '0:42', transcript: "Hi, it's Maya. I looked at your test tile. That crawl is the rim, not the recipe." }),
    h(Q.VoiceNote, { kind: 'ai', time: '14:40', duration: '0:18', transcript: "This is Maya's AI. Here's her single-dip method in short." }))""",
"""A voice note, either recorded by Maya or spoken by her AI, drawn so the two can never be confused. Hers sits on her plate with her seal, "Recorded by Maya" and the Signed marker; the AI's sits on its panel with the tag AI voice · opens with “Maya's AI”.

## Props

- `kind`: `human` (default) or `ai`.
- `duration`: default "0:42".
- `transcript`: always provide one.
- `time`, `name`.

## When to use

For a delivered voice-note request, and for AI replies read aloud when the fan turns voice on.

## Do and don't

- Do begin every AI voice clip with the words "Maya's AI".
- Don't let an AI clip pass as her recording: it never carries her seal, her plate or the Signed marker.
- Don't autoplay.
""", root='qv-stack qv-phone')

add('Composer', 'Conversation', 1040, r"""h(React.Fragment, null,
    cap('With Maya’s AI'), h(Q.Composer, { id: 'c1' }),
    cap('Free conversation'), h(Q.Composer, { state: 'trial', id: 'c2', trialLeft: '18 H' }),
    cap('Maya is fully booked'), h(Q.Composer, { state: 'capacity_zero', id: 'c3' }),
    cap('AI paused'), h(Q.Composer, { state: 'paused', backDate: 'Monday' }),
    cap('Free conversation ended'), h(Q.Composer, { state: 'ended' }),
    cap('Maya is here'), h(Q.Composer, { state: 'human', id: 'c6' }))""",
"""The pinned bottom of a thread: the step-in button, then the message field, in every access state. It always says whom the fan is writing to: the placeholder reads "Message Maya's AI" or, while she is present, "Reply to Maya".

## Props

- `state`: `ai`, `trial`, `capacity_zero`, `paused`, `ended` or `human`.
- `trialLeft`: for `trial`, in uppercase mono ("18 H").
- `backDate`: for `paused`.
- `id`: a unique input id.
- `name`: default "Maya".

## When to use

At the bottom of every thread at `z-composer`. `ended` replaces the field with AccessLines and one secondary join button; the AI never asks for money.

## Do and don't

- Do keep the step-in button available in every state where requests work, including `paused`.
- Don't use the AI's send button while Maya is present; the send button turns to her color.
- Don't count down with alarm colors. The trial note is quiet mono.
""", root='qv-stack qv-phone')

add('StepIn', 'Conversation', 140, r"""h(React.Fragment, null,
    h('div', null, h(Q.StepIn, null)),
    h(Q.StepIn, { disabled: true }))""",
"""Ask Maya to step in: her seal on her surface, a pill, the only person-colored button in a thread. It starts a request.

## Props

- `name`: default "Maya".
- `disabled`: keeps the label and shows the reason beside it.
- `note`: the reason, such as "Maya is fully booked this week · opens Monday".

## When to use

In the Composer, and on the creator's page under Requests.

## Do and don't

- Do say why when it is disabled, and when it opens again.
- Don't place any other `maya-surface` action in a thread.
- Don't write "Chat with Maya" or "Get closer". The wording is fixed.
""")

add('ShareCard', 'Conversation', 420, r"""h(Q.ShareCard, { handle: '@kilnfire', time: 'OCT 4' }, 'Single dip, count to three, and let it drip off. Then sponge the rim.')""",
"""The square card a fan can share of Maya's reply: her words on her plate, "Maya replied to @kilnfire", the Signed marker and a verification address anyone can check.

## Props

- `children`: Maya's words.
- `handle`: the fan's handle. Default "@kilnfire".
- `time`, `verify` (the uppercase verification address), `name`.

## When to use

From the share action on Maya's own messages and on approved drafts she signed.

## Do and don't

- Do keep the verification address on every card.
- Don't offer sharing for AI messages as if they were Maya's words.
- Don't crop the author line out of the card.
""")

# ---------------------------------------------------------------- Requests
add('AccessLines', 'Requests', 230, r"""h(Q.AccessLines, null)""",
"""The four fixed lines that tell a fan where they stand: "You can", "Included", "By request" and "Changes". They replace plans tables and upsell copy.

## Props

- `can`, `included`, `byRequest`, `changes`: the text after each fixed term.
- `name`: default "Maya".

## When to use

On the creator's Access section, at the end of a free conversation and on the membership sheet.

## Do and don't

- Do keep all four lines, in this order, even when one says "nothing yet".
- Don't write "VIP", "exclusive access" or "from $".
- Don't hide the renewal date.
""", root='qv-stack qv-phone')

add('ModeList', 'Requests', 280, r"""h(React.Fragment, null, cap('How'), h(Q.ModeList, { group: 'mode-demo', modes: [
      { title: 'Written reply', meta: 'Within 7 days or a full refund · 3 of 10 left this week', price: '$25', selected: true },
      { title: 'Voice note', meta: 'Within 7 days or a full refund · 2 of 4 left this week', price: '$40' },
      { title: '10-minute call', meta: 'Fully booked this week · opens Monday', price: '$120', disabled: true }
    ] }),
    cap('Who sees the answer'),
    h(Q.ModeList, { group: 'who-demo', legend: 'Who sees the answer', modes: [
      { title: 'Private', meta: 'Only you', price: '$25', selected: true },
      { title: 'Public', meta: "Maya's members can read it, and it may help her AI answer others", price: '$15' }
    ] }))""",
"""Radio rows for how Maya can answer a request, each with its promise and its fixed price in `data-md`.

## Props

- `modes`: a list of `{ title, meta, price, selected, disabled }`.
- `group`: a unique radio name.
- `legend`: for screen readers. Default "How Maya answers".

## When to use

In the step-in packet: once for "How" (each mode with its deadline and "{n} of {cap} left this week") and once for "Who sees the answer" (Private or Public, where public costs less). Before a fan chooses, the AI shows any public answer that already covers the question.

## Do and don't

- Do show one exact price per mode, its deadline or length, its refund rule and what is left this week.
- Do say why a mode is unavailable and when it opens.
- Don't write "from $", "per minute" or countdown urgency.
""", root='qv-stack qv-phone')

add('IncludeList', 'Requests', 420, r"""h(Q.IncludeList, { edited: true, summary: "My satin white crawls at the rim after a single dip at cone 6. I've tried thinning it. Could you look at my test tile and tell me what to change?", items: [
      { label: 'The last 10 messages and 1 photo', help: 'Maya sees them exactly as they are', checked: true },
      { label: 'The whole conversation', help: '46 messages since Sep 30' },
      { label: 'Your name and city', help: 'Otherwise Maya sees @kilnfire' }
    ] })""",
"""The packet editor, "Included in your request": a summary the AI drafted for the fan to edit, then checkboxes for exactly what Maya will see, then the fixed access notice. Nothing is shared through the request unless it is checked here.

## Props

- `summary`: the draft summary.
- `items`: a list of `{ label, help, checked }`.
- `edited`: shows "Edited by you".
- `notice`: `false` hides "Maya and her authorized team can separately review this AI conversation. Those accesses are logged." Keep it in every packet.

## When to use

In the step-in packet, after ModeList.

## Do and don't

- Do start with the summary and the last messages on, and the whole conversation and the fan's name and city off.
- Do mark the summary "Edited by you" once the fan changes it.
- Don't send anything the fan has not seen in this list.
""", root='qv-stack qv-phone')

add('TermsBlock', 'Requests', 240, r"""h(Q.TermsBlock, { price: '$25.00', deadline: '48 h' })""",
"""The fixed money copy under every request: what happens if Maya accepts, what happens if she declines or the deadline passes, and the bank-hold note. Money is one plain line.

## Props

- `price`: default "$25.00".
- `deadline`: default "48 h".
- `draftNote`: `false` hides "Maya may answer with her AI's draft; you'll see that label."
- `name`: default "Maya".

## When to use

Directly above the send button in every request, and on the request's status page.

## Do and don't

- Do keep every sentence: "Charged only when Maya accepts. If she declines or 48 h pass, nothing is charged." and "Your bank may show a pending hold for a few days."
- Don't shorten the terms into a tooltip.
""", root='qv-stack qv-phone')

add('EtaLine', 'Requests', 110, r"""h(React.Fragment, null,
    h(Q.EtaLine, null),
    h(Q.EtaLine, { range: '2 to 3 days', ahead: 3 }))""",
"""How long Maya usually takes to decide, always as a range ("Maya usually decides in 1 to 2 days"), with an optional count of requests ahead.

## Props

- `range`: default "1 to 2 days".
- `ahead`: the number of requests ahead.
- `name`: default "Maya".

## When to use

In the packet above TermsBlock, and on a pending request's status page.

## Do and don't

- Do use a range computed from her real history.
- Don't promise a reply ("Maya will reply"). She decides; she may pass.
""", root='qv-stack qv-phone')

add('RequestStatus', 'Requests', 420, r"""h(React.Fragment, null,
    h(Q.RequestStatus, { reqId: 'REQ-0412', mode: 'Written reply', price: '$25', steps: [
      { label: 'Sent · hold placed', time: 'OCT 3 14:02', state: 'done' },
      { label: 'Maya accepted · $25 charged', time: 'OCT 4 09:15', state: 'done' },
      { label: 'Maya is writing', state: 'current' },
      { label: 'Delivered', state: 'todo' }
    ] }),
    h(Q.RequestStatus, { reqId: 'REQ-0398', mode: 'Call', price: '$120', outcome: 'Maya passed on this one · nothing charged', steps: [
      { label: 'Sent · hold placed', time: 'SEP 30 18:40', state: 'done' },
      { label: 'Maya passed', time: 'OCT 1 10:02', state: 'done' }
    ] }))""",
"""A request's ID, mode and price, then its steps from sent to delivered, with the time of each. The money state is written into the steps.

## Props

- `reqId`, `mode`, `price`.
- `steps`: a list of `{ label, time, state }`, where `state` is `done`, `current` or `todo`.
- `outcome`: a closing line, such as "Maya passed on this one · nothing charged".
- `children`: follow-up content, such as a Receipt.

## When to use

On the Requests tab and on a request's detail page.

## Do and don't

- Do write declines gently and money first.
- Don't use `alert` for a decline or an expiry. Nothing went wrong.
""", root='qv-stack qv-phone')

add('Receipt', 'Requests', 420, r"""h(Q.Receipt, { reqId: 'REQ-0412', rows: [['Request', 'Written reply'], ['Accepted', 'Oct 4, 09:15'], ['Delivered', 'Oct 5, 18:40'], ['Charged', '$25.00'], ['Card', 'Visa ·· 4242']] })""",
"""A receipt that reads like a dated letter: a `display-lg` title, `data-sm` rows on dashed rules and the seal at the foot with the authorship line. Fans keep these.

## Props

- `reqId`, `title` (default "A written reply from Maya"), `rows` (label and value pairs).
- `label`: the authorship line, "Written by Maya" or "Prepared by AI · approved by Maya".
- `name`: default "Maya".

## When to use

After a request is delivered, from the request's page and from You › Receipts.

## Do and don't

- Do state the authorship exactly as the fan saw it in the thread.
- Don't show a receipt for a decline; show RequestStatus with "nothing charged".
""")

add('SpendLimit', 'Requests', 180, r"""h(Q.SpendLimit, null)""",
"""The monthly spend limit: a set of plain amounts, with reminders at 50% and 100%. Lowering is immediate; raising takes 24 hours.

## Props

- `options`: default "$30", "$60", "$120" and "No limit".

## When to use

In You › Spending, and offered once after a fan's first paid request.

## Do and don't

- Do keep the 24-hour delay on raising a limit.
- Don't nudge toward a higher amount or preselect "No limit".
""", root='qv-stack qv-phone')

# ---------------------------------------------------------------- Studio
add('QueueCard', 'Studio', 560, r"""h(React.Fragment, null,
    h(Q.QueueCard, { kind: 'packet', handle: '@kilnfire', mode: 'Written reply', price: '$25', due: 'DECIDE BY OCT 5 · 14:02', summary: 'Satin white crawls at the rim after a single dip at cone 6. Wants to know what to change.', shared: 'summary, 1 photo', draftReady: true }),
    h(Q.QueueCard, { kind: 'commitment', handle: '@wheelhouse', mode: 'Voice note', price: '$40', due: 'DUE OCT 11', summary: 'How you decide when a pot is done trimming.' }),
    h(Q.QueueCard, { kind: 'commitment', overdue: true, handle: '@glazedandconfused', mode: 'Written reply', price: '$25', due: 'OCT 2', summary: 'Recommend a first kiln for a garage studio.' }))""",
"""One item in Maya's queue: a new packet to decide, an accepted commitment to deliver, or a request that matched one of her rules. It shows the fan's handle, what they asked, what they shared and the deadline in mono.

## Props

- `kind`: `packet`, `commitment` or `rule`.
- `handle`, `mode`, `price`, `due` (uppercase mono), `summary`, `shared`.
- `draftReady`: shows "AI draft ready".
- `overdue`: the one place `alert` appears in the studio, always with the word "Overdue".

## When to use

In Studio › Requests, sorted by deadline.

## Do and don't

- Do keep "Decline · no charge" as a quiet action beside Open.
- Don't show the fan's spend history or rank fans by money.
""", root='qv-stack qv-phone')

add('CapacityHeader', 'Studio', 190, r"""h(Q.CapacityHeader, { rows: [{ mode: 'Written replies', used: 7, limit: 10 }, { mode: 'Voice notes', used: 2, limit: 4 }, { mode: 'Calls', used: 1, limit: 1 }], line: 'Your AI handled 212 conversations this week. 9 asked for you.' })""",
"""Maya's weekly capacity by mode, on her own surface at the top of her queue. When a mode is full, fans see it as unavailable with the day it opens.

## Props

- `rows`: a list of `{ mode, used, limit }`.
- `line`: one sentence with a count and a window, such as "Your AI handled 212 conversations this week. 9 asked for you."

## When to use

At the top of Studio › Requests and in the capacity settings.

## Do and don't

- Do show the same numbers the fan sees ("Maya answers written replies within 7 days · 3 of 10 left this week").
- Don't frame capacity as a target to hit.
""", root='qv-stack qv-phone')

add('LabelPreview', 'Studio', 130, r"""h(React.Fragment, null,
    h(Q.LabelPreview, { kind: 'approved_draft' }),
    h(Q.LabelPreview, { kind: 'human_creator' }))""",
"""Shows Maya exactly which label the fan will see before she sends: "Prepared by AI · approved by Maya" or "Maya".

## Props

- `kind`: the author kind the reply will carry.
- `name`: default "Maya".

## When to use

Above the send button in the studio reply editor, updating as she edits: once she rewrites the AI draft past the threshold, the label becomes hers.

## Do and don't

- Do show it before every send under her name.
- Don't let her choose a label that doesn't match how the reply was made.
""", root='qv-stack qv-phone')

add('SigningSheet', 'Studio', 420, r"""h(Q.SigningSheet, { title: 'Accept this request', rows: [['Request', 'REQ-0412 · @kilnfire'], ['Answer as', 'Written by Maya'], ['Fan is charged', '$25.00 on acceptance'], ['Due', 'Oct 11, 23:59']] })""",
"""The sheet where Maya reviews and signs an act made under her name: accepting a request, sending an approved draft, publishing a Note. Face ID signs exactly what the sheet shows.

## Props

- `title`: default "Accept this request".
- `rows`: label and value pairs.
- `action`: default "Sign with Face ID".

## When to use

Before any act that charges a fan or speaks as Maya. Team members can prepare, but only Maya signs.

## Do and don't

- Do say "Any change needs a new signature."
- Don't let a signature cover a batch of different items.
""")

add('AuditBanner', 'Studio', 120, r"""h(React.Fragment, null,
    h(Q.AuditBanner, null),
    h(Q.AuditBanner, null, "Priya is viewing this conversation. It's logged and visible to @kilnfire."))""",
"""The fixed notice that opening a fan's conversation is logged and visible to the fan. It keeps the studio honest about who reads what.

## Props

- `children`: default "Opening this conversation is logged and visible to the fan."

## When to use

At the top of any fan conversation opened from the studio, for Maya and her team.

## Do and don't

- Do keep it visible while the conversation is open.
- Don't allow dismissing it.
""", root='qv-stack qv-phone')

add('SourceRow', 'Studio', 330, r"""h(React.Fragment, null,
    h(Q.SourceRow, { title: 'Glazing 101', meta: 'YouTube playlist · approved Sep 12', scope: 'public', state: 'approved' }),
    h(Q.SourceRow, { title: 'Kiln Club library', meta: '42 documents · approved Sep 12', scope: 'Kiln Club', state: 'approved' }),
    h(Q.SourceRow, { title: 'Instagram captions, last 90 days', meta: 'Found · not used until you approve', scope: 'public', state: 'candidate' }),
    h(Q.SourceRow, { title: 'Studio tour, spring 2025', meta: 'Revoked Sep 20', scope: 'public', state: 'revoked' }))""",
"""One knowledge source for Maya's AI, with its scope (who can hear answers drawn from it) and the approve, revoke or restore action.

## Props

- `title`, `meta`.
- `scope`: "public" or a tier name such as "Kiln Club".
- `state`: `approved`, `candidate` or `revoked`.

## When to use

In Studio › My AI › What it knows.

## Do and don't

- Do say that candidates are "not used until you approve".
- Don't use a source for any fan outside its scope.
""", root='qv-stack qv-phone')

# ---------------------------------------------------------------- Controls
add('Button', 'Controls', 200, r"""h(React.Fragment, null,
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' } },
      h(Q.Button, { variant: 'ai' }, "Message Maya's AI"),
      h(Q.Button, { variant: 'maya' }, 'Ask Maya to step in'),
      h(Q.Button, { variant: 'secondary' }, 'View request'),
      h(Q.Button, { variant: 'quiet' }, 'Not now'),
      h(Q.Button, { variant: 'secondary', disabled: true }, 'Fully booked')),
    h('div', { style: { maxWidth: 390, display: 'flex', flexDirection: 'column', gap: 10 } }, h(Q.Button, { variant: 'maya', size: 'lg', block: true }, 'Send request · $25 if accepted'), h(Q.Button, { variant: 'secondary', size: 'lg', block: true }, 'Continue with Pantopus')))""",
"""Buttons. `ai` (an `ai-ink` fill) and `maya` (her plate and seal) belong to their authors; `secondary` (a `control-line` outline) and `quiet` (text) are neutral.

## Props

- `variant`: `ai`, `maya`, `secondary` or `quiet`.
- `size`: `lg` for a 48px (`space-12`) primary.
- `block`: full width.
- `href`: renders a link.
- `initial`: the seal's letter for `maya`.
- `disabled`: keep the label and put the reason beside the button.

## When to use

One accent action per screen. In a thread, `maya` appears once, as the step-in button, and every other primary action belongs to the AI or is neutral. In the step-in packet, the large `maya` button sends the request to her.

## Do and don't

- Do write the verb first, in sentence case: "Send request · $25 if accepted".
- Do use a large `secondary` block for "Continue with Pantopus", the one sign-in for every Pantopus app. Set the word in plain type; there is no mark to draw.
- Don't use `maya` for marketing, joining or anything that is not made by Maya or addressed to her.
- Don't use exclamation marks.
""")

add('TabBar', 'Controls', 170, r"""h(React.Fragment, null,
    h(Q.TabBar, { active: 'Home' }),
    h(Q.TabBar, { active: 'Requests' }))""",
"""The fan app's four tabs: Home, Discover, Requests and You. Notifications sit behind the bell on Home.

## Props

- `active`: `Home`, `Discover`, `Requests` or `You`.

## When to use

At the bottom of every top-level fan screen. Hide it inside threads and sheets.

## Do and don't

- Do keep four tabs, with labels always visible.
- Don't add a Chat tab; threads live under a creator.
""", root='qv-stack qv-phone')

add('Segmented', 'Controls', 150, r"""h(React.Fragment, null,
    h(Q.Segmented, { active: 'Chat' }),
    h(Q.Segmented, { items: ['Waiting', 'Accepted', 'Done'], active: 'Accepted', label: 'Request status' }))""",
"""A segmented switcher for sections of one page, such as a creator's Chat, Posts, Requests and Access.

## Props

- `items`: the labels. Default Chat, Posts, Requests, Access.
- `active`: the current item.
- `label`: the navigation's accessible name.

## When to use

For two to four peer sections. Use tabs for app-level navigation instead.

## Do and don't

- Do keep labels to one word where possible.
- Don't put counts or badges in segments.
""", root='qv-stack qv-phone')

add('Notice', 'Controls', 380, r"""h(React.Fragment, null,
    h(Q.Notice, { tone: 'neutral' }, 'Official means Maya authorized this AI. It does not mean she read your message.'),
    h(Q.Notice, { tone: 'neutral', title: 'Maya is away until Oct 14' }, 'Her AI keeps answering. Requests open again when she is back.'),
    h(Q.Notice, { tone: 'paused', title: "Maya's AI is paused" }, 'Back Monday. Requests still work.'),
    h(Q.Notice, { tone: 'error', title: 'Your card was declined' }, 'Nothing was charged. Update your card to send this request.'),
    h(Q.Notice, { tone: 'offline', title: "You're offline" }, 'Messages you write now are sent when you reconnect.'))""",
"""An inline notice with a tone, a title and one sentence. Every notice says what happened and what, if anything, the person can do.

## Props

- `tone`: `neutral`, `paused`, `error` or `offline`.
- `title`, `children`.

## When to use

At the top of a screen or above the composer, for states that affect what the person can do right now.

## Do and don't

- Do lead with money when money is involved: "Nothing was charged."
- Don't use `error` for a decline, an expiry or a paused AI.
- Don't write "Oops" or "failed".
""", root='qv-stack qv-phone')

add('NotificationRow', 'Controls', 560, r"""h('div', { className: 'qv-phone' },
    h(Q.NotificationRow, { kind: 'maya', time: '14:38', unread: true }, 'Single dip, count to three, and let it drip off.'),
    h(Q.NotificationRow, { kind: 'reaction', time: '14:40', unread: true }, 'Trying it tonight.'),
    h(Q.NotificationRow, { kind: 'approved', time: 'OCT 4' }, 'Thin the glaze to 1.45 specific gravity and wipe the top 5 mm.'),
    h(Q.NotificationRow, { kind: 'note', time: 'OCT 3' }, 'Opened the kiln this morning. The new celadon test came out the color of shallow water.'),
    h(Q.NotificationRow, { kind: 'ai', time: 'OCT 3' }, "Here's the dipping video you asked about."),
    h(Q.NotificationRow, { kind: 'team', time: 'OCT 2' }, "Your seat for Saturday's glazing workshop is confirmed."),
    h(Q.NotificationRow, { kind: 'system', time: 'OCT 4' }, 'Maya accepted your request · REQ-0412'))""",
"""One row in the notifications list, carrying its author's mark and word so the list is as honest as the thread. The same words appear in push notifications.

## Props

- `kind`: `ai`, `maya`, `note`, `approved`, `reaction`, `team` or `system`.
- `children`: the preview text.
- `time`, `unread`.
- `audience`: for a Note. `systemLabel`: for `system` (default "Request update").
- `name`: default "Maya".

## When to use

In Notifications, behind the bell on Home.

## Do and don't

- Do label Notes "Maya · to Kiln Club members", never "Maya messaged you".
- Don't use Maya's seal for AI or team rows.
- Don't put a price in a request-status notification; the status word and the creator's name are enough.
""", root='')

add('EmptyState', 'Controls', 280, r"""h(React.Fragment, null,
    h(Q.EmptyState, { title: 'No requests yet', body: 'When you ask Maya to step in, the request and its receipt live here.', action: h(Q.Button, { variant: 'secondary' }, 'Find a creator') }),
    h(Q.EmptyState, { title: 'Nothing waiting', body: 'Your AI is handling it. New requests appear here, with what each fan chose to share.' }))""",
"""An empty list: a `display-md` title saying what will appear here, one sentence and at most one way forward.

## Props

- `title`, `body`, `action` (one Button).

## When to use

For any list that can be empty: Requests, Notifications, the studio queue, receipts.

## Do and don't

- Do say what will appear here, in plain words.
- Don't use illustrations, Maya's surface or her seal in empty states.
""", root='qv-stack qv-phone')


# ---------------------------------------------------------------- Added after the inventory check
add('CallChip', 'Identity', 120, r"""h(React.Fragment, null,
    h(Q.CallChip, { time: '08:42', end: '10:00' }),
    h(Q.CallChip, { time: '02:10', end: '10:00', recording: true }))""",
"""The chip pinned for the whole of a live call: Maya's lit seal and "Maya · the person" on her surface, the recording state beside it and the connected time counting to the fixed end. It is the call's identity strip.

## Props

- `time`: connected time, such as "08:42".
- `end`: the fixed end, such as "10:00".
- `recording`: only when both people agreed to a recording. Default: "Not recording".
- `name`: default "Maya".

## When to use

On the call screen from connect to leave, and at the top of the post-call summary.

## Do and don't

- Do show "Not recording" whenever nothing is recorded.
- Don't show an overtime charge. Calls end at their fixed length, and a dropped connection pauses the timer for up to 3 minutes in total.
- Don't use this chip anywhere except a live call with the person.
""", root='qv-stack qv-phone')

add('ReservedLabel', 'Identity', 200, r"""h(React.Fragment, null,
    h(Q.ReservedLabel, { kind: 'fan_agent' }),
    h(Q.ReservedLabel, { kind: 'ai_call' }),
    h(Q.ReservedLabel, { kind: 'ai_video' }))""",
"""A reserved authorship state, drawn but disabled: a fan's own assistant ("@kilnfire's assistant"), an AI call ("Maya's AI · call") and an AI video ("Maya's AI · video"). The system keeps a word, a mark and a place for each so they can never be confused with Maya or her AI. None is shown to fans until it is enabled.

## Props

- `kind`: `fan_agent`, `ai_call` or `ai_video`.
- `handle`: for `fan_agent`. Default "@kilnfire".
- `name`: default "Maya".

## When to use

Only in specifications and planning. Never on a fan surface.

## Do and don't

- Don't reuse these marks for anything else.
- Don't enable a reserved state without designing its surface, strip and notification wording first.
""", root='qv-stack qv-phone')

add('Countdown', 'Requests', 90, r"""h('div', { className: 'qv-row', style: { padding: 0 } },
    h(Q.Countdown, null, 'Free conversation · 18 h left'),
    h(Q.Countdown, { tone: 'soon' }, 'Decide by Oct 5 · 14:02'),
    h(Q.Countdown, { tone: 'soon' }, 'Call starts in 04:12'),
    h(Q.Countdown, { tone: 'overdue' }, '2 days'))""",
"""A mono pill for time that matters: what is left of a free conversation, a decision deadline, a call about to start or an overdue commitment. It informs and never pressures.

## Props

- `tone`: `neutral`, `soon` or `overdue` (prefixes "OVERDUE ·" and uses `alert`).
- `children`: the text, set in uppercase `data-sm`.

## When to use

In the composer during a free conversation, on request status, in the call waiting room and on studio queue cards.

## Do and don't

- Do use `overdue` only for Maya's own late commitments in the studio.
- Don't use a countdown to push a purchase or a membership.
- Don't show seconds except in a call's waiting room.
""")

add('InsteadMenu', 'Studio', 380, r"""h(Q.InsteadMenu, null)""",
"""The actions behind "Instead" on a packet. None of them fulfills the mode the fan paid for, so none charges the fan: let the AI answer, convert to a group answer, ask for more information or decline.

## Props

- `items`: title and explanation pairs. Default: the four fixed actions.
- `name`: default "Maya".

## When to use

In the packet detail, below the actions that fulfill the promised mode (Reply myself, Review and send, Record, Offer times). For a team member, add "Reply as team" here; it can never fulfill a personal mode.

## Do and don't

- Do keep "Decline · no charge" last and neutral. Declining never counts against Maya.
- Don't give any Instead action the visual weight of the fulfilling actions.
""", root='qv-stack qv-phone')

add('TestConsole', 'Studio', 560, r"""h(Q.TestConsole, { version: 'V5 DRAFT', versionShort: 'v5', tests: [
      { name: 'Identity disclosure', state: 'pass' },
      { name: 'Out of scope', state: 'pass' },
      { name: 'Restricted-source probe', state: 'pass' },
      { name: 'Unsupported opinion', state: 'pass' },
      { name: 'Never-reveal probe', state: 'fail' },
      { name: 'Instruction override', state: 'pass' }
    ], transcript: { test: 'Never-reveal probe', fan: "Which town is Maya's studio in? I want to visit.", ai: "Maya's studio is in Hood River, next to the old cannery.", why: 'Your never-reveal list includes the studio location. Remove the source that mentions it or add a rule, then run the tests again.' } })""",
"""The boundary tests a draft version must pass before it can be published: identity disclosure, out of scope, restricted-source probe, unsupported opinion, never-reveal probe and instruction override, plus every case Maya filed. A failing case shows its transcript and what to change.

## Props

- `tests`: a list of `{ name, state }`, where `state` is `pass`, `fail` or `running`.
- `version`, `versionShort`: "V5 DRAFT" and "v5".
- `transcript`: `{ test, fan, ai, why }` for the case being read.

## When to use

In Studio › My AI › Test, and before every publish. After the tests, Maya can chat with the draft as a fan.

## Do and don't

- Do keep Publish disabled while any test fails, and name the failing case beside it.
- Don't hide passing tests; the full list is the record.
""", root='qv-stack', )

add('VersionList', 'Studio', 300, r"""h(Q.VersionList, { versions: [
      { id: 'v5', state: 'draft', date: 'EDITED SEP 24', changes: 'Adds the Kiln Club library · gentler tone on critiques' },
      { id: 'v4', state: 'live', date: 'PUBLISHED SEP 12', changes: 'Adds your October glaze videos' },
      { id: 'v3', state: 'retired', date: 'PUBLISHED SEP 2', changes: 'Never-reveal list: the studio location' },
      { id: 'v2', state: 'retired', date: 'PUBLISHED AUG 20', changes: 'First style card from your replies' }
    ] })""",
"""The AI's versions, newest first, with what changed, the live pointer and rollback. One version is live at a time.

## Props

- `versions`: a list of `{ id, state, date, changes }`, where `state` is `draft`, `live` or `retired`.

## When to use

In Studio › My AI › Versions.

## Do and don't

- Do say what changed in plain words, one line per version.
- Do let Maya roll back to any retired version in one step; it goes live again without re-testing.
- Don't show a version's internal prompt text here.
""", root='qv-stack qv-phone')

add('DigestItem', 'Studio', 330, r"""h(React.Fragment, null,
    h(Q.DigestItem, { handle: '@kilnfire', time: '14:32' }, 'Crawling usually means the coat is too thick. Try a single dip and count to three.'),
    h(Q.DigestItem, { handle: '@wheelhouse', time: '09:05', filed: true }, 'Honestly, most commercial glazes are a waste of money.'))""",
"""One AI reply in the 72-hour digest that follows every publish, newest first, with "I'd never say that" on each. Flagging a reply opens a one-line rule and files it as a test case.

## Props

- `children`: the AI's reply.
- `handle`, `time`, `name`.
- `filed`: the reply was flagged and filed.

## When to use

In the studio for 72 hours after a version goes live, and on each AI message in the studio's read-only thread view.

## Do and don't

- Do keep the AI's label on every reply; this is the AI's work under review, not Maya's.
- Don't let the digest edit what the fan already received. Corrections are signed separately.
""", root='qv-stack qv-phone')

add('StudioTabBar', 'Navigation', 170, r"""h(React.Fragment, null,
    h(Q.StudioTabBar, { active: 'Requests', requests: 3 }),
    h(Q.StudioTabBar, { active: 'My AI', requests: 3 }))""",
"""The studio's phone tabs: Notes, Requests, Threads, My AI and More. More holds Offers, Publish, Insights, Earnings and Team.

## Props

- `active`: the current tab.
- `requests`: the number of waiting packets and due commitments.

## When to use

At the bottom of every top-level studio screen on a phone. Use Sidebar on desktop.

## Do and don't

- Do count only what needs Maya: packets to decide and commitments due.
- Don't badge Threads with conversation counts. The AI handling fans is not a to-do.
""", root='qv-stack qv-phone')

add('Sidebar', 'Navigation', 640, r"""h(Q.Sidebar, { active: 'Requests', requests: 3 })""",
"""The studio's desktop sidebar: Maya's monogram and "Qelvora Studio", the four phone sections, then Offers, Publish, Insights, Earnings and Team, with the live version at the foot.

## Props

- `active`, `requests`, `name`.
- `status`: default "Your AI is live · v4".

## When to use

On desktop and tablet widths, where Maya does the longer work: My AI and Insights.

## Do and don't

- Do keep the section order the same as the phone tabs.
- Don't add a second navigation level here; sections open their own tabs.
""", root='')

add('Sheet', 'Controls', 560, r"""h(Q.Sheet, { meta: 'Ask Maya to step in', title: 'Included in your request', actions: h(Q.Button, { variant: 'maya', size: 'lg', block: true }, 'Send request · $25 if accepted') },
    h('p', null, 'Your summary, the last 10 messages and 1 photo. Nothing else from this conversation is included.'),
    h(Q.TermsBlock, null))""",
"""A bottom sheet: a grabber, an optional meta line, a `display-lg` title, a body and stacked actions, lifted with `shadow-sheet`.

## Props

- `title`, `meta`, `children`.
- `actions`: one primary action, with a quiet secondary under it if needed.

## When to use

For focused tasks that return to where they started: the step-in packet, checkout, the spend limit, memory details.

## Do and don't

- Do keep one primary action.
- Don't stack sheets on sheets. Replace the content instead.
""")

add('Dialog', 'Controls', 260, r"""h(Q.Dialog, { title: 'Delete this conversation?', confirm: 'Delete conversation', cancel: 'Keep it', destructive: true },
    h('p', null, "Your messages with Maya's AI and what it remembers from them are deleted everywhere."),
    h('p', { className: 'qv-help' }, 'What you shared in requests, and what Maya delivered, is kept for 12 months in case of a dispute, then deleted.'))""",
"""A confirmation for a consequential, hard-to-undo action: a title that asks the question, what happens, and two buttons whose labels say what they do.

## Props

- `title`, `children`.
- `confirm`, `cancel`: verb-first labels, such as "Delete conversation" and "Keep it".
- `destructive`: marks the action for assistive tech; the style stays neutral.

## When to use

Deleting a conversation, memory or account; revoking a source; leaving a call early.

## Do and don't

- Do state any exception in the dialog itself, such as the 12-month retention of request records.
- Don't color the destructive button red; the verb carries the weight.
- Don't use a dialog to confirm routine actions.
""")

add('Toast', 'Controls', 200, r"""h(React.Fragment, null,
    h(Q.Toast, { action: 'View' }, 'Request sent · nothing is charged until Maya accepts'),
    h(Q.Toast, { action: 'Undo' }, "Remembered · Maya's AI will use this"),
    h(Q.Toast, null, 'Link copied'))""",
"""A short confirmation that something happened, with at most one action. It sits flat on `surface` with a `control-line` border and leaves on its own after 4 seconds.

## Props

- `children`: one line.
- `action`: one verb, such as "View" or "Undo".

## When to use

After an action whose result is not otherwise visible: a request sent, a memory saved, a link copied.

## Do and don't

- Do lead with the money state when money is involved.
- Don't use toasts for errors that need action; use Notice.
- Don't use Maya's surface or seal in a toast.
""", root='qv-stack qv-phone')

add('Skeleton', 'Feedback', 230, r"""h(React.Fragment, null,
    h(Q.Skeleton, { kind: 'message' }),
    h(Q.Skeleton, { kind: 'row' }),
    h(Q.Skeleton, { kind: 'row' }))""",
"""Loading placeholders in `line`, shaped like what is coming, shown only after 300 ms. They pulse only when motion is allowed.

## Props

- `kind`: `message` or `row`.

## When to use

For threads, lists and the queue while their first page loads.

## Do and don't

- Do keep the identity strip and header visible while the thread loads; who is speaking is never loading.
- Don't use the fan's `surface-sunken` or any author's color in a skeleton.
""", root='qv-stack qv-phone')

add('EmailFrame', 'Feedback', 900, r"""h(React.Fragment, null,
    h(Q.EmailFrame, { kind: 'human_creator', subject: 'Maya replied to your request', time: 'OCT 5', cta: 'Read the whole reply' }, "I looked at your test tile. That crawl is the rim, not the recipe."),
    h(Q.EmailFrame, { kind: 'approved_draft', subject: 'A reply approved by Maya', time: 'OCT 4', cta: 'Read the reply' }, 'Thin the glaze to 1.45 specific gravity and wipe the top 5 mm before firing.'))""",
"""The email layout: the sender label set by the product, the same author label as the app, a preview that respects restrictions, and one link back. Maya's words keep her plate and serif in email too.

## Props

- `kind`: the author, as in AuthorLabel.
- `subject`, `children` (the first line only), `time`, `cta`, `footer`.
- `from`: default "Maya via Qelvora" for her replies and "Qelvora" otherwise.

## When to use

For the fan's weekly digest, the creator's daily digest, request updates and delivered replies, following the notification table's sender labels.

## Do and don't

- Do use "Maya replied" only for her own replies and calls; approved drafts say "Approved by Maya".
- Don't put a price in a request-status email subject or a restricted text in any preview.
- Don't send an email that starts a conversation from the AI.
""", root='qv-stack')

GROUPS = {'TabBar': 'Navigation', 'Segmented': 'Navigation', 'Notice': 'Feedback', 'NotificationRow': 'Feedback', 'EmptyState': 'Feedback'}

# Heights measured from headless renders of every preview (px, rounded up).
HEIGHTS = {'AccessLines': 180, 'AuditBanner': 150, 'AuthorLabel': 360, 'Avatar': 80, 'Button': 230, 'CallChip': 210, 'CapacityHeader': 200, 'CitationChip': 230, 'Composer': 1390, 'ContextCard': 180, 'Correction': 240, 'Countdown': 70, 'Dialog': 300, 'DigestItem': 340, 'EmailFrame': 930, 'EmptyState': 440, 'EtaLine': 90, 'IdentityStrip': 340, 'IncludeList': 470, 'InsteadMenu': 380, 'LabelPreview': 190, 'Mark': 190, 'MemoryChip': 270, 'Message': 2100, 'ModeList': 500, 'Note': 820, 'Notice': 500, 'NotificationRow': 600, 'QueueCard': 600, 'ReactionChip': 170, 'Receipt': 430, 'RequestStatus': 420, 'ReservedLabel': 310, 'Seal': 90, 'Segmented': 150, 'ShareCard': 380, 'Sheet': 540, 'Sidebar': 610, 'SignedMarker': 140, 'SigningSheet': 460, 'Skeleton': 290, 'SourceRow': 390, 'SpendLimit': 260, 'StepIn': 170, 'StudioTabBar': 220, 'SystemLine': 170, 'TabBar': 220, 'TermsBlock': 250, 'TestConsole': 570, 'ThreadHeader': 270, 'Toast': 240, 'VersionList': 350, 'VoiceNote': 420}


def main():
    for name, group, height, root, pre, expr, readme in C:
        d = os.path.join(ROOT, name)
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, 'README.md'), 'w') as f:
            f.write('# ' + name + '\n\n' + readme.strip() + '\n')
        root_cls = ' class="%s"' % root if root else ''
        html = TEMPLATE.format(group=GROUPS.get(name, group), height=HEIGHTS.get(name, height), name=name, root_cls=root_cls, pre=pre, expr=expr)
        assert '</script' not in expr and '<!--' not in expr, name
        with open(os.path.join(d, 'preview.html'), 'w') as f:
            f.write(html)
    print(len(C), 'components written')


if __name__ == '__main__':
    main()
