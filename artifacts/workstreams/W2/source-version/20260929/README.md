# W2 actual run — source/version/Studio

Run started 2026-09-29 America/Los_Angeles; later observations cross UTC midnight. The W2 primary performed all implementation/build/launch/input/verification. Agents were read-only researchers. No new test code was written. Foundation and peer work are uncommitted and preserved; baseline HEAD ba2ee4fe9cc029cb5252b2c0ad2f9c582f925892 is not the complete source state. Owned-file hashes are in source-sha256.txt.

## Environment and truthful scope

- macOS27.0 build26A428, Node24.13.0, Next16.3.7, actual Codex in-app browser.
- W2 web127.0.0.1:3002; API127.0.0.1:4102; pgvector/PostgreSQL17 container creator-platform-w2-20260929, loopback55442/database creator_w2, non-owner creator_runtime with forced RLS; ingestion w2-local.
- Actual Next.js routes: /studio/ai, /sources, /style, /rules, /test, /versions, /license, /interview, /onboard. These are functional Studio routes, not /design or a component catalog.
- Development-only W1 synthetic account10000000-0000-4000-8000-000000000001, pending creator20000000-0000-4000-8000-000000000002. Second account ending2 used for denied-owner API read. No production authority or verification was minted.
- Model/embedding/classifier/provider mode: **unconfigured**. Reviewed license verifier and privacy-safe shadow feed absent. No invented keys/model rates/legal terms/provider passes. Local deterministic crisis preview is not a provider response or fan delivery.
- Desktop1280×900 Light; phone390×1300 Night. No native devices leased, built, installed or changed by W2: current native chat has no connected W3/W2 path. Production fan web is also unavailable. Native component catalogs are not acceptance evidence.
- Runtime web copy /private/tmp/creator-w2-workspace/apps/web; separate production-build copy /private/tmp/creator-w2-build/apps/web. Peer .next/Gradle/DerivedData/resources untouched by W2. A failed build in the runtime copy was isolated to its own cache and the own dev server was restarted with a fresh cache.

## Personally executed journeys

| Actual steps                                                                                                              | Expected and observed durable result                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop Sources: enter title/text/rights; save candidate; refresh; review exact source; confirm rights and approve        | Candidate persisted; input survived initial origin error; actual approval queued ingestion. Worker progressed then failed because embeddings are unconfigured. No approved/indexed source or false success.                                         |
| Desktop Style: edit practical style card, rules/never-reveal and usefulness/style criteria; save; restart API and revisit | Configuration persisted with exact revision. Browser return visit showed saved source/style.                                                                                                                                                        |
| Desktop Test: Run evaluations                                                                                             | Actual API503 model_unconfigured; six NOT RUN rows, publish disabled. No fabricated transcript, token usage or pass.                                                                                                                                |
| Phone Night My AI and Test; enter “Synthetic scenario: I might hurt myself.”; Send                                        | Actual pipeline returned labeled AI safety resources; browser said “Draft preview complete.” Local branch86ms total /0ms first approved, usage0/cost0 because no provider call. No paid/fan-delivery proof implied.                                 |
| Desktop Sources: enter synthetic weekly update; focus save button and press Return after mouse-control delays             | Browser “Weekly update saved”; database status contains synthetic text and explicit expiry2026-10-07T00:43:15.706Z.                                                                                                                                 |
| API duplicate import of exact existing text/scope                                                                         | HTTP200 duplicate:true and same source ID; database source count remains1.                                                                                                                                                                          |
| API revoke source; read actual state and SQL                                                                              | Source revision2/state revoked; workspace paused; live version null; chunk count0/effective source count0. Browser visibly shows revoked row and Restore. Browser revoke confirmation itself was not completed; mutation verified through real API. |
| API actor2 attempts own-creator state read                                                                                | HTTP403 creator_required. No state disclosed.                                                                                                                                                                                                       |
| API stale publish revision0, then current pending-creator publish                                                         | HTTP409 draft_changed; HTTP403 verification_required. No version created.                                                                                                                                                                           |
| API NUL-damaged source and 250001-character source                                                                        | HTTP400 source_damaged / invalid_request. No extra source inserted.                                                                                                                                                                                 |
| Final API malformed JSON                                                                                                  | HTTP400 invalid_request, fixed redacted message; no raw body or stack returned.                                                                                                                                                                     |
| Restore revoked source without rights; audio consent with no provider; expired weekly update                              | HTTP403 rights_confirmation_required; HTTP503 audio_interview_unavailable; HTTP400 status_expiry. No state change from denied actions.                                                                                                              |
| API text interview                                                                                                        | HTTP200 revision6; story/boundaries persisted. It did not become an approved source automatically.                                                                                                                                                  |
| API sponsor create, then deactivate same brand                                                                            | Both return stored ID429982c2-faac-4ae7-8393-51fc0a7606f9; one stored inactive sponsor. Sponsor update fix also allows existing brand update at capacity; the full20-entry capacity case was not separately exercised.                              |
| API synthetic paraphrased correction                                                                                      | Stored regressionced7049a-c579-4ddc-86b8-2aaaf29823b8 and added practical-step rule; no raw fan conversation copied. Actual regression evaluation remains blocked by provider.                                                                      |
| Actual creator export and DB read                                                                                         | Sources/configuration/interview/status/license/sponsors/regressions/version history exported; no top-level fan message/memory store. Database: source1, effective0, chunks0, versions0, evaluations0, regressions1, sponsors1.                      |
| Final API comparisons read                                                                                                | HTTP200 available:false/items:[]; privacy-safe feed absence is explicit.                                                                                                                                                                            |

