# Eight paste-ready workstream prompts

For the next W1 agent, use the [W1 continuation prompt](W1-resume-handoff.md) together with the [W1 handoff](../handoffs/W1-platform-identity.md). This starts from the preserved feature-branch checkpoint and retains the full original assignment below.

For the next W2 agent, use the [October 1 complete continuation prompt](W2-resume-20261001.md) and [current W2 handoff](../handoffs/W2-creator-ai-20261001.md). They preserve all nine packages/R01–R14 and latest human authorization to restore needed runtimes, personally verify all three apps, open ready PRs and merge ready PRs normally.

Copy the **entire contents of one prompt file** into the independent agent assigned to that stream. Each file is self-contained: it repeats the founder's personal-implementation and no-new-test-code rules, includes the complete stream scope and primary artboards, and specifies real-app verification and delivery evidence. You do not need to prepend a separate common prompt.

Every owner must personally implement, launch, diagnose, fix and verify its work. Subagents may only research or check information read-only. The eight workstream owners are peers, not implementation subagents recruited by one owner.

| Agent | Complete prompt                                                         |
| ----- | ----------------------------------------------------------------------- |
| W1    | [Platform, identity, and app foundations](W1-platform-identity.md)      |
| W2    | [Creator AI, knowledge, and model runtime](W2-creator-ai.md)            |
| W3    | [Fan conversations and real-time chat](W3-conversations.md)             |
| W4    | [Commerce, access, and request lifecycle](W4-commerce-requests.md)      |
| W5    | [Creator Studio, content, and fulfillment](W5-studio-content.md)        |
| W6    | [Calls, voice, and media](W6-calls-media.md)                            |
| W7    | [Discovery, growth, notifications, and insights](W7-growth-insights.md) |
| W8    | [Trust operations, reliability, and release](W8-trust-release.md)       |

[All eight prompts in one document](ALL_WORKSTREAM_PROMPTS.md) is available for convenient copying; copy only the selected stream's section into its agent. The separate files are the easiest way to avoid mixing assignments.

Use the existing creator-platform checkout or an assigned worktree containing the current foundation. Before parallel edits, preserve that foundation and honor the shared-file, migration, port, database and simulator/emulator leases in [CONTRACTS](../CONTRACTS.md). W8 coordinates the integration checkpoint while the other owners inspect their areas and prepare contracts; it does not perform their coding or verification for them.

These prompt files do not create or start any agent chats. They are ready for assignment. The [master plan](../README.md), [coverage register](../COVERAGE.md), [runtime verification guide](../VERIFICATION.md) and [decision register](../DECISIONS.md) remain shared references. If the sources change later, reconcile the prompt with the latest explicit founder decisions and update the affected scope deliberately.
