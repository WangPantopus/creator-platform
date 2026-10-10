# WP 5.10 launch kit — 2026-10-09

Draft only. The kit now has four preparation links, a current public-page link
and sharing action, and invitation availability from the real creator/AI state.
All labels reuse existing copy. No invitation is created by reading the kit or
sharing the public page. No completion ticks or activity counts are invented.
The invitation retry fix remains separately on `lane-5/invite-entry`.

`GET /v1/growth/launch` requires the actual verified creator, refreshes the
canonical public projection, and returns only `publicPage: {path,name} | null`
and `canInvite`. A paused creator still has a readable page; new invitations
are disabled. The sharing button reads current state again before copying, and
the view refreshes when a tab becomes visible. These last browser behaviors
are implemented but **not proved**, because of the ticket below.

## Blocking ticket

Integrator / web route owner: in
`apps/web/app/api/growth/[...path]/route.ts`, admit **GET only** for `launch`,
and require the same `X-Expected-Account-Id` and `X-Expected-Session-Id` headers
used for the other private Growth views. Preserve the canonical server session
and no-store response. This file is outside the lane's allowed paths and was
not edited. The current proxy returns:

```text
404 {"error":{"message":"This endpoint is unavailable."}}
```

Do not merge this draft until that connection is made and the browser scenario
passes. The preparation list is visible now, but the sharing controls cannot
load. No fake routing, owner or browser response was installed to bypass it.

## Evidence

Stock server, real PostgreSQL `creator_stack`, installed Chrome, lane 5 ports.
Edge fakes: development identity, license and model from the existing stack.
No new unit tests. Load ranged roughly 11–22 during this run (16 CPUs).

| ID                    | Steps                                                                        | Expected                               | Observed                                     | Result   | Evidence                                        |
| --------------------- | ---------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------- | -------- | ----------------------------------------------- |
| E5.10-owner           | Anonymous/fan reads; four concurrent creator reads; compare invitation count | Only creator reads; no new invite      | 401, 403, four current 200s; count unchanged | pass     | `/tmp/qelvora-lane5-launch-with-checklist.log`  |
| E5.10-state           | Actual AI pause/read/resume/read                                             | Readable public link; invites off/on   | Both transitions correct                     | pass     | same                                            |
| E5.10-browser         | Creator signs in and opens kit                                               | Current share action appears           | Proxy 404 above                              | **fail** | same; `/tmp/qelvora-lane5-launch-blocked.png`   |
| E5.10-links           | Inspect four preparation links; request their real destinations              | Correct paths, 200, no mobile overflow | Four 200s; 390px layout fits                 | pass     | same; `/tmp/qelvora-lane5-launch-checklist.png` |
| E5.10-copy            | Share and inspect real clipboard/DB                                          | Current URL, no new invitation         | Blocked by proxy                             | not run  | same                                            |
| E5.10-pause           | State changes while tab remains open                                         | Sharing rechecks; invite disabled      | Blocked by proxy                             | not run  | same                                            |
| E5.10-clipboard-retry | Deny/grant actual browser permission                                         | Failure then successful retry          | Blocked by proxy                             | not run  | same                                            |
| E5.10-native-sheet    | Physical-device OS share sheet                                               | Current labeled URL                    | Headless Chrome only                         | not run  | same                                            |

Latest full scenario: **3 pass, 1 fail, 4 not run**. Seven typecheck tasks and
changed-source eslint passed. Full backend regression was not rerun for this
read-only endpoint; the prior withdrawal/public-page branch passed 157/157.
After stopping and starting the stock stack, the API-only run passed **2/2**
with four dependent/device checks not run; evidence:
`/tmp/qelvora-lane5-launch-restart-proof.log`. The proxy failure remains.

Defects in my work: I added the consumer before checking the web proxy's
allowlist, so the first browser run timed out (1/5 pass, one not run). I also
started a diagnostic rerun before the first pause scenario had finished; it
saw the intentionally paused state (1/3 pass, four not run). Those runs are
preserved in `/tmp/qelvora-lane5-launch-proof.log` and
`/tmp/qelvora-lane5-launch-proof-explicit.log`. The later run was serial, exposes
the exact 404 immediately, and marks dependent checks not run. The proxy
blocker remains; it is not a successful launch flow.

Run with the Codex Node and fallback bin on PATH and
`npm_config_manage_package_manager_versions=false`:

```sh
node infra/local/stack.mjs up --lane 5 --growth --no-smoke
node tests/scenarios/lane-5/e5-10-launch-kit.mjs
# API-only repeat after a clean stop/up:
node tests/scenarios/lane-5/e5-10-launch-kit.mjs --api-only
node infra/local/stack.mjs down --lane 5
```
