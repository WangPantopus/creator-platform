# Coverage: every finding has exactly one owner

This maps each finding in the [launch review](../operations/launch-review-2026-10-08.md), and the
items added since, to one lane and work package (WP). If you find something that is not here,
or here twice, tell the integrator. "Done" means already merged to `main`.

## Cross-cutting (review section 3)

| Finding | Owner |
| --- | --- |
| No production composition | Lane 2, WP 2.2 (adapters: C2 with lane 1) |
| Pinned catalogues change on every migration | Lane 2, WP 2.9, with the integrator's migration queue |
| One serial generation worker, 1 s poll | Lane 3, A2 and A6 |
| Heavy client polling | Native: 7.8. Studio web: 6.9. Fan web thread: A7 |
| Strict JSON decoding in the Android client | Done (release builds tolerant) |

## Moment 1, the first answer (section 4)

| Finding | Owner |
| --- | --- |
| Latency ranks 1 and 2 (repeated verification, definition cache) | Lane 3, A3 |
| Rank 3 (model safety check off the acknowledgment path) | Lane 3, A5 (founder sign-off) |
| Rank 4 (wake the worker) | Lane 3, A2 |
| Rank 5 (paint from the frame) | Lane 3, A7 and contract C5; native follow-up 7.8 |
| Ranks 6 and 7 (fewer transactions, parallel classifier) | Lane 3, A4 |
| Rank 8 (small guard, caching, pre-warm) | Lane 3, B6 |
| Rank 9 (multi-worker, locks, hold sizing, unknown cost) | Lane 3, A6; hosting side 2.4 and 2.8 |
| Guard false positives, exact-reproduction, fallback copy for distress | Lane 3, B1 |
| Evidence starvation, follow-up retrieval | Lane 3, B4 |
| The fallback rate on a creator's FAQ set | Lane 3, B2 |
| A second version cannot be published without fan samples | Lane 3, B2 |
| Citations open a whole chunk and break on re-ingest | Lane 3, B3 |
| Lease, lock, cost-hold and unknown-cost hazards | Lane 3, A6 |
| In-flight takeover not qualified (INV-03) | Lane 3, A3 and A7 (tests) |
| No universal or app links; blank creator page; generic invite; link preview | Lane 5, 5.6 and 5.7; apps 7.6 |
| Per-post "Ask about this" blocked twice | Later (lane 5, 5.x if cheap) |
| Path to first message is six screens | Lane 5, 5.7 |
| Public read path takes a row lock twice per request | Lane 5, 5.6 |
| Push tap for a returning fan lands on first-conversation consent | Lane 5, 5.3 (C7) and lane 7, 7.7 |

## Moment 2, being remembered (section 5)

| Finding | Owner |
| --- | --- |
| Extraction and open loops not wired; no follow-up on return | Lane 3, B5 |
| Consent is manual only; no in-thread prompt; sensitive proposals stored first | Lane 3, B5 (INV-23) |
| Exclusion makes the whole thread stateless | Lane 3, B5 |
| The guard cannot pass memory-based sentences | Lane 3, B5 with B1 |
| Memory job must not delay the composer | Lane 3, B5 (job after the answer) |
| Memory UI on native | Lane 7, 7.4 (C6) |

## Moment 3, the person shows up (section 6)

| Finding | Owner |
| --- | --- |
| Fans cannot read members or tier Notes | Done (tenure wired) |
| No delivery to the thread or phone | Lane 5, 5.1 |
| No push can send | Lane 5, 5.3 |
| 0 of 19 notification types fire | Lane 5, 5.2 |
| Every Note reply waits for an ops decision | Lane 1, 1.6 |
| Native Notes, reactions and calls are bare text | Lane 7, 7.4 (C4) |
| Digests have no producer | Lane 5, 5.5 (page: lane 6, 6.7) |
| "Let my AI use this" effect never drained | Lane 5, 5.1 (drain, or the toggle goes away) |
| Followers audience (follow migration reserved) | Later |

## Moment 4, honest money (section 7)

| Finding | Owner |
| --- | --- |
| 1 No scheduler or webhook | Lane 4, 4.2 (production index with lane 1) |
| 2 Late decline | Done |
| 3 Stripe never run; no money tests | Tests done; the run: 4.7 |
| 4 Accept, reply, deliver is 3 screens and 2 ceremonies | Lane 4, 4.4; screens: lane 6, 6.5 |
| 5 Eligibility field not writable | Lane 4, 4.5 |
| 6 Retry key, minimum price, 1,000-intent scan | Lane 4, 4.6 |
| 7 Public capacity and ETA blank | Lane 4, 4.9 (C8) |
| 8 Pending publication stuck after the signature window | Lane 1, 1.5; screen: 6.10 |
| 9 Passkey recovery revokes all past signatures | Lane 1, 1.5 |
| 10 Publication worker never started; paid voice cannot be offered | Lane 2, 2.4 (run the worker); voice is later |
| 11 "Ask Maya to step in" always shows | Lane 3, B9 |
| 12 Copy defects | Lane 4, 4.12; question input: lane 6, 6.6 |
| Defects found by the money tests: five fixed; DB capture guard | Fixed; guard: 4.1 |
| Failed refund neither retried nor escalated; refunds still count against the limit | Lane 4, 4.3 |
| Native "Send request" disabled (Q04) | Lane 4, 4.8 with lane 7 |
| Membership purchase in the apps | Lane 4, 4.10 and lane 7, 7.9 |
| Packet and checkout match the design (ETA range beside the deadline, in-flow limit, terms block) | Lane 4, 4.13; native rendering 7.4 |

