import { createHash, randomBytes } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  DraftConfig,
  type Usage,
} from "../../../../../packages/api/src/agent/contracts.js";
import { DomainError, invariant } from "../../core/errors.js";
import {
  GenerationIdentityAuthority,
  type GenerationPurposeConsumer,
  type GenerationTask,
  type GenerationTaskScope,
} from "../identity/generation-scope.js";
import { PreparedGenerationConversationContext } from "../conversation/generation-context.js";
import { generationTransaction } from "../identity/generation-transaction.js";
import {
  PreparedGenerationAgentInputs,
  type GenerationAgentFacts,
} from "./generation-inputs.js";
import { PreparedGenerationJournal } from "./generation-journal.js";
import { AgentService } from "./service.js";
import type { AgentModel } from "./model.js";
import { CONTEXT_BUDGET, maximumGenerationCalls } from "./pipeline.js";
import { ProviderResponseError } from "./response-usage.js";
import type { StreamProposal } from "./streaming.js";
import {
  assertGenerationConsumerCustody,
  type GenerationConsumerCustody,
} from "./generation-consumer-catalogue.js";
import { registeredMigration } from "../../db/reviewed-migration.js";

export const GENERATION_PROVIDER_MIGRATION =
  "0181_w2_generation_attempt_admission";
/** Replaces only the attempt admission function: an interrupted reply's
 * unknown cost counts as its whole hold instead of locking the creator. Its
 * receipt must cite this source once registered, and only then. */
export const GENERATION_INTERRUPTED_COST_SOURCE = Object.freeze({
  name: "w2_interrupted_cost_estimate",
  owner: "W2",
  path: "apps/backend/src/modules/agent/migrations/pending_w2_interrupted_cost_estimate.sql",
  checksum: "3bfbe8e7b7646729f5b2662115ec9198d1c4f0103bff63f9ca08fc765d590b69",
});
export const GENERATION_PROVIDER_SIGNATURES = Object.freeze([
  "creator.generation_begin_agent_attempt(uuid,uuid,text,text,bigint,text)",
  "creator.generation_open_provider_usage(uuid,uuid,text,text,text,text)",
  "creator.generation_finish_provider_usage(uuid,uuid,uuid,text,jsonb,integer)",
] as const);
const owner = "creator_w2_generation_journal";
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
const Report = z
  .strictObject({
    provider: z.string().min(1).max(160),
    model: z.string().min(1).max(200),
    inputTokens: z.int().nonnegative().max(2147483647),
    outputTokens: z.int().nonnegative().max(2147483647),
    cachedInputTokens: z.int().nonnegative().max(2147483647).nullable(),
    cacheWriteInputTokens: z.int().nonnegative().max(2147483647).nullable(),
    costMicros: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  })
  .refine(
    (value) =>
      (value.cachedInputTokens ?? 0) + (value.cacheWriteInputTokens ?? 0) <=
      value.inputTokens,
  );
export type GenerationProviderAttempt = Readonly<{
  generationId: string;
  workerToken: string;
  creatorId: string;
  creatorHoldId: string;
  compiledHash: string;
  modelFingerprint: string;
}>;
type Admitted = Readonly<{ id: string }>;
/** A provider call admitted inside another held purpose (A4: the preflight). */
export type GenerationProviderAdmission = Admitted;
type Category = "reply" | "guardrail" | "memory";
/** Nonsecret reference to one actually committed original provider admission.
 * Its private WeakMap binding, never these copied fields, supplies provenance. */
export type GenerationProviderCall = Readonly<{
  usageId: string;
  generationId: string;
  workerToken: string;
  modelFingerprint: string;
}>;
export type GenerationAdmissionBookend = (
  client: PoolClient,
  scope: GenerationTaskScope,
) => Promise<void | GenerationAgentFacts>;

/** Accounting consumer only. It does not supply terminal/output/memory write
 * permission or enable a host without the actual W1/W3/W4 terminal composition.
 * Provider I/O starts only after a fresh genuine purpose transaction commits.
 */