Input was synthetic creator-owned craft material. Source ID67082ac7-28a3-4e43-a5fb-03c2c4c21f8f. Export is sanitized synthetic data, not a production creator/fan export.

## Observed timings

These are individual wall-clock HTTP observations on a shared local development machine, not a named agreed load profile or p95 evidence. Browser automation itself showed long CDP delays/timeouts; its duration is not model latency.

| Observation                                               | HTTP / elapsed                                              |
| --------------------------------------------------------- | ----------------------------------------------------------- |
| Duplicate source                                          | 200 /2.256849s                                              |
| Revoke source                                             | 200 /1.374125s                                              |
| Denied actor                                              | 403 /0.708743s                                              |
| Stale publish                                             | 409 /1.738105s                                              |
| Pending verification publish                              | 403 /0.803186s                                              |
| Damaged / oversized source                                | 400 /0.236199s;400 /0.076264s                               |
| Initial / final synthetic export                          | 200 /0.278760s;200 /4.000885s                               |
| Final invalid JSON / comparison read                      | 400 /0.365848s;200 /0.495001s                               |
| Text interview / sponsor create / deactivate / correction | 200 /0.389554s;200 /0.930015s;200 /1.591775s;200 /3.921066s |
| Rights/audio/expiry denial under later local load         | 403 /11.460375s;503 /10.374247s;400 /7.345793s              |
| Phone deterministic safety preview                        | Pipeline86ms, first approved0ms; no model tokens/cost       |

Revocation occurred with no active provider generation, so1.374125s is not evidence of the five-second live-stop guarantee. Warm/cold model latency, accepted-message/takeover p95, cost-weighted settlement and provider retention are unmeasured.

## Builds and checks

- W2-owned ESLint and Prettier check: pass.
- Latest full backend TypeScript check: pass. Earlier shared checks failed in peer Commerce/Growth code; they were resolved without W2 editing those modules.
- Full web TypeScript check: pass.
- Final isolated backend esbuild bundle: pass,110.6KB, /private/tmp/creator-w2-build/agent-development.mjs. This proves packaging, not provider/integration behavior.
- Full Next production build: pass,26 static pages plus dynamic Studio/BFF routes; build ID WNrzX38z_NP3vl7f1npAt. Own runtime and production copies separate; missing symlinks in the first copied-build attempt were corrected.
- No new tests or test scripts/suites were created; no existing test changed.

## Screenshots and design comparison

- [Final desktop Light Sources: revoked and check-in saved](sources-revoked-check-in-light.jpg)
- [Phone Night My AI](my-ai-phone-night.jpg)
- [Phone Night actual safety preview, full page](test-phone-safety-night.jpg)
- [Desktop Light Test/provider unavailable](test-provider-unavailable-light.jpg)
- [Final synthetic export](creator-ai-export.synthetic.json)

The actual Sources screenshot uses the reference1280×900 dimensions, sidebar248, main padding36×48, source aside320/gap32, shared fonts/tokens/glyph geometry. Phone capture uses390×1300/16 gutters and safe-area-aware navigation. Corrections during operation: BFF origin compared actual host, failed/candidate source gained revoke control, manual upload kept its true origin, Test/License headings and grids aligned with their reference column, and sidebar/phone glyph paths aligned with shared glyph geometry. Reference files were not edited.

