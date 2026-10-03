import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { IdSchema, SignedActCommandSchema } from "@qelvora/api";
import { ContentDocument } from "../../../../../packages/api/src/content.js";
import { ProcessedMediaEvidenceSchema } from "../../../../../packages/api/src/media.js";
import { canonical, contentHash } from "../../core/canonical.js";
import { invariant } from "../../core/errors.js";
import { requestAuthority } from "./request-authority.js";
import { assertPublicationPreparation } from "./publication-preparation.js";
import { assertFulfillmentPublicationDenialCatalog } from "../trust/fulfillment-publication-denial-catalog.js";

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
 * session can authorize it. W8 must activate reviewed 0071 plus its held denial
 * projection before construction/use; no development or missing-port fallback.
 */
export class PublicationIdentityAuthority {
  private readonly issued = new WeakMap<
    object,
    Readonly<{
      client: PoolClient;
      preparation: string;
      command: string;
      transaction: string;
      pid: number;
      nonce: string;
    }>
  >();
  constructor(
    private readonly pool: Pool,
    private readonly configuration: Readonly<{
      assertAllowed: PublicationRestriction;
      assertDiscoveryAllowed: (client: PoolClient) => Promise<void>;
    }>,
  ) {
    invariant(
      typeof configuration.assertAllowed === "function" &&
        typeof configuration.assertDiscoveryAllowed === "function",
      "publication_denial_unconfigured",
      "Publication workers require their current purpose denial authority.",
    );
  }

  async assertRole(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await assertPublicationPreparation(client);
    } finally {
      client.release();
    }
  }

  private async prepare(
    client: PoolClient,
    task: z.infer<typeof candidateSchema>,
  ) {
    // The genuine W8 catalogue is required before original204's private
    // negatives/body boundary. A future combined208 wave needs its separately
    // qualified catalogue; never learn or accept the current metadata here.
    await assertFulfillmentPublicationDenialCatalog(client);
    const result = await client.query<{ preparation: unknown }>(
      "SELECT creator.prepare_publication_task($1,$2,$3,$4,$5) AS preparation",
      [
        task.creatorId,
        task.contentId,
        task.version,
        task.publisherAccountId,
        task.signedActId,
      ],
    );
    return IdSchema.parse(result.rows[0]?.preparation);
  }

  private assertWorker() {
    invariant(
      !requestAuthority.getStore(),
      "publication_worker_required",
      "Publication worker authority cannot substitute for an interactive session.",
    );
  }

  /** Metadata enumeration grants no publication authority. Every returned task
   * is independently rechecked under current denial/identity locks before work.
   * Unsigned hashes come from a bounded, authorized current Team post projection.
   */
  async pendingTasks(limit = 20): Promise<readonly PublicationTask[]> {
    this.assertWorker();
    await this.assertRole();
    const boundedLimit = z.number().int().min(1).max(20).parse(limit);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      await client.query(
        "SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','2000',true)",
      );
      await this.configuration.assertDiscoveryAllowed(client);
      const rows = await client.query<{ candidate: unknown }>(
        "SELECT candidate FROM creator.pending_publication_tasks($1)",
        [boundedLimit],
      );
      const candidates = rows.rows.map((row) =>
        candidateSchema.parse(row.candidate),
      );
      await client.query("COMMIT");
      const tasks: PublicationTask[] = [];
      for (const candidate of candidates) {
        // One family per transaction avoids accumulating denial locks in
        // unrelated account/creator order during global discovery.
        await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
        await client.query(
          "SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','2000',true)",
        );
        await this.configuration.assertDiscoveryAllowed(client);
        const preparation = await this.prepare(client, candidate);
        const result = await client.query<{ proof: unknown }>(
          "SELECT creator.read_prepared_publication_task($1) AS proof",
          [preparation],
        );
        if (result.rows[0]?.proof == null) {
          await client.query("ROLLBACK");
          continue;
        }
        const proof = proofSchema.parse(result.rows[0].proof),
          commandHash = contentHash(proofCommand(proof));
        invariant(
          proof.signedActId === null ||
            (proof.commandHash === commandHash &&
              contentHash(proof.command) === commandHash),
          "publication_command_changed",
          "The stored publication command changed.",
        );
        tasks.push(
          Object.freeze(
            taskSchema.parse({
              creatorId: proof.creatorId,
              contentId: proof.contentId,
              version: proof.version,
              publisherAccountId: proof.publisherAccountId,
              signedActId: proof.signedActId,
              commandHash,
            }),
          ),
        );
        // Discovery grants no issuance or domain write. Roll back the actual
        // early preparation, including original204's private negatives.
        await client.query("ROLLBACK");
      }
      return Object.freeze(tasks);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async withPublication<T>(
    input: PublicationTask,
    work: (client: PoolClient, scope: PublicationTaskScope) => Promise<T>,
    beforeFinalSignatureRead?: (
      client: PoolClient,
      scope: PublicationTaskScope,
    ) => Promise<void>,
  ): Promise<T> {
    this.assertWorker();
    await this.assertRole();
    const task = Object.freeze(taskSchema.parse(input));
    const client = await this.pool.connect();
    let scope: PublicationTaskScope | undefined;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      await client.query(
        "SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','2000',true)",
      );
      // This actual held-client callback includes W8 restoration currentness.
      // The SQL issuer separately requires its purpose-specific DB denial.
      await this.configuration.assertAllowed(client, task);
      const preparation = await this.prepare(client, task);
      const result = await client.query<{ proof: unknown }>(
        "SELECT creator.read_prepared_publication_task($1) AS proof",
        [preparation],
      );
      const proof = proofSchema.parse(result.rows[0]?.proof);
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
        "SELECT creator.begin_prepared_publication_scope($1,$2,$3) AS allowed",
        [preparation, task.commandHash, canonical(command)],
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
          ...context,
        }),
      );
      const value = await work(client, scope);
      await this.configuration.assertAllowed(client, task);
      await assertFulfillmentPublicationDenialCatalog(client);
      await beforeFinalSignatureRead?.(client, scope);
      const final = await client.query<{ allowed: boolean }>(
        "SELECT creator.finalize_prepared_publication_scope($1) AS allowed",
        [preparation],
      );
      invariant(
        final.rows[0]?.allowed === true,
        "publication_scope_expired",
        "The original publication changed before commit.",
      );
      this.issued.delete(scope);
      // No matcher, callback, cleanup, settings, domain read or write follows
      // original0208's final fresh signature gate. Only COMMIT is sent to SQL.
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      if (scope) this.issued.delete(scope);
      client.release();
    }
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
    const held = this.issued.get(scope);
    invariant(
      held?.client === client,
      "publication_scope_required",
      "A current issued publication scope is required.",
    );
    const context = await this.context(client);
    invariant(
      context.pid === held.pid &&
        context.transaction === held.transaction &&
        context.nonce === held.nonce,
      "publication_scope_expired",
      "The original publication transaction changed.",
    );
    const result = await client.query<{ allowed: boolean }>(
      "SELECT creator.publication_scope_matches($1,$2,$3) AS allowed",
      [scope.creatorId, scope.contentId, scope.version],
    );
    invariant(
      result.rows[0]?.allowed === true,
      "publication_scope_expired",
      "The publication transaction ended or changed.",
    );
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
