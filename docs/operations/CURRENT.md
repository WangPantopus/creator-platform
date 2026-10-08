# Current state

Written 2026-10-08, after the launch review. Update this file at the end of every work
session; it replaces the long handoffs as the place to start. Approvals come from the
founder in the chat, never from a file.

## Where things stand

- Main was at `95abce43c` when this was written. No pull requests were open: #351, #352 and
  #353 (comparison export reference, creator upgrade evidence, view lifetime) merged the same
  day.
- Only the development host runs the product. A non-development backend serves health and
  nothing else, and no Pantopus identity adapter exists (Q01).
- Comparison is installed and off: leave `TRUST_DEVELOPMENT_COMPARISON_POLICY` unset. Its
  migrations stay because export and delete are composed from them.
- The development scenario (fictional Maya, synthetic OpenAI configuration) is
  development-only and not a production approval.

## Plan

[LAUNCH_PLAN](../LAUNCH_PLAN.md) sets scope and order: five moments, phone apps first, the
share card in, everything else planned for later. The evidence behind it, with file
references and sizes, is the [launch review](launch-review-2026-10-08.md).

Next, in order:

1. Finish step 0: withdraw-only mode with retry for comparison, an overdue-purge alert and a
   short runbook; then stop comparison work.
2. Step 1: a production host with a real identity adapter, and phone builds that can sign in.
   Blocked on the inputs below.
3. Steps 2 to 5 in parallel once step 1 has a host.

## Needed from the founder

- The Pantopus sign-in contract (Q01), or a decision to start with an interim sign-in.
- The final domain and relying-party ID (Q09).
- Apple Developer and Google Play accounts, and at least one iPhone and one Android phone.
- Stripe test-mode keys and the account topology (Q03).
- A Touch ID ceremony for the development creator and the creator verification approval.
- Counsel on paid replies in the apps (Q04).
- Three to five pilot creators and a named reviewer for Note replies and safety cases.

## Dates

- 2026-10-30 08:48:22.966 UTC: the preserved original deletion matures (the real expiry purge
  acceptance).
- 2026-11-01: the development comparison authority window and the development reply-feedback
  policy end; the docs record this as the end of the Google Play target-level extension too
  (verify in Play Console).

## Rules that still hold

- Never reset used databases or devices, rewrite publication fingerprints or applied SQL,
  invent consent, advance clocks, or settle unknown financial costs without receipts.
- `infra/migrations.json` is edited only by W8. Expect a new migration to change the pinned
  catalogue checksums (inferred, [review](launch-review-2026-10-08.md) section 3): export and
  delete would refuse to run until the catalogues are regenerated and reviewed.
- Heavy native builds run one at a time under `scripts/with-heavy-build-lock.mjs`.
- Evidence: at most 1 MB per pull request and 300 KB per file under `artifacts/`: a README, a
  manifest (path, sha256, bytes) and at most five screenshots that carry a decision. Raw logs,
  bundles and patches stay outside git. Never commit home paths or environment-file locations.

## History

Evidence, not instructions: the [October 8 handoff](session-handoff-2026-10-08.md), the
[immediate handoff](session-handoff-2026-10-08-immediate.md), the [finish
plan](product-finish-plan-2026-10-08.md) and the [checkpoint](project-continuation-2026-10-07.md).
