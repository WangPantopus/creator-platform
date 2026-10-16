# C9: pilot metrics — owner handoff, 2026-10-09

WP 5.9 is not complete. The existing taxonomy, idempotent writer and aggregate reader are implemented, but repository search finds no production caller of `GrowthService.measure`. A consented entry is stored separately in `growth.entry_attribution`; it currently does not produce `arrival`. A successful follow stores `growth.follow`; it currently does not produce `follow`. These are missing event connections, not zero user activity.

The founder's Q5 default is to prepare emitters and retain existing privacy rules pending review. The contract also requires a pilot cohort (`expert` or `companion`) but no assignment owner is connected. That question was sent to the founder. An AI with both modes cannot be arbitrarily assigned to one cohort. Default: do not record unassigned events or fabricate context.

## The existing write contract

Only the genuine owner records a confirmed outcome. A browser cannot call a generic metrics endpoint or claim `useful_answer`. The existing one-line call under a real current request is:

```ts
await growth.service.measure(actor, {
  ...context,
  id: stableActionID,
  type: "follow",
});
```

`actor` is the real request's current identity authority. `context` contains `schemaVersion: 2`, `creatorId`, `role` (`fan`/`creator`), assigned `cohort` (`expert`/`companion`), `surface` (`web`/`ios`/`android`), `userState` (`new`/`returning`), `capability` (`available`/`unavailable`), `source` (`direct`/`creator_link`/`post`/`invite`/`share`/`search`), nullable categorical `reason`, and nullable `effortSeconds` bounded to one day. These values must come from the actual action and approved assignment, never a guessed platform or an unrelated creator's configuration.

The action ID is a stable UUID from the owning action, not a new UUID on every delivery. Retrying the exact document is a no-op; reuse with different content is 409 `metric_id_conflict`. No raw text, endpoint, device fingerprint or private reply belongs in the metric document. Account IDs remain internal for erasure; public aggregate readers expose no actor keys or account rows.

Do not make a successful business action depend on a second non-atomic analytics write. Owners need durable post-commit delivery with the same ID and an approved replay authority. The current writer takes a live Actor and is **not** a worker replay port. Saving an Actor or inventing one from an account ID is forbidden. Lanes 1/owner/integrator must settle that part of C9 before asynchronous events such as renewal/refund are connected. This note describes the existing interface; it does not invent a background authority or claim exactly-once delivery is solved.

## All sixteen owner calls

Each row uses the same call above with the listed type and a stable ID for that real action. The named files/areas are tickets, not edits outside lane 5. Reasons and effort are only supplied when actually collected; otherwise null.

| Type                     | Owner and file/area                                                                 | Actual trigger and stable action                                                             | Connection status                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `arrival`                | Lane 5, `growth/engagement.ts` attribution                                          | Accepted voluntary attribution ID, after validating the actual source                        | Awaiting cohort/context and durable writer contract                               |
| `sign_in`                | Lane 1, `identity/router.ts` and `identity/sessions.ts`                             | Completed continuation with genuine creator entry context                                    | Ticket; do not treat every token refresh as sign-in                               |
| `consent`                | Lanes 1/3, `identity/consent.ts` and `conversation/service.ts`                      | The committed consent receipt/version                                                        | Ticket; no inferred consent from entry                                            |
| `useful_answer`          | Lane 3, `conversation/service.ts`                                                   | Actual useful-answer outcome ID for delivered fan use                                        | Ticket; evaluation traffic and browser claims excluded; needed for install prompt |
| `follow`                 | Lane 5, `growth/service.ts` follow                                                  | First successful false-to-true action under the real fan request; stable command ID required | Existing endpoint has no action ID/context; C9 gap                                |
| `membership`             | Lane 4, `commerce/service.ts`                                                       | Confirmed membership activation receipt, not checkout intent                                 | Ticket                                                                            |
| `request`                | Lane 4, `commerce/service.ts`                                                       | Newly durable request action ID                                                              | Ticket; retries are the same action                                               |
| `human_delivery`         | Lanes 3/4, `conversation/service.ts` and `commerce/service.ts`                      | The confirmed exact-version delivery action                                                  | Ticket; AI/approved draft must not claim human delivery                           |
| `return`                 | Lanes 1/5/7, `identity/router.ts`, `growth/engagement.ts` and native entry handlers | A real return action with approved deduplication window                                      | Ticket; day/window semantics require contract review, not a page-render guess     |
| `renewal`                | Lane 4, `commerce/service.ts` and `commerce/runtime.ts`                             | Confirmed next-period renewal receipt                                                        | Ticket; needs genuine worker replay authority                                     |
| `churn`                  | Lane 4, `commerce/service.ts` and `commerce/runtime.ts`                             | Confirmed transition to ended membership                                                     | Ticket; pending cancellation is not completion                                    |
| `creator_activity`       | Lanes 2/5/6, `agent/service.ts` and `content/service.ts`                            | A committed publication or other agreed creator action ID                                    | Ticket; eligible action set/context need agreement                                |
| `support`                | Lane 1/ops, support case owner                                                      | Newly committed support request ID                                                           | Ticket; categorical reason only                                                   |
| `refund`                 | Lane 4, `commerce/service.ts` and `commerce/runtime.ts`                             | Confirmed processor refund receipt                                                           | Ticket; pending refund is not settlement                                          |
| `comprehension`          | Lanes 5/6/7, `growth/service.ts` feedback and calling web/native forms              | Accepted comprehension response action ID                                                    | Ticket; existing feedback endpoint lacks creator/cohort context                   |
| `capability_unavailable` | Actual refusing owner in each lane                                                  | Stable unavailable action with real capability/reason                                        | Ticket; excluded from successful conversion denominators                          |

