# Engine backend qualification, 2026-10-22

This records local qualification of the incoming AI engine wave on
`codex/engine-qualification-2026-10-22`. All identities, PostgreSQL databases and
model traffic were task-owned development resources. The Anthropic-compatible
provider was the local fake. These checks establish neither real-model quality
nor production readiness.

## Source corrections

Commit `a846ecb64` repairs three defects found while reviewing the incoming wave:

- Sum each provider call's rounded-up micro-dollar bound. Rounding only the
  aggregate can under-reserve by 20 micros for the 21 admitted calls.
- An admitted call remains known zero until the provider request starts.
  Cancellation before that point releases unused budget; missing usage after
  the call starts remains unknown and follows conservative reconciliation.
- Closing the generation wake listener drains an in-progress connection as
  well as an established `LISTEN` session. Shutdown also observes the socket's
  end because `pg` can leave its connection promise pending when closed during
  the handshake.

The existing A6 scenario now checks fresh-input, cache-read and cache-write
adversarial prices using the actual receipt-pricing implementation. Each case
requires 21 micros; rounding the aggregate would have reserved only one. The
existing wake scenario now includes closing the actual `GenerationWake` against
a TCP edge that accepts a connection and holds its PostgreSQL handshake.

Commit `3c5bb594f` delegates the older provider wrappers to the corrected admitted
helpers, preserving the original admission and completion authority. It also
lets the workspace-contention scenario select its owned PostgreSQL container
and fails if that container's log cannot be read. No new unit tests or domain
authority stand-ins were added.

Backend type checking, lint and formatting for the changed files, and
`git diff --check` passed. The exact pre-request cancellation race was reviewed
in the shared helper; no deterministic runtime reproduction of that narrow
race is claimed.

## Database prerequisite

The preserved 119-migration `engine-1022` stack delivered its first reply, then
hit a real workspace `NOWAIT` collision with the stock Growth projection during
the A6 run. The interrupted reply consumed its conservative unknown-cost hold,
so four later attempts could not fit under the unchanged $5 daily cap.

The integrator separately registered the unchanged workspace-wait proposal as 0252. See [workspace lock qualification](workspace-lock-qualification-2026-10-22.md)
for fresh/restored qualification, owner custody, the operator and catalogue-pin
evidence. The memory and context-exclusion proposals remain inactive.

An independent `migrate-trust` invocation in the new disposable database
`commerce_canonical61_1022` installed exactly the 61 canonical version/checksum
pairs from the original generation-wave baseline. No wave, including 0252, was
applied by that bootstrap. The registered 0252 source remains byte-for-byte
identical to the proposal on `origin/lane-3/merge-wave-2026-10-16`, SHA-256
`d95eeb56126bae8c64d3112b45072d773ae16b00bd5c7fcc572efdc3c4368e89`.

## Runtime evidence

The replacement `qualified-1022` stack uses PostgreSQL 56620, API 56621, web
56622 and fake model 56623, with Growth enabled and 120 registered migrations.
The original $5 daily cap was retained.

