import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { IdSchema } from "@qelvora/api";
import { CommerceFulfillmentPlanRef } from "../../../../../packages/api/src/commerce/fulfillment.js";
import { canonical } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import {
  PublicationIdentityAuthority,
  type PublicationPreparation,
  type PublicationTaskScope,
} from "../identity/publication-scope.js";
import { publicationTransaction } from "../identity/publication-transaction.js";
import { requestAuthority } from "../identity/request-authority.js";
import { assertFulfillmentPublicationWorkerCatalogue } from "./fulfillment-publication-worker-catalogue.js";

const originalRecipient = z.strictObject({
  packet_id: IdSchema,
  commitment_id: IdSchema,
  thread_id: IdSchema,
  creator_id: IdSchema,
  fan_id: IdSchema,
  packet_version: z.int().positive(),
  commitment_version: z.int().positive(),
  control_epoch: z.int().nonnegative(),
  publisher_account_id: IdSchema,
  plan_id: IdSchema,
  plan_revision: z.int().positive(),
  plan_hash: z.string().regex(/^[a-f0-9]{64}$/u),
  content_id: IdSchema,
  content_version: z.int().positive(),
  publication_signed_act_id: IdSchema,
  minimum_recipients: z.int().min(2).max(100),
});
const actualOutput = z.strictObject({
  message_id: IdSchema,
  event_id: IdSchema,
  cursor: z.int().positive(),
  epoch: z.int().nonnegative(),
});
const finalReceipt = z.strictObject({
  planRef: CommerceFulfillmentPlanRef,
  contentId: IdSchema,
  contentVersion: z.int().positive(),
  publicationSignedActId: IdSchema,
  minimumRecipients: z.int().min(2).max(100),
  deliveries: z
    .array(
      z.strictObject({
        packetId: IdSchema,
        messageId: IdSchema,
        eventId: IdSchema,
        cursor: z.int().positive(),
      }),
    )
    .min(2)
    .max(100),
});
const recipientBrand: unique symbol = Symbol("OriginalPublicationRecipient");
const outputBrand: unique symbol = Symbol("OriginalPublicationSystemOutput");
export type FulfillmentPublicationRecipient = Readonly<{
  [recipientBrand]: true;
  packetId: string;
  commitmentId: string;
  threadId: string;
  creatorId: string;
  fanId: string;
  controlEpoch: number;
}>;
export type FulfillmentPublicationOutput = Readonly<{
  [outputBrand]: true;
  messageId: string;
  eventId: string;
  cursor: number;
  epoch: number;
}>;
type HeldOriginal = Readonly<{
  client: PoolClient;
  preparation: PublicationPreparation;
  transaction: string;
  pid: number;
  document: string;
  planRef: z.infer<typeof CommerceFulfillmentPlanRef>;
  recipients: readonly FulfillmentPublicationRecipient[];
  linked: Map<FulfillmentPublicationRecipient, FulfillmentPublicationOutput>;
  delivered: Map<FulfillmentPublicationRecipient, FulfillmentPublicationOutput>;
}>;

function unavailable(cause?: unknown): never {
  throw new DomainError(
    "fulfillment_publication_worker_unavailable",
    "Current fulfillment for this answer is unavailable. Try again later.",
    503,
    { cause },
  );
}

/** Owns Commerce fulfillment only. W1 alone owns the transaction, retained
 * preparation and joint final signature/cleanup/COMMIT. W3 alone issues its
 * separate fixed System output; no interactive Actor or scope is constructed.
 */
export class CommerceFulfillmentPublicationWorker {
  private readonly held = new WeakMap<PublicationTaskScope, HeldOriginal>();
  private readonly issuedRecipients = new WeakMap<
    FulfillmentPublicationRecipient,
    PublicationTaskScope
  >();
  private readonly issuedOutputs = new WeakMap<
    FulfillmentPublicationOutput,
    Readonly<{
      scope: PublicationTaskScope;
      recipient: FulfillmentPublicationRecipient;
    }>
  >();

  private constructor(
    private readonly identity: PublicationIdentityAuthority,
    private readonly minimumRecipients: number,
  ) {}