## Arrival counts and current aggregate

The existing voluntary attribution endpoint is `POST /v1/growth/entry`; repeated IDs are idempotent and changed content is refused. It is not an anonymous pageview tracker. Converting it to an arrival emitter must preserve explicit consent and erase with the account. Do not count every public cache hit or introduce fingerprints to create a denominator.

`GET /v1/growth/funnel` is creator-only. Current behavior: 30-day counts need at least five distinct actors; fixed role/cohort/surface/new-returning slices also need five; unavailable capabilities are excluded from conversion counts. D1/D7/D30 denominators use closed first-arrival cohorts; the median time to a useful answer needs five observations. The API exposes no arbitrary narrow filters. All these rules remain unchanged. With ten pilot fans, splitting into many slices may hide results; the privacy reviewer must decide whether a coarser fixed view is acceptable. No suppression threshold was lowered.

## Real-server evidence

Run `node tests/scenarios/lane-5/e5-8-metrics.mjs` against `node infra/local/stack.mjs up --lane 5 --growth --no-smoke`, with the runtime Node/fallback PATH and `npm_config_manage_package_manager_versions=false`. Development identity/license/model are edge fakes. The script uses real consented attribution and follow HTTP workflows, and reads their stored rows and metrics. It never inserts metric fixtures. No new unit tests.

| ID                       | Steps                                                            | Expected                                     | Observed                                                       | Result  | Evidence                               |
| ------------------------ | ---------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------- | ------- | -------------------------------------- |
| E5.8-consented-entry     | Three concurrent identical entry calls; changed retry            | One attribution; conflict refused            | Three 200s, one attribution row; changed retry 409             | pass    | `/tmp/qelvora-lane5-metrics-proof.log` |
| E5.8-emitter-gap         | Real arrival and repeated successful follow; inspect metric rows | Arrival/follow events                        | Real follow and attribution exist; zero metric rows            | fail    | same log and PostgreSQL                |
| E5.8-owner-view          | Creator/fan/anonymous read funnel                                | Creator only; privacy rule unchanged         | Creator 200, fan 403, anonymous 401; five-person rule retained | pass    | same log                               |
| E5.8-client-claim        | Browser claims useful answer                                     | No outcome write                             | No metrics endpoint (404); row count unchanged                 | pass    | same log                               |
| E5.8-sixteen / pilot-ten | Real 16-event lifecycle and ten-fan counts                       | Match hand count without identifying someone | Owner/context/privacy contract missing                         | not run | tickets above                          |

This concern adds only the C9 note and scenario. The missing emitters are not fixed by documentation. No production code, copy, money semantics, invariant, engine revision or privacy rule changes. Existing suites are not rerun for these evidence files; E5.8 remains incomplete.

Result: three checks passed, one failed, two not run. The failure is the actual missing arrival/follow producer connection. No scenario defect was found. This is not a green E5.8 result. Local load was 6–7 on 16 CPUs.

Backend module paths above are relative to `apps/backend/src/modules/`. Host wiring belongs to the integrator in `apps/backend/src/server.ts`. An owner must name the actual support/outcome action before its call is added; no event is emitted from a guessed UI click.
