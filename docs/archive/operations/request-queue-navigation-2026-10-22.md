# Request queue navigation and narrow layout

Verified locally on 2026-10-22 against the preserved `integrated-1022` stack:
API 56631, web 56632 and PostgreSQL 56630 / `creator_stack`. The browser ran
the real application. The development identity, software passkey and Stripe
processor on 56584 were synthetic outer edges; no real payment was attempted.

Commit `4d8c61d74` replaced the Requests page's outer button with a neutral
container and connected the shared card's navigation callback. The card only
renders actions with supplied callbacks. A submitted request has an `Open`
button, and an accepted commitment retains its existing `Deliver` label; both
open the exact packet detail page. The actual `Decline` decision remains on
that detail page.

The browser check found that the card's metadata and due date overflowed a
320-pixel window. The queue header now wraps, and card metadata, dates and long
handles can wrap within the card. The rule is specific to the shared queue
card so Studio's general metadata rule cannot restore `nowrap`. Words, prices
and dates remain intact.

## Operated checks

The existing lane 4 helpers created one submitted packet and one accepted
commitment through the real commerce and signing APIs. The software passkey
credential row stood in for the registration ceremony; acceptance still used
the actual begin/verify/decide endpoints. A temporary helper copy restricted
its database guard to this task's `127.0.0.1:56630/creator_stack` database.

| Check                                                       | Observed result                                                                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Submitted packet, desktop Light and Night at 1280 pixels    | Enter on `Open` reached that packet's detail page                                                                  |
| Accepted commitment, desktop Light and Night at 1280 pixels | Space on `Deliver` reached that commitment's packet detail page                                                    |
| Both cards, phone Light and Night at 320 pixels             | All four keyboard navigations passed                                                                               |
| Queue controls and detail actions                           | No nested buttons or callbackless queue `Decline`; the real detail `Decline` remained present                      |
| Card geometry in all eight journeys                         | Page width equaled viewport width, and handle, price/offer metadata, summary and due date stayed within their card |
| Browser requests and runtime errors                         | Zero API writes during navigation and zero uncaught page errors                                                    |
| Exact financial state before and after navigation           | Packet, ledger, effect, commitment and processor intent snapshots were unchanged                                   |
| Existing money invariant sweep                              | All nine invariants passed                                                                                         |

The final run passed all ten steps: eight browser journeys, the unchanged-state
comparison and the existing invariant sweep. Phone Light/Night and desktop
screenshots were inspected. CSS formatting and `git diff --check` passed.

The submitted packet is `7192ec4b-6f4a-4323-95c0-466462a4a60e`; it retained
one 5000-cent USD hold and `submitted/requires_capture` state. The accepted
packet is `96c02e96-9862-405d-bea7-221a5059d9f1`; it retained one hold, one
5000-cent capture and a `due` commitment. Opening either did not charge,
release, decline or fulfill it. The scenario's unique offer was paused through
the real API after setup; the packet and commitment remain as observed.

The initial probe looked for `Open` on the accepted card and failed before
activation because that card is labelled `Deliver`. The corrected probe reused
the same packets. An intermediate layout probe also caught Studio's later
`nowrap` override; the final scoped rule and repeated geometry checks resolved
that defect. These earlier failures are not counted as passing checks.

Local artifacts are under `/tmp/qelvora-runtime-review-1022/`: the final log is
`queue-browser-wrapped-final.log`, exact snapshots and geometry are in
`queue-results-wrapped.json`, and inspected screenshots begin with `wrapped-`.
The original navigation and intermediate layout logs are retained there too.
These temporary files are local evidence, not durable deployment artifacts.

## Repeat the navigation check

The reusable probe is now preserved as
`tests/scenarios/lane-6/e6-requests-navigation.mjs`. It accepts existing packet
IDs and configurable loopback API, web, database and fake-processor URLs. It
uses the existing lane 3 database helper and lane 4 invariant sweep. The
portable extraction was syntax-checked, linted and formatted; the operated
results above came from its temporary predecessor.

Prepare the two fixtures through the existing lane 4 APIs: sign in as a fan,
create an offer as its creator, submit two requests with distinct summaries,
then accept one with the creator's actual signed-act flow. The fixtures must
belong to the same creator and retain a submitted hold and accepted/due
commitment. The processor must retain their original intent state. The probe
does not create fixtures, enroll a passkey, approve a request or alter payment
state. Its development actor label defaults to Maya's actor three; use
`--actor` for a different configured development creator.

For the preserved fixtures from this run:

```sh
node tests/scenarios/lane-6/e6-requests-navigation.mjs \
  --api http://127.0.0.1:56631 --web http://localhost:56632 \
  --stripe http://127.0.0.1:56584 \
  --db postgresql://postgres:foundation-test-only@127.0.0.1:56630/creator_stack \
  --submitted 7192ec4b-6f4a-4323-95c0-466462a4a60e \
  --accepted 96c02e96-9862-405d-bea7-221a5059d9f1 \
  --out /tmp/qelvora-requests-repeat
```

This is a read-navigation check against a running local development host,
not an authority substitute or a production-payment scenario. Fixtures that
have naturally expired or changed require fresh setup through their APIs.

The restored database had no commerce packets or effects before this fixture,
so the newly started fake Stripe state had no older payment references to
reconcile. The existing published AI version, unknown-cost receipt and deletion
jobs were not edited for this queue check. No SQL, migration or catalogue pin
changed.
