# InsteadMenu

The actions behind "Instead" on a packet. None of them fulfills the mode the fan paid for, so none charges the fan: let the AI answer, convert to a group answer, ask for more information or decline.

## Props

- `items`: title and explanation pairs. Default: the four fixed actions.
- `name`: default "Maya".

## When to use

In the packet detail, below the actions that fulfill the promised mode (Reply myself, Review and send, Record, Offer times). For a team member, add "Reply as team" here; it can never fulfill a personal mode.

## Do and don't

- Do keep "Decline · no charge" last and neutral. Declining never counts against Maya.
- Don't give any Instead action the visual weight of the fulfilling actions.
