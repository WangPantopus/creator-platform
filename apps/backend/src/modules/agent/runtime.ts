import type { PoolClient } from "pg";
import type {
  Passage,
  Version,
} from "../../../../../packages/api/src/agent/contracts.js";
import { assertThreadScope, type ThreadScope } from "../access/scope.js";
import { DomainError, invariant } from "../../core/errors.js";
import {
  reserveCreatorCost,
  settleCreatorCost,
  settleCreatorCostInTransaction,
} from "./budget.js";
import { AgentService } from "./service.js";
import {
  assertAgentDelivery,
  type CapturedAgentAuthority,
} from "./delivery-authority.js";
import type { ProviderExecution } from "./provider-usage.js";
import {
  licenseRow,
  sourceRows,
  versionRow,
  type CreatorScope,
} from "./repository.js";
import {
  crisisText,
  needsImmediateSafety,
  type AudienceSnapshot,
  type ThreadSnapshot,
} from "./pipeline.js";

/** Producer contracts are callbacks, not SQL into W3 memory or W4 grant/money tables. */
export interface ConversationContextPort {
  current(scope: ThreadScope): Promise<ThreadSnapshot>;
  /** Current W1/W3 processor consent is required before sending fan text remotely. */
  assertProcessorConsent?(scope: ThreadScope): Promise<void>;
  assertDeliveryCurrent(
    scope: ThreadScope,
    expected: { epoch: number; revision: number },
  ): Promise<void>;
}
export interface AudiencePort {
  current(scope: ThreadScope): Promise<AudienceSnapshot>;
  /** Canonical W4 authority, locked through the caller's sentence commit. */
  currentInTransaction?(
    scope: ThreadScope,
    client: PoolClient,
  ): Promise<AudienceSnapshot>;
}
export type ApprovedSentence = {
  text: string;
  citations: string[];
  authorKind: "ai";
  versionId: string;
  versionHash: string;
  contextHash?: string;
};
export class LiveAgentRuntime {
  private readonly active = new Map<string, Set<AbortController>>();
  private readonly executionHolds = new WeakMap<
    ProviderExecution,
    {
      creatorId: string;
      threadId: string;
      fanId: string;
      actorAccountId: string;
      generationId: string;
      attemptId: string;
      hold: string;
      versionHash: string;
      model: string;
      completed: boolean;
      sealed: boolean;
    }
  >();
  constructor(
    private readonly service: AgentService,
    private readonly conversations: ConversationContextPort,
    private readonly audiences: AudiencePort,
  ) {}
  interruptCreator(creatorId: string) {
    for (const controller of this.active.get(creatorId) ?? [])
      controller.abort();
  }
  /** W3 invokes this same runtime/execution after extraction. A prepared journal
   * additionally seals its durable receipt; original W4 weighting stays owned. */
  async sealExecution(scope: ThreadScope, execution: ProviderExecution) {
    assertThreadScope(scope);
    const held = this.executionHolds.get(execution);
    invariant(
      held &&
        held.creatorId === scope.creatorId &&
        held.threadId === scope.threadId &&
        held.fanId === scope.fanId &&
        held.actorAccountId === scope.actorAccountId &&
        held.generationId === execution.generationId &&
        held.attemptId === execution.attemptId,
      "creator_cost_hold_required",
      "This runtime has no matching generation cost hold.",
    );
    if (held.sealed) return;
    await execution.sealAdmission(async (client) => {
      // Match completion/reservation lock order: workspace before the journal
      // fence. Reversing these locks can deadlock with a late provider charge.
      await client.query(
        "SELECT creator_id FROM creator.ai_workspace WHERE creator_id=$1 FOR UPDATE",
        [scope.creatorId],
      );
      const receipt = await this.service.repository.usageJournal?.seal(
        scope,
        client,
        execution.generationId,
      );
      await settleCreatorCostInTransaction(
        client,
        this.creatorScope(scope),
        held.hold,
        receipt ? receipt.state !== "unknown" : held.completed,
        "configured",
        held.model,
        held.versionHash,
        Boolean(this.service.repository.usageJournal),
      );
    });
    held.sealed = true;
  }
  /** W3 invokes these inside its existing acceptance/release transaction. */
  async assertReady(
    scope: ThreadScope,
    client: PoolClient,
    captured?: CapturedAgentAuthority,
  ) {
    await assertAgentDelivery(
      this.service,
      this.audiences,
      scope,
      client,
      undefined,
      captured,
    );
  }
  async assertApproved(
    scope: ThreadScope,
    client: PoolClient,
    sentence: ApprovedSentence,
  ) {
    await assertAgentDelivery(
      this.service,
      this.audiences,
      scope,
      client,
      sentence,
    );
  }
  /** W3 calls before a paid generation reservation. Safety needs current thread authority, never a license or grant. */
  async routeSafety(
    scope: ThreadScope,
    message: string,
    signal: AbortSignal,
    deliver: (sentence: {
      text: string;
      citations: [];
      authorKind: "ai";
      safety: true;
    }) => Promise<void>,
  ) {
    assertThreadScope(scope);
    invariant(
      message.trim().length > 0 && message.length <= 2000,
      "message_invalid",
      "A bounded fan message is required.",
    );
    signal.throwIfAborted();
    const snapshot = await this.conversations.current(scope);
    let crisis = needsImmediateSafety(message);
    if (!crisis && this.service.pipeline.model) {
      invariant(
        this.conversations.assertProcessorConsent,
        "processor_consent_unavailable",
        "Current processor consent is required before safety classification.",
      );
      await this.conversations.assertProcessorConsent(scope);
      crisis = await this.service.pipeline.classifySafety(
        this.creatorScope(scope),
        message,
        signal,
      );
    }
    if (!crisis) return false;
    await this.conversations.assertDeliveryCurrent(scope, {
      epoch: snapshot.epoch,
      revision: snapshot.revision,
    });
    await deliver({
      text: crisisText,
      citations: [],
      authorKind: "ai",
      safety: true,
    });
    return true;
  }
  private creatorScope(scope: ThreadScope): CreatorScope {
    assertThreadScope(scope);
    return {
      creatorId: scope.creatorId,
      accountId: scope.creatorAccountId,
      development: false,
    };
  }
  private async current(scope: CreatorScope): Promise<{
    version: Version;
    status: { text: string; expiresAt: string } | null;
    sponsors: Awaited<ReturnType<AgentService["sponsors"]>>;
  }> {
    return this.service.repository.transaction(
      scope,
      async (client, workspace, creator) => {
        invariant(
          creator.verification === "verified",
          "creator_paused",
          "This creator’s AI is paused.",
        );
        invariant(
          !workspace.paused && workspace.live_version_id,
          "ai_paused",
          "The creator has paused this AI.",
        );
        invariant(
          await this.service.currentLicense(
            scope,
            await licenseRow(client, scope.creatorId),
          ),
          "license_expired",
          "This AI’s license is unavailable or expired.",
        );
        const version = await versionRow(
          client,
          scope.creatorId,
          workspace.live_version_id,
        );
        invariant(
          version?.state === "live",
          "version_unavailable",
          "The live version is unavailable.",
        );
        invariant(
          version.pipelineHash === this.service.pipeline.fingerprint,
          "ai_updating",
          "AI is updating after a provider configuration change.",
        );
        const sources = await sourceRows(client, scope.creatorId);
        invariant(
          version.sourceSet.every((v) =>
            sources.some(
              (s) =>
                s.id === v.id &&
                s.revision === v.revision &&
                s.contentHash === v.hash &&
                s.state === "approved" &&
                s.indexState === "ready" &&
                (!s.expiresAt || Date.parse(s.expiresAt) > Date.now()),
            ),
          ),
          "source_revoked",
          "A source changed or was revoked; the creator’s AI is updating.",
        );
        return {
          version,
          status: workspace.current_status,
          sponsors: await this.service.sponsors(client, scope.creatorId),
        };
      },
    );
  }
  async generate(
    scope: ThreadScope,
    message: string,
    signal: AbortSignal,
    deliver: (sentence: ApprovedSentence) => Promise<void>,
    execution?: ProviderExecution,
  ) {
    assertThreadScope(scope);
    invariant(
      message.length > 0 && message.length <= 2000,
      "message_invalid",
      "Shorten this message before sending.",
    );
    const creatorScope = this.creatorScope(scope);
    invariant(
      !execution || !this.executionHolds.has(execution),
      "generation_already_started",
      "This runtime already owns the generation attempt.",
    );
    const current = await this.current(creatorScope);
    invariant(
      this.conversations.assertProcessorConsent,
      "processor_consent_unavailable",
      "Current processor consent is required before generation.",
    );
    await this.conversations.assertProcessorConsent(scope);
    const snapshot = await this.conversations.current(scope);
    const grants = await this.audiences.current(scope);
    const hold = await reserveCreatorCost(
      this.service.repository,
      creatorScope,
      current.version.configuration.dailyCostCapMicros,
      this.service.pipeline.model?.maximumRunCostMicros(
        Buffer.byteLength(
          JSON.stringify(current.version.configuration),
          "utf8",
        ),
      ) ?? null,
    );
    const executionHold = execution
      ? {
          creatorId: scope.creatorId,
          threadId: scope.threadId,
          fanId: scope.fanId,
          actorAccountId: scope.actorAccountId,
          generationId: execution.generationId,
          attemptId: execution.attemptId,
          hold,
          versionHash: current.version.compiledHash,
          model: this.service.pipeline.model?.fingerprint ?? "unconfigured",
          completed: false,
          sealed: false,
        }
      : undefined;
    if (execution && executionHold)
      this.executionHolds.set(execution, executionHold);
    const admittedExecution: ProviderExecution | undefined = execution && {
      generationId: execution.generationId,
      attemptId: execution.attemptId,
      admit: (journal) =>
        execution.admit(async (client) => {
          await this.assertReady(scope, client, {
            versionId: current.version.id,
            versionHash: current.version.compiledHash,
            audienceRevision: grants.revision,
          });
          return journal(client);
        }),
      sealAdmission: (journal) => execution.sealAdmission(journal),
    };
    let completed = false;
    const controller = new AbortController();
    const controllers =
      this.active.get(scope.creatorId) ?? new Set<AbortController>();
    controllers.add(controller);
    this.active.set(scope.creatorId, controllers);
    const assertCurrent = async () => {
      signal.throwIfAborted();
      controller.signal.throwIfAborted();
      await this.conversations.assertDeliveryCurrent(scope, {
        epoch: snapshot.epoch,
        revision: snapshot.revision,
      });
      await this.conversations.assertProcessorConsent!(scope);
      const fresh = await this.current(creatorScope);
      if (fresh.version.id !== current.version.id)
        throw new DomainError(
          "version_changed",
          "The creator’s AI changed during generation.",
          409,
        );
      const audience = await this.audiences.current(scope);
      if (
        audience.revision !== grants.revision ||
        !(Date.parse(audience.validUntil) > Date.now())
      )
        throw new DomainError(
          "access_changed",
          "Source access changed during generation.",
          409,
        );
    };
    // Recheck durable authority in every process, including while the provider
    // is silent. Sentence delivery also rechecks it immediately before release.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const monitor = async () => {
      try {
        await assertCurrent();
      } catch (error) {
        controller.abort(error);
      }
      if (!controller.signal.aborted && !signal.aborted)
        timer = setTimeout(() => {
          void monitor();
        }, 1000);
    };
    try {
      await assertCurrent();
      if (execution && this.service.repository.usageJournal)
        await admittedExecution!.admit((client) =>
          this.service.repository.usageJournal!.beginAttempt(
            scope,
            client,
            execution,
            hold,
          ),
        );
      timer = setTimeout(() => {
        void monitor();
      }, 1000);
      let emitted = 0;
      const result = await this.service.pipeline.run({
        scope: creatorScope,
        usageCategory: "reply",
        configuration: current.version.configuration,
        creatorName: scope.creatorName,
        sourceSet: current.version.sourceSet,
        status: current.status,
        sponsors: current.sponsors,
        message,
        grants,
        snapshot,
        signal: AbortSignal.any([signal, controller.signal]),
        execution: admittedExecution,
        beforeSentence: assertCurrent,
        onSentence: async (sentence) => {
          emitted++;
          await deliver({
            ...sentence,
            authorKind: "ai",
            versionId: current.version.id,
            versionHash: current.version.compiledHash,
          });
        },
      });
      if (!emitted) {
        for (const sentence of result.sentences) {
          await assertCurrent();
          await deliver({
            ...sentence,
            authorKind: "ai",
            versionId: current.version.id,
            versionHash: current.version.compiledHash,
          });
        }
      }
      completed = true;
      return result;
    } finally {
      if (timer) clearTimeout(timer);
      controller.abort();
      try {
        if (executionHold) {
          // Memory extraction is still billed under this attempt. The exact
          // W3 execution seals it later; crash/authority loss retains the hold.
          executionHold.completed = completed;
        } else
          await settleCreatorCost(
            this.service.repository,
            creatorScope,
            hold,
            completed,
            "configured",
            this.service.pipeline.model?.fingerprint ?? "unconfigured",
            current.version.compiledHash,
          );
      } finally {
        controllers.delete(controller);
        if (!controllers.size) this.active.delete(scope.creatorId);
      }
    }
  }
  async passage(scope: ThreadScope, passageId: string): Promise<Passage> {
    const creatorScope = this.creatorScope(scope);
    const grants = await this.audiences.current(scope);
    if (!(Date.parse(grants.validUntil) > Date.now()))
      throw new DomainError(
        "citation_unavailable",
        "No longer accessible to you",
        403,
      );
    return this.service.repository.transaction(
      creatorScope,
      async (client: PoolClient) => {
        const rows = await client.query(
          `SELECT c.id,s.id AS "sourceId",c.source_revision AS "sourceRevision",s.title,c.passage AS text,c.start_offset AS start,c.end_offset AS "end",s.audience FROM creator.ai_chunk c JOIN creator.ai_source s ON s.id=c.source_id AND s.creator_id=c.creator_id WHERE c.id=$1 AND c.creator_id=$2 AND s.creator_id=$2 AND c.source_revision=s.revision AND s.state='approved' AND (s.expires_at IS NULL OR s.expires_at>now()) AND (s.audience->>'kind'='public' OR (s.audience->>'kind'='tier' AND s.audience->'ids' ?| $3::text[]) OR (s.audience->>'kind'='group' AND s.audience->'ids' ?| $4::text[]))`,
          [passageId, scope.creatorId, grants.tierIds, grants.groupIds],
        );
        if (!rows.rows[0])
          throw new DomainError(
            "citation_unavailable",
            "No longer accessible to you",
            403,
          );
        return rows.rows[0] as Passage;
      },
    );
  }
}
