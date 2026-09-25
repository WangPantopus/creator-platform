# IncludeList

The packet editor, "Included in your request": a summary the AI drafted for the fan to edit, then checkboxes for exactly what Maya will see, then the fixed access notice. Nothing is shared through the request unless it is checked here.

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
