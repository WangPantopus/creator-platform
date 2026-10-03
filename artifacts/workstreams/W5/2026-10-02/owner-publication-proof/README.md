# Publisher proof for public projection

Implemented source `5b95b8904e76ec7d8ec9f8388092eaf1a5c82aaf` corrects W5's internal `publicationProof`. It uses the actual current publisher request and held transaction, without issuing the publisher an own-fan audience scope, requiring self-follow or calling fan eligibility. It returns the exact stored `ContentView`, complete command, signature ID and processed-media readiness from the same current revision.

The proof checks the stored index/document audience and source binding, current publisher role, original publication author/signature, live and count producers when required, processed media evidence and actual W6 readiness before returning. Packet and quote proofs remain explicitly unavailable until their real original-source authority and retraction graph are composed. The viewer's delivered-packet source graph cannot substitute for owner authority, and no late negative lease is taken below business locks. A proof does not authorize recipients after commit; W7 must separately verify the actual public signature, eligibility and retractions.

Runnable: backend type checking and targeted lint/format checks passed. The actual held W5 backend launched at this source. Integrated: the canonical service return includes `proof.view`; W7 was sent the immutable checkpoint for its separate Growth consumer update. That consumer update is not claimed here.

Verified: source checks only for the new proof path. The actual fresh W5 database has no published signed Note, paid history or media publication. No proof, signature, fan permission, delivery or source approval was fabricated. The creator is DEVELOPMENT-ONLY SEEDED VERIFIED (2026-10-01T20:44:26Z), without genuine proof/passkey.

Release-ready: no. Personal positive publication/withdrawal operation, W7's actual consumer and the remaining original-source/media/signing authorities are still required.
