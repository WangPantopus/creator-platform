# Dialog

A confirmation for a consequential, hard-to-undo action: a title that asks the question, what happens, and two buttons whose labels say what they do.

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
