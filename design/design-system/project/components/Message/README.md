# Message

One message in a thread, drawn with its author's four cues. The fan's messages sit right on `surface-sunken`; the AI's on its `ai-surface` panel with the ring and "Maya's AI"; Maya's on her plate in `voice-lg` with the Signed marker; approved drafts split the AI's panel over her band; the team's on `team-surface`.

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