export class PreparedGenerationProviderAccounting {
  private readonly attempts = new WeakSet<GenerationProviderAttempt>();
  private readonly calls = new WeakMap<
    GenerationProviderCall,
    GenerationProviderAttempt
  >();
  private readonly admissions = new WeakMap<
    Admitted,
    {
      generationId: string;
      workerToken: string;
      capability: string;
      started: number;
      completed: boolean;
    }
  >();
  private constructor(
    private readonly identity: GenerationIdentityAuthority,
    private readonly workerPool: Pool,
    private readonly model: AgentModel,
    private readonly inputs: PreparedGenerationAgentInputs,
    private readonly context: PreparedGenerationConversationContext,
    private readonly journal: PreparedGenerationJournal,
    private readonly custody: GenerationConsumerCustody,
  ) {}

  assertComposition(input: {
    identity: GenerationIdentityAuthority;
    service: AgentService;
    inputs: PreparedGenerationAgentInputs;
    context: PreparedGenerationConversationContext;
  }): void {
    invariant(
      input.identity === this.identity &&
        input.service.pipeline.model === this.model &&
        input.inputs === this.inputs &&
        input.context === this.context &&
        input.service.repository.usageJournal === this.journal,
      "generation_provider_composition_mismatch",
      "Use the actual accounting consumer's current model, inputs, conversation and journal.",
    );
    this.inputs.assertHostPool(input.service.repository.pool);
  }

  static async prepare(input: {
    identity: GenerationIdentityAuthority;
    workerPool: Pool;
    service: AgentService;
    inputs: PreparedGenerationAgentInputs;
    context: PreparedGenerationConversationContext;
    journal: PreparedGenerationJournal;
    consumers: readonly GenerationPurposeConsumer[];
    /** Independently reviewed effective permission/RLS catalogue. */
    catalogueChecksum: string;
  }): Promise<PreparedGenerationProviderAccounting> {
    const model = input.service.pipeline.model;
    invariant(
      input.identity instanceof GenerationIdentityAuthority &&
        input.service instanceof AgentService &&
        input.inputs instanceof PreparedGenerationAgentInputs &&
        input.context instanceof PreparedGenerationConversationContext &&
        input.journal instanceof PreparedGenerationJournal &&
        input.service.repository.usageJournal === input.journal &&
        model !== null &&
        model.pricingConfigured &&
        Hash.safeParse(model.fingerprint).success,
      "generation_provider_unconfigured",
      "Actual current readers, accepted C10 journal custody and configured model pricing are required.",
    );
    input.identity.assertPool(input.workerPool);
    input.inputs.assertHostPool(input.service.repository.pool);
    input.context.assertHostPool(input.service.repository.pool);
    input.journal.assertPool(input.service.repository.pool);
    const consumers = Object.freeze(
      input.consumers.map((consumer) =>
        Object.freeze({
          ...consumer,
          migration: Object.freeze({ ...consumer.migration }),
        }),
      ),
    );
    const replaced = await registeredMigration(
      GENERATION_INTERRUPTED_COST_SOURCE,
    );
    const admission = GENERATION_PROVIDER_SIGNATURES[0];
    const original = consumers.filter(
      (c) => !replaced || c.signature !== admission,
    );
    invariant(
      Hash.safeParse(input.catalogueChecksum).success &&
        consumers.length === GENERATION_PROVIDER_SIGNATURES.length &&
        GENERATION_PROVIDER_SIGNATURES.every(
          (signature) =>
            consumers.filter((consumer) => consumer.signature === signature)
              .length === 1,
        ) &&
        new Set(original.map((c) => c.migration.checksum)).size === 1 &&
        original.every(
          (c) => c.migration.version === GENERATION_PROVIDER_MIGRATION,
        ) &&
        (!replaced ||
          consumers.some(
            (c) =>
              c.signature === admission &&
              c.migration.version === replaced.version &&
              c.migration.checksum === replaced.checksum,
          )) &&
        consumers.every(
          (c) =>
            c.owner === owner &&
            Hash.safeParse(c.migration.checksum).success &&
            Hash.safeParse(c.definitionChecksum).success,
        ),
      "generation_provider_unconfigured",
      "Use all three exact source-reviewed accounting consumers.",
    );
    const custody: GenerationConsumerCustody = Object.freeze({
      owner,
      consumers,
      catalogueChecksum: input.catalogueChecksum,
      callers: Object.freeze([]),
      dependencies: Object.freeze([
        "creator.generation_scope_matches(uuid,uuid)",
        "creator.generation_agent_inputs(uuid,uuid)",
      ]),
    });
    try {
      await assertGenerationConsumerCustody(input.workerPool, custody);
      for (const consumer of consumers) {
        input.identity.assertConsumerRegistered(consumer);
        const row = (
          await input.workerPool.query<{
            ready: boolean;
            definition: string;
          }>(
            `SELECT session_user='creator_generation_worker' AND current_user=session_user
             AND EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
             AND p.prosecdef AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=pg_catalog']
             AND r.rolname=$3 AND NOT r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper
             AND NOT r.rolbypassrls AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication
             AND (r.rolconfig IS NULL OR cardinality(r.rolconfig)=0)
             AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
             AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
             AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=r.oid)
             AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
              WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
             AND has_function_privilege(session_user,p.oid,'EXECUTE')
             AND (SELECT count(*)=6 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
              WHERE n.nspname='creator' AND c.relname=ANY(ARRAY['generation_worker_scope','ai_workspace','ai_cost_hold','ai_generation_admission','ai_generation_attempt','ai_usage'])
               AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AND pg_get_userbyid(c.relowner)='creator_owner')
             AS ready,pg_get_functiondef(p.oid) AS definition
             FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=to_regprocedure($4)`,
            [
              consumer.migration.version,
              consumer.migration.checksum,
              owner,
              consumer.signature,
            ],
          )
        ).rows[0];
        if (
          row?.ready !== true ||
          createHash("sha256").update(row.definition).digest("hex") !==
            consumer.definitionChecksum
        )
          throw new Error("Unreviewed accounting executable");
      }
    } catch (cause) {
      const failure = new DomainError(
        "generation_provider_unconfigured",
        "Reviewed canonical provider admission and completion custody is not installed.",
        503,
      );
      Object.defineProperty(failure, "cause", {
        value: cause,
        configurable: true,
        writable: true,
      });
      throw failure;
    }
    return new PreparedGenerationProviderAccounting(
      input.identity,
      input.workerPool,
      model,
      input.inputs,
      input.context,
      input.journal,
      custody,
    );
  }

