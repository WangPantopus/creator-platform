# CitationChip

A source Maya's AI used, shown inside its panel and linking to the source: a stamp, a title and a meta line. Citations let the fan check the AI against Maya's own material.

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
