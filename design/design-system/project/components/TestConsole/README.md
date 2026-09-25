# TestConsole

The boundary tests a draft version must pass before it can be published: identity disclosure, out of scope, restricted-source probe, unsupported opinion, never-reveal probe and instruction override, plus every case Maya filed. A failing case shows its transcript and what to change.

## Props

- `tests`: a list of `{ name, state }`, where `state` is `pass`, `fail` or `running`.
- `version`, `versionShort`: "V5 DRAFT" and "v5".
- `transcript`: `{ test, fan, ai, why }` for the case being read.

## When to use

In Studio › My AI › Test, and before every publish. After the tests, Maya can chat with the draft as a fan.

## Do and don't

- Do keep Publish disabled while any test fails, and name the failing case beside it.
- Don't hide passing tests; the full list is the record.
