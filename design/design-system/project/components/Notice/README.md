# Notice

An inline notice with a tone, a title and one sentence. Every notice says what happened and what, if anything, the person can do.

## Props

- `tone`: `neutral`, `paused`, `error` or `offline`.
- `title`, `children`.

## When to use

At the top of a screen or above the composer, for states that affect what the person can do right now.

## Do and don't

- Do lead with money when money is involved: "Nothing was charged."
- Don't use `error` for a decline, an expiry or a paused AI.
- Don't write "Oops" or "failed".
