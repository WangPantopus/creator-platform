# Developer handoff

| File | What |
| --- | --- |
| `tokens.json` | The source tokens (Light and Night), same as the design system |
| `tokens.css` | CSS custom properties: `:root`/`[data-theme="light"]`, `[data-theme="night"]` |
| `tokens.ts` | The same values as typed constants, plus text styles |
| `../design-system/project/components/` | Reference React components (`bundle.js`), styles, prop types (`index.d.ts`) and a guideline per component |

Themes follow the system setting: set `data-theme` on the root from `prefers-color-scheme`.

## Screen to module map

Each screen reads from the module that owns its data (System Architecture §3). Composite
screens use a read model. "Signed" means the action goes through `identity.beginSignedAct`.

| Screen | Canvas | Reads | Writes |
| --- | --- | --- | --- |
| Creator home, post view | 4A-01, 4A-11 | identity (profile, reliability), content.audienceFor, handoff (modes, capacity) | — |
| Continue with Pantopus, handle | 4A-02, 4A-13 | identity.resolveActor | identity (fan_profile) |
| Consent | 4A-03 | agent (providers) | conversation (consent) |
| Thread | 4A-04/05/14/15 | conversation.readThread, WebSocket | conversation.send, memory CRUD |
| Packet, limit, card | 4A-06/07/16 | handoff.draftPacket, payments (limit) | handoff.submitPacket → payments.hold |
| Request status, receipt | 4A-08, 4B-04 | handoff (packet, commitment), payments (ledger) | handoff (withdraw) |
| Notifications, push, email | 4A-09, 4E-05, 4I | notifications | notifications.preference |
| Home, Discover | 4B-01/02 | read model (home), identity, handoff (capacity) | — |
| Access, pass | 4B-03, 4G | access.listGrants | access (membership, pass slots) |
| Me and privacy | 4B-06 | conversation (memory, thread_audit) | memory delete, thread delete (D-08) |
| Spending | 4B-07 | payments | payments (limit: lower now, raise after 24 h) |
| Verification page | 4B-08 | identity.verifySignedAct | — |
| Studio queue, request | 4C-01/02 | read model (queue), handoff | handoff.decide (signed), Instead actions |
| Threads, takeover | 4C-04/05 | conversation.readThread (audited) | takeover, handback, pauseForFan, presence.correct (signed) |
| Notes, replies, reactions | 4C-06/09 | presence | presence.postNote (signed), react |
| Impact digest | 4C-10 | insights.weeklyDigest | — |
| Verification and setup | 4D-01 | identity (verification) | identity |
| My AI | 4D-02/03/04, 4C-07 | agent | agent.publishVersion after runBoundaryTests; regression cases |
| Offers | 4D-05 | handoff (human_mode, capacity), access (tier) | same |
| Earnings, pool | 4D-06, 4G-03 | payments | — |
| Team | 4D-07 | identity (team_membership) | same |
| License, sponsors | 4D-08 | agent | agent |
| Calls | 4E-01/02/03/04 | session | session.offerTimes, join, end, consentRecording |
| Public answer, share, AI voice | 4F | content, presence, agent (voice) | — |
| Insights | 4F-04 | insights.clusters, recommend | content (group answer) |
| Ops console | 4H | safety | safety.opsAction, payments.refund |