  /** minimumRecipients is an explicitly configured approved policy value.
   * There is no default, approval scalar, replacement issuer or startup pin.
   */
  static async prepare(
    configuration: Readonly<{
      workerPool: Pool;
      identity: PublicationIdentityAuthority;
      minimumRecipients: number;
    }>,
  ): Promise<CommerceFulfillmentPublicationWorker> {
    if (
      requestAuthority.getStore() ||
      !(configuration.identity instanceof PublicationIdentityAuthority)
    )
      unavailable();
    const minimum = z
      .int()
      .min(2)
      .max(100)
      .parse(configuration.minimumRecipients);
    configuration.identity.assertHostPool(configuration.workerPool);
    await publicationTransaction(
      configuration.workerPool,
      undefined,
      assertFulfillmentPublicationWorkerCatalogue,
      "ROLLBACK",
      true,
    );
    return new CommerceFulfillmentPublicationWorker(
      configuration.identity,
      minimum,
    );
  }

  /** Before W5 content/object positives: actual sorted TRY row leases and
   * complete original metadata only. An ordinary non-group document issues no
   * recipient or delivery capability.
   */
  async recipients(client: PoolClient, scope: PublicationTaskScope) {
    if (requestAuthority.getStore() || this.held.has(scope)) unavailable();
    await this.identity.authorizeInTransaction(scope, client);
    await assertFulfillmentPublicationWorkerCatalogue(client);
    const preparation = await this.identity.preparationInTransaction(
      scope,
      client,
    );
    const original = await this.identity.originalInTransaction(scope, client);
    if (!original.document.planRef) return undefined;
    if (!preparation.fulfillmentNonce || !scope.signedActId) unavailable();
    const planRef = CommerceFulfillmentPlanRef.parse(original.document.planRef);
    const result = await client.query(
      "SELECT * FROM creator.fulfillment_publication_worker_recipients($1,$2)",
      [preparation.nonce, preparation.token],
    );
    const rows = z
      .array(originalRecipient)
      .min(this.minimumRecipients)
      .max(100)
      .parse(result.rows);
    const packets = new Set<string>();
    const threads = new Set<string>();
    const recipients = rows.map((row) => {
      invariant(
        row.creator_id === scope.creatorId &&
          row.publisher_account_id === scope.publisherAccountId &&
          row.content_id === scope.contentId &&
          row.content_version === scope.version &&
          row.publication_signed_act_id === scope.signedActId &&
          row.plan_id === planRef.id &&
          row.plan_revision === planRef.revision &&
          row.plan_hash === planRef.hash &&
          row.minimum_recipients === this.minimumRecipients &&
          !packets.has(row.packet_id) &&
          !threads.has(row.thread_id),
        "fulfillment_publication_original_changed",
        "The complete original fulfillment plan is required.",
      );
      packets.add(row.packet_id);
      threads.add(row.thread_id);
      return Object.freeze({
        [recipientBrand]: true as const,
        packetId: row.packet_id,
        commitmentId: row.commitment_id,
        threadId: row.thread_id,
        creatorId: row.creator_id,
        fanId: row.fan_id,
        controlEpoch: row.control_epoch,
      });
    });
    const held: HeldOriginal = Object.freeze({
      client,
      preparation,
      transaction: original.transaction,
      pid: original.pid,
      document: canonical(original.document),
      planRef: Object.freeze(planRef),
      recipients: Object.freeze(recipients),
      linked: new Map(),
      delivered: new Map(),
    });
    this.held.set(scope, held);
    for (const recipient of recipients)
      this.issuedRecipients.set(recipient, scope);
    return held.recipients;
  }

  private async current(client: PoolClient, scope: PublicationTaskScope) {
    if (requestAuthority.getStore()) unavailable();
    const held = this.held.get(scope);
    if (!held || held.client !== client) unavailable();
    await this.identity.authorizeInTransaction(scope, client);
    const preparation = await this.identity.preparationInTransaction(
      scope,
      client,
    );
    const original = await this.identity.originalInTransaction(scope, client);
    invariant(
      preparation === held.preparation &&
        original.transaction === held.transaction &&
        original.pid === held.pid &&
        canonical(original.document) === held.document,
      "fulfillment_publication_original_changed",
      "The original publication client and complete command are required.",
    );
    return held;
  }