  async beginInTransaction(
    client: PoolClient,
    scope: GenerationTaskScope,
    licensedFacts?: GenerationAgentFacts,
  ): Promise<GenerationProviderAttempt> {
    await this.identity.authorizeInTransaction(scope, client);
    await assertGenerationConsumerCustody(client, this.custody);
    await this.journal.assertClient(client);
    const context = await this.context.currentInTransaction(client, scope);
    const facts =
      licensedFacts ?? (await this.inputs.currentInTransaction(client, scope));
    if (licensedFacts)
      await this.inputs.authorizeLicensedInTransaction(facts, scope, client);
    // A strict bound on what this run can send for this creator's actual
    // configuration and message (founder decision 2026-10-15), each call at
    // its own model's rate. Models without the bound keep the old envelope.
    const ceiling =
      this.model.maximumBoundedRunCostMicros &&
      this.model.contextTokenCeiling &&
      this.model.outputTokenCap
        ? this.model.maximumBoundedRunCostMicros(
            maximumGenerationCalls({
              compiledPrefix: facts.version.compiledPrefix,
              message: context.acceptedText,
              configuration: DraftConfig.parse(facts.version.configuration),
              sponsors: facts.sponsors,
              contextTokenCeiling:
                this.model.contextTokenCeiling(CONTEXT_BUDGET),
              outputTokenCap: this.model.outputTokenCap,
            }),
          )
        : this.model.maximumRunCostMicros(
            Buffer.byteLength(facts.version.compiledPrefix, "utf8"),
          );
    invariant(
      ceiling !== null &&
        Number.isSafeInteger(ceiling) &&
        ceiling > 0 &&
        ceiling <= 1_000_000_000,
      "model_pricing_required",
      "The actual configured model must bound all provider attempts before admission.",
    );
    const raw = (
      await client.query<{ id: unknown }>(
        "SELECT creator.generation_begin_agent_attempt($1,$2,$3,$4,$5,$6) AS id",
        [
          scope.generationId,
          scope.workerToken,
          facts.version.compiledHash,
          this.model.fingerprint,
          ceiling,
          this.journal.retentionPolicyVersion,
        ],
      )
    ).rows[0]?.id;
    await this.inputs.authorizeInTransaction(facts, scope, client);
    await this.context.assertCurrentInTransaction(client, scope, context);
    await this.identity.authorizeInTransaction(scope, client);
    await assertGenerationConsumerCustody(client, this.custody);
    const attempt = Object.freeze({
      generationId: scope.generationId,
      workerToken: scope.workerToken,
      creatorId: scope.creatorId,
      creatorHoldId: z.uuid().parse(raw),
      compiledHash: facts.version.compiledHash,
      modelFingerprint: this.model.fingerprint,
    });
    this.attempts.add(attempt);
    return attempt;
  }

