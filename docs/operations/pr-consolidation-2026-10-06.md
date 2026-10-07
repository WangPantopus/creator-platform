# Draft reconciliation and foundation extraction — October 6, 2026

Baseline main is `23b9d626b647f30ca4b87de2a3b25fb2c894e54a` (31 prior review merges). All 20 original draft heads were compared locally before implementation. [Exact inventory and evidence](../../artifacts/pr-review/2026-10-06/foundation-settlement/) retain their source refs. Final tree differences include shared history and newer main fixes; a missing exclusive file does not prove supersession.

## Consolidation completed

- **#182 closed unmerged into #63.** Complete trees at `a3a42678b404a60690b9fef94a409f4fe760cf7d` and `82c9abffdb00f73bc7ba3fb4baedb508b1170917` both equal `83d3b40b5a2d921e572a1307343f08b51706de9a`. Its branch/historical review anchor are preserved. All conversation/privacy qualification remains on #63.
- **#288 closed as consumed by main.** Relative to its real merge base `d2f541c3c2b0d8b356fb2d3c08cc1ff96f9ba9f5`, its only production change is Studio.tsx. Complete own-diff and current-main comparison are saved: role editor, exact retry and draft-role guards are already merged in #310; current main adds #311 design and #313 accurate saved-draft status. Its eight historical evidence/docs files and branch remain available. Its inherited unfinished integration graph is still tracked in #74 and owner drafts.

There are now **18 original open drafts**, not 20. These closures do not count as new merges or product acceptance.

## Reused foundation change

Implementation `b81d6de4e7c05c1213362096f8d8fc67e4e279f9` copies five reviewed files byte-for-byte from #74 `5b1675ca155f87957c8ad62201097de2563c3c4f`: Identity transaction, Creator/Audience scopes, Access and Database. The first three transaction consumers also match #132/#63 (and other integrated drafts). The existing ContentHeldClient and request-context helper are already on main and remain unchanged.

Known failures roll back before release. Uncertain transport/BEGIN/COMMIT or expiry closes/discards the original connection; context restoration does not append SQL after an uncertain callback. Identity retains its connection while awaiting the entire owner callback, including after its five-second host deadline. This does not impose a five-second whole-callback completion guarantee. No task, actor, policy, schema, provider or privilege is added.

Personally operated PostgreSQL17 on the preserved canonical 61-migration review database:

- Known commit persisted one temporary row; known 409 refusal rolled its second row back, with the same healthy PID available afterward.
- At5050ms the expired transaction still held its original connection (one total, zero idle) while the owner callback was running. The callback's late query failed against the closed socket; it settled at5153ms and released/discarded the client. The next transaction used another PID.
- A real50ms query-read timeout returned at59ms, with no pooled original client; both closed PIDs were absent at the later database observation. These resource operations create no request/task authority and are not positive generation qualification.
- Actual canonical browser sign-in, account restoration and My AI draft load succeeded. A real account advisory lock made profile Save return503 in2019ms; the actual page kept its input and recovered its button. The unchanged retry returned200 in18ms, and reopening the editor showed the saved text. The intro was then restored blank through the same UI. Creator verification remains pending/version9; no threads or generations were created.

Backend types, scoped lint/format/diff and production build pass. No new test code/suites. Web/native/design inputs unchanged (discard only Next's generated next-env change). Populated conversation/audience operations and genuine provider generation remain unqualified.

## Remaining drafts and next dependency order

| Draft | Retained work / next qualification |
| --- | --- |
| #74 | Foundation: remaining Team invitation acceptance/removal guards, original actor handling, native Team, broader held worker/publication integration. Reuse its code in qualified pieces while preserving newer main fixes. |
| #132 | AI input/retrieval/admission/accounting and complete worker composition. Host currently unconditionally adds “current generation worker composition (W3/W1/W2/W4)” to missing dependencies when generation is requested. This is unfinished engineering, not merely a missing provider key. |
| #63 | Canonical conversation/privacy host, now also retains the identical #182 source. Depends on current generation graph and full export/purge qualification. |
| #131, #145, #247 | Original worker/terminal negatives and safety accounting; finish exact dependency/catalogue/compiler/physical-settlement qualification before activation. |
| #200 | Exact-version reply review and session transport; retain unique review behavior beyond already merged Support fixes. |
| #262, #302 | Original publication worker then Content recipient output; qualify actual creator-approved publication and final commit. |
| #305 | Media session, recording/photo and publication custody; verify original-session/lost-ack behavior with actual media. |
| #284 | Native recorder cleanup; needs actual record/play/dismiss and adoption-race operation. |
| #36, #242 | Privacy revalidation and original-task family authority; combine with #63 only after exact source coverage and full-domain lifecycle checks. |
| #301 | Commerce export settlement; external sink lifecycle still needs enforceable cancellation and settlement, not an abandoned promise race. |
| #192 | Finite development feedback consent/withdrawal/expiry; retains distinct policy and lifecycle requirements. |
| #31 | Remaining populated Growth publication/notification/share/return flows beyond already merged session and worker fixes. |
| #282, #303 | Calls and native Commerce session custody; actual native lifecycle/provider operation still required. |

Engineering-owned migration/compiler/catalogue/host integration can advance autonomously. Production proof, real creator licensing/consent, designated provider policy and hardware-only/native acceptance are separate genuine prerequisites. Synthetic local development must stay explicitly labeled and cannot establish production approval. Do not replace these distinctions with a blanket “all blocked” or claim the entire app is complete.