## Moment 5, the creator's five minutes (section 8)

| Finding | Owner |
| --- | --- |
| Twelve taps to accept and deliver; decline takes four | Lane 6, 6.5 |
| Queue header, rule cards, draft-ready flag | Lane 6, 6.4 |
| Note takes three taps; reaction two plus a signature | Lane 6, 6.2 and 6.3 |
| Digest page empty | Lane 5, 5.5; lane 6, 6.7 |
| Memory panel in the thread audit | Lane 6, 6.6 with lane 3, B5 |
| Studio polls every 4 s | Lane 6, 6.9 |
| The native Studio | After the pilot (a separate app) |
| AI-drafted replies (`approved_draft`) are not generated | **Open scope question**, see below |

## Share card and phone apps (section 9)

| Finding | Owner |
| --- | --- |
| Share card: every piece but the join | Lane 5, 5.8; native share sheet: lane 7, 7.4 |
| Metrics: 16 types and no emitters; small-group suppression; no arrival counter | Lane 5, 5.9 |
| `useful_answer` never recorded | Lane 5, 5.7 |
| Launch kit is one button | Lane 5, 5.10 |
| Release builds cannot sign in | Lane 1, 1.2 and 1.4; screens: lane 7, 7.5 |
| No links, entitlements, push | Lane 7, 7.6 and 7.7; server files: lane 5 |
| 27 of 53 components catalogue-only (terms block, ETA line, composer states, notification rows) | Lane 7, 7.4 |
| Step-in seal and visibility, citations chip, 3-hour reminder, 18+ screen, consent, raw ids in pickers | Lane 7, 7.4 |
| Back, insets, drafts, rotation | Lane 7, 7.2 and 7.3 |
| Offline cache is a 5 s lease; frames trigger refetch | Lane 7, 7.8 (C5) |
| `HttpURLConnection` never cancelled | Lane 7, 7.8 |
| Icon, release config, `targetSdk` 36, `minSdk`, call permissions and services, export compliance | Lane 7, 7.9 (decisions: founder) |
| About 470 literal strings on iOS | Lane 7, 7.10 |
| Thin native tests (session, Keychain, thread model, push) | Lane 7, as each is touched |

## Comparison (section 10)

| Finding | Owner |
| --- | --- |
| Keep installed and off; no new comparison features | Integrator rule |
| Withdraw-only mode with retry, overdue-purge alert, runbook | Lane 1, 1.8 |
| FAQ check replaces the fan-sample gate | Lane 3, B2 (also guards `AgentService.read` against a policy lapse on 2026-11-01) |
| "AI comparisons are not available yet" copy; Test tab polls with a lock | Lane 3, B9 (web) and lane 7, 7.4 (native) |
| `CreatorAI.tsx` freshness fixes | Lane 3, B8, only if comparison is switched on |
| After the provider switch, a live version cannot compare, publish or roll back | Lane 3, B6 (switch before any real creator publishes) |

## Documents, weight and the Anthropic switch (sections 12 and 13)

| Finding | Owner |
| --- | --- |
| Decision log, `CURRENT`, handoffs | Integrator |
| Evidence size guard in CI; CI path filters | Integrator |
| `Studio.tsx` split | Lane 6, 6.1 |
| `CreatorAI.tsx` split | Lane 3, B8 |
| `CommerceScreen.tsx` has the same shape | Lane 4, when touched |
| Anthropic checklist, items 1 to 9 | Lane 3, B6 and B7 |

## Not reviewed in the launch review

Ops console and trust authorities beyond what was cited: lane 1 reads them in 1.6. The 2,159-line
`fulfillment-plans.ts`: lane 4 reads what it needs. Translation, style and lifecycle modules:
untouched unless a WP needs them. Calls, media, voice, the pass: later.

## Items that belong to the founder (not to a lane)

Pilot sign-in option and 18+ method; account id; hosting and domain (Q09); Apple and Google
accounts; Stripe test keys and topology (Q03); a Touch ID ceremony and creator approval;
Anthropic key and the embedding choice; counsel on Q04 and 18+; icon art; export-compliance
answer; the price rule under INV-21; safety sign-off for A5; the single-signature option under
INV-22; pilot creators and a named ops reviewer; written replies before voice notes; the
launch-quality bars.

## Open scope question

**AI-drafted replies.** Design 4c-02 shows the creator reviewing an AI-prepared draft and sending
it as `approved_draft`; the code generates no such draft, and the Studio shows a blank reply box.
Is an AI-prepared draft part of the pilot? **Recommendation: no for the alpha; add after the
first creators have used the blank-box flow.** If yes, the draft generation is lane 3 and its
screen is lane 6.

## Overlap check

Two lanes might touch the same file in these places, each with a rule: `generation-pipeline.ts`
(lane 3's two tracks: small diffs, rebase often); `packages/api/src/<domain>.ts` (each lane edits
its own domain file); `config/copy.json` (additive keys, integrator review); `server.ts` and
the migration registry (integrator only); the fan thread screen (lane 3 owns it; lane 5's Note
rendering is a ticket to lane 3 or lane 7 per contract C4); the `you` page (lane 3 owns the page;
lanes 4 and 5 provide components in their own folders).
