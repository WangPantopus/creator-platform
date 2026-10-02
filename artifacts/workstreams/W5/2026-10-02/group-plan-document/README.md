# Immutable fulfillment reference in C08

Implemented: optional nullable `planRef` uses W4's exact `CommerceFulfillmentPlanRef` from `58d39e671609750fac88a3fa11f22ab9d2eccd51`; copied contract SHA256 `8e4079e264038b5a18fa3eef80a18d9339c3b37c92c7b183a830961224bbd50e`. No default is added. A reference is valid only for a public answer with no single packet, quote, live entry or schedule, and either public audience or the one matching plan ID. Recipient identities and consent are not in C08.

Runnable: backend/web types, affected lint/format and shared/native generators pass. Generated Swift/Kotlin models retain the optional reference. Current save, view, interactive publication and publication-worker paths explicitly refuse planned answers while the real owner authority is absent; ordinary tier membership cannot authorize a plan ID.

Integrated: canonical document parsing and full publication command retain the reference. W4's genuine stage-specific draft/review/challenge/commit-retry/current-viewer ports and W3's actual `appendSystemLink` remain to be composed. W3 itself records delivery exactly once; W5 must finalize W4's publication after every write, with only COMMIT following. No group mode is offered from this representation change.

Verified: a personal read-only observation on the actual unsigned revision3 Note found the omitted field still omitted and its canonical document SHA256 unchanged (`d1b24ca6580577ced53817761a6350beb1c10cf99a6663e0ff5d1ed491cd03b1`). No database write or synthetic domain record was made. The creator remains DEVELOPMENT-ONLY SEEDED VERIFIED, with no proof or passkey. This observation is not signing, audience, delivery or privacy acceptance.

Release-ready: no. Real owner ports, held0178/0167 activation, current viewer/retraction authority, actual captured recipients, genuine creator signing and personal positive native journeys remain required. No unit or UI test code was added.
