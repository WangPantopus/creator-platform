import { DatabaseError, type Pool, type PoolClient } from "pg";
import { z } from "zod";
import { contentHash } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import { agentPreparationRead } from "../agent/preparation-read.js";
import { agentPrivacyTransaction } from "../agent/privacy-transaction.js";
import type { CreatorScope } from "../agent/repository.js";
import type { ConversationPrivacyAuthority } from "../conversation/privacy.js";
import type { PrivacyHook } from "./contracts.js";
import { assertAccountingBoundaryCatalogue } from "./accounting-boundary-catalogue.js";
import {
  restoredPrivacyTaskAuthorityInTransaction,
  type PrivacyTaskInput,
} from "./privacy-authority.js";
import {
  PrivacyArtifact,
  type PrivacyArtifactStore,
} from "./privacy-export.js";

const Retained = z.strictObject({
  category: z.string().min(1),
  until: z.iso.datetime({ offset: true }).nullable(),
  reason: z.string().min(1),
});
const DeleteReceipt = z
  .object({
    format: z.literal("conversation-delete-committed-v1"),
    schemaVersion: z.literal(3),
    domain: z.literal("conversation"),
    jobId: z.uuid(),
    idempotencyKey: z.string(),
    processedThreads: z.number().int().min(0).max(100),
    completedAt: z.iso.datetime({ offset: true }),
    retained: z.array(Retained),
  })
  .passthrough();
type DeleteResult = Awaited<ReturnType<PrivacyHook["run"]>>;

/** Retain the original Conversation authority/pool and actual Trust artifact
 * store. The database scope and tagged receipt own completion; no callback or
 * missing family can create a replacement successful result. */
export class PreparedPrivacyAccountingBoundary {
  private constructor(
    private readonly pool: Pool,
    private readonly authority: ConversationPrivacyAuthority,
    private readonly database: string,
    private readonly restored: (client: PoolClient) => Promise<void>,
    private readonly verifyArtifact: PrivacyArtifactStore["verify"] | undefined,
  ) {}

  static async prepare(input: {
    pool: Pool;
    authority: ConversationPrivacyAuthority;
    assertRestoredInTransaction: (client: PoolClient) => Promise<void>;
    artifacts?: PrivacyArtifactStore;
    signal?: AbortSignal;
  }): Promise<PreparedPrivacyAccountingBoundary> {
    invariant(
      typeof input.authority.fenceTaskInTransaction === "function" &&
        typeof input.assertRestoredInTransaction === "function",
      "accounting_boundary_unconfigured",
      "Original Conversation task and held restoration authority are required.",
    );
    const database = await agentPreparationRead(
      input.pool,
      async (client) => {
        await input.assertRestoredInTransaction(client);
        await assertAccountingBoundaryCatalogue(client, input.signal);
        const name = (
          await client.query<{ name: string }>(
            "SELECT current_database() AS name",
          )
        ).rows[0]!.name;
        await input.assertRestoredInTransaction(client);
        return name;
      },
      input.signal,
    );
    const owner = new PreparedPrivacyAccountingBoundary(
      input.pool,
      input.authority,
      database,
      input.assertRestoredInTransaction,
      input.artifacts?.verify.bind(input.artifacts),
    );
    Object.freeze(owner);
    return owner;
  }

  assertConversation(input: {
    pool: Pool;
    authority: ConversationPrivacyAuthority;
  }) {
    invariant(
      input.pool === this.pool && input.authority === this.authority,
      "accounting_boundary_owner_changed",
      "Use the original Conversation pool and task authority.",
    );
  }

  private async assertClient(client: PoolClient, job: PrivacyTaskInput) {
    invariant(
      job.signal,
      "privacy_lease_required",
      "The original task signal is required.",
    );
    job.signal.throwIfAborted();
    const row = (
      await client.query<{ same: boolean }>(
        "SELECT current_database()=$1 AS same",
        [this.database],
      )
    ).rows[0];
    invariant(
      row?.same === true,
      "accounting_boundary_owner_changed",
      "Retain the original accounting database.",
    );
    await assertAccountingBoundaryCatalogue(client, job.signal);
    return restoredPrivacyTaskAuthorityInTransaction(
      client,
      job,
      this.restored,
    );
  }

  private result(value: unknown, job: PrivacyTaskInput): DeleteResult {
    const receipt = DeleteReceipt.parse(value);
    invariant(
      job.kind === "delete" &&
        receipt.jobId === job.jobId &&
        receipt.idempotencyKey === `${job.jobId}:conversation` &&
        Buffer.byteLength(
          JSON.stringify({ receipt, retained: receipt.retained }),
        ) <=
          4 * 1024 * 1024,
      "accounting_boundary_receipt_unavailable",
      "The complete original deletion result must match this task and its bounded acknowledgement.",
    );
    return { receipt, retained: receipt.retained };
  }

