# Decisions and missing-design register

These are implementation/release dependencies, not requests for the founder to answer everything before work can start. Owners prepare concrete options and evidence, continue independent work, and ask only when the choice becomes necessary. No pending choice is silently converted into a production default.

## Decisions already settled

Node.js/TypeScript backend, Next.js web, native Swift iOS and Kotlin Android; standalone creator-platform now and Pantopus integration later; exact supplied appearance; replaceable Qelvora name; full build with membership first, human voice before AI voice, pass after sufficient roster; no new test code/coverage in this phase; actual browser/simulator/emulator verification. Older source references to Expo, a thin unselling native shell, five lifetime trial messages, auto-reply after twenty approvals, or a proof-only build do not reopen those choices.

## W1 source conflicts resolved — October 1, 2026

Under the founder's explicit authorization to decide routine UX/security details, W1 follows behavioral-source precedence for DI09 and the interview-duration conflict. Product Design S-F1/S-F5 defers the optional intro offer until after the first useful answer; initial Handle therefore collects only a pseudonymous handle. Existing profiles retain the optional intro editor through You/Account, and per-creator AI use remains a separate explicit choice. Initial profile creation sends an empty intro; hidden input cannot silently become consent. The real later one-time thread offer remains an uncompleted W3/W1 integration, with no generation or participant result inferred.

Product Design S-C14, Second Review A10 and BRIEF S-C14 consistently specify about 20 minutes for the optional voice/text interview. The live setup rail uses that estimate. It adds no timer, required-duration gate or promise of completion, and imported-source-only setup remains valid under the producer's policy. The artboard's 15-minute sample label and all original references remain unchanged.

These decisions resolve timing/copy, not genuine identity, legal terms, native Studio scope, screen-reader/device acceptance or Q12 study thresholds. Actual browser and compiler evidence is recorded with the implementation; native control is currently disabled.

## Required decisions and confirmation points

### W1 credential issuer and recovery — October 1 completion run

Stored native session credentials bind to one canonical root API origin (scheme, lowercased host and effective port). Keychain/Keystore namespaces separate issuers; Android encryption also authenticates the origin. The previous unbound credential cannot prove its issuer, so the upgrade requires reauthorization rather than migrating it. Existing device-only custody, purge fences and one-use rotation remain; Android persists a completed bounded rotation through foreground cancellation. Actual device isolation/purge/foreground acceptance remains outstanding.

Web refresh transport/non-401 failures preserve the saved credential and registered destination on an explicit recovery page. A completed rotation is persisted even if its following session read fails. Personally operated production-bundle local development journeys verify outage Retry and a cancelled real refresh UPDATE followed by Retry. This verifies recovery behavior, not production identity or release origin configuration.

Participant RLS receives transaction-local `app.identity_session_id` only after `assertCurrentSession` validates and holds the actual request session. The value clears with its transaction and adds no worker session/Actor fallback. Actual non-owner diagnostics cover current, expired and mismatched sessions. Background work requires a separate purpose issuer, durable tuple proof and held domain restrictions; an interactive account ID is never sufficient.

| ID | Decision / unresolved input | Owner | Needed before | Work that continues meanwhile |
| --- | --- | --- | --- | --- |
| Q01 | Production Pantopus identity/session/eligibility/deletion contract and access to a proper development identity environment | W1/W8 | Real account acceptance and external pilot | Adapter, secure continuation, role flows, explicit isolated development actors, all other features |
| Q02 | Model/embedding/classifier providers and tiers, actual processor names, contractual retention/training terms, credentials and quotas | W2/W8 | Real AI/processor-consent acceptance and public launch | Full pipeline/configuration/evaluation, unavailable UI, bounded provider interfaces |
| Q03 | Payment platform/Connect account topology, payout markets, tax/fee/refund operation and sandbox access | W4/W8 | Provider settlement and external paid use | State machines, ledger, UI, price configuration and reconciliation structure |
| Q04 | Native asynchronous paid written/voice replies, store programs/storefronts, current distribution matrix | W4/W8 with business/counsel | Enabling those native purchase actions | Web payments, shared requests/receipts, native membership IAP and permitted call flows after validation |
| Q05 | Final license/replica terms, permitted territories/uses, attestation and estate/incapacity handling | W2/W8 with counsel | External creator signing and licensed voice | Structured lifecycle/enforcement and draft Studio UI |
| Q06 | Call account/provider commercial readiness; build prompt names LiveKit while older architecture retains evaluation | W6/W8 | Real calls and release | Session clocks/outcomes, scheduling contracts, UI/native adapters |
| Q07 | Voice provider, creator voice-model ownership, consent/retention/deletion, supported marking/watermark output | W2/W6/W8 | Enabling AI voice after pilot | Human voice pipeline and disabled licensed AI-voice configuration |
| Q08 | Prices, currency/regions, tier capabilities, pass amount/slot configuration, public-price discount, credit eligibility/caps/redemption, cost budgets | W4/W2/W7 | Public offer and economic release acceptance | Configurable mechanics and labeled sandbox amounts; no invented final prices |
| Q09 | Final brand/domain/RP ID, app IDs, sender domains and store identities | W1/W8 | External passkey registration, public links and irreversible store identity | Qelvora token/rename support, local-only identities, config indirection |
| Q10 | Hosting/region, production projects, APNs/FCM/email credentials, store accounts/signing, provider sandbox access | W8 with relevant owner | External staging/release verification | Reproducible local configuration and deployable artifacts |
| Q11 | Physical iPhone/Android availability and supported OS/device release matrix | W8/W1/W6 | Background calls/push/audio/passkeys/store release sign-off | Simulator/emulator builds and all reproducible UI/API workflows |
| Q12 | T-21 authorship comprehension bar; T-32 style/usefulness study interpretation; cohort pilot measurement bars and sample/windows | W8/W2/W7 | Pilot study evaluation | Instrumentation, consented study plan and real flow preparation |
| Q13 | Accepted off-the-record behavior amendment; semantic memory exclusion definition and scope; existing-memory context policy while off the record | W3/W2/W8 | Enabling the setting | Other memory/consent/deletion work; record precise behavior before implementation |
| Q14 | Full library/live-content/community behavior mentioned by grants/architecture but not fully specified/designed | W5/W4/W7/W8 | Claiming full publishing/community scope delivered | Build defined post/library/audience primitives, retain explicit gap; do not invent a social network |
| Q15 | Native creator Studio extension, additional locales, referral incentives and growth experiments | Listed owners in OPPORTUNITIES | Expanding beyond specified surfaces/business rules | Required fan-native and responsive Studio product |
| Q16 | Account-wide deletion versus creator-product data removal in shared identity; external subscription consequences and reviewed retention exceptions | W1/W8/W4 | Public deletion flow and external accounts | Product-scoped export/delete pipeline and explicit final-boundary contract |
| Q17 | Passkey recovery/rotation policy and Android API26–27 signed-act availability | W1/W8 | Creator device support and recovery launch | Strong supported-device signing; safe unavailable state |
| Q18 | Translation provider/consent and display semantics for human replies; original signed content remains accessible and immutable | W3/W2/W1/W8 | Enabling translation | Shared copy/localization readiness and original-language content |

