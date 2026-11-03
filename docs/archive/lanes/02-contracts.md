# Contracts between lanes

Lanes touch different files, but the product only works where their pieces meet. Each seam
below has one **provider** lane that defines it and one or more **consumers**. The schema
source in `packages/api/src/<domain>.ts` is the written contract; generated clients are never
edited by hand. Status: **draft** (provider has not published it), **agreed** (published and
consumers have read it), **built**.

A consumer never works around a missing contract. It opens a ticket to the provider, builds
against a stub that matches the draft, and says so in its report.

| # | Seam | Provider | Consumers | What it must say | Status |
| --- | --- | --- | --- | --- | --- |
| C1 | **Sign-in API** | 1 | 2, 6, 7 | Start and complete sign-in (web and native), the session object, the 18+ flag, fresh-authentication for signed acts, sign-out, deletion. Redirects and callbacks for system-browser sign-in | draft |
| C2 | **Production adapters** | 1, 2 | integrator | The `PantopusIdentityAdapter` shape and any second adapter, the `CommerceWorkIndex`, the license verifier and provider ports, and the rule that a production host fails closed if one is missing | draft |
| C3 | **Accept-and-send** | 4 | 6, 7 | Accept, sign, reply, deliver in the fewest calls. Request states and error codes. The single-signature option if the founder approves it (INV-22) | draft |
| C4 | **Note and reaction delivery** | 5 | 3, 6, 7 | The message kinds (`human_broadcast`, `human_reaction`) a thread returns, the audience label and glyph fields, the notification types and their payloads | draft |
| C5 | **Streaming frames** | 3 | 3 (web thread), 7 | What a WebSocket frame carries so a client can paint a sentence without refetching the page; the ordering and epoch rules (INV-03) a client must keep | draft |
| C6 | **Memory** | 3 | 7 | Memory item shape, the in-thread "Want me to remember this? Only if you say yes." prompt, edit and delete, how exclusions behave, how the guard treats memory as evidence | draft |
| C7 | **Push and links** | 5 | 2, 7 | Push payload, redaction and tap routing, the destinations a tap can open, the associated-domain and app-link files and where they are served | draft |
| C8 | **Public creator projection** | 5 | 1, 3, 4 | The public creator page fields and where each comes from (profile, public AI state, capacity row, reliability range) | draft |
| C9 | **Pilot metrics events** | 5 | all | The event names and the one-line call each lane makes to emit them; the aggregate view | draft |
| C10 | **Creator Studio data** | 6 | 3, 4, 5 | What the Today screen reads: queue, Notes, digest, AI status, capacity; one place each | draft |
| C11 | **Migrations** | integrator | all | The request-and-register protocol in the working agreement; the order of the queue | agreed |
| C12 | **Copy** | integrator | all | `config/copy.json` keys, the review checklist, generated clients | agreed |

## Dependencies that decide the order of work

- C1 gates native sign-in (lane 7) and creator onboarding (lane 6). Lane 1 publishes it first.
- C3 gates the two-tap Studio flow (lane 6). Lane 4 publishes it first; lane 6 starts with
  the file split meanwhile.
- C4 gates thread rendering of Notes (lanes 3 and 7). Lane 5 publishes it first.
- C5 gates painting from a frame (lane 7 and the web thread). Lane 3 track A publishes it.
- C6 and the guard both read memory. Lane 3 track B owns both, so there is no cross-lane edit.
- C2 gates the production composition (lane 2 and the integrator).

## Shared files and who may edit them

| File or area | Rule |
| --- | --- |
| `packages/api/src/<domain>.ts` | The domain's lane edits its own file. Generated outputs are regenerated, never merged by hand |
| `config/copy.json`, `packages/copy` | Add keys in your pull request; the integrator reviews against the copy checklist |
| `config/navigation.json` | Integrator. Lanes ask |
| `server.ts` and `integration.ts` | Integrator. A lane provides a `register<Name>` function in its own module and the integrator wires it |
| `infra/migrations.json` | Integrator, through the migration queue |
| `design/`, `packages/tokens` | Founder. Lanes read only |
| Large files (`Studio.tsx`, `CreatorAI.tsx`) | One owner each: lane 6 for `Studio.tsx`, lane 3 for `CreatorAI.tsx` |
