# Lane 2: load and soak (WP 2.8)

Updated: 2026-10-09. Pull request: [#384](https://github.com/WangPantopus/creator-platform/pull/384).
Status: the full idle socket run passed; public overload and worker completion failed. Overall capacity is not qualified.

The founder's instruction to continue coding through the lane authorizes this package.
The branch `lane-2/load-soak` starts at `origin/main` commit
`c0b4ac0f030a893dfc92457f0f4348dd87174398`, which contains WP 2.1. It does not
contain the production host or catalogue tool: see the resume audit in PR #380.
The final handoff fetch found main at `21b3d4836340b0ad494dd0faa8adb041d8e244fa`
with PR #381's model changes. Those changes were not present in these measurements and were
not re-tested here. Read the current stack instructions before running on a newer checkout;
keep load runs on the fake model rather than the optional paid gateway.

## What the code does

Three plain Node scenario scripts drive the real HTTP and WebSocket entry points, then
inspect PostgreSQL and the existing supervisor metrics endpoint. There are no new unit tests,
feature mocks, migrations, product changes or relaxed authority checks.

- `e2-8-public.mjs`: a bounded ramp of concurrent readers of Maya's public creator API,
  missing-creator behavior, overload response codes, latency percentiles and recovery.
- `e2-8-workers.mjs`: two fans send concurrently, each with a simultaneous retry; checks
  acknowledgment identity, durable jobs, reply completion, accounting receipts, changed
  retries and wrong-person refusal. The current host has one serial worker.
- `e2-8-sockets.mjs`: signed-out, wrong-origin and wrong-fan refusals; authorized replay,
  ordered and scoped frames; a requested 30-minute hold; process memory samples; counters
  and durable state after disconnect. An unexpected drop fails and stops the run; it is never
  hidden by a retry. Planned session renewals are logged separately, including their gap.
- `load-support.mjs` and `load-sockets.mjs`: HTTP, SQL, session and socket measurement helpers.

Every target is fixed to lane 2's loopback ports and named database. The database's ownership
label is checked first. Tokens stay in memory and are not logged. Database inspection selects
counts and operational state, never credentials. All user actions go through HTTP or WebSocket;
SQL is read-only. Only the model and development identity are faked, using the existing stack.

## Re-run

Use the toolchain in the working agreement. No download or new dependency is needed.

```sh
node infra/local/stack.mjs up --lane 2 --growth --no-web --no-smoke
node tests/scenarios/lane-2/e2-8-public.mjs --seconds 15 --max-readers 16
node tests/scenarios/lane-2/e2-8-workers.mjs --seconds 120
node tests/scenarios/lane-2/e2-8-sockets.mjs --connections 8 --seconds 1800
node infra/local/stack.mjs down --lane 2
```

Run these separately, retaining each exit code; an expected product failure exits 1 and
must not prevent cleanup. The worker scenario needs a fresh stack if an earlier failed reply
left `reply_in_progress` or an unresolved cost. Rebuild only this disposable stack with
`reset --lane 2 --growth --no-web --no-smoke`. Do not erase another lane's data.

The public ramp stops after a stage returns a 5xx, a client deadline or any response other
than 200/429, to avoid increasing pressure on the shared Mac. A 10-second client deadline
is reported as status `0`, not as a server response. Requested stage duration is 15 seconds;
already-started requests are allowed to finish or hit that deadline.

Sessions expire after 15 minutes (`modules/identity/sessions.ts:138`). Every ten minutes,
the socket scenario closes its healthy connections, uses the real `/v1/identity/refresh`
endpoint, and reconnects from each durable cursor with the new token. The supervisor session
also refreshes normally. This is a 30-minute client/session workload with explicit renewal
gaps, not a claim that one socket lasts beyond its credential. Unexpected 1008/1013 closes
still fail. Use `--seconds 90 --refresh-seconds 30` to exercise renewal quickly without
changing clocks or token lifetimes; it does not qualify memory over 30 minutes.

Memory sampling reports RSS and heap every ten seconds. After the first minute, the script
compares the lower 20th-percentile heap samples in the first and last thirds of the run, with
a 16 MiB diagnostic allowance for GC noise. This is a measurement heuristic, not a founder-
approved launch bar or proof that no leak exists. An interrupted or short run cannot qualify it.

## Observed results

The machine was shared and busy: 16 CPUs, load averages from about 25 to 99 during these runs.
These measurements describe this checkout on this Mac, not production capacity or pilot SLOs.
The tests use two fan accounts and multiple sockets per account, not hundreds of distinct fans.

### Public creator API: final ramp

| Concurrent readers | Requests | HTTP 200 | Other outcomes                                                    | p95       |
| ------------------ | -------- | -------- | ----------------------------------------------------------------- | --------- |
| 1                  | 17       | 17       | None                                                              | 1,245 ms  |
| 4                  | 24       | 24       | None                                                              | 3,147 ms  |
| 8                  | 27       | 27       | None                                                              | 6,036 ms  |
| 16                 | 32       | 21       | 10 client deadlines; one HTTP 503 `growth_connection_unavailable` | 10,003 ms |

**Fail:** overload did not return 429. The bounded ramp stopped. A public read after the load
returned 200 in 710 ms. Missing creator returned 404. Message/job/event counts stayed at
4/2/4, with zero duplicate message sequences. No wrong creator was returned.

An earlier ramp through eight readers returned 59/59 successful reads, with p95 from 1,592 to
7,732 ms. Its negative fixture used an invalid handle and correctly got 400; the scenario was
corrected to use the valid but absent `lane2missing` handle, and the final ramp above re-ran it.

### Concurrent generation and sockets

First worker run: each duplicate pair returned the same HTTP 200 acknowledgment, in
1,402–1,488 ms. PostgreSQL held exactly two jobs for the two distinct messages. Both were still
`generating` after 122.6 seconds; neither had a first-visible timestamp. The backend reported:

```text
generation_scope_changed
generation_terminal_denied
generation_authority_unavailable
generation_terminal_recovery_incomplete
```

Changed retry: 403 `idempotency_conflict`. Wrong fan: 403 `thread_unavailable`. No extra job.
This does not demonstrate multiple worker processes or successful reply completion.

The final worker script was re-run after `reset --lane 2 --growth --no-web --no-smoke`.
It exited 1: **seven checks passed, one failed**. The duplicate pairs again returned the same
200 acknowledgment in 852–959 ms. Both jobs settled within 57.9 seconds, but only one delivered:

| Job        | Generation / AI message   | First visible | Completed | Attempts | Open attempts | Latest receipt | Unsettled calls |
| ---------- | ------------------------- | ------------- | --------- | -------- | ------------- | -------------- | --------------- |
| First fan  | `failed` / `failed`       | None          | 19,564 ms | 1        | 0             | `known`        | 0               |
| Second fan | `delivered` / `delivered` | 42,010 ms     | 52,619 ms | 1        | 0             | `known`        | 0               |

Both fan messages remained `accepted`; both `failure_code` fields were null. The fresh
backend log contained one `generation_authority_unavailable`. Accounting settlement,
exactly two jobs, changed-retry refusal and wrong-person refusal passed. This is a useful
recovery result, but **reply completion still failed**, and even the delivered fake-model
reply took about 42 seconds to show its first output. No costs or job states were edited.

First socket run: all eight connections opened, then all closed with 1013 by the first sample
(12 seconds including the ramp). Six received a replay; frames were scoped and ordered.
Signed-out and wrong-origin upgrades returned 401; wrong-fan subscription closed with 1008
and no frames. After disconnect, active connections and subscriptions were zero; liveness was 200. **Fail:** survival. **Not run:** the 30-minute memory qualification.

The initial socket script also assumed the event count would stay fixed while generation
was active. PostgreSQL showed a legitimate `interrupted` event from background recovery.
The final script still reports event counts but checks no extra messages, jobs or duplicate
sequences; it no longer attributes a worker's terminal event to a socket read. The soak clock
starts after the connection ramp. Accounting checks inspect receipts and open attempts rather
than assuming exactly one provider attempt is always sufficient.

A second socket attempt was stopped by its verified process ID after roughly three minutes
with 8/8 connections alive, when the 15-minute session lifetime was identified. It is an
interrupted measurement, not a product failure or a completed soak. The normal refresh path
was added before restarting the full-duration run.

### Completed 30-minute idle soak

The final full-duration command exited 0: **10 checks passed, zero failed**, with 180 metric
samples over 1,800 seconds. Eight connections and authorized subscriptions remained active
between two planned renewals; there were no unexpected closes. The renewal gaps were 622 ms
and 617 ms. The supervisor session refreshed three times through the real endpoint.

All eight initial connections received authorized replay, totaling 16 frames; there were no
scope or ordering errors. Reconnects resumed from those cursors. This was an idle subscription
workload after initial replay; no new fan messages were injected during the thirty minutes.

- Heap low-water comparison: 164,571,976 bytes in the first window versus 164,424,856 in the
  last, a decrease of 147,120 bytes. The diagnostic allowance passed.
- RSS: 729,194,496 bytes at the first sample versus 745,533,440 at the last (about 15.6 MiB
  higher); maximum 746,528,768 bytes. **Do not translate the heap result into a blanket
  "no memory growth" or "no leak" claim.** Both measures are reported.
- After closure: zero active connections and subscriptions; liveness 200. Message/job/event
  counts stayed 4/2/4, with zero duplicate message sequences. Both original jobs were failed
  when inspected after the soak; neither became a delivered reply.

The first failing socket run overlapped background generation recovery and the worker
scenario's final refusal checks. The passing full run was idle. They are different workloads;
the pass does not erase the earlier 1013 failures or establish their sole cause.

## Tickets to owners

| Owner                               | File                                                                                              | Change needed                                                                                                         | Evidence and limit                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lane 3                              | `apps/backend/src/realtime/gateway.ts:149`                                                        | Resolve authorized socket loss under contention while preserving current-session checks                               | Eight sockets closed 1013 in the first active run; the later idle soak passed. The authority read has a 2-second deadline; do not simply relax it |
| Lane 3                              | `apps/backend/src/modules/identity/generation-scope.ts:1083`, `workers/generation-terminal.ts:86` | Finish or safely recover accepted jobs when scope verification overruns                                               | Initial jobs had no output after 120 seconds; fresh rerun settled both receipts but one reply failed and one took 42 seconds to first output      |
| Lane 3                              | `apps/backend/src/workers/generation-host.ts:70` and its worker composition                       | Supply the supported multi-worker entry/configuration for concurrency qualification                                   | The current host fixes its pool to one and runs one serial executor; multiple workers not run                                                     |
| Lane 5                              | `apps/backend/src/modules/growth/service.ts:145`, `:479`, `:491`                                  | Investigate repeated public-projection refresh work and lock contention without weakening revocation/erasure behavior | Creator and posts each refresh; refresh takes a row lock. Latency rises with readers. These are candidate causes, not a proved attribution        |
| Lane 5; lane 2 after hosting choice | `apps/backend/src/modules/growth/transaction.ts:49`; staging edge configuration                   | Bound admission before connection exhaustion and return the agreed overload response                                  | HTTP 503 `growth_connection_unavailable` and ten client deadlines at 16 readers; no staging limiter exists yet                                    |

## Not checked

- 500 distinct fan connections, sustained message streaming during the soak, a production
  capacity ceiling or proof of no memory leak. Eight idle subscriptions passed thirty minutes;
  the local client and server compete on the same busy machine.
- Multiple generation worker processes, worker restart/poison-job scenarios (WP 2.4), or real
  model quality and provider latency. No financial state was manually settled to make progress.
- The web page in a browser: this package measures its backend public read path, not rendering.
- Hosted HTTPS, rate limiting, backup/restore, deployment or alert delivery. Those packages
  still need the hosting choice and integrator deployment.
- E2.1, E2.2 and E2.9 were not re-run; their implementations were not changed.

## Static verification

`pnpm typecheck` passed (seven tasks successful, all cached). ESLint passed for all five new
scenario/helper scripts. Prettier and `git diff --check` passed. No existing backend test suite
was run; static checks do not replace the real scenario results above.

## State at stop

`node infra/local/stack.mjs down --lane 2` exited 0 after the fresh worker run. Backend and
model stopped; the lane 2 database container, volume and temporary state directory were
removed. Docker queries found no lane 2 containers or volumes, and `lsof` found no listeners
on 56420–56429. Scenario commands had all exited. Scratch outputs were removed after recording
the measurements here. No preserved or other lane's resources were changed.
