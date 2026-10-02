# Exact Note reply review — implemented, acceptance pending

The [receipt](receipt.json) records source, experimental SQL, real browser refusal and non-owner negative integration checks. Canonical registry/history remain forty rows; final0053/0045/0069 were applied only to a separately labelled synthetic clone.

W8 provides `createTrustReplyReviewer()` for W5's actual held transaction after source insertion. The SQL checks a current author session, actual signed/published Note and current verified creator, exact reply/version/canonical text hash and current participant denial. One durable safety case exists per exact tuple. `pending` has a queue reference; `allowed`/`flagged` require an append-only recorded reviewer decision matching the current resolved case version. Ops reads current source text only under its purpose lease and audit; no raw private reply snapshot or invented Note retention period is stored. Changed/withdrawn replies cannot be allowed. Trust export/delete includes/removes the scoped association and decision metadata.

Personally operated: genuine browser sign-in as the existing synthetic creator; passkey enrollment returned403 `fresh_proof_required`. No proof, credential, signature, Note, follow consent or reviewer outcome was fabricated. Actual stored content and credential counts remain zero. A real signed Note/reply and Ops decision journey therefore remains unverified pending the already requested proof input or explicit labelled fixture authorization.

Negative integration resolved the genuine browser cookie with SessionService, then checked missing request authority401, nonexistent source403, altered tuple hash409, and actual42501 denials for core private association SELECT, decision INSERT and Ops evidence EXECUTE. Both new tables enforce FORCE RLS; the NOLOGIN projection role has no memberships. Backend/web typechecks passed; no new unit tests. These checks are not positive queue/idempotency, native form, release or preserved-recovery acceptance.

Services/devices stopped with data retained. Private env, browser cookies, operator scripts/logs and proof codes are excluded from Git and this receipt.
