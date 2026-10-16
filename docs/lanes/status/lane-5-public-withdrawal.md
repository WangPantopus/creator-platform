# Lane 5: public post withdrawal

WP 5.6 prerequisite, found while checking the public page on 2026-10-09.
No migration. The public-page cache is a separate change.

## Problem and change

Saving an edit withdrew the signature but did not queue removal of the old public
text. Unpublish and archive wrote withdrawal effects but did not start delivery.
Even Studio's manual effects action failed: PostgreSQL reported
`inconsistent types deduced for parameter $1` in the opaque parent insert.

Edits now queue withdrawal of the former publication. Draft saves, unpublish and
archive start the existing per-creator delivery queue. Failed withdrawal effects
use its existing three in-session retries. The withdrawal query binds the creator
ID consistently as UUID. When the current item is a new draft, the public adapter
withdraws only former revisions, so signing the new draft can publish it later.
Delayed effects still read the current owner state. Delivery remains asynchronous;
there is no claim of an atomic cross-module withdrawal.

## Evidence

Real stock backend and PostgreSQL, full lane 2 stack using lane 5 ports, all 114
registered migrations. Fakes: development identity, development creator license,
model edge, and a software passkey enrolled in the disposable database. Draft,
sign, publish, edit, unpublish and archive use the real HTTP endpoints. SQL reads
check public state and completed effects. No new unit tests.

| ID                     | Steps                                           | Expected                                | Observed                                  | Result                                | Evidence                            |
| ---------------------- | ----------------------------------------------- | --------------------------------------- | ----------------------------------------- | ------------------------------------- | ----------------------------------- |
| E5.5-post-publish      | Draft, sign and publish Unicode and markup text | Exact public text, version 1            | Exact body, stored published row          | Pass                                  | `e5-5-public-posts.mjs`             |
| E5.5-post-edit         | Warm page; save edit; wait; sign new draft      | Old text removed; version 2 can publish | Removed, then new text/version 2          | Pass                                  | Same script, public HTTP + database |
| E5.5-post-wrong-person | Another account unpublishes Maya's post         | Refused; unchanged page                 | 503 `scope_denial_unavailable`; unchanged | Pass for refusal; status ticket below | Same script                         |
| E5.5-post-withdraw     | Warm page; unpublish                            | Removed without manual effects action   | Stored tombstone, absent from page        | Pass                                  | Same script                         |
| E5.5-post-archive-race | Three archives with the same request key        | One withdrawal                          | Three 200s, one completed effect          | Pass                                  | Same script + effect count          |

Initial runs failed on the three defects above. Scenario setup also needed fixes:
an unsupported sign-in return target, the Note-only signing helper, a misspelled
table name, and deleting a credential referenced by a signed act. The helper now
signs the actual document kind and cleanup revokes the synthetic credential.
Logs: `/tmp/qelvora-lane5-public-posts-final5.log`; earlier failures are in
`/tmp/qelvora-lane5-public-posts-final.log`, `-drain.log`, `-fixed.log`,
`-complete.log`. These local logs are not committed artifacts.

Not run: media/quote/plan withdrawal, team publication, process death specifically
between withdrawal commit and delivery, or this withdrawal's retry after an
outage. Existing retry coverage is separate and must not be counted for these
cases. Full backend-suite and static results are recorded in the PR after they
finish. Local load during this work was roughly 13–22 (16 CPUs).

## Tickets and rerun

- Lane 1 / integrator, the production host's held content-denial authority:
  an unrelated signed-in account receives `scope_denial_unavailable` (503), not
  a stable 403/404. It did not change or expose the post. Review the error mapping
  and owner binding; do not weaken the authority check.
- Lane 3 / integrator, content source-revoke adapter: effects without AI reuse
  still produce `content_producer_unconfigured`. Public withdrawal completes;
  these separate source effects remain blocked. Do not pretend they were drained.

With the runtime PATH and pnpm setting from the handoff:

```sh
node infra/local/stack.mjs up --lane 5 --growth --no-smoke
LANE5_ADMIN_DB=postgresql://postgres:foundation-test-only@127.0.0.1:56450/creator_stack LANE5_WEB_ORIGIN=http://localhost:56452 node tests/scenarios/lane-5/e5-5-public-posts.mjs
```

The `--drain` option reproduces Studio's manual effects action for comparison;
the passing final run does not use it. Only the disposable lane 5 database is used.