  /** A current genuine retry reads the prior committed result before it tries
   * to enumerate families that the original transaction already erased. */
  async recover(job: PrivacyTaskInput): Promise<DeleteResult | undefined> {
    invariant(
      job.signal &&
        job.kind === "delete" &&
        job.idempotencyKey === `${job.jobId}:conversation`,
      "privacy_lease_required",
      "The original Conversation delete task is required.",
    );
    return agentPrivacyTransaction(this.pool, job.signal, async (client) => {
      await this.assertClient(client, job);
      const saved = (
        await client.query<{ receipt: unknown }>(
          "SELECT creator_trust.recover_conversation_delete_receipt($1,$2) AS receipt",
          [job.jobId, job.leaseToken],
        )
      ).rows[0]?.receipt;
      const result = saved == null ? undefined : this.result(saved, job);
      await this.assertClient(client, job);
      job.signal!.throwIfAborted();
      return result;
    });
  }

  /** Called after the real family/financial/retention checks and before the
   * caller's sole COMMIT. Return this exact object only once COMMIT settles. */
  async persist(
    client: PoolClient,
    job: PrivacyTaskInput,
    receipt: Record<string, unknown>,
    retained: z.infer<typeof Retained>[],
  ): Promise<DeleteResult> {
    invariant(
      job.kind === "delete" &&
        job.idempotencyKey === `${job.jobId}:conversation`,
      "privacy_lease_required",
      "The original Conversation delete task is required.",
    );
    await this.assertClient(client, job);
    const saved = (
      await client.query<{ receipt: unknown }>(
        "SELECT creator_trust.save_conversation_delete_receipt($1,$2,$3) AS receipt",
        [job.jobId, job.leaseToken, JSON.stringify({ ...receipt, retained })],
      )
    ).rows[0]?.receipt;
    const result = this.result(saved, job);
    await this.assertClient(client, job);
    job.signal!.throwIfAborted();
    return result;
  }

  async agentBoundary(
    job: PrivacyTaskInput,
    client: PoolClient,
    scopes: readonly CreatorScope[],
  ) {
    invariant(
      job.signal && job.idempotencyKey === `${job.jobId}:agent`,
      "privacy_lease_required",
      "The original Agent privacy task is required.",
    );
    const owned = await this.assertClient(client, job);
    invariant(
      scopes.every(
        (scope) => !scope.development && scope.accountId === job.accountId,
      ) &&
        contentHash([...owned].sort()) ===
          contentHash(scopes.map((scope) => scope.creatorId).sort()),
      "privacy_authority_changed",
      "The original Agent ownership must match this boundary.",
    );
    const { rows } = await client
      .query<{
        boundary: unknown;
      }>(
        "SELECT creator_trust.agent_conversation_accounting_boundary($1,$2) AS boundary",
        [job.jobId, job.leaseToken],
      )
      .catch((cause: unknown) => {
        if (
          cause instanceof DatabaseError &&
          cause.code === "42501" &&
          cause.message === "Actual completed Conversation boundary required"
        )
          throw new DomainError(
            "accounting_boundary_pending",
            "Waiting for the original Conversation privacy task to complete.",
            503,
            { cause },
          );
        throw cause;
      });
    const boundary = z
      .discriminatedUnion("kind", [
        z.strictObject({
          kind: z.literal("delete"),
          reference: z.string().regex(/^[a-f0-9]{64}$/),
        }),
        z.strictObject({
          kind: z.literal("export"),
          reference: z.string().regex(/^[a-f0-9]{64}$/),
          artifact: PrivacyArtifact,
        }),
      ])
      .parse(rows[0]?.boundary);
    invariant(
      boundary.kind === job.kind,
      "accounting_boundary_receipt_unavailable",
      "Retain the original privacy kind.",
    );
    if (boundary.kind === "export") {
      invariant(
        this.verifyArtifact &&
          boundary.artifact.jobId === job.jobId &&
          boundary.artifact.accountId === job.accountId &&
          boundary.artifact.domain === "conversation" &&
          Date.parse(boundary.artifact.expiresAt) > Date.now(),
        "privacy_artifact_unconfigured",
        "The original unexpired protected Conversation artifact is required.",
      );
      await this.verifyArtifact(
        boundary.artifact,
        { jobId: job.jobId, accountId: job.accountId, domain: "conversation" },
        job.signal,
      );
    }
    await this.assertClient(client, job);
    invariant(
      boundary.kind !== "export" ||
        Date.parse(boundary.artifact.expiresAt) > Date.now(),
      "privacy_artifact_unconfigured",
      "The original protected Conversation artifact must remain unexpired after verification.",
    );
    job.signal.throwIfAborted();
    return { reference: boundary.reference };
  }
}
