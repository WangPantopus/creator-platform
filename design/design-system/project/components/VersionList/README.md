# VersionList

The AI's versions, newest first, with what changed, the live pointer and rollback. One version is live at a time.

## Props

- `versions`: a list of `{ id, state, date, changes }`, where `state` is `draft`, `live` or `retired`.

## When to use

In Studio › My AI › Versions.

## Do and don't

- Do say what changed in plain words, one line per version.
- Do let Maya roll back to any retired version in one step; it goes live again without re-testing.
- Don't show a version's internal prompt text here.
