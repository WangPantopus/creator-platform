# W5 group publication consumer

This consumer composes actual `CommerceFulfillmentPlans`, `ConversationService`,
`Database`, and `AccessService` instances with the canonical Content pool. IDs,
host callbacks and a historical system link do not confer publication access.
The minimum recipient count remains W4's explicit founder configuration.

## Owner source custody

W4 owner dependencies were taken byte for byte from
`a632cd7ad5af0e4dffc2385cc3b8497961fb23dc`, including W3's personally confirmed
main-compatible system-link implementation. `fulfillment-plans.ts` is updated byte for byte to W4
`5a7925ef91fee53386136708a28eb1818b5ae8c4` for genuine empty saved-draft
retries and bounded creator draft reads. `fulfillment-view-authority.ts` retains
W4 `84a035328150746e6a94cbce8e511de87b469109` and its actual W1 held
request-session consumer. These dependencies retain their held SQL and catalogue
pins; this change registers and activates no migrations.

## Actual transaction order

| Operation            | Preparation and positive work                                                                                                                                                                                                              | Last owner gate                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Save                 | W4 `prepareDraft` resolves every original recipient's negatives; W5 holds creator/content/media positives; W4 holds original positives; W5 saves the next exact document and idempotency receipt                                           | `finalizeDraftPublication`                                     |
| Save retry           | Read only the actual actor's committed `content.save` receipt hash and ID/version metadata; compare the complete submitted command; W4 `prepareDraftRetry` checks the current next draft, including empty text; acquire the same positives | `finalizeDraftPublication`                                     |
| Review               | Prepare the current stored plan before body/creator/content/media positives; validate the exact document; acquire W4 positives                                                                                                             | `finalizePublicationReview`                                    |
| Signing challenge    | Same preparation, exact command and positives; W1 writes its real challenge                                                                                                                                                                | `finalizePublicationChallenge` with that actual challenge ID   |
| Publish              | Same preparation and positives; consume the real creator signed act and write the exact publication; append W3's neutral link in each original asker's thread; W3 records each W4 delivery once; write idempotency                         | `finalizePublication` with that actual consumed act            |
| Publish retry        | W4 prepares the exact current committed publication; W5 checks the stored command and receipt; acquire positives without issuing recipients                                                                                                | `finalizePublicationRetry`; no signature reconsume or new link |
| Creator saved return | Prepare the actual current publication/draft before role/content positives; return the authorized owner's view                                                                                                                             | Review or committed retry gate                                 |

Only COMMIT follows each final owner gate. The consumer retains the actual
Actor, request, pool client, backend PID and full transaction ID throughout.
W3's link says `Answered publicly.` and carries only the versioned destination
tuple. Its system author has no fabricated creator signature, private answer
body or supplied URL, and it does not alter takeover control or its epoch.

## Open integration and verification

Fan reads of planned answers are refused using tuple metadata before ordinary
audience preparation; a fulfillment plan ID never enters tier-group permission.
Single saved return and mixed Studio pages consume the actual bounded W4 read
batch (including empty drafts) without a recipient proof or mutation authority.
A page change or over-bound original set refuses the whole read rather than
omitting an answer. The immutable public index tuple also closes fan planned
answers before revision RLS could hide their plan metadata. Genuine
0199 view issuance, W8 0200 all-original negatives, W4 0202 descriptor matching,
the final capture/refund/dispute and signature/source-retraction checks remain
necessary before fan body access. Group public projection remains pending its
real source-retraction adapter.

Group media waits for an actorless owner publication task. AI reuse waits for
its actual original-source verifier. No captures, approval, signature, passkey,
system message, frame, delivery or privacy receipt was produced during source
qualification. There is no Stripe sandbox on this host. Shipping native link
operation and all positive group acceptance are unverified.