Screens have pending/unconfigured synthetic content instead of fabricated populated reference facts. Development banner and missing-state forms alter heights; DG-W2-01–05 composition and exact populated-reference acceptance remain open. 200% text, screen readers, runtime reduced motion and offline/reconnect were not verified. Later Night Style inspection timed out in browser control and is not claimed. Temporary viewport was restored at the earlier checkpoint. A later desktop1280×900 override was used for Night Style inspection; final reset attempts timed out even after reconnecting browser control. Final viewport cleanup could not be confirmed, and browser control cannot currently establish more acceptance evidence.

## How to resume the current isolated runtime

The existing isolated DB/container and copied web app are preserved. Do not reset them or migrate peer databases. Start the container if stopped:

    docker start creator-platform-w2-20260929

From apps/backend, start the already-provisioned development scope:

    NODE_ENV=development W2_DEVELOPMENT_MODE=true W2_DATABASE_URL=postgresql://creator_runtime:w2-runtime-development-only@127.0.0.1:55442/creator_w2 W2_CREATOR_ID=20000000-0000-4000-8000-000000000002 W2_DEVELOPMENT_ACCOUNT_ID=10000000-0000-4000-8000-000000000001 PORT=4102 pnpm exec tsx src/modules/agent/development-server.ts

From /private/tmp/creator-w2-workspace/apps/web, start the isolated web copy:

    W2_DEVELOPMENT_MODE=true W2_DEVELOPMENT_SESSION=development:10000000-0000-4000-8000-000000000001 W2_CREATOR_ID=20000000-0000-4000-8000-000000000002 W2_API_URL=http://127.0.0.1:4102 node /Users/yingpengwang/creator-platform/apps/web/node_modules/next/dist/bin/next dev --webpack -H 127.0.0.1 -p 3002

Open http://127.0.0.1:3002/studio/ai. Health http://127.0.0.1:4102/health explicitly reports model unconfigured and publication unavailable. These DB credentials and opaque IDs are exclusively synthetic local development values; they are not production authority.

The web copy contains copied apps/web source and links to repository packages/node_modules/backend/design/config. Changes to owned web source must be copied into this runtime copy; shared manifests and peer caches must stay untouched. The production copy uses its own .next. The shared app startup remains W1-owned.

Actual provider configuration consumes OPENAI_API_KEY, W2_SMALL_MODEL, W2_LARGE_MODEL, W2_EMBEDDING_MODEL, W2_PROVIDER_POLICY_REFERENCE, W2_MODEL_RATES_JSON with inputMicrosPerMillion/outputMicrosPerMillion for each model. No values are invented here. Verified current pricing/policy and founder authorization are prerequisites. Responses store:false does not establish zero retention.

## Shared integration and remaining proof

W1 now registers injected Studio router and supplies canonical session bridge. Live runtime still requires W3/W4 producers: atomic current context/epoch/consent/exclusion/revision and cancellation, durable citation/version delivery; actual tier/group audience revision/expiry/invalidation and canonical allowance settlement. Shared generationAvailable is false; W3 rejects citations; fan web/native chat unavailable. Native roots do contain peer features, not an empty registry.

Reviewed license/version/signing and provider decision Q02/Q05 are outstanding. W8 must allocate pending extension/shadow/tombstone migration IDs, register privacy/effect hooks and verified authority, settle identifier retention, and supply large export artifact sink. Exact local migration bytes/ledger are preserved in applied-isolated-migrations; local0013/0014 never claim shared allocation. W7 sanitizer/digest/outbox delivery and W6 gated media/OAuth producers remain required.

Mandatory unverified demos: real expert/companion licensed publish, exact passage/fallback and source/memory injection; expired license/invalid voice consent on actual generation; correction regression/publish/rollback; live multi-device takeover/source revoke/memory delete/provider timeout without phantom reply or permanent hold; sensitive consent/sponsor/expiring first-conversation behavior; actual shadow replay/provider cost/latency; native app flows and accessibility/design acceptance. Trusted purge is implemented but not represented as an exercised integrated W8 job. Source revoke was exercised via API and visibly read in Studio.

The W2 primary retains responsibility for these dependent implementations and end-to-end verification. This record distinguishes implemented, runnable, code-integrated, personally verified and release-ready; none of the unavailable paths is marked complete.

## Primary provider/policy references checked

- https://platform.openai.com/docs/guides/structured-outputs
- https://platform.openai.com/docs/guides/streaming-responses
- https://platform.openai.com/docs/guides/your-data
- https://developers.google.com/youtube/v3/docs/captions/download
- https://developers.google.com/youtube/terms/developer-policies
- https://988lifeline.org/contact-us/
- https://www.canada.ca/en/public-health/services/mental-health-services/mental-health-get-help.html

Sources guide implementation and gates; this run contains no external provider success, current-rate claim or zero-retention assurance.
