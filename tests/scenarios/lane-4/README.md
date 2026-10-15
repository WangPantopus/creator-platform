# Lane 4 money scenarios

End-to-end scenarios for the money path, run over HTTP against the real backend
(`server.ts` on the one-command local stack) and its real PostgreSQL. Every
scenario ends with the invariant sweep, and it passes only if its own steps and
the sweep both pass.

```
node tests/scenarios/lane-4/stack.mjs up --no-web --ack-only   # the lane 4 stack plus the fake processor
node tests/scenarios/lane-4/run.mjs                            # every scenario, one summary line each
node tests/scenarios/lane-4/run.mjs e4-1 e4-12                 # only these
node tests/scenarios/lane-4/sweep.mjs                          # the invariant sweep on its own
node tests/scenarios/lane-4/stack.mjs down                     # remove the stack and the fake's record
```

Use the toolchain from the working agreement (section 3.7) first. Lane 4's ports
are 56440 to 56449: PostgreSQL 56440, backend 56441, web 56442, model fake 56443,
fake processor 56444.

## Fakes (all at the outer edge)

- **Card processor:** `fake-stripe.mjs`, a loopback HTTP server for the part of
  Stripe's API the backend's Stripe adapter uses (manual-capture PaymentIntents,
  refunds, lists, idempotency keys, Stripe's error shapes). `stripe-edge.mjs` is
  loaded into the backend only (through its development settings) and sends its
  `api.stripe.com` calls there, so our own Stripe adapter runs unchanged. The
  keys are sandbox-shaped placeholders. The fake writes every change to a file,
  so a restart forgets nothing. Payment methods: `pm_cardVisa` (holds),
  `pm_cardDeclined`, `pm_cardInsufficientFunds`, `pm_cardExpired` (declines),
  `pm_cardAuthRequired` (3-D Secure); any other id is "No such PaymentMethod".
  Scenarios steer it through `POST /__control` (faults before or after acting,
  3-D Secure results, hold lapses, refund outcomes) and read the truth from
  `GET /__state`.
- **Identity:** the development adapter's synthetic accounts (fans 1, 2 and 6,
  Maya 3, her team member 4, Devon 5, an under-18 account 7).
- **The creator's passkey:** a software key enrolled as a `passkey_credential`
  row, standing in for lane 1's registration ceremony. Every signature still goes
  through the real begin and verify endpoints.

Deadlines are moved by editing them in this stack's own database, and the
scenario says so.

## The invariant sweep

`sweep.mjs` reads the database in one read-only snapshot and the fake
processor's record, and checks:

|     | Invariant                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Every hold ends in exactly one state: one capture or one release per authorization, none while the request is live                                       |
| S2  | The captured total equals the price of the accepted requests                                                                                             |
| S3  | Nothing is captured without the creator's consumed signed accept (INV-16), at the processor too, and no capture request exists for an unaccepted request |
| S4  | Refunds never exceed captures                                                                                                                            |
| S5  | The ledger is append-only: the trigger is live and every row an earlier sweep saw is unchanged                                                           |
| S6  | Held, released and captured amounts reconcile exactly, and match the processor                                                                           |
| S7  | Capacity in use equals the open plus accepted requests (INV-10)                                                                                          |
| S8  | No closed request still has a hold, in the ledger or at the processor                                                                                    |
| S9  | Only the creator's own signed reply completes a commitment (INV-09)                                                                                      |

Requests whose money work is still in flight are named, and their processor
comparisons are skipped for that run.
