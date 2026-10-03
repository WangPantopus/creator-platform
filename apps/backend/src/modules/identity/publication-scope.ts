import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { IdSchema, SignedActCommandSchema } from "@qelvora/api";
import { ContentDocument } from "../../../../../packages/api/src/content.js";
import { ProcessedMediaEvidenceSchema } from "../../../../../packages/api/src/media.js";
import { canonical, contentHash } from "../../core/canonical.js";
import { invariant } from "../../core/errors.js";
import { requestAuthority } from "./request-authority.js";
import { assertPublicationPreparationCatalogue } from "./publication-preparation-catalogue.js";
import {
  assertPublicationPoolCustody,
  publicationTransaction,
} from "./publication-transaction.js";

const taskSchema = z
  .object({
    creatorId: IdSchema,
    contentId: IdSchema,
    version: z.number().int().positive(),
    publisherAccountId: IdSchema,
    signedActId: IdSchema.nullable(),
    commandHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();
export type PublicationTask = Readonly<z.infer<typeof taskSchema>>;
const publicationScopeBrand: unique symbol = Symbol("PublicationTaskScope");
export type PublicationTaskScope = PublicationTask &
  Readonly<{
    [publicationScopeBrand]: true;
    kind: "publication";
  }>;
export type PublicationRestriction = (
  client: PoolClient,
  task: PublicationTask,
) => Promise<void>;
const preparationBrand: unique symbol = Symbol("PublicationPreparation");
/** Owner ports receive this only from the genuine issuer on its held client.
 * Private preparation tokens never appear in a task, request or serialized DTO. */
export type PublicationPreparation = Readonly<{
  [preparationBrand]: true;
  nonce: string;
  token: string;
  fulfillmentNonce: string | null;
}>;
const preparationSchema = z
  .object({
    nonce: IdSchema,
    token: IdSchema,
    fulfillment_nonce: IdSchema.nullable(),
    proof: z.unknown(),
  })
  .strict();

const proofSchema = z.object({
  creatorId: IdSchema,
  contentId: IdSchema,
  version: z.number().int().positive(),
  publisherAccountId: IdSchema,
  signedActId: IdSchema.nullable(),
  document: ContentDocument,
  mediaEvidence: z.array(ProcessedMediaEvidenceSchema).max(10),
  command: SignedActCommandSchema.nullable(),
  commandHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .nullable(),
});
const candidateSchema = taskSchema.omit({ commandHash: true });

function proofCommand(proof: z.infer<typeof proofSchema>) {
  return SignedActCommandSchema.parse({
    actType: proof.document.kind === "note" ? "broadcast" : "reply",
    subjectId: proof.contentId,
    content: {
      kind: "content_publication",
      creatorId: proof.creatorId,
      version: proof.version,
      document: proof.document,
      ...(proof.mediaEvidence.length
        ? { mediaEvidence: proof.mediaEvidence }
        : {}),
    },
  });
}

/** A separate noninteractive purpose issuer. Neither an Actor nor a request
 * session can authorize it. Actual0208 and both original-family owners must be
 * reviewed/activated with their combined catalogue before use. No fallback.
 */
export class PublicationIdentityAuthority {
  private readonly issued = new WeakMap<
    object,
    Readonly<{
      client: PoolClient;
      preparation: PublicationPreparation;
      command: string;
      transaction: string;
      pid: number;
      nonce: string;
      signal?: AbortSignal;
    }>
  >();
  constructor(
    private readonly pool: Pool,
    private readonly configuration: Readonly<{
      assertAllowed: PublicationRestriction;
      assertDiscoveryAllowed: (client: PoolClient) => Promise<void>;
      assertPreparationAllowed: (client: PoolClient) => Promise<void>;
    }>,
  ) {
    assertPublicationPoolCustody(pool);
    invariant(
      typeof configuration.assertAllowed === "function" &&
        typeof configuration.assertDiscoveryAllowed === "function" &&
        typeof configuration.assertPreparationAllowed === "function",
      "publication_denial_unconfigured",
      "Publication workers require their current purpose denial authority.",
    );
  }

  async assertRole(signal?: AbortSignal): Promise<void> {
    this.assertWorker();
    await publicationTransaction(
      this.pool,
      signal,
      async (client) => {
        await client.query("SET LOCAL statement_timeout='5s'");
        await client.query("SET LOCAL lock_timeout='1s'");
        await this.configuration.assertDiscoveryAllowed(client);
        await assertPublicationPreparationCatalogue(client);
        await this.configuration.assertPreparationAllowed(client);
      },
      "ROLLBACK",
      true,
    );
  }

  private assertWorker() {
    invariant(
      !requestAuthority.getStore(),
      "publication_worker_required",
      "Publication worker authority cannot substitute for an interactive session.",
    );
  }

  /** Preparation must use this issuer's exact separate publication pool. */
  assertHostPool(pool: Pool): void {
    invariant(
      pool === this.pool,
      "publication_pool_changed",
      "Use the original configured publication data service.",
    );
  }

  private async prepare(
    client: PoolClient,
    candidate: z.infer<typeof candidateSchema>,
  ) {
    await assertPublicationPreparationCatalogue(client);
    await this.configuration.assertPreparationAllowed(client);
    const result = await client.query(
      "SELECT * FROM creator.prepare_publication_task($1,$2,$3,$4,$5)",
      [
        candidate.creatorId,
        candidate.contentId,
        candidate.version,
        candidate.publisherAccountId,
        candidate.signedActId,
      ],
    );
    const prepared = preparationSchema.parse(result.rows[0]);
    return {
      proof: proofSchema.parse(prepared.proof),
      preparation: Object.freeze({
        [preparationBrand]: true as const,
        nonce: prepared.nonce,
        token: prepared.token,
        fulfillmentNonce: prepared.fulfillment_nonce,
      }),
    };
  }

  /** Metadata enumeration grants no publication authority. Every returned task
   * is independently rechecked under current denial/identity locks before work.
   * Unsigned hashes come from a bounded, authorized current Team post projection.
   */
  async pendingTasks(
    limit = 20,
    signal?: AbortSignal,
  ): Promise<readonly PublicationTask[]> {
    this.assertWorker();
    await this.assertRole(signal);
    const boundedLimit = z.number().int().min(1).max(20).parse(limit);
    const candidates = await publicationTransaction(
      this.pool,
      signal,
      async (client) => {
        await client.query(
          "SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','2000',true)",
        );
        await this.configuration.assertDiscoveryAllowed(client);
        const rows = await client.query<{ candidate: unknown }>(
          "SELECT candidate FROM creator.pending_publication_tasks($1)",
          [boundedLimit],
        );
        return rows.rows.map((row) => candidateSchema.parse(row.candidate));
      },
      "ROLLBACK",
    );
    const tasks: PublicationTask[] = [];
    for (const candidate of candidates) {
      // One family per transaction preserves original denial lock order.
      try {
        const task = await publicationTransaction(
          this.pool,
          signal,
          async (client) => {
            await client.query(
              "SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','2000',true)",
            );
            await this.configuration.assertDiscoveryAllowed(client);
            const { proof } = await this.prepare(client, candidate),
              commandHash = contentHash(proofCommand(proof));
            invariant(
              proof.signedActId === null ||
                (proof.commandHash === commandHash &&
                  contentHash(proof.command) === commandHash),
              "publication_command_changed",
              "The stored publication command changed.",
            );
            return Object.freeze(
              taskSchema.parse({
                creatorId: proof.creatorId,
                contentId: proof.contentId,
                version: proof.version,
                publisherAccountId: proof.publisherAccountId,
                signedActId: proof.signedActId,
                commandHash,
              }),
            );
          },
          "ROLLBACK",
        );
        // A task becomes visible only after the actual discovery rollback
        // receipt. No private204/208 preparation or negative lock is committed.
        tasks.push(task);
      } catch (error) {
        // A denied candidate is skipped only when its original rollback settled.
        // Transport, cleanup, registry and restoration failures stop discovery.
        if ((error as { code?: string } | null)?.code !== "42501") throw error;
      }
    }
    return Object.freeze(tasks);
  }

  async withPublication<T>(
    input: PublicationTask,
    work: (client: PoolClient, scope: PublicationTaskScope) => Promise<T>,
    beforeFinalSignatureRead?: (
      client: PoolClient,
      scope: PublicationTaskScope,
    ) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<T> {
    this.assertWorker();
    await this.assertRole(signal);
    const task = Object.freeze(taskSchema.parse(input));
    return publicationTransaction(this.pool, signal, async (client) => {
      let scope: PublicationTaskScope | undefined;
      try {
        await client.query(
          "SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','2000',true)",
        );
        // This actual held-client callback includes W8 restoration currentness.
        // The SQL issuer separately requires its purpose-specific DB denial.
        await this.configuration.assertAllowed(client, task);
        const { proof, preparation } = await this.prepare(client, task);
        invariant(
          proof.creatorId === task.creatorId &&
            proof.contentId === task.contentId &&
            proof.version === task.version &&
            proof.publisherAccountId === task.publisherAccountId &&
            proof.signedActId === task.signedActId,
          "publication_task_changed",
          "The stored publication task changed.",
        );
        const command = proofCommand(proof);
        invariant(
          contentHash(command) === task.commandHash &&
            (task.signedActId === null
              ? proof.command === null
              : proof.commandHash === task.commandHash &&
                contentHash(proof.command) === task.commandHash),
          "publication_command_changed",
          "The exact stored publication command is required.",
        );
        const issued = await client.query<{ allowed: boolean }>(
          "SELECT creator.bind_prepared_publication($1,$2,$3,$4) AS allowed",
          [
            preparation.nonce,
            preparation.token,
            task.commandHash,
            canonical(command),
          ],
        );
        invariant(
          issued.rows[0]?.allowed === true,
          "publication_unavailable",
          "This publication task is unavailable.",
        );
        scope = Object.freeze({
          ...task,
          [publicationScopeBrand]: true as const,
          kind: "publication" as const,
        });
        const context = await this.context(client);
        this.issued.set(
          scope,
          Object.freeze({
            client,
            preparation,
            command: canonical(command),
            signal,
            ...context,
          }),
        );
        const value = await work(client, scope);
        await this.authorizeInTransaction(scope, client);
        await this.configuration.assertAllowed(client, task);
        await assertPublicationPreparationCatalogue(client);
        await this.configuration.assertPreparationAllowed(client);
        await beforeFinalSignatureRead?.(client, scope);
        await this.authorizeInTransaction(scope, client);
        // Invalidate the JS port before the joint SQL finalizer. The SQL ends204
        // before actual213, then ends0158/208 before its last current domain read.
        // No owner/catalogue/restore callback or DB read may follow it, only COMMIT.
        this.issued.delete(scope);
        const finished = await client.query<{ allowed: boolean }>(
          "SELECT creator.finish_prepared_publication($1,$2) AS allowed",
          [preparation.nonce, preparation.token],
        );
        invariant(
          finished.rows[0]?.allowed === true,
          "publication_unavailable",
          "The original publication task cannot be finalized.",
        );
        return value;
      } finally {
        if (scope) this.issued.delete(scope);
      }
    });
  }

  /** Original cancellation context only; durable authorization remains required. */
  originalSignalInTransaction(
    scope: PublicationTaskScope,
    client: PoolClient,
  ): AbortSignal | undefined {
    this.assertWorker();
    const held = this.issued.get(scope);
    invariant(
      held?.client === client,
      "publication_scope_required",
      "A current issued publication scope is required.",
    );
    return held!.signal;
  }

  /** W6 joins only the exact client and still-active SQL transaction issued
   * above. Retained scopes, other clients, JSON lookalikes and nested login
   * sessions fail; this grants no asset, recipient or generation permission.
   */
  async authorizeInTransaction(
    scope: PublicationTaskScope,
    client: PoolClient,
  ): Promise<void> {
    this.assertWorker();
    invariant(
      this.issued.get(scope)?.client === client,
      "publication_scope_required",
      "A current issued publication scope is required.",
    );
    const held = this.issued.get(scope)!;
    const context = await this.context(client);
    invariant(
      context.transaction === held.transaction &&
        context.pid === held.pid &&
        context.nonce === held.nonce,
      "publication_scope_expired",
      "The original publication client or transaction changed.",
    );
    const result = await client.query<{ allowed: boolean }>(
      "SELECT creator.prepared_publication_matches($1,$2) AS allowed",
      [
        this.issued.get(scope)!.preparation.nonce,
        this.issued.get(scope)!.preparation.token,
      ],
    );
    invariant(
      result.rows[0]?.allowed === true,
      "publication_scope_expired",
      "The publication transaction ended or changed.",
    );
  }

  /** Private owner-only binding. A copied/retained scope or another client
   * cannot retrieve or reuse the original nonce/token or fulfillment nonce. */
  async preparationInTransaction(
    scope: PublicationTaskScope,
    client: PoolClient,
  ): Promise<PublicationPreparation> {
    await this.authorizeInTransaction(scope, client);
    return this.issued.get(scope)!.preparation;
  }
  private async context(client: PoolClient) {
    const row = (
      await client.query<{
        transaction: unknown;
        pid: unknown;
        nonce: unknown;
      }>(
        "SELECT pg_current_xact_id()::text AS transaction,pg_backend_pid() AS pid,current_setting('publication.scope_id',true) AS nonce",
      )
    ).rows[0];
    return {
      transaction: z
        .string()
        .regex(/^[0-9]+$/u)
        .parse(row?.transaction),
      pid: z.number().int().positive().parse(row?.pid),
      nonce: IdSchema.parse(row?.nonce),
    };
  }

  /** Copy the complete original command captured by this issuer, never a caller
   * document or a structural authority lookalike. Copying grants no new scope. */
  async originalInTransaction(scope: PublicationTaskScope, client: PoolClient) {
    await this.authorizeInTransaction(scope, client);
    const command = SignedActCommandSchema.parse(
      JSON.parse(this.issued.get(scope)!.command),
    );
    const content = z
      .object({
        kind: z.literal("content_publication"),
        creatorId: IdSchema,
        version: z.number().int().positive(),
        document: ContentDocument,
        mediaEvidence: z.array(ProcessedMediaEvidenceSchema).max(10).optional(),
      })
      .parse(command.content);
    invariant(
      content.creatorId === scope.creatorId &&
        content.version === scope.version &&
        command.subjectId === scope.contentId &&
        contentHash(command) === scope.commandHash,
      "publication_command_changed",
      "The complete original publication command is required.",
    );
    return {
      document: content.document,
      mediaEvidence: content.mediaEvidence ?? [],
      transaction: this.issued.get(scope)!.transaction,
      pid: this.issued.get(scope)!.pid,
    };
  }
}
