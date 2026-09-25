# ModeList

Radio rows for how Maya can answer a request, each with its promise and its fixed price in `data-md`.

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
