import { DeliverApprovedDraft } from "../../../../../packages/api/src/commerce/approval.js";
import type { CommerceApprovals } from "../commerce/approvals.js";
import type { ConversationAllowance } from "./allowance.js";
import type { ApprovedSentence } from "../agent/runtime.js";
import { randomUUID } from "node:crypto";
import { formatCopy } from "@qelvora/copy";
import { Client, type PoolClient } from "pg";
import {
  ControlCommandSchema,
  HumanReplySchema,
  ModelProposalSchema,
  SendMessageSchema,
  AcceptedMessageSchema,
  type AcceptedMessage,
  type Frame,
  type Message,
  type ThreadControl,
} from "@qelvora/api";
import { Database } from "../../db/database.js";
import {
  AccessService,
  assertThreadScope,
  type ThreadScope,
} from "../access/scope.js";
import { consumeSignedAct } from "../identity/signed-acts.js";
import { DomainError, invariant } from "../../core/errors.js";
import { idempotent } from "../../core/idempotency.js";
import { appendFrame } from "../../core/outbox.js";
import type { GuardrailProvider } from "../agent/providers.js";
import type { ConversationWellbeing } from "./wellbeing.js";
import {
  ConversationMessageSchema,
  ConversationCallControlSchema,
  TeamReplySchema,
  type ConversationTimeline,
} from "../../../../../packages/api/src/conversation/contracts.js";
import { crisisText } from "../agent/pipeline.js";
import { contentHash } from "../../core/canonical.js";
import type { ConversationLineage } from "./lineage.js";
import type { PreparedGenerationJournal } from "../agent/generation-journal.js";
import type { GenerationCostReconciliation } from "../commerce/generation-allowance.js";
import type { Actor } from "../identity/adapter.js";
import {
  CommerceFulfillmentPlans,
  type CommerceGroupRecipient,
} from "../commerce/fulfillment-plans.js";
import { ConversationSystemLinkSchema } from "../../../../../packages/api/src/conversation/system-link.js";

type ThreadRow = {
  control: ThreadControl;
  control_epoch: number;
  revision: number;
  event_cursor: number;
  processor_consent_version: string | null;
};
type MessageRow = {
  id: string;
  thread_id: string;
  author_kind: Message["authorKind"];
  text: string;
  delivery_state: Message["deliveryState"];
  control_epoch: number;
  sequence: number;
  signed_act_id: string | null;
  author_account_id: string | null;
  team_member: string | null;
  version: number;
  citations: string[];
  created_at: Date;
  off_the_record: boolean;
};
type GenerationRow = {
  id: string;
  ai_message_id: string;
  grant_id: string;
  epoch: number;
  last_sequence: number;
  state: string;
  reservation_id: string | null;
  worker_token: string | null;
  lease_until: Date | null;
  context_revision: number | null;
};
function message(row: MessageRow): Message {
  return {
    id: row.id,
    threadId: row.thread_id,
    authorKind: row.author_kind,
    text: row.text,
    deliveryState: row.delivery_state,
    controlEpoch: row.control_epoch,
    sequence: row.sequence,
    signedActId: row.signed_act_id,
    member: row.team_member ?? null,
    authorAccountId: row.author_account_id ?? null,
  };
}

export class ConversationService {
  private fulfillmentPlans?: CommerceFulfillmentPlans;
  configureFulfillmentPlans(plans: CommerceFulfillmentPlans): void {
    CommerceFulfillmentPlans.assertRuntime(plans, this.db, this.access);
    invariant(
      !this.fulfillmentPlans,
      "fulfillment_already_configured",
      "Original fulfillment is already configured.",
    );
    this.fulfillmentPlans = plans;
  }

  /** W5 owns this transaction. Consume only W4's actual positive recipient on
   * its original held client; never open another transaction or rebuild a scope.
   * W4's final publication fence must run after this and every other domain
   * effect. Only COMMIT may follow that fence. */
  async appendSystemLink(
    client: PoolClient,
    recipient: CommerceGroupRecipient,
  ): Promise<Readonly<{ message: Message; frame: Frame }>> {
    const plans = this.fulfillmentPlans;
    if (!plans)
      throw new DomainError(
        "system_link_unconfigured",
        "Original public-answer delivery is unavailable.",
        503,
      );
    CommerceFulfillmentPlans.assertRuntime(plans, this.db, this.access);
    const scope = await plans.recipientScope(client, recipient);
    assertThreadScope(scope);
    invariant(
      scope.authority === "creator" &&
        scope.actorAccountId === scope.creatorAccountId,
      "system_link_creator_required",
      "The original creator publication is required.",
    );
    const original = await plans.recipientLink(client, recipient);
    const systemLink = ConversationSystemLinkSchema.parse({
      kind: "published_answer",
      creatorId: scope.creatorId,
      contentId: original.contentId,
      contentVersion: original.contentVersion,
      label: original.text,
    });
    // A plan may include multiple families. Restore only the actual owner-
    // issued scope's RLS coordinates, never a synthetic recipient Actor.
    await client.query(
      "SELECT set_config('app.creator_id',$1,true),set_config('app.fan_id',$2,true),set_config('app.account_id',$3,true)",
      [scope.creatorId, scope.fanId, scope.actorAccountId],
    );
    // W4 already obtained this exact existing-thread UPDATE lease before W5's
    // document locks. This re-read never creates a thread or changes control.
    const thread = await this.lockThread(client, scope);
    const stored = await this.insertMessage(
      client,
      scope,
      "system",
      systemLink.label,
      thread.control_epoch,
      "delivered",
    );
    const frame = await appendFrame(client, scope, {
      epoch: thread.control_epoch,
      kind: "delivered",
      messageId: stored.id,
      authorKind: "system",
      text: stored.text,
      generationId: null,
      sequence: 0,
      systemLink,
    });
    // The actual W4 insert trigger checks family, neutral authorship, genuine
    // signed publication and publication time; it also records the original
    // commitment and durable Commerce event on this same transaction.
    await plans.recordDelivery(client, recipient, stored.id);
    return Object.freeze({
      message: Object.freeze({ ...stored, systemLink }),
      frame: Object.freeze(frame),
    });
  }

