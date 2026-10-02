# Final packet source phase

Implemented source `9adf2e88481984ac9bf56d14c9998596368faba5` personally consumes W1's exact signing finalizer files at `0e494f937b9c0e29b13ac6c047f343799056172f` and adds W5's phased owner-source consumer. The registered Content signing policy requires finalization; the development host preserves and forwards that callback.

Before media, creator, content or idempotency positives, W5 reads the actual stored source tuple and invokes the real configured controller's early preparation. Permission uses that retained source. W5 then finishes all publication, signature consumption, media attachment, effect and idempotency writes before calling the final source gate. A false, denied, busy or unavailable result rolls back the complete transaction, including duplicate-action receipts. A scalar `publicPacket` consent check cannot enable packet publication.

The controller port matches W4's proposed sealed owner graph: `prepare(client, actualActor, {creatorId, contentId})`, `permission(client, actualActor, creatorId, packetId)` and `finalize(client, actualActor, stagedExactTuple)`. W5 retains the actual client, xid, PID, ALS request, original Actor and exact stored tuple/hash. The stage cannot downgrade a published source to a draft:

- `signing_challenge`: actual W1-issued challenge ID, no new publication signature, after all challenge/passkey/profile writes.
- `publication`: actual consumed publication signature, after every domain/idempotency write.
- `review`: null only for a saved draft; the actual stored signature for a published review.

Only metadata and COMMIT follow the real final gate. No fan/thread Actor is manufactured, and the delivered-packet viewer source graph is not used as owner authority. Quote-source projection remains unavailable pending its genuine original-fan authority and retraction producer.

Replay source `6adea1cd26d514d5751d31838c730f4e8353e1e1` personally adds a bounded `onReplay` callback used only by publication. After validating the actual idempotency request hash, it reacquires the current content lock, checks the version/state and original author/signature receipt, verifies the stored source tuple and exact processed media evidence, and reruns current publication validation including W4's staged packet permission. The existing final source gate still runs last. Replays neither consume the signature again nor create domain/idempotency writes. Unpublished, archived or changed revisions cannot return the old receipt as a current grant. Text-only replay does not require the future media-evidence column.

Backend type checking and targeted lint/format checks passed at replay source. Actual paid/signed replay and contention acceptance remain unverified until W4's genuine controller and the required canonical authority wave are configured.

Runnable: backend type checking and targeted lint/format checks passed at this source. The actual held W5 development host launched with its real Trust composition; its current scope remains unavailable because the required future denial projection has not been activated.

Integrated: W1's actual post-write challenge hook is consumed and the W5 policy calls it. W4 was sent the exact matching consumer port. W4's actual sealed controller and W1's original-acceptance signer gate are not configured here yet, and no reserved SQL was activated. Their absence refuses packet review/signing/publication; it cannot create a positive receipt.

Verified: static source checks and actual host startup only for the new phased path. No paid packet, genuine signed Note, source-fence contention or durable delivery was fabricated. The creator remains DEVELOPMENT-ONLY SEEDED VERIFIED (2026-10-01T20:44:26Z), without proof/passkey. Release-ready: no.
