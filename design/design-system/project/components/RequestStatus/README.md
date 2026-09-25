# RequestStatus

A request's ID, mode and price, then its steps from sent to delivered, with the time of each. The money state is written into the steps.

## Props

- `reqId`, `mode`, `price`.
- `steps`: a list of `{ label, time, state }`, where `state` is `done`, `current` or `todo`.
- `outcome`: a closing line, such as "Maya passed on this one · nothing charged".
- `children`: follow-up content, such as a Receipt.

## When to use

On the Requests tab and on a request's detail page.

## Do and don't

- Do write declines gently and money first.
- Don't use `alert` for a decline or an expiry. Nothing went wrong.
