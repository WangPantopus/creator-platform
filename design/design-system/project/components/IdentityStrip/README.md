# IdentityStrip

The strip under the thread header that says who reads the fan's next message. It never scrolls away, and it changes within 500 ms whenever the speaker changes.

## Props

- `state`: `ai` ("You're talking to Maya's AI · Maya steps in on request"), `human` ("Maya is here"), `team` ("Maya's team is here"), `paused` or `updating`.
- `name`: default "Maya".

## When to use

In every thread, directly under ThreadHeader, pinned at `z-strip`. It is a `status` region, so screen readers announce each change.

## Do and don't

- Do announce the same change with a SystemLine in the thread.
- Do use the `human` state only while Maya is actually present. It turns on her surface and the house lights.
- Don't hide the strip on scroll, in landscape or at large text sizes.