  private async openInTransaction(
    client: PoolClient,
    scope: GenerationTaskScope,
    attempt: GenerationProviderAttempt,
    category: Category,
    licensedFacts?: GenerationAgentFacts,
  ): Promise<Admitted> {
    invariant(
      this.attempts.has(attempt) &&
        attempt.generationId === scope.generationId &&
        attempt.workerToken === scope.workerToken &&
        attempt.creatorId === scope.creatorId &&
        attempt.modelFingerprint === this.model.fingerprint,
      "generation_attempt_required",
      "Use this worker's actual current issued provider attempt.",
    );
    await this.identity.authorizeInTransaction(scope, client);
    await assertGenerationConsumerCustody(client, this.custody);
    await this.journal.assertClient(client);
    const context = await this.context.currentInTransaction(client, scope);
    const facts =
      licensedFacts ?? (await this.inputs.currentInTransaction(client, scope));
    if (licensedFacts)
      await this.inputs.authorizeLicensedInTransaction(facts, scope, client);
    invariant(
      facts.version.compiledHash === attempt.compiledHash,
      "generation_inputs_changed",
      "The accepted attempt's compiled version changed.",
    );
    const capability = randomBytes(32).toString("hex");
    const raw = (
      await client.query<{ id: unknown }>(
        "SELECT creator.generation_open_provider_usage($1,$2,$3,$4,$5,$6) AS id",
        [
          scope.generationId,
          scope.workerToken,
          attempt.compiledHash,
          attempt.modelFingerprint,
          category,
          capability,
        ],
      )
    ).rows[0]?.id;
    await this.inputs.authorizeInTransaction(facts, scope, client);
    await this.context.assertCurrentInTransaction(client, scope, context);
    await this.identity.authorizeInTransaction(scope, client);
    await assertGenerationConsumerCustody(client, this.custody);
    const admitted = Object.freeze({ id: z.uuid().parse(raw) });
    this.admissions.set(admitted, {
      generationId: scope.generationId,
      workerToken: scope.workerToken,
      capability,
      started: performance.now(),
      completed: false,
    });
    return admitted;
  }

  private unknownUsage(): Usage {
    return {
      provider: "configured",
      model: this.model.fingerprint,
      inputTokens: 0,
      outputTokens: 0,
      costMicros: null,
    };
  }

  private issuedCall(
    admitted: Admitted,
    task: GenerationTask,
    attempt: GenerationProviderAttempt,
  ): GenerationProviderCall {
    const call = Object.freeze({
      usageId: admitted.id,
      generationId: task.generationId,
      workerToken: task.workerToken,
      modelFingerprint: this.model.fingerprint,
    });
    this.calls.set(call, attempt);
    return call;
  }

  assertCall(
    call: GenerationProviderCall,
    attempt: GenerationProviderAttempt,
    task: GenerationTask,
  ): void {
    invariant(
      this.calls.get(call) === attempt &&
        this.attempts.has(attempt) &&
        call.generationId === task.generationId &&
        call.workerToken === task.workerToken &&
        attempt.generationId === task.generationId &&
        attempt.workerToken === task.workerToken &&
        attempt.creatorId === task.creatorId &&
        call.modelFingerprint === this.model.fingerprint &&
        attempt.modelFingerprint === this.model.fingerprint,
      "generation_provider_call_required",
      "Use the original privately issued committed provider admission.",
    );
  }

