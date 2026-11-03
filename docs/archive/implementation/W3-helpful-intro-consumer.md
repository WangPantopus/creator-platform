# W3 helpful feedback and W1 intro offers

W3 consumes W1's corrected `Database` and `IdentityIntroOffers` from `97de72ff9244c1341dd01ee41bcb3895d2f16542`. A held interactive binding exists only for the actual validated request session and executing callback. Separately scoped background callbacks retain their existing authority and cannot use the intro-offer port.

`ConversationLineage.configureIntroOffers` accepts only a genuine prepared `IdentityIntroOffers` instance on the actual conversation pool. The host prepares it on its canonical `Database` only when the actual feedback authority and W8 account-level offer policy are supplied. No synthetic policy, expiry or approval is substituted. Absent offer configuration leaves the existing feedback path independent.

After the exact delivered AI reply's explicit consented helpful INSERT/UPDATE, `feedback` awaits `afterHelpfulInTransaction` on that original write transaction with message ID/version and agent ID/hash. Failure rolls back that write. Delivery, generation completion, not-helpful feedback, withdrawal and old rows never mint eligibility. The feedback response contains `rating` and nullable `introOffer`; an offer ID means committed eligibility, not that any screen was displayed.

The current family's GET `intro-offer` runs `pendingInTransaction` inside a held fan read. POST `intro-offer/acknowledgement` accepts only `{offerId}` and awaits the owner's acknowledgement inside a held fan write after the actual client Save/Skip. Missing configuration refuses. The web BFF preserves its existing current-account, origin, path and no-store checks for both endpoints. W1 owns actual presentation and Save/Skip wiring on all three clients.

This source creates no migration, backfill, approved policy or helpful fixture. Positive, lost-response, concurrent-profile, withdrawn-consent and all-three-client acceptance still require real policy composition and a genuinely delivered/rated reply. Public intro editing is separate from consent to use an intro with a creator's processor.
