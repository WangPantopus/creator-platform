# Mark

The authorship mark: the glyph that says which author wrote what follows before a single word is read. Each author has exactly one mark: a ring with a center dot for Maya's AI, a filled seal with her initial for Maya, the ring and seal overlapping for an approved draft, a seal with broadcast arcs for a Note, a heart for a reaction, a dashed square for her team and a folded card for a correction.

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
