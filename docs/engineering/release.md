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

Nothing is released today. TestFlight setup has begun in the existing Pantopus, Inc. Apple
Developer account; Hotpot has the registered bundle ID `com.pantopus.hotpot`. App Store naming,
the updated Apple agreement and local signing setup are unresolved. No staging or production
environment, final domain or production credential is configured in this repository
([STATUS](../STATUS.md)).

## First Hotpot TestFlight build

Setup state and outstanding founder inputs are in [STATUS](../STATUS.md#hotpot-testflight-setup--in-progress).
Apple team `6UYZBA546R` owns `com.pantopus.hotpot` with Sign in with Apple enabled.
The exact listing name Hotpot is unavailable; a different listing name can retain
Hotpot as the home-screen display name.

Before uploading:

1. The Account Holder reviews and accepts Apple's outstanding Developer Program
   License Agreement. Sign in to that team's account in Xcode Settings → Apple Accounts.
2. Create the App Store Connect iOS record with an available name, English (U.S.),
   bundle ID `com.pantopus.hotpot`, and SKU `pantopus-hotpot-ios`. These were the
   attempted form values; the name rejection means the record was **not** created.
3. Supply an app icon and explicit `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`.
   The unsigned main archive compiled successfully, but its processed Info.plist
   had neither version key nor app icons, so it is not ready for upload.
4. Set the release HTTPS API origin and public OAuth client configuration, or get
   an explicit installation-only scope. An empty API origin leaves sign-in and
   conversations unavailable; TestFlight does not host the backend.
5. Archive with the Hotpot bundle/display-name overrides and Pantopus team, sign
   using Apple distribution, then validate and upload using Xcode. Review export
   compliance against the actual archive; do not invent declarations.
6. After Apple processes the build, add it to an internal TestFlight group and
   add the founder's existing App Store Connect user. Verify installation and
   the agreed test scope on the real iPhone before reporting completion.

The initial archive was built from `78c890e8cc6c8bbf19bb32e8355edc9affe5f757`
with Xcode 27.1, Release, generic iOS device, signing disabled, and build overrides
`PRODUCT_BUNDLE_IDENTIFIER=com.pantopus.hotpot` and
`INFOPLIST_KEY_CFBundleDisplayName=Hotpot`. It is a compile preflight, not an
end-to-end test, signed delivery artifact or successful TestFlight upload. The
source-wide rename remains pending. Logs and archive stay outside Git in ignored
`artifacts/testflight-hotpot/`.

Apple references: [upload builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds)
and [TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).

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
