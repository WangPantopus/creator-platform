# SystemLine

A centered line that announces a change of speaker, a date or an event in the thread. No change of speaker is ever silent.

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
