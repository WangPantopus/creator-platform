# Composer

The pinned bottom of a thread: the step-in button, then the message field, in every access state. It always says whom the fan is writing to: the placeholder reads "Message Maya's AI" or, while she is present, "Reply to Maya".

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
