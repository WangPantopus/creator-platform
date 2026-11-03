# W1 — Platform, identity, and app foundations

## Agent assignment

**Execution rule:** You personally do all coding, migrations, configuration, documentation, debugging/fixes, integration, app launching and end-to-end verification. Subagents may only research or check information read-only; never delegate implementation or acceptance, including asking for patches to apply yourself. Do not write new test code. Use your [complete execution prompt](prompts/W1-platform-identity.md) when assigning this stream.

Own the common foundation that lets the other seven owners deliver compatible features. Build in this repository with Node.js/TypeScript, Next.js, Swift/SwiftUI, and Kotlin/Compose. Follow [the founder's overrides](README.md#instructions-from-the-founder-that-override-older-documents), [shared standards](STANDARDS.md), [contracts](CONTRACTS.md), and [runtime verification](VERIFICATION.md). Do not write new test code or coverage work. Preserve existing implementation and the replaceable Qelvora brand.

## Outcome and scope

A fan can arrive at a deep link, authenticate through the account boundary, establish their public profile/eligibility, and return to the intended object. A creator can verify their identity, register a passkey, and sign exactly the act the fan will see. Each client has functioning navigation, session handling, API configuration, common UI, and truthful unavailable/recovery states.

1. **Identity adapter and sessions.** Finish authentication continuation/callback, validated return targets, account/session resolution, expiry/refresh/logout/revocation, fan 18+ eligibility, creator/fan profiles and handles, role switching, and scoped capability responses. Keep Pantopus integration behind the adapter for later. A synthetic local development adapter may unblock isolated development if explicitly selected and impossible to enable accidentally in production; it must not become a second production account system. The production identity connection remains a recorded external dependency.
2. **Creator verification.** External proof challenge, submission, pending/rejected/approved states, manual review hooks, creator-only authority, and status propagation. Draft setup stays usable while pending; public activation waits. W8 owns the review case UI/actions and W2 owns AI activation. Do not confuse creator identity with payout-provider KYC.
3. **Passkeys and signed acts.** Registration/authentication, exact canonical payload hashing, user verification, credential ownership, short expiry, replay prevention, revoked keys, recovery/rotation, and device cancellation. Provide web, Swift AuthenticationServices, and Kotlin Credential Manager adapters and the exact-content signing sheet. Bind Notes, reactions, replies, approvals, corrections, acceptances and other named acts through the same primitive. Document unsupported-device behavior; no weaker silent signature fallback.
4. **Team authority.** Invitation, acceptance, removal and role checks with scopes from D-07. Team identity never becomes creator identity. W5 owns settings UI and W8 owns privileged review/audit. Creator confirmation is required for protected guardrail/never-reveal changes.
5. **All client shells.** Real navigation, authenticated API session/configuration, deep-link resolver, safe auth return, feature capability gating, role-aware surfaces, error handling, theme/system settings, secure native credential storage, account-switch cache purge, and schema-compatible clients. Native apps must reach actual feature routes; catalog-only hosts are insufficient.
6. **Shared design and contract infrastructure.** Finish 53 native components against the independent reference; address clipped compositions and unaccepted native fidelity. Maintain typed web components, generated tokens/copy/fonts/glyphs, OpenAPI and Swift/Kotlin clients, common money/time/error representations, shared loading/offline/dialog primitives, and rename support. Domain owners supply copy/token needs and own composed screens.
7. **Verifiable identity presentation.** Server-derived author treatments and reusable Signed links. Own public signed-act verification semantics with W7's public entry/share pages; show content/version/provenance/revocation status honestly. A signature proves an authorized key approved an act, not the truth of every factual statement in it.

## Owned surfaces and files

Primary entry/sign-in/handle/identity verification/signing surfaces are assigned in the [design inventory](research/design-inventory.md). Own shared UI and root wiring in `packages/`, `config/`, `scripts/`, backend identity/bootstrap, native app roots/projects, and web layout/navigation. Coordinate edits through the shared-file rules; preserve the source artboards. Creator signing is required in responsive web Studio, including supported mobile browsers. Native credential adapters support native identity and the shared signing capability; full native creator Studio remains O19 and is not implicitly required for fan-native acceptance.

The source has no complete creator onboarding/passkey recovery sequence. Deliver its domain mechanics and record each missing composition in the design-gap register before visual acceptance. Follow `docs/NAMING.md` for final-domain, relying-party, bundle-ID and store-name decisions.

## Interfaces and sequencing

Publish C01 actor/session, C02 signed command, C11 navigation, and the shared schema conventions first. Accept narrow W2–W8 feature route/schema registrations without centralizing their domain logic. Register domain-owned consent records through a common actor/time/version envelope, while each owner enforces its purpose.

First increment: all three apps launch with real navigation and an explicit configured/unconfigured identity capability; two development actors remain isolated. Next: creator verification/passkey/signing with W8 review and W5 named act. Then: native fidelity, unsupported device/recovery handling, and production identity integration readiness. Do not wait for production credentials to finish the rest of the clients.

## Required runtime demonstrations

- Open an authenticated deep link signed out; complete sign-in and return to the same permitted object on web and both native apps. Deny malformed/cross-origin return URLs and inaccessible objects safely.
- Expire and revoke a session while two clients are open; privileged mutations stop and cached private data does not leak after account switch.
- Try a creator act as fan, team member, creator without fresh assertion, and creator with the exact assertion. Only the authorized exact payload succeeds; edit after signing, replay, expiry and wrong-account key fail.
- Exercise creator verification pending/rejected/approved/revoked behavior. Pending drafts remain editable without a public AI becoming live.
- Run native passkey UI in available simulators/emulators; use real devices/relying-party configuration for release proof. Record unsupported Android versions and recovery outcomes explicitly.
- Compare all shared component variants Light/Night to references; verify keyboard/focus, 200% text, VoiceOver/TalkBack, reduced motion and screen safe areas.
- Regenerate all clients/resources and compile all consumers after a shared-contract change. Preview the existing brand rename in a disposable copy; do not rename the live project.

## Delivery standard

Supply an identity/authority diagram, contract examples, working client entry routes, configuration instructions, exact visual evidence, supported-device matrix, and unresolved identity/domain/recovery inputs. Consumers can build without inventing users, auth headers, signing payloads or navigation. No claims of production authentication or native passkey readiness without actual provider/device evidence.
