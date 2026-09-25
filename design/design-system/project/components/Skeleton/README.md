# Skeleton

Loading placeholders in `line`, shaped like what is coming, shown only after 300 ms. They pulse only when motion is allowed.

## Props

- `kind`: `message` or `row`.

## When to use

For threads, lists and the queue while their first page loads.

## Do and don't

- Do keep the identity strip and header visible while the thread loads; who is speaking is never loading.
- Don't use the fan's `surface-sunken` or any author's color in a skeleton.