  /** Calls only W3's separately owned fixed writer. Its actual private output
   * proof binds these returned IDs to the original retained full transaction.
   */
  async recipientLink(
    client: PoolClient,
    scope: PublicationTaskScope,
    recipient: FulfillmentPublicationRecipient,
  ): Promise<FulfillmentPublicationOutput> {
    const held = await this.current(client, scope);
    if (
      this.issuedRecipients.get(recipient) !== scope ||
      held.linked.has(recipient)
    )
      unavailable();
    const result = await client.query(
      "SELECT * FROM creator.publication_worker_system_link($1,$2,$3,$4)",
      [
        held.preparation.nonce,
        held.preparation.token,
        recipient.packetId,
        recipient.threadId,
      ],
    );
    if (result.rowCount !== 1) unavailable();
    const row = actualOutput.parse(result.rows[0]);
    invariant(
      row.epoch === recipient.controlEpoch,
      "fulfillment_publication_epoch_changed",
      "The original thread controls changed.",
    );
    // The worker receives only the real writer's bounded result. W3's fixed
    // private proof is executable by the isolated W4 SQL owner, never raw
    // worker code; recordDelivery invokes it before any service association.
    const output = Object.freeze({
      [outputBrand]: true as const,
      messageId: row.message_id,
      eventId: row.event_id,
      cursor: row.cursor,
      epoch: row.epoch,
    });
    held.linked.set(recipient, output);
    this.issuedOutputs.set(output, Object.freeze({ scope, recipient }));
    return output;
  }

  async recordDelivery(
    client: PoolClient,
    scope: PublicationTaskScope,
    recipient: FulfillmentPublicationRecipient,
    output: FulfillmentPublicationOutput,
  ): Promise<void> {
    const held = await this.current(client, scope);
    const issued = this.issuedOutputs.get(output);
    if (
      this.issuedRecipients.get(recipient) !== scope ||
      held.delivered.has(recipient) ||
      held.linked.get(recipient) !== output ||
      issued?.scope !== scope ||
      issued.recipient !== recipient
    )
      unavailable();
    const result = await client.query<{ recorded: boolean }>(
      "SELECT creator.fulfillment_publication_worker_record_delivery($1,$2,$3,$4,$5) AS recorded",
      [
        held.preparation.nonce,
        held.preparation.token,
        recipient.packetId,
        output.messageId,
        output.eventId,
      ],
    );
    if (result.rows[0]?.recorded !== true) unavailable();
    held.delivered.set(recipient, output);
    this.issuedOutputs.delete(output);
  }

  /** Runs before W1's joint finalizer. Actual immutable delivery evidence and
   * all fixed W3 proofs are reread; no callback or SQL follows W1's last gate.
   */
  async finalFence(
    client: PoolClient,
    scope: PublicationTaskScope,
  ): Promise<void> {
    const held = await this.current(client, scope);
    if (held.delivered.size !== held.recipients.length) unavailable();
    await assertFulfillmentPublicationWorkerCatalogue(client);
    const result = await client.query<{ receipt: unknown }>(
      "SELECT creator.fulfillment_publication_worker_receipt($1,$2) AS receipt",
      [held.preparation.nonce, held.preparation.token],
    );
    const receipt = finalReceipt.parse(result.rows[0]?.receipt);
    invariant(
      canonical(receipt.planRef) === canonical(held.planRef) &&
        receipt.contentId === scope.contentId &&
        receipt.contentVersion === scope.version &&
        receipt.publicationSignedActId === scope.signedActId &&
        receipt.minimumRecipients === this.minimumRecipients &&
        receipt.deliveries.length === held.recipients.length,
      "fulfillment_publication_receipt_changed",
      "The complete original delivery receipt is required.",
    );
    const delivered = new Map(
      receipt.deliveries.map((item) => [item.packetId, item]),
    );
    if (delivered.size !== held.recipients.length) unavailable();
    for (const recipient of held.recipients) {
      const output = held.delivered.get(recipient);
      const actual = delivered.get(recipient.packetId);
      if (
        !output ||
        !actual ||
        actual.messageId !== output.messageId ||
        actual.eventId !== output.eventId ||
        actual.cursor !== output.cursor
      )
        unavailable();
      this.issuedRecipients.delete(recipient);
    }
    this.held.delete(scope);
  }
}