| Existing scenario                                              | Observed result                                                                                                                                                                          |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a6-hold-bound.mjs`                                            | All 10 steps passed: three adversarial pricing checks, a live creator, five delivered replies and daily-budget checks                                                                    |
| `a6-ack-disconnect.mjs`                                        | All nine steps passed after scoping the receipt check to this run: dropped message absent, safety cost known, timeout bounded, both later fan replies delivered and takeover handed back |
| `e3a3-wake.mjs --cases latency,listener,shutdown --messages 2` | All four steps passed: two ordinary replies, exactly-once delivery after killing the owned listener, reconnect and in-progress handshake shutdown                                        |

The existing `e3a7-workspace-lock.mjs --cases studio` scenario also passed both
steps: nine answers delivered exactly once during 271 Studio reads. Its owned
PostgreSQL log recorded 25 remaining public-metadata workspace lock refusals.

A short 52-character message reserved 3,179,950 micros; a 2,000-character message
reserved 3,248,169. Actual costs for the five replies were 7,543, 12,545, 8,771,
12,757 and 9,987 micros, with five completed calls per reply and no unknown
usage. Maximum observed spend was 0.39% of the corresponding hold. Including
the initial smoke reply, daily spend was 58,992 micros at the end of A6.

After the full FAQ failure scenario, the first disconnect run reported two
assertion failures because it counted one older unknown-cost evaluation receipt.
The new disconnect and timeout receipts were already correct, and both later
fan replies delivered. The reused-stack scenario now snapshots prior unknown
receipt IDs and requires every newly created receipt to have a cost. The rerun
passed: the dropped request stored zero messages, its safety check cost 340
micros, the timed-out safety check recorded its own 50,810-micro estimate, and
zero new unknown receipts remained.

The prior standalone `evaluation` receipt remains unknown and completed. The
FAQ scenario intentionally injected a provider 500 response with no usage
receipt, so the cost cannot truthfully be filled in. This is the existing
standalone evaluation behavior. Generation admission includes `reply`,
`guardrail`, `memory` and `provider_unknown` categories in its budget and
uncertainty checks; `evaluation` is excluded. The two subsequent successful fan
replies corroborate that this receipt did not block admission. No global
zero-unknown claim is made, and no receipt was settled or changed to satisfy a
test.

The two wake-latency messages were claimed 367 and 398 ms after acceptance.
With the local fake's 300 ms delay, the first sentence arrived at about 6.1 s and
completion at about 10.6 s. Killing the dedicated listener immediately before
a send still produced one generation and one delivered frame, with a new single
listener session; that reply was claimed after 366 ms. Closing during the local
TCP handshake drained the socket in 1 ms with zero wakeups and remained safe to
close again. The host restart, idle, burst and second-worker cases were not run
as part of this subset.

The contention check read the owned `qelvora-lanequalified-1022-postgres` log.
All 25 workspace lock refusals during its run came from the existing
`public_ai_metadata` / `begin_public_ai_scope` `FOR SHARE NOWAIT` path. None came
from the four generation functions changed by 0252, and none interrupted the
nine answers. This is evidence of successful generation under the tested
single-worker load, not elimination of every workspace lock refusal.

Reproduce the checks serially against an owned running stack:

```sh
node tests/scenarios/lane-3/a6-hold-bound.mjs \
  --api http://127.0.0.1:56621 --model http://127.0.0.1:56623 \
  --db postgresql://postgres:foundation-test-only@127.0.0.1:56620/creator_stack

node tests/scenarios/lane-3/a6-ack-disconnect.mjs \
  --api http://127.0.0.1:56621 --model http://127.0.0.1:56623 \
  --db postgresql://postgres:foundation-test-only@127.0.0.1:56620/creator_stack

node tests/scenarios/lane-3/e3a3-wake.mjs \
  --cases latency,listener,shutdown --messages 2 \
  --api http://127.0.0.1:56621 --model http://127.0.0.1:56623 \
  --db postgresql://postgres:foundation-test-only@127.0.0.1:56620/creator_stack

node tests/scenarios/lane-3/e3a7-workspace-lock.mjs \
  --cases studio --container qelvora-lanequalified-1022-postgres \
  --api http://127.0.0.1:56621 --model http://127.0.0.1:56623 \
  --db postgresql://postgres:foundation-test-only@127.0.0.1:56620/creator_stack
```

The three follow-up scenarios ran serially after the qualified backend restarted
with the wrapper correction, preserving the published FAQ and the original daily
cap. No SQL was edited for these runtime checks. Logs remain locally at
`/tmp/qelvora-engine-1022-ack-disconnect-scoped.log`,
`/tmp/qelvora-engine-1022-wake.log` and
`/tmp/qelvora-engine-1022-workspace-lock.log`. The first disconnect failure is
retained in `/tmp/qelvora-engine-1022-ack-disconnect.log`.

Multi-worker qualification, real providers, memory writes, context exclusions
and production hosting remain separate work.
