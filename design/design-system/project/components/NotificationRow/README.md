# NotificationRow

One row in the notifications list, carrying its author's mark and word so the list is as honest as the thread. The same words appear in push notifications.

## Props

- `kind`: `ai`, `maya`, `note`, `approved`, `reaction`, `team` or `system`.
- `children`: the preview text.
- `time`, `unread`.
- `audience`: for a Note. `systemLabel`: for `system` (default "Request update").
- `name`: default "Maya".

## When to use

In Notifications, behind the bell on Home.

## Do and don't

- Do label Notes "Maya · to Kiln Club members", never "Maya messaged you".
- Don't use Maya's seal for AI or team rows.
- Don't put a price in a request-status notification; the status word and the creator's name are enough.
