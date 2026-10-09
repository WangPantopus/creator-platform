# Current state

Written 2026-10-08. Update this file at the end of every work session; it replaces the long
handoffs as the place to start and is meant to answer two questions: what is being worked on
right now, and what remains. Approvals come from the founder in the chat, never from a file.

## Where things stand

- Only the development host runs the product. A non-development backend serves only health,
  the OpenAPI document and identity capabilities, and no production identity adapter exists.
- **Pantopus is not an OAuth provider and has no verified 18+ signal** (researched 2026-10-08),
  so sign-in is a bigger piece of work than client registration. Options and seven decisions:
  [identity contract](pantopus-identity-contract.md).
- Comparison is installed and off: leave `TRUST_DEVELOPMENT_COMPARISON_POLICY` unset. Its
  migrations stay because export and delete are composed from them.
- The development scenario (fictional Maya, synthetic OpenAI configuration) is
  development-only and not a production approval.
- A JDK 17 and XcodeGen are installed on the founder's Mac under `~/.local/tooling` (checksums
  verified), so Android and iOS build here. On current main, Android assemble, unit tests,
  Paparazzi verification and Lint pass, and the iOS app builds with its privacy manifest in
  the bundle.

## In flight

- **The seven lanes** are approved ([docs/lanes](../lanes/README.md)). The briefing pack
  (charter, working agreement, contracts, coverage, one brief per lane) is in review. After the
  founder approves it, each lane starts with a plan-only read-back, then works one pull request at
  a time; the integrator merges in batches.
- **Main's CI** for the merged work: the macOS jobs run slowly on one runner, and every merge
  to main cancels the run in progress. Merges are therefore batched.
- **Done today:** the money tests (100, five defects found and fixed), Android Lint fixes, the
  Pantopus identity research, and option A for the apps.
- **Waiting on the founder:** the Q01 decisions below, then hosting and domain.

## Plan to completion

[LAUNCH_PLAN](../LAUNCH_PLAN.md) sets scope and order: five moments, phone apps first, the
share card in, everything else planned for later. The evidence is the
[launch review](launch-review-2026-10-08.md).

| Step | Work | State | Waiting on |
| --- | --- | --- | --- |
| 0 | Clear the deck | Merges, docs and evidence policy done. Comparison withdraw-only mode, overdue-purge alert and runbook not started (they do not affect launch while the flag is off) | nothing |
| 1 | A real host on real phones | Store hygiene started (privacy manifest, Android fixes). Sign-in, production composition, domain, push, store accounts not started | Q01 decisions, accounts, domain |
| 2 | First answer: speed, guard, FAQ publish check, entry links, provider switch | Not started. The guard fixes ship with the provider switch as the next engine revision | provider and embedding decision |
| 3 | Remembered, and the person shows up | Fans can read members and tier Notes (not operated). Memory wiring, Note and reaction delivery, push not started | Touch ID ceremony to operate |
| 4 | Honest money | Late decline merged; 100 money tests merged and five defects fixed. Scheduler needs a work index from the identity or operations adapter; Stripe run needs keys | Stripe test keys, step 1 adapter |
| 5 | The creator's five minutes | Not started. Web Studio on phones for the pilot (option A); native Studio app after the pilot | step 1 |
| 6 | Share card, measurement, ops, release readiness | Not started | counsel, pilot creators |

## Needed from the founder

- The Q01 decisions in the [identity contract](pantopus-identity-contract.md): the pilot
  sign-in option, what defines 18+, and which account id Qelvora receives.
- The final domain and relying-party ID (Q09).
- Apple Developer and Google Play accounts, and at least one iPhone and one Android phone.
- Stripe test-mode keys and the account topology (Q03).
- A Touch ID ceremony for the development creator and the creator verification approval.
- Counsel on paid replies in the apps (Q04) and on the 18+ method.
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
- Merging to main cancels main's run in progress (`cancel-in-progress`), and the macOS jobs
  take an hour or more, so batch merges.
- Evidence: at most 1 MB per pull request and 300 KB per file under `artifacts/`: a README, a
  manifest (path, sha256, bytes) and at most five screenshots that carry a decision. Raw logs,
  bundles and patches stay outside git. Never commit home paths or environment-file locations.

## History

Evidence, not instructions: the [October 8 handoff](session-handoff-2026-10-08.md), the
[immediate handoff](session-handoff-2026-10-08-immediate.md), the [finish
plan](product-finish-plan-2026-10-08.md) and the [checkpoint](project-continuation-2026-10-07.md).