  /** Called only inside the caller's actual scoped read transaction. A saved
   * delivery association provides minimal historical link metadata; opening
   * it still uses the current W5 viewer. No title/body/fan/plan is projected. */
  async enrichSystemLinksInTransaction<T extends Message>(
    scope: ThreadScope,
    client: PoolClient,
    messages: readonly T[],
  ): Promise<T[]> {
    assertThreadScope(scope);
    const plans = this.fulfillmentPlans;
    const selected = messages.filter(
      (m) =>
        m.threadId === scope.threadId &&
        m.authorKind === "system" &&
        m.deliveryState === "delivered" &&
        m.signedActId === null &&
        m.authorAccountId == null &&
        m.text === "Answered publicly.",
    );
    if (!plans || selected.length === 0) return [...messages];
    invariant(
      messages.length <= 100,
      "system_link_projection_bounded",
      "Refresh this conversation to read its links.",
    );
    CommerceFulfillmentPlans.assertRuntime(plans, this.db, this.access);
    await plans.assertCurrentCatalogueInTransaction(client);
    const rows = (
      await client.query<{
        message_id: string;
        creator_id: string;
        content_id: string;
        content_version: number;
      }>(
        `SELECT g.message_id,g.creator_id,g.content_id,g.content_version
         FROM creator.commerce_group_delivery g
         JOIN creator.commerce_fulfillment_plan p
          ON p.id=g.plan_id AND p.revision=g.plan_revision
           AND p.creator_id=g.creator_id AND p.content_id=g.content_id
           AND p.content_version=g.content_version
         JOIN creator.message m
          ON m.id=g.message_id AND m.thread_id=g.thread_id
           AND m.creator_id=g.creator_id AND m.fan_id=g.fan_id
         WHERE g.thread_id=$1 AND g.creator_id=$2 AND g.fan_id=$3
          AND g.message_id=ANY($4::uuid[]) AND m.author_kind='system'
          AND m.delivery_state='delivered' AND m.text='Answered publicly.'
          AND m.author_account_id IS NULL AND m.signed_act_id IS NULL
          AND m.signed_content_hash IS NULL LIMIT 100`,
        [
          scope.threadId,
          scope.creatorId,
          scope.fanId,
          selected.map((m) => m.id),
        ],
      )
    ).rows;
    const links = new Map(
      rows.map((r) => [
        r.message_id,
        ConversationSystemLinkSchema.parse({
          kind: "published_answer",
          creatorId: r.creator_id,
          contentId: r.content_id,
          contentVersion: r.content_version,
          label: "Answered publicly.",
        }),
      ]),
    );
    return messages.map((m) =>
      links.has(m.id) ? { ...m, systemLink: links.get(m.id)! } : m,
    );
  }
  isFor(database: Database, access: AccessService) {
    return this.db === database && this.access === access;
  }
  private approvals?: Pick<
    CommerceApprovals,
    "prepareDelivery" | "recordDelivery"
  >;
  configureApprovals(
    producer: Pick<CommerceApprovals, "prepareDelivery" | "recordDelivery">,
  ) {
    invariant(
      !this.approvals,
      "approvals_already_configured",
      "Draft approval is already configured.",
    );
    this.approvals = producer;
  }
  async approvedDraft(scope: ThreadScope, raw: unknown): Promise<Message> {
    const body = DeliverApprovedDraft.parse(raw);
    invariant(
      scope.authority === "creator",
      "creator_required",
      "Only the creator can publish an approved draft.",
    );
    const approvals = this.approvals;
    invariant(
      approvals,
      "approval_unconfigured",
      "Exact-version draft approval is not connected yet.",
    );
    return this.db.withThread(scope, (client) =>
      idempotent(
        client,
        scope,
        "approvedDraft",
        body.idempotencyKey,
        body,
        async () => {
          const thread = await this.lockThread(client, scope);
          invariant(
            thread.control === "human_active",
            "takeover_required",
            "The creator must take over before publishing an approved draft.",
          );
          const approved = await approvals.prepareDelivery(
            client,
            scope,
            body.approvalId,
          );
          const output = await this.insertMessage(
            client,
            scope,
            "approved_draft",
            approved.text,
            thread.control_epoch,
            "delivered",
            approved.signing,
            approved.approvalId,
          );
          await approvals.recordDelivery(
            client,
            scope,
            body.approvalId,
            output.id,
          );
          await appendFrame(client, scope, {
            epoch: thread.control_epoch,
            kind: "delivered",
            messageId: output.id,
            authorKind: "approved_draft",
            text: output.text,
            generationId: null,
            sequence: 0,
          });
          return output;
        },
      ),
    );
  }
  private delivery: {
    allowance?: ConversationAllowance;
    assertReady?: (scope: ThreadScope, client: PoolClient) => Promise<void>;
    assertApproved?: (
      scope: ThreadScope,
      client: PoolClient,
      sentence: ApprovedSentence,
    ) => Promise<void>;
    policyVersion?: string;
    citation?: (scope: ThreadScope, id: string) => Promise<unknown>;
    wellbeing?: ConversationWellbeing;
    lineage?: ConversationLineage;
    journal?: PreparedGenerationJournal;
    reconciliation?: GenerationCostReconciliation;
  } = {};
  configureDelivery(delivery: typeof this.delivery) {
    delivery.lineage?.assertPool(this.db.pool);
    this.delivery = delivery;
  }
  /** Revalidate the current configured policy before every remote fan-text call.
   * A thread's historical notice alone is not current processor consent. */
  async assertProcessorConsent(scope: ThreadScope) {
    await this.db.withThread(scope, (client) =>
      this.assertProcessorConsentInTransaction(scope, client),
    );
  }
  async assertProcessorConsentInTransaction(
    scope: ThreadScope,
    client: PoolClient,
  ) {
    assertThreadScope(scope);
    invariant(
      this.delivery.policyVersion,
      "processor_consent_unavailable",
      "Current AI processor policy is unavailable.",
    );
    const current = await client.query(
      `SELECT t.id FROM creator.thread t
     WHERE t.id=$1 AND t.creator_id=$2 AND t.fan_id=$3
     AND t.processor_consent_version=$4
     AND EXISTS(SELECT 1 FROM creator.processor_consent c
       WHERE c.thread_id=t.id AND c.creator_id=$2 AND c.fan_id=$3
       AND c.version=$4 AND c.withdrawn_at IS NULL)`,
      [
        scope.threadId,
        scope.creatorId,
        scope.fanId,
        this.delivery.policyVersion,
      ],
    );
    invariant(
      current.rowCount === 1,
      "processor_consent_required",
      "Review the current AI providers before messaging.",
    );
  }
  private async settle(
    client: PoolClient,
    scope: ThreadScope,
    generation: GenerationRow,
    consumed: boolean,
  ) {
    // Terminal closure precedes W4's original-policy settlement. The durable
    // initialized admission, including queued zero-call cancellation, owns the
    // receipt; last_sequence alone never proves that no request was made.
    await this.delivery.journal?.sealIfInitialized(
      scope,
      client,
      generation.id,
    );
    if (generation.reservation_id) {
      invariant(
        this.delivery.allowance,
        "allowance_unconfigured",
        "Allowance reconciliation is unavailable.",
      );
      await this.delivery.allowance.settle(
        scope,
        client,
        generation.reservation_id,
        consumed,
      );
    } else if (this.delivery.reconciliation)
      await this.delivery.reconciliation.reconcile(
        scope,
        client,
        generation.id,
        generation.grant_id,
        consumed,
      );
    else
      await this.access.settleAllowance(
        scope,
        client,
        generation.grant_id,
        consumed,
        generation.id,
      );
  }
  /** W2's late-receipt consumer supplies an actual currently issued scope and
   * its held core transaction. Only terminal persisted generations may replay
   * weighted settlement; legacy fixed-unit accounting is never a fallback. */
  async reconcileGenerationCostInTransaction(
    scope: ThreadScope,
    client: PoolClient,
    generationId: string,
  ) {
    assertThreadScope(scope);
    invariant(
      this.delivery.reconciliation && this.delivery.journal,
      "generation_cost_reconciliation_unavailable",
      "The prepared original-policy cost and usage adapters are required.",
    );
    await this.lockThread(client, scope);
    const generation = (
      await client.query<GenerationRow>(
        "SELECT * FROM creator.generation WHERE id=$1 AND thread_id=$2 AND creator_id=$3 AND fan_id=$4 FOR UPDATE",
        [generationId, scope.threadId, scope.creatorId, scope.fanId],
      )
    ).rows[0];
    invariant(
      generation &&
        ["delivered", "interrupted", "failed"].includes(generation.state) &&
        generation.reservation_id === null,
      "generation_cost_reconciliation_unavailable",
      "A terminal generation in this exact weighted-allowance family is required.",
    );
    await this.delivery.reconciliation.reconcile(
      scope,
      client,
      generation.id,
      generation.grant_id,
      generation.last_sequence > 0,
    );
  }
  async releaseApprovedSentence(
    scope: ThreadScope,
    generationId: string,
    approved: ApprovedSentence,
    sequence: number,
    workerToken?: string,
  ) {
    invariant(
      this.delivery.citation && this.delivery.assertApproved,
      "generation_unconfigured",
      "The approved generation adapter is unavailable.",
    );
    for (const id of approved.citations)
      await this.delivery.citation(scope, id);
    return this.releaseSentence(
      scope,
      generationId,
      { text: approved.text, citations: approved.citations },
      sequence,
      approved,
      workerToken,
    );
  }
  constructor(
    private readonly db: Database,
    private readonly access: AccessService,
    private readonly guardrails: GuardrailProvider,
  ) {}
  private async lockThread(
    client: PoolClient,
    scope: ThreadScope,
    readOnly = false,
  ): Promise<ThreadRow> {
    assertThreadScope(scope);
    const found = await client.query<ThreadRow>(
      `SELECT control,control_epoch,revision,event_cursor,processor_consent_version FROM creator.thread WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND deleted_at IS NULL FOR ${readOnly ? "SHARE" : "UPDATE"}`,
      [scope.threadId, scope.creatorId, scope.fanId],
    );
    invariant(
      found.rows[0],
      "thread_unavailable",
      "This conversation is unavailable.",
    );
    return found.rows[0];
  }
  async safetyCheckpoint(scope: ThreadScope) {
    return this.db.withThread(scope, async (client) => {
      const thread = await this.lockThread(client, scope, true);
      invariant(
        thread.control !== "closed",
        "thread_closed",
        "Open Help and safety for free support.",
      );
      return { epoch: thread.control_epoch, revision: thread.revision };
    });
  }
  async assertSafetyCurrent(
    scope: ThreadScope,
    expected: { epoch: number; revision: number },
  ) {
    const current = await this.safetyCheckpoint(scope);
    invariant(
      current.epoch === expected.epoch &&
        current.revision === expected.revision,
      "conversation_changed",
      "This conversation changed. Retry your message.",
    );
  }
  private async interruptGenerations(client: PoolClient, scope: ThreadScope) {
    const active = await client.query<GenerationRow>(
      "SELECT * FROM creator.generation WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND state IN('queued','generating') FOR UPDATE",
      [scope.threadId, scope.creatorId, scope.fanId],
    );
    for (const generation of active.rows) {
      await client.query(
        "UPDATE creator.generation SET state='interrupted' WHERE id=$1 AND thread_id=$2 AND creator_id=$3 AND fan_id=$4",
        [generation.id, scope.threadId, scope.creatorId, scope.fanId],
      );
      await client.query(
        "UPDATE creator.message SET delivery_state='interrupted' WHERE id=$1 AND thread_id=$2 AND creator_id=$3 AND fan_id=$4",
        [
          generation.ai_message_id,
          scope.threadId,
          scope.creatorId,
          scope.fanId,
        ],
      );
      await this.settle(
        client,
        scope,
        generation,
        generation.last_sequence > 0,
      );
      await appendFrame(client, scope, {
        epoch: generation.epoch,
        kind: "interrupted",
        messageId: generation.ai_message_id,
        authorKind: "ai",
        text: "",
        generationId: generation.id,
        sequence: generation.last_sequence,
      });
    }
    return active.rows.length;
  }
  /** Fixed W2 platform safety copy: no license, paid generation or allowance.
   * The classification snapshot is fenced again in the actual message write. */
  async sendSafety(
    scope: ThreadScope,
    raw: unknown,
    expected: { epoch: number; revision: number },
  ): Promise<AcceptedMessage> {
    const body = SendMessageSchema.parse(raw);
    invariant(
      scope.authority === "fan",
      "fan_required",
      "Only the fan can send this message.",
    );
    return this.db.withThread(
      scope,
      (client) =>
        idempotent(
          client,
          scope,
          "send",
          body.idempotencyKey,
          {
            creatorId: scope.creatorId,
            fanId: scope.fanId,
            recipient: "ai",
            ...body,
          },
          async () => {
            const thread = await this.lockThread(client, scope);
            invariant(
              thread.control !== "closed",
              "thread_closed",
              "Open Help and safety for free support.",
            );
            invariant(
              thread.control_epoch === expected.epoch &&
                thread.revision === expected.revision,
              "conversation_changed",
              "This conversation changed. Retry your message.",
            );
            const interrupted = await this.interruptGenerations(client, scope);
            const epoch = thread.control_epoch + (interrupted ? 1 : 0);
            if (interrupted) {
              await client.query(
                "UPDATE creator.thread SET control_epoch=$4 WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
                [scope.threadId, scope.creatorId, scope.fanId, epoch],
              );
              await this.delivery.wellbeing?.boundary(scope, client);
            }
            const fan = await this.insertMessage(
              client,
              scope,
              "fan",
              body.text,
              epoch,
              "accepted",
            );
            const reply = await this.insertMessage(
              client,
              scope,
              "ai",
              crisisText,
              epoch,
              "delivered",
            );
            if (interrupted)
              await appendFrame(client, scope, {
                epoch,
                kind: "control",
                control: thread.control,
                messageId: reply.id,
                authorKind: "ai",
                text: crisisText,
                generationId: null,
                sequence: 0,
              });
            await appendFrame(client, scope, {
              epoch,
              kind: "accepted",
              messageId: fan.id,
              authorKind: "fan",
              text: fan.text,
              generationId: null,
              sequence: 0,
            });
            await appendFrame(client, scope, {
              epoch,
              kind: "delivered",
              messageId: reply.id,
              authorKind: "ai",
              text: crisisText,
              generationId: null,
              sequence: 0,
            });
            return { message: fan, generationId: null };
          },
        ),
      "write",
    );
  }
  private async insertMessage(
    client: PoolClient,
    scope: ThreadScope,
    author: Message["authorKind"],
    text: string,
    epoch: number,
    state: Message["deliveryState"],
    signing?: { id: string; hash: string },
    approvalId?: string,
  ): Promise<Message> {
    const seq = await client.query<{ message_sequence: number }>(
      "UPDATE creator.thread SET message_sequence=message_sequence+1, revision=revision+1 WHERE id=$1 AND creator_id=$2 AND fan_id=$3 RETURNING message_sequence",
      [scope.threadId, scope.creatorId, scope.fanId],
    );
    const result = await client.query<MessageRow>(
      `INSERT INTO creator.message(id,thread_id,creator_id,fan_id,author_kind,author_account_id,text,delivery_state,control_epoch,sequence,signed_act_id,signed_content_hash,off_the_record${approvalId ? ",approval_id" : ""}) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,(SELECT off_the_record FROM creator.thread WHERE id=$2 AND creator_id=$3 AND fan_id=$4)${approvalId ? ",$13" : ""}) RETURNING *`,
      [
        randomUUID(),
        scope.threadId,
        scope.creatorId,
        scope.fanId,
        author,
        author === "fan" ||
        author === "human_creator" ||
        author === "team" ||
        author === "approved_draft"
          ? scope.actorAccountId
          : null,
        text,
        state,
        epoch,
        seq.rows[0]!.message_sequence,
        signing?.id ?? null,
        signing?.hash ?? null,
        ...(approvalId ? [approvalId] : []),
      ],
    );
    return message(result.rows[0]!);
  }
  async read(scope: ThreadScope): Promise<ConversationTimeline> {
    return this.db.withThread(
      scope,
      async (client) => {
        const thread = await this.lockThread(client, scope, true);
        const rows = await client.query<MessageRow>(
          "SELECT * FROM (SELECT * FROM creator.message WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 ORDER BY sequence DESC LIMIT 100) recent ORDER BY sequence",
          [scope.threadId, scope.creatorId, scope.fanId],
        );
        const generations = await client.query<{
          id: string;
          last_sequence: number;
        }>(
          "SELECT id,last_sequence FROM creator.generation WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND state IN ('queued','generating')",
          [scope.threadId, scope.creatorId, scope.fanId],
        );
        const selected = rows.rows.map((row) =>
          ConversationMessageSchema.parse({
            ...message(row),
            version: row.version,
            citations: row.citations,
            createdAt: row.created_at.toISOString(),
            offTheRecord: row.off_the_record,
          }),
        );
        const enriched = this.delivery.lineage
          ? await this.delivery.lineage.enrich(scope, client, selected)
          : selected;
        const messages = await this.enrichSystemLinksInTransaction(
          scope,
          client,
          enriched,
        );
        return {
          threadId: scope.threadId,
          creatorId: scope.creatorId,
          fanId: scope.fanId,
          control: thread.control,
          epoch: thread.control_epoch,
          cursor: thread.event_cursor,
          generationSequences: Object.fromEntries(
            generations.rows.map((row) => [row.id, row.last_sequence]),
          ),
          messages,
        };
      },
      "read",
    );
  }
  async accepted(
    scope: ThreadScope,
    raw: unknown,
  ): Promise<AcceptedMessage | null> {
    const body = SendMessageSchema.parse(raw);
    invariant(
      scope.authority === "fan",
      "fan_required",
      "Only the sender can check their message.",
    );
    return this.db.withThread(scope, async (client) => {
      const row = (
        await client.query<{ request_hash: string; response: unknown }>(
          "SELECT request_hash,response FROM creator.idempotency_key WHERE actor_account_id=$1 AND operation='send' AND key=$2",
          [scope.actorAccountId, body.idempotencyKey],
        )
      ).rows[0];
      if (!row) return null;
      invariant(
        row.request_hash ===
          contentHash({
            operation: "send",
            threadId: scope.threadId,
            request: {
              creatorId: scope.creatorId,
              fanId: scope.fanId,
              recipient: "ai",
              ...body,
            },
          }),
        "idempotency_conflict",
        "This retry key was already used for a different request.",
      );
      return AcceptedMessageSchema.parse(row.response);
    });
  }
  async send(
    scope: ThreadScope,
    raw: unknown,
  ): Promise<AcceptedMessage & { generationId: string }> {
    const body = SendMessageSchema.parse(raw);
    invariant(
      scope.authority === "fan",
      "fan_required",
      "Only this fan can send their message.",
    );
    const accepted = await this.db.withThread(
      scope,
      (client) =>
        idempotent(
          client,
          scope,
          "send",
          body.idempotencyKey,
          {
            creatorId: scope.creatorId,
            fanId: scope.fanId,
            recipient: "ai",
            ...body,
          },
          async () => {
            const thread = await this.lockThread(client, scope);
            invariant(
              thread.control === "ai_active",
              "ai_unavailable",
              "The AI is unavailable in this conversation.",
            );
            invariant(
              thread.processor_consent_version,
              "processor_consent_required",
              "Consent to the configured AI providers is required before messaging.",
            );
            if (this.delivery.policyVersion)
              invariant(
                thread.processor_consent_version ===
                  this.delivery.policyVersion,
                "processor_consent_required",
                "Review the current AI providers before messaging.",
              );
            await this.delivery.assertReady?.(scope, client);
            const generationId = randomUUID();
            const reservation = await this.delivery.allowance?.reserve(
              scope,
              client,
              `generation:${generationId}`,
            );
            const grantId =
              reservation?.grantId ??
              (await this.access.reserveAllowance(scope, client, generationId));
            const active = await client.query(
              "SELECT id FROM creator.generation WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND state IN('queued','generating') LIMIT 1",
              [scope.threadId, scope.creatorId, scope.fanId],
            );
            // Access/allowance denial agrees with the capability projection.
            // If another reply is running, rejection rolls this transaction's
            // reservation back; an unavailable send cannot consume a unit.
            invariant(
              !active.rowCount,
              "reply_in_progress",
              "Wait for this reply before sending another message.",
            );
            const fan = await this.insertMessage(
              client,
              scope,
              "fan",
              body.text,
              thread.control_epoch,
              "accepted",
            );
            await appendFrame(client, scope, {
              epoch: thread.control_epoch,
              kind: "accepted",
              messageId: fan.id,
              authorKind: "fan",
              text: fan.text,
              generationId,
              sequence: 0,
            });
            for (const line of (await this.delivery.wellbeing?.notices(
              scope,
              client,
            )) ?? []) {
              const notice = await this.insertMessage(
                client,
                scope,
                "system",
                line,
                thread.control_epoch,
                "delivered",
              );
              await appendFrame(client, scope, {
                epoch: thread.control_epoch,
                kind: "delivered",
                messageId: notice.id,
                authorKind: "system",
                text: line,
                generationId: null,
                sequence: 0,
              });
            }
            const ai = await this.insertMessage(
              client,
              scope,
              "ai",
              "",
              thread.control_epoch,
              "generating",
            );
            await client.query(
              "INSERT INTO creator.generation(id,thread_id,creator_id,fan_id,fan_message_id,ai_message_id,grant_id,epoch,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
              [
                generationId,
                scope.threadId,
                scope.creatorId,
                scope.fanId,
                fan.id,
                ai.id,
                grantId,
                thread.control_epoch,
                "queued",
              ],
            );
            if (reservation)
              await client.query(
                "UPDATE creator.generation SET reservation_id=$1,context_revision=(SELECT revision FROM creator.thread WHERE id=$3 AND creator_id=$4 AND fan_id=$5) WHERE id=$2 AND thread_id=$3 AND creator_id=$4 AND fan_id=$5",
                [
                  reservation.reservationId,
                  generationId,
                  scope.threadId,
                  scope.creatorId,
                  scope.fanId,
                ],
              );
            await this.delivery.journal?.initializeGeneration(
              scope,
              client,
              generationId,
            );
            return { message: fan, generationId };
          },
        ),
      "write",
    );
    invariant(
      accepted.generationId,
      "generation_not_required",
      "This message already received free safety support. Reopen its accepted state.",
    );
    return accepted;
  }
  async fanReply(scope: ThreadScope, raw: unknown): Promise<Message> {
    const body = SendMessageSchema.parse(raw);
    invariant(
      scope.authority === "fan",
      "fan_required",
      "Only this fan can send their message.",
    );
    return this.db.withThread(
      scope,
      (client) =>
        idempotent(
          client,
          scope,
          "send",
          body.idempotencyKey,
          {
            creatorId: scope.creatorId,
            fanId: scope.fanId,
            recipient: "human",
            ...body,
          },
          async () => {
            const thread = await this.lockThread(client, scope);
            invariant(
              thread.control === "human_active",
              "human_unavailable",
              "The creator is no longer in this conversation. Refresh before sending.",
            );
            const output = await this.insertMessage(
              client,
              scope,
              "fan",
              body.text,
              thread.control_epoch,
              "accepted",
            );
            await appendFrame(client, scope, {
              epoch: thread.control_epoch,
              kind: "accepted",
              messageId: output.id,
              authorKind: "fan",
              text: output.text,
              generationId: null,
              sequence: 0,
            });
            return output;
          },
        ),
      "write",
    );
  }
  async releaseSentence(
    scope: ThreadScope,
    generationId: string,
    rawProposal: unknown,
    sequence: number,
    approved?: ApprovedSentence,
    workerToken?: string,
  ): Promise<Frame | null> {
    invariant(
      Number.isSafeInteger(sequence) && sequence > 0,
      "invalid_sequence",
      "A generation frame sequence is required.",
    );
    const proposal = ModelProposalSchema.parse(rawProposal);
    const checked = approved
      ? { allowed: true }
      : await this.guardrails.checkSentence({
          scope,
          text: proposal.text,
          citations: proposal.citations,
        });
    invariant(
      checked.allowed,
      "sentence_withheld",
      "The AI response did not pass the output checks.",
    );
    return this.db.withThread(
      scope,
      async (client) => {
        const thread = await this.lockThread(client, scope);
        const result = await client.query<GenerationRow>(
          "SELECT * FROM creator.generation WHERE id=$1 AND thread_id=$2 AND creator_id=$3 AND fan_id=$4 FOR UPDATE",
          [generationId, scope.threadId, scope.creatorId, scope.fanId],
        );
        const generation = result.rows[0];
        invariant(
          generation,
          "generation_unavailable",
          "The generation is unavailable.",
        );
        if (
          workerToken &&
          (generation.worker_token !== workerToken ||
            !generation.lease_until ||
            generation.lease_until <= new Date())
        )
          return null;
        if (
          approved &&
          generation.context_revision !==
            thread.revision - generation.last_sequence
        )
          return null;
        if (
          thread.control !== "ai_active" ||
          (this.delivery.policyVersion !== undefined &&
            thread.processor_consent_version !== this.delivery.policyVersion) ||
          generation.epoch !== thread.control_epoch ||
          !["queued", "generating"].includes(generation.state)
        )
          return null;
        // Citation retrieval/grounding is not enabled until the scoped source module exists.
        invariant(
          proposal.citations.length === 0 ||
            (approved &&
              this.delivery.citation &&
              this.delivery.assertApproved),
          "citations_unavailable",
          "Source citations require the scoped retrieval module.",
        );
        if (sequence <= generation.last_sequence) {
          const prior = await client.query<{ payload: Frame }>(
            `SELECT payload FROM creator.event WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND payload->>'generationId'=$4 AND (payload->>'sequence')::integer=$5 AND type='sentence'`,
            [
              scope.threadId,
              scope.creatorId,
              scope.fanId,
              generationId,
              sequence,
            ],
          );
          invariant(
            prior.rows[0]?.payload.text === proposal.text,
            "generation_retry_conflict",
            "This frame sequence was already used for different content.",
          );
          return prior.rows[0].payload;
        }
        invariant(
          sequence === generation.last_sequence + 1,
          "generation_sequence_gap",
          "Generation frames must arrive in order.",
        );
        if (approved) {
          invariant(
            this.delivery.assertApproved,
            "approval_unavailable",
            "Exact-version delivery validation is unavailable.",
          );
          await this.delivery.assertApproved(scope, client, approved);
          await this.delivery.lineage?.pinApproved(
            scope,
            client,
            generation.ai_message_id,
            approved,
          );
        }
        await client.query(
          "UPDATE creator.generation SET last_sequence=$1,state=$2 WHERE id=$3 AND thread_id=$4 AND creator_id=$5 AND fan_id=$6",
          [
            sequence,
            "generating",
            generationId,
            scope.threadId,
            scope.creatorId,
            scope.fanId,
          ],
        );
        await client.query(
          "UPDATE creator.message SET text=text || $1,citations=ARRAY(SELECT DISTINCT unnest(citations || $6::uuid[])) WHERE id=$2 AND thread_id=$3 AND creator_id=$4 AND fan_id=$5",
          [
            proposal.text,
            generation.ai_message_id,
            scope.threadId,
            scope.creatorId,
            scope.fanId,
            proposal.citations,
          ],
        );
        await client.query(
          "UPDATE creator.generation SET first_visible_at=coalesce(first_visible_at,now()) WHERE id=$1 AND thread_id=$2 AND creator_id=$3 AND fan_id=$4",
          [generationId, scope.threadId, scope.creatorId, scope.fanId],
        );
        await client.query(
          "UPDATE creator.thread SET revision=revision+1 WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
          [scope.threadId, scope.creatorId, scope.fanId],
        );
        if (!generation.reservation_id)
          await this.access.recordAllowanceOutput(
            scope,
            client,
            generation.id,
            generation.grant_id,
          );
        return appendFrame(client, scope, {
          epoch: generation.epoch,
          kind: "sentence",
          messageId: generation.ai_message_id,
          authorKind: "ai",
          text: proposal.text,
          generationId,
          sequence,
        });
      },
      "write",
    );
  }
  async complete(
    scope: ThreadScope,
    generationId: string,
    failed = false,
    workerToken?: string,
  ): Promise<Frame | null> {
    return this.db.withThread(
      scope,
      async (client) => {
        const thread = await this.lockThread(client, scope);
        const result = await client.query<GenerationRow>(
          "SELECT * FROM creator.generation WHERE id=$1 AND thread_id=$2 AND creator_id=$3 AND fan_id=$4 FOR UPDATE",
          [generationId, scope.threadId, scope.creatorId, scope.fanId],
        );
        const generation = result.rows[0];
        invariant(
          generation,
          "generation_unavailable",
          "The generation is unavailable.",
        );
        if (!["queued", "generating"].includes(generation.state)) return null;
        if (workerToken && generation.worker_token !== workerToken) return null;
        if (
          thread.control !== "ai_active" ||
          thread.control_epoch !== generation.epoch
        )
          return null;
        // A visible approved prefix is already delivered work. Keep it and
        // settle it consistently with takeover; only an empty failure releases
        // the reservation without consumption.
        const visible = generation.last_sequence > 0;
        const state = failed
          ? visible
            ? "interrupted"
            : "failed"
          : "delivered";
        await client.query(
          "UPDATE creator.generation SET state=$1 WHERE id=$2 AND thread_id=$3 AND creator_id=$4 AND fan_id=$5",
          [state, generationId, scope.threadId, scope.creatorId, scope.fanId],
        );
        await client.query(
          "UPDATE creator.message SET delivery_state=$1 WHERE id=$2 AND thread_id=$3 AND creator_id=$4 AND fan_id=$5",
          [
            state,
            generation.ai_message_id,
            scope.threadId,
            scope.creatorId,
            scope.fanId,
          ],
        );
        await this.settle(client, scope, generation, visible);
        await client.query(
          "UPDATE creator.generation SET completed_at=now(),worker_token=NULL,lease_until=NULL WHERE id=$1 AND thread_id=$2 AND creator_id=$3 AND fan_id=$4",
          [generationId, scope.threadId, scope.creatorId, scope.fanId],
        );
        return appendFrame(client, scope, {
          epoch: generation.epoch,
          kind: failed ? "interrupted" : "delivered",
          messageId: generation.ai_message_id,
          authorKind: "ai",
          text: "",
          generationId,
          sequence: generation.last_sequence,
        });
      },
      "write",
    );
  }
  async changeControl(
    scope: ThreadScope,
    to: "human_active" | "ai_active" | "ai_paused",
    raw: unknown,
  ): Promise<Frame> {
    const body = ControlCommandSchema.parse(raw);
    invariant(
      scope.authority === "creator",
      "creator_required",
      "Only the creator can change this conversation’s speaker.",
    );
    return this.db.withThread(
      scope,
      (client) => this.changeControlOnClient(client, scope, to, body),
      "write",
    );
  }
  /** Genuine W6 authenticated request composition. No nested pool/transaction,
   * retained ThreadScope, provider callback, worker Actor or commit is supplied.
   * The caller owns COMMIT and must propagate a refused transition. */
  async changeControlInTransaction(
    client: PoolClient,
    actor: Actor,
    family: Readonly<{ creatorId: string; fanId: string }>,
    to: "human_active" | "ai_active",
    raw: unknown,
  ): Promise<Frame> {
    const body = ConversationCallControlSchema.parse(raw);
    invariant(
      to === "human_active" || to === "ai_active",
      "call_control_invalid",
      "Calls require a current creator takeover or handback.",
    );
    const endpoint = new Client(this.db.pool.options);
    if (
      !this.access.isForPool(this.db.pool) ||
      !(client instanceof Client) ||
      endpoint.user !== "creator_runtime" ||
      client.user !== endpoint.user ||
      client.host !== endpoint.host ||
      client.port !== endpoint.port ||
      client.database !== endpoint.database
    )
      throw new DomainError(
        "call_control_pool_mismatch",
        "Call control requires this canonical conversation database client.",
        503,
      );
    try {
      await client.query("SAVEPOINT w3_held_call_control");
    } catch {
      throw new DomainError(
        "call_control_transaction_required",
        "Call control requires the actual held request transaction.",
        503,
      );
    }
    try {
      const role = (
        await client.query<{ ready: boolean }>(
          `SELECT current_user=session_user AND session_user='creator_runtime'
           AND current_setting('transaction_isolation')='read committed'
           AND r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolbypassrls
           AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication
           AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid) AS ready
           FROM pg_roles r WHERE r.rolname=session_user`,
        )
      ).rows[0];
      invariant(
        role?.ready === true,
        "call_control_role_invalid",
        "Use the canonical interactive request role for call control.",
      );
      // W1 current session and W8 negatives precede its positive family lease.
      // The actor comes from the authenticated request, never job metadata.
      const scope = await this.access.openThreadInTransaction(
        client,
        actor,
        family.creatorId,
        family.fanId,
        false,
        "write",
      );
      invariant(
        scope.authority === "creator",
        "creator_required",
        "Only the creator can change this conversation’s speaker.",
      );
      const frame = await this.changeControlOnClient(client, scope, to, body);
      const current = await this.access.openThreadInTransaction(
        client,
        actor,
        family.creatorId,
        family.fanId,
        false,
        "write",
      );
      invariant(
        current.authority === "creator" &&
          current.threadId === scope.threadId &&
          current.actorAccountId === scope.actorAccountId &&
          current.creatorAccountId === scope.creatorAccountId &&
          current.fanAccountId === scope.fanAccountId,
        "call_control_changed",
        "Current creator call authority ended or changed.",
      );
      await client.query("RELEASE SAVEPOINT w3_held_call_control");
      return frame;
    } catch (error) {
      await client.query("ROLLBACK TO SAVEPOINT w3_held_call_control");
      await client.query("RELEASE SAVEPOINT w3_held_call_control");
      throw error;
    }
  }
  private async changeControlOnClient(
    client: PoolClient,
    scope: ThreadScope,
    to: "human_active" | "ai_active" | "ai_paused",
    body: { idempotencyKey: string; expectedEpoch?: number },
  ): Promise<Frame> {
    assertThreadScope(scope);
    invariant(
      scope.authority === "creator",
      "creator_required",
      "Only the creator can change this conversation’s speaker.",
    );
    return idempotent(
      client,
      scope,
      `control:${to}`,
      body.idempotencyKey,
      body,
      async () => {
        const thread = await this.lockThread(client, scope);
        invariant(
          !["closed", "blocked"].includes(thread.control),
          "thread_closed",
          "This conversation is closed.",
        );
        if (body.expectedEpoch !== undefined) {
          if (thread.control_epoch !== body.expectedEpoch)
            throw new DomainError(
              "call_control_changed",
              "The conversation’s speaker changed. Refresh before continuing the call.",
              409,
            );
          invariant(
            to !== "ai_active" || thread.control === "human_active",
            "call_handback_required",
            "Only the current creator takeover can hand back after a call.",
          );
        }
        invariant(
          thread.control !== to,
          "control_unchanged",
          "The conversation already has this speaker.",
        );
        await this.interruptGenerations(client, scope);
        const epoch = thread.control_epoch + 1;
        await client.query(
          "UPDATE creator.thread SET control=$1,control_epoch=$2 WHERE id=$3 AND creator_id=$4 AND fan_id=$5",
          [to, epoch, scope.threadId, scope.creatorId, scope.fanId],
        );
        await this.delivery.wellbeing?.boundary(scope, client);
        const text = formatCopy(
          to === "human_active"
            ? "takeover"
            : to === "ai_active"
              ? "handback"
              : "aiPaused",
          { name: scope.creatorName },
        );
        const system = await this.insertMessage(
          client,
          scope,
          "system",
          text,
          epoch,
          "delivered",
        );
        return appendFrame(client, scope, {
          epoch,
          kind: "control",
          control: to,
          messageId: system.id,
          authorKind: "system",
          text,
          generationId: null,
          sequence: 0,
        });
      },
    );
  }
  async humanReply(scope: ThreadScope, raw: unknown): Promise<Message> {
    const body = HumanReplySchema.parse(raw);
    invariant(
      scope.authority === "creator",
      "creator_required",
      "Only the creator can reply under their name.",
    );
    return this.db.withThread(
      scope,
      (client) =>
        idempotent(
          client,
          scope,
          "humanReply",
          body.idempotencyKey,
          body,
          async () => {
            const thread = await this.lockThread(client, scope);
            invariant(
              thread.control === "human_active",
              "takeover_required",
              "The creator must take over before replying in this conversation.",
            );
            const hash = await consumeSignedAct(
              client,
              scope,
              body.signedActId,
              {
                actType: "reply",
                subjectId: scope.threadId,
                content: { text: body.text },
              },
            );
            const output = await this.insertMessage(
              client,
              scope,
              "human_creator",
              body.text,
              thread.control_epoch,
              "delivered",
              { id: body.signedActId, hash },
            );
            await appendFrame(client, scope, {
              epoch: thread.control_epoch,
              kind: "delivered",
              messageId: output.id,
              authorKind: "human_creator",
              text: output.text,
              generationId: null,
              sequence: 0,
            });
            return output;
          },
        ),
      "write",
    );
  }
  /** D-07: current audited triage authority writes only under the team label.
   * This grants no creator signature, control change or personal obligation. */
  async teamReply(scope: ThreadScope, raw: unknown): Promise<Message> {
    const body = TeamReplySchema.parse(raw);
    invariant(
      scope.authority === "triage",
      "team_required",
      "Only a current authorized team member can reply as team.",
    );
    return this.db.withThread(
      scope,
      (client) =>
        idempotent(
          client,
          scope,
          "team_reply",
          body.idempotencyKey,
          body,
          async () => {
            const thread = await this.lockThread(client, scope);
            invariant(
              thread.control !== "closed",
              "thread_closed",
              "This conversation is closed.",
            );
            // Team replies do not acquire the creator's takeover authority. Keep
            // a live AI stream ordered; the creator can interrupt it explicitly.
            const active = await client.query(
              "SELECT id FROM creator.generation WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND state IN('queued','generating') LIMIT 1",
              [scope.threadId, scope.creatorId, scope.fanId],
            );
            invariant(
              !active.rowCount,
              "reply_in_progress",
              "Wait for the current reply before sending as team.",
            );
            const profile = await client.query<{ handle: string }>(
              "SELECT handle FROM creator.fan_profile WHERE account_id=$1 FOR SHARE",
              [scope.actorAccountId],
            );
            invariant(
              profile.rows[0],
              "team_profile_required",
              "Choose your public handle before replying as team.",
            );
            const output = await this.insertMessage(
              client,
              scope,
              "team",
              body.text,
              thread.control_epoch,
              "delivered",
            );
            const labelled = await client.query<{
              team_member: string;
              author_account_id: string;
            }>(
              "UPDATE creator.message SET team_member=$5 WHERE id=$4 AND thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND author_kind='team' AND author_account_id=$6 RETURNING team_member,author_account_id",
              [
                scope.threadId,
                scope.creatorId,
                scope.fanId,
                output.id,
                `@${profile.rows[0].handle} · triage`,
                scope.actorAccountId,
              ],
            );
            invariant(
              labelled.rowCount === 1,
              "team_reply_unavailable",
              "Current team attribution is required.",
            );
            await appendFrame(client, scope, {
              epoch: thread.control_epoch,
              kind: "delivered",
              messageId: output.id,
              authorKind: "team",
              text: output.text,
              generationId: null,
              sequence: 0,
            });
            return {
              ...output,
              member: labelled.rows[0]!.team_member,
              authorAccountId: labelled.rows[0]!.author_account_id,
            };
          },
        ),
      "write",
    );
  }
  async replay(
    scope: ThreadScope,
    cursor: number,
    limit = 256,
  ): Promise<Frame[]> {
    invariant(
      Number.isSafeInteger(cursor) && cursor >= 0,
      "invalid_cursor",
      "The replay cursor is invalid.",
    );
    invariant(
      Number.isSafeInteger(limit) && limit > 0 && limit <= 256,
      "invalid_limit",
      "The replay page limit is invalid.",
    );
    return this.db.withThread(
      scope,
      async (client) => {
        const thread = await this.lockThread(client, scope, true);
        invariant(
          cursor <= thread.event_cursor,
          "invalid_cursor",
          "Refresh the conversation before resuming.",
        );
        const rows = await client.query<{ payload: Frame }>(
          "SELECT payload FROM creator.event WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND cursor>$4 ORDER BY cursor LIMIT $5",
          [scope.threadId, scope.creatorId, scope.fanId, cursor, limit],
        );
        return rows.rows.map((row) => row.payload);
      },
      "read",
    );
  }
}
