import type { PoolClient } from "pg";
import { invariant } from "../../core/errors.js";
import type { Database } from "../../db/database.js";
import { GenerationWorker } from "../../workers/generation.js";
import type { AccessService, ThreadScope } from "../access/scope.js";
import type { createAgentDomain } from "../agent/integration.js";
import { confirmAcceptedGeneration } from "../identity/generation-scope.js";
import { conversationAgentGenerator } from "./agent-generator.js";
import { CommerceGenerationAllowance } from "../commerce/generation-allowance.js";

/** Acceptance and free safety use the canonical interactive session. Only the
 * separately prepared worker executes the durable accepted generation. */
export class PreparedGenerationAcceptance {
  private constructor(
    private readonly configuration: {
      worker: GenerationWorker;
      database: Database;
      access: AccessService;
      agent: ReturnType<typeof createAgentDomain>;
      allowance: CommerceGenerationAllowance;
    },
    private readonly adapter: ReturnType<typeof conversationAgentGenerator>,
  ) {}

  static prepare(input: {
    worker: GenerationWorker;
    database: Database;
    access: AccessService;
    agent: ReturnType<typeof createAgentDomain>;
    allowance: CommerceGenerationAllowance;
  }): PreparedGenerationAcceptance {
    invariant(
      input.worker instanceof GenerationWorker &&
        input.allowance instanceof CommerceGenerationAllowance,
      "generation_acceptance_unconfigured",
      "Prepare the original scoped worker before accepting fan generation.",
    );
    input.worker.assertAcceptance(
      input.database.pool,
      input.access,
      input.agent.service,
    );
    const adapter = conversationAgentGenerator(input.database, input.agent);
    invariant(
      adapter.generator.journal && adapter.generator.routeSafety,
      "generation_acceptance_unconfigured",
      "The original accounting journal and free safety route are required.",
    );
    input.allowance.assertComposition(input.database.pool, input.access);
    input.allowance.assertJournal(adapter.generator.journal);
    return new PreparedGenerationAcceptance(
      Object.freeze({ ...input }),
      adapter,
    );
  }

  assertComposition(database: Database, access: AccessService): void {
    invariant(
      database === this.configuration.database &&
        access === this.configuration.access,
      "generation_acceptance_composition_changed",
      "Use this acceptance's original database and allowance authority.",
    );
    this.configuration.worker.assertAcceptance(
      database.pool,
      access,
      this.configuration.agent.service,
    );
  }

  get journal() {
    return this.configuration.agent.service.repository.usageJournal!;
  }

  reserve(scope: ThreadScope, client: PoolClient, generationId: string) {
    this.assertComposition(
      this.configuration.database,
      this.configuration.access,
    );
    this.configuration.allowance.assertComposition(
      this.configuration.database.pool,
      this.configuration.access,
    );
    this.configuration.allowance.assertJournal(this.journal);
    return this.configuration.allowance.reserveGeneration(
      scope,
      client,
      generationId,
    );
  }

  async assertReady(scope: ThreadScope, client: PoolClient): Promise<void> {
    this.assertComposition(
      this.configuration.database,
      this.configuration.access,
    );
    await this.adapter.assertReady(scope, client);
  }

  /** Called after W3's actual INSERT and journal initialization, before their
   * sole COMMIT. Idempotent replays never confirm an earlier transaction. */
  async confirm(
    scope: ThreadScope,
    client: PoolClient,
    generationId: string,
  ): Promise<void> {
    this.assertComposition(
      this.configuration.database,
      this.configuration.access,
    );
    await confirmAcceptedGeneration(scope, client, generationId);
  }

  citation(scope: ThreadScope, passageId: string): Promise<unknown> {
    return this.adapter.citation(scope, passageId);
  }

  routeSafety(
    ...args: Parameters<NonNullable<typeof this.adapter.generator.routeSafety>>
  ): Promise<boolean> {
    return this.adapter.generator.routeSafety!(...args);
  }
}
