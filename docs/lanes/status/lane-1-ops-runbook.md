# Lane 1 · Ops reviewers runbook (WP 1.6, O2)

Decided by the founder on 2026-10-16: for the pilot, the founder adds and removes ops reviewers
with a command; a screen comes later. Needs `pending-ops-member-admin.sql` registered.

## Who can be a reviewer

An active Qelvora account (someone who has signed in with Apple or Google and passed the age
step). Find their account id in the ops console's case details or ask them to read it from their
account page. A reviewer works only in the queues you give them: `safety`, `disputes`,
`verification`, `pauses`, `support`. A supervisor can also decide verification, pause, license
and suspension cases in those queues, and (with O1) sees every reviewer's accesses there.

## Commands

Run from the repository root with the **migration login**, never the runtime one. The address
is read from the environment and never printed.

```bash
export DATABASE_MIGRATION_URL=…   # the migration login, from your secret store
pnpm --filter @qelvora/backend exec tsx src/modules/trust/ops-members.ts list
```

Add a reviewer, or change one (the same command replaces their queues, role and expiry):

```bash
pnpm --filter @qelvora/backend exec tsx src/modules/trust/ops-members.ts add \
  --account <account id> --queues safety,support --expires 2026-12-31 \
  --operator "<your name>" --reason "Pilot safety reviewer"
```

Add `--supervisor` for a supervisor. The expiry is a date at most a year away; access ends at
the end of that day (UTC).

Remove a reviewer:

```bash
pnpm --filter @qelvora/backend exec tsx src/modules/trust/ops-members.ts remove \
  --account <account id> --operator "<your name>" --reason "Pilot ended"
```

See every change, newest first:

```bash
pnpm --filter @qelvora/backend exec tsx src/modules/trust/ops-members.ts list --changes
```

## What happens

- Each command prints one JSON line, or `{"refused": "..."}` and exits 1 having changed nothing.
- A change or a removal ends the reviewer's open case leases at once; they must reopen a case
  with a new reason. A removal also refuses their next ops request.
- Every change is kept in `creator_trust.ops_member_change` with your name and reason. Only the
  trust schema owner can read or write it.

Proof: `tests/scenarios/lane-1/e1-6-ops-members.mjs`.
