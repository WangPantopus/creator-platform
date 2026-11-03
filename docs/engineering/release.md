# Release

What has to be true before anything reaches real people, and how a release is built and rolled
back. The full record, written by workstream 8 on 2026-09-30, is
[W8-release.md](../operations/W8-release.md). It stays at that path because `infra/environments.json`
and `.github/workflows/trust-release.yml` point at it as the release gate. This page summarizes it;
where the two differ, the later decisions recorded in the [BRIEF](../BRIEF.md) win (for example,
sign-in is now option D, Apple and Google, not a Pantopus account).

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
domains; a missing or failing probe keeps release closed.

The launch plan adds the store requirements for the pilot: an 18+ rating, in-app account deletion,
Report on every AI message, provider consent before the first AI message, and links that open the
app or fall back to the web ([launch plan](../LAUNCH_PLAN.md#2-what-done-means)).

## Store submission

Recheck the store policies at submission. Apple requires in-app deletion and disclosure of what is
kept; Google requires in-app and web deletion and in-app reporting of generated content. Reviewers
get sandbox accounts with synthetic data only. Privacy labels and Data safety answers come from an
audit of the signed archive and its SDKs, not from a placeholder page or a generated manifest.

## Rollout and rollback

- Run the gates against one immutable staging revision, with an incident commander and named
  responders for safety, money, identity, the database and the AI.
- Release behind a capability flag to a bounded cohort, and compare errors, latency, queues,
  billing, privacy and author comprehension with the baseline.
- Stop for any isolation failure, unresolved money, a missed 5-second revocation, false authorship,
  a reopened privacy path or unavailable mandatory support.
- Roll back the application to a compatible revision. Additive schema, tombstones and idempotency
  records stay. Recovery from a destructive schema change uses a new isolated restore environment.

## Building the trust image

`infra/containers/trust.Dockerfile` builds a non-root image from a clean, reviewed checkout. The
build argument `RELEASE_REVISION` (the exact 40-character commit) is mandatory and becomes the image
label, a build manifest and a value compiled into the deployment, which refuses a different
revision at runtime. `infra/containers/trust-sbom.mjs` then emits an unsigned CycloneDX inventory
from inside the image. Neither the inventory nor local provenance replaces a signed SBOM and an
approved vulnerability and license review. The CI job that compiles the trust code is described in
[ci.md](ci.md).
