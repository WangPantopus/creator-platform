# Release

What has to be true before anything reaches real people, and how a release is built and rolled
back. This page is the release gate that `infra/environments.json` and
`.github/workflows/trust-release.yml` point at. It summarizes the full record that workstream 8
wrote on 2026-09-30, now in the [archive](../archive/operations/W8-release.md), and keeps its
commands, probes and notice wording; where the two differ, the later decisions recorded in the
[BRIEF](../BRIEF.md) win (for example, sign-in is now option D, Apple and Google, not a Pantopus
account). The G0 to G5 that the trust workflow names are the integration gates of the archived
[workstream plan](../archive/workstreams/README.md); the
[launch plan](../LAUNCH_PLAN.md#8-the-road-to-the-pilot) has replaced that plan.

Nothing is released today. No staging or production environment, store account, final domain or
production credential exists ([STATUS](../STATUS.md)).

## The gates

Each gate needs evidence from a real run, and a failed gate blocks the scope it covers. An
unavailable paid or safety-critical dependency is never replaced by a local fixture.

| Gate | Evidence needed |
| --- | --- |
| Shared revision | One reviewed commit with every owner's changes, frozen dependencies, a reproducible source manifest |
| Identity | Real sign-in, verified 18+ eligibility, current and revoked sessions, fresh sign-in for privacy actions, the passkey relying party and domain, a recovery policy |
| Privacy | Complete export and delete in all eight domains, immediate denial at every owner, provider erasure, configured retention, replay of the deletion journal |
| Safety | Report on every AI message without a grant, scoped ops and appeals, named and staffed reviewers, reviewed crisis resources |
| Payments | Provider or store-sandbox recovery, support, disputes and refunds, subscription cancellation, no duplicate money or false delivery |
| License | Approved license and departure rules, authority checked before context and delivery, generation stopped within 5 seconds of a revocation |
| Deployments | Separate staging and production credentials, queues and data; HTTPS; private object storage; non-owner database roles; a restore gate |
| Recovery | Base backup and continuous encrypted WAL, archive age alarms, an isolated restore drill, measured RPO at most 5 minutes and RTO at most 1 hour |
| Native | Whole-app builds, signed archives, SDK manifests, in-app purchase and restore, push, passkeys and app links, physical-device checks |
| Design and accessibility | The boards at phone and desktop widths in Light and Night, keyboard and focus, 200% text, reduced motion, VoiceOver and TalkBack, author comprehension |
| Reliability | A defined pilot workload, real provider latency, error rates and cost, traces, staffed alerts |

The deployed adapter must also provide a read-only readiness probe for each of the eight privacy
domains, named `privacy_<domain>` (identity, conversation, agent, commerce, content, media, growth
and trust). A probe checks that domain's non-owner role, approved retention and provider
configuration, and never exports or purges anything. A missing hook or probe, or a failing probe,
keeps release closed; a registered hook alone is not readiness.

The launch plan adds the store requirements for the pilot: an 18+ rating, in-app account deletion,
Report on every AI message, provider consent before the first AI message, and links that open the
app or fall back to the web ([launch plan](../LAUNCH_PLAN.md#2-what-done-means)).

## Store submission

Recheck the store policies at submission. Apple requires in-app deletion and disclosure of what is
kept; Google requires in-app and web deletion and in-app reporting of generated content. Reviewers
get sandbox accounts with synthetic data only. Privacy labels and Data safety answers come from an
audit of the signed archive and its SDKs, not from a placeholder page or a generated manifest.

- The database part of those answers starts from [data-safety.md](data-safety.md).
- The reviewer steps go through sign-in, a labeled AI, Report, support and privacy, and billing
  management. Submit no account, final URL or declaration until it is configured.
- The policies as workstream 8 checked them on 2026-09-29: Apple's
  [account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app),
  [review guidelines](https://developer.apple.com/app-store/review/guidelines/),
  [privacy labels](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy)
  and [privacy manifests](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files);
  Google's [account deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en),
  [AI-generated content](https://support.google.com/googleplay/android-developer/answer/13985936?hl=en)
  and [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).

## Rollout and rollback

- Run the gates against one immutable staging revision, with an incident commander and named
  responders for safety, money, identity, the database and the AI.
- Release behind a capability flag to a bounded cohort, and compare errors, latency, queues,
  billing, privacy and author comprehension with the baseline.
- Stop for any isolation failure, unresolved money, a missed 5-second revocation, false authorship,
  a reopened privacy path or unavailable mandatory support.
- Roll back the application to a compatible revision. Additive schema, tombstones and idempotency
  records stay. Recovery from a destructive schema change uses a new isolated restore environment.
- The thresholds proposed in `infra/alerts.json` are not staffed alerts; set the budgets with
  business input.
- An incident notice reads: "We are investigating [capability] from [UTC time]. [Specific user
  impact]. [Verified workaround]. Next update: [time]." The closing notice gives the time service
  came back and the retries still pending. Public notices never include fan text, private reasons or
  secrets, and a human responder approves every external message.

## Building the trust image

`infra/containers/trust.Dockerfile` builds a non-root image from a clean, reviewed checkout. The
build argument `RELEASE_REVISION` (the exact 40-character commit) is mandatory and becomes the image
label, a build manifest and a value compiled into the deployment, which refuses a different
revision at runtime. `infra/containers/trust-sbom.mjs` then emits an unsigned CycloneDX inventory
from inside the image. Neither the inventory nor local provenance replaces a signed SBOM and an
approved vulnerability and license review. The CI job that compiles the trust code is described in
[ci.md](ci.md).

```sh
docker build -f infra/containers/trust.Dockerfile \
  --build-arg RELEASE_REVISION=<exact-40-character-commit> -t <local-review-tag> .
node infra/containers/trust-sbom.mjs <exact-40-character-commit> sha256:<image-digest>
```

Run the inventory inside the reviewed image, with no network and no secrets mounted; it refuses a
commit that differs from the one baked into the image. The label alone does not verify the
checkout, so record the clean Git status, the source, tree and lock hashes and the image digest
separately. Validate the inventory against the CycloneDX schema and pin its hash beside that record
before asking for the release signature.