The source's legal statements are not independently certified by this planning pass. Owners verify current platform requirements and obtain the specified legal/business decisions; they do not weaken product protections while waiting.

## Design gaps that require explicit completion

The [design inventory](research/design-inventory.md) is the detailed register. It identifies missing compositions/variants despite the existence of 64 artboards. Minimum gap groups:

| Gap group | Primary | Required design resolution |
| --- | --- | --- |
| Creator verification/onboarding/interview/passkey enrollment and recovery | W1/W2 | Step sequence, resume/pending/rejected/error states, exact signing/cancel/retry |
| Source import/processing/rights/expiry and publish/rollback states | W2 | Progress/failure/retry, review evidence and incomplete configuration |
| Memory detail/off-the-record/export/delete/consent progress | W3 | Sensitive-item decisions, provenance, deletion exceptions and accessible confirmation |
| Membership manage/restore/cancel/refund, tier/group editors and changed request offers | W4 | Platform-specific payment transition and recovery states, no web/store price juxtaposition |
| Full Publish/library/live/community, quote/public group composition | W5 | Audience/source controls, scheduling/empty/error/revoked states and fan consent |
| Call waiting/reconnect/no-show/early/technical outcomes, permissions and audio routes | W6 | Both parties' clear state, clocks, settlement copy and accessible controls |
| Preferences/quiet hours, creator launch kit, missing notification states and growth additions | W7 | Use existing identity/copy rules and component system; avoid unapproved alternative designs |
| Support/appeals/status/privacy/help and complete ops actions | W8 | Scoped case workflow and truthful public recovery information |
| Native feature compositions, large text/keyboard, tablet/adaptive/landscape and every empty/error state | Each screen owner; W1 primitives | Exact reference at normal size plus usable platform adaptations |

A gap entry records requirement/source, owner, affected platforms, proposed reuse of existing components, reference/capture, decision and reviewer, and acceptance evidence. Routine missing loading/error states can follow existing component patterns; a changed layout/meaning or newly invented workflow needs explicit design resolution. Do not edit the reference to conceal an implementation mismatch.

## Consistency decisions for the first contract checkpoint

Resolve exact typed boundaries before parallel consumers diverge: `Approval` owner and invalidation, `ShareGrant` dual consent/revocation, stable current-authorization/grant versions, allowance transaction participation, packet-vs-thread audit, call acceptance timing, immutable signed original versus translated display, Note fan-out ordering, domain-wide outbox beyond the thread log, and privacy job completion receipts. See [CONTRACTS](CONTRACTS.md) and backend research for proposed ownership.

The immediate planning work raises no blocking question: these owners can start useful, reversible implementation with the established decisions. A release may remain blocked for specific inputs even while its feature development is complete; record that distinction explicitly.


### W1 — separate Growth/content API pool (October 2, 2026)

The canonical core connection stays non-owner `creator_runtime` NOINHERIT for identity, Conversation, Agent and Trust. Growth and W5 follower-content transactions use an explicit same-database `GROWTH_API_DATABASE_URL` pool, inheriting only `creator_runtime` and `growth_runtime`. This preserves the actual follow row lock through the content transaction; a Boolean obtained from a released second connection cannot provide that guarantee. The root rejects a shared core login, another database, additional reachable roles, owner/bypass/create-role privileges and direct private relation/column/function grants. Disabled Growth allocates no extra pool. Startup failure and shutdown close the owned pool without logging URLs or credentials. Negative probes against W1's actual non-owner core connection pass; positive role/readiness and configured application journeys await reviewed role/schema composition.

### W1 — purpose policies and issuer-bound push (October 2, 2026)

0071 normalizes only existing PUBLIC content policies, preserving every named purpose role added by earlier migrations. W8 identified that normalizing all policies would break0069 reply-review metadata. Scope expiry uses wall-clock time, since transaction `now()` cannot measure a long callback's age. Integrated native push consumers bind credential reads to their API issuer; Android also refuses a captured credential from another issuer before unregistering remotely. Local notification cancellation still occurs during private cleanup. No push provider/device permission or delivery success is fabricated.