  private async admit(
    task: GenerationTask,
    attempt: GenerationProviderAttempt,
    category: Category,
    signal: AbortSignal,
    bookend?: GenerationAdmissionBookend,
  ): Promise<Admitted> {
    return this.identity.withGeneration(
      task,
      async (client, scope) => {
        // One fresh read of the answer's authority and inputs precedes the
        // admission; W1 still checks authority before its sole COMMIT, and
        // every sentence's append re-checks its approval before and after.
        const facts = await bookend?.(client, scope);
        return this.openInTransaction(
          client,
          scope,
          attempt,
          category,
          facts || undefined,
        );
      },
      signal,
    );
  }

  private async finish(admitted: Admitted, usage: Usage): Promise<void> {
    const custody = this.admissions.get(admitted);
    invariant(
      custody && !custody.completed,
      "generation_usage_completion_required",
      "Completion requires this original privately admitted call.",
    );
    const report = Report.parse({
      ...usage,
      cachedInputTokens: usage.cachedInputTokens ?? null,
      cacheWriteInputTokens: usage.cacheWriteInputTokens ?? null,
    });
    const duration = Math.min(
      2147483647,
      Math.max(0, Math.round(performance.now() - custody.started)),
    );
    // An incurred obligation must finish after cancellation/revocation. The
    // original transaction helper owns commit and awaited cleanup, without a
    // cancelled generation signal or renewed read/admission authority.
    await generationTransaction(this.workerPool, undefined, async (client) => {
      await client.query("SET LOCAL statement_timeout='4s'");
      await client.query("SET LOCAL lock_timeout='250ms'");
      const clean = (
        await client.query<{ clean: boolean }>(
          `SELECT session_user='creator_generation_worker' AND current_user=session_user
           AND nullif(current_setting('app.account_id',true),'') IS NULL
           AND nullif(current_setting('app.identity_session_id',true),'') IS NULL
           AND nullif(current_setting('app.creator_id',true),'') IS NULL
           AND nullif(current_setting('app.fan_id',true),'') IS NULL AS clean`,
        )
      ).rows[0]?.clean;
      invariant(
        clean,
        "generation_completion_pool_changed",
        "Use the original distinct worker pool without interactive identity.",
      );
      // Completion keeps only its original private admission capability after
      // revocation. Check accounting custody without requiring new read/admit
      // authority, so an incurred charge can still be recorded truthfully.
      await assertGenerationConsumerCustody(client, this.custody);
      const updated = (
        await client.query<{ completed: boolean }>(
          "SELECT creator.generation_finish_provider_usage($1,$2,$3,$4,$5::jsonb,$6) AS completed",
          [
            admitted.id,
            custody.generationId,
            custody.workerToken,
            custody.capability,
            JSON.stringify(report),
            duration,
          ],
        )
      ).rows[0]?.completed;
      invariant(
        updated,
        "generation_usage_completion_missing",
        "The original admitted usage must persist its actual reported charge.",
      );
      await assertGenerationConsumerCustody(client, this.custody);
    });
    custody.completed = true;
    custody.capability = "";
    this.admissions.delete(admitted);
  }

  private async finishRetainingFailure(
    admitted: Admitted,
    usage: Usage,
    sourceFailure?: { cause: unknown },
  ): Promise<void> {
    try {
      await this.finish(admitted, usage);
    } catch (completionFailure) {
      if (!sourceFailure) throw completionFailure;
      const unavailable = new DomainError(
        "generation_usage_completion_unavailable",
        "The incurred usage could not be recorded. Reconcile its original admission.",
        503,
      );
      Object.defineProperty(unavailable, "cause", {
        value: new AggregateError(
          [sourceFailure.cause, completionFailure],
          "Original provider and incurred usage completion failures.",
        ),
        configurable: true,
        writable: true,
      });
      throw unavailable;
    }
  }

  /** Admits one call inside the caller's own held W1 purpose, with the same
   * checks as a separate admission. The caller must use it once through
   * withAdmittedUsage, or release it unused. */
  async admitInTransaction(
    client: PoolClient,
    scope: GenerationTaskScope,
    attempt: GenerationProviderAttempt,
    category: Category,
    licensedFacts?: GenerationAgentFacts,
  ): Promise<GenerationProviderAdmission> {
    return this.openInTransaction(
      client,
      scope,
      attempt,
      category,
      licensedFacts,
    );
  }

