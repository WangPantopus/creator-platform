# Toast

A short confirmation that something happened, with at most one action. It sits flat on `surface` with a `control-line` border and leaves on its own after 4 seconds.

## Props

- `children`: one line.
- `action`: one verb, such as "View" or "Undo".

## When to use

After an action whose result is not otherwise visible: a request sent, a memory saved, a link copied.

## Do and don't

- Do lead with the money state when money is involved.
- Don't use toasts for errors that need action; use Notice.
- Don't use Maya's surface or seal in a toast.