  /** An admitted call that was never made sent no request: a known zero. */
  async releaseUnused(admitted: GenerationProviderAdmission): Promise<void> {
    await this.finish(admitted, {
      ...this.unknownUsage(),
      costMicros: 0,
    });
  }

  async withAdmittedUsage<T extends { usage: Usage }>(
    task: GenerationTask,
    attempt: GenerationProviderAttempt,
    admitted: GenerationProviderAdmission,
    signal: AbortSignal,
    call: () => Promise<T>,
    onAdmission?: (call: GenerationProviderCall) => void,
  ): Promise<T> {
    let usage = this.unknownUsage();
    let sourceFailure: { cause: unknown } | undefined;
    try {
      onAdmission?.(this.issuedCall(admitted, task, attempt));
      signal.throwIfAborted();
      const result = await call();
      usage = result.usage;
      return result;
    } catch (error) {
      sourceFailure = { cause: error };
      if (error instanceof ProviderResponseError) usage = error.usage;
      throw error;
    } finally {
      await this.finishRetainingFailure(admitted, usage, sourceFailure);
    }
  }

  async withUsage<T extends { usage: Usage }>(
    task: GenerationTask,
    attempt: GenerationProviderAttempt,
    category: Category,
    signal: AbortSignal,
    call: () => Promise<T>,
    bookend?: GenerationAdmissionBookend,
    onAdmission?: (call: GenerationProviderCall) => void,
  ): Promise<T> {
    signal.throwIfAborted();
    const admitted = await this.admit(task, attempt, category, signal, bookend);
    let usage = this.unknownUsage();
    let sourceFailure: { cause: unknown } | undefined;
    try {
      onAdmission?.(this.issuedCall(admitted, task, attempt));
      signal.throwIfAborted();
      const result = await call();
      usage = result.usage;
      return result;
    } catch (error) {
      sourceFailure = { cause: error };
      if (error instanceof ProviderResponseError) usage = error.usage;
      throw error;
    } finally {
      // No current read authority is required to record an already incurred
      // charge after cancellation or invalid output. Missing usage stays unknown.
      await this.finishRetainingFailure(admitted, usage, sourceFailure);
    }
  }

  async *withAdmittedStreamUsage(
    task: GenerationTask,
    attempt: GenerationProviderAttempt,
    admitted: GenerationProviderAdmission,
    signal: AbortSignal,
    call: () => AsyncIterable<StreamProposal>,
    onAdmission?: (call: GenerationProviderCall) => void,
  ): AsyncIterable<StreamProposal> {
    let usage = this.unknownUsage();
    let sourceFailure: { cause: unknown } | undefined;
    try {
      onAdmission?.(this.issuedCall(admitted, task, attempt));
      signal.throwIfAborted();
      for await (const proposal of call()) {
        if ("usage" in proposal) usage = proposal.usage;
        yield proposal;
      }
    } catch (error) {
      sourceFailure = { cause: error };
      if (error instanceof ProviderResponseError) usage = error.usage;
      throw error;
    } finally {
      await this.finishRetainingFailure(admitted, usage, sourceFailure);
    }
  }

  async *withStreamUsage(
    task: GenerationTask,
    attempt: GenerationProviderAttempt,
    signal: AbortSignal,
    call: () => AsyncIterable<StreamProposal>,
    bookend?: GenerationAdmissionBookend,
    onAdmission?: (call: GenerationProviderCall) => void,
  ): AsyncIterable<StreamProposal> {
    signal.throwIfAborted();
    const admitted = await this.admit(task, attempt, "reply", signal, bookend);
    let usage = this.unknownUsage();
    let sourceFailure: { cause: unknown } | undefined;
    try {
      onAdmission?.(this.issuedCall(admitted, task, attempt));
      signal.throwIfAborted();
      for await (const proposal of call()) {
        if ("usage" in proposal) usage = proposal.usage;
        yield proposal;
      }
    } catch (error) {
      sourceFailure = { cause: error };
      if (error instanceof ProviderResponseError) usage = error.usage;
      throw error;
    } finally {
      await this.finishRetainingFailure(admitted, usage, sourceFailure);
    }
  }
}
