import type { ConversationAllowance } from "./allowance.js";
import type { ApprovedSentence } from "../agent/runtime.js";
import { randomUUID } from "node:crypto";
import { formatCopy } from "@qelvora/copy";
import type { PoolClient } from "pg";
import {
  ControlCommandSchema,
  HumanReplySchema,
  ModelProposalSchema,
  SendMessageSchema,
  type AcceptedMessage,
  type Frame,
  type Message,
  type ThreadControl,
  type ThreadTimeline,
} from "@qelvora/api";
import { Database } from "../../db/database.js";
import {
  AccessService,
  assertThreadScope,
  type ThreadScope,
} from "../access/scope.js";
import { consumeSignedAct } from "../identity/signed-acts.js";
import { invariant } from "../../core/errors.js";
import { idempotent } from "../../core/idempotency.js";
import { appendFrame } from "../../core/outbox.js";
import type { GuardrailProvider } from "../agent/providers.js";
import type { ConversationWellbeing } from "./wellbeing.js";

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
  };
}

export class ConversationService {
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
  } = {};
  configureDelivery(delivery: typeof this.delivery) {
    this.delivery = delivery;
  }
  /** Revalidate the current configured policy before every remote fan-text call.
   * A thread's historical notice alone is not current processor consent. */
  async assertProcessorConsent(scope: ThreadScope) {
    invariant(
      this.delivery.policyVersion,
      "processor_consent_unavailable",
      "Current AI processor policy is unavailable.",
    );
    await this.db.withThread(scope, async (client) => {
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
    });
  }
  private async settle(
    client: PoolClient,
    scope: ThreadScope,
    generation: GenerationRow,
    consumed: boolean,
  ) {
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
    } else
      await this.access.settleAllowance(
        scope,
        client,
        generation.grant_id,
        consumed,
        generation.id,
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
  private async insertMessage(
    client: PoolClient,
    scope: ThreadScope,
    author: Message["authorKind"],
    text: string,
    epoch: number,
    state: Message["deliveryState"],
    signing?: { id: string; hash: string },
  ): Promise<Message> {
    const seq = await client.query<{ message_sequence: number }>(
      "UPDATE creator.thread SET message_sequence=message_sequence+1, revision=revision+1 WHERE id=$1 AND creator_id=$2 AND fan_id=$3 RETURNING message_sequence",
      [scope.threadId, scope.creatorId, scope.fanId],
    );
    const result = await client.query<MessageRow>(
      "INSERT INTO creator.message(id,thread_id,creator_id,fan_id,author_kind,author_account_id,text,delivery_state,control_epoch,sequence,signed_act_id,signed_content_hash,off_the_record) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,(SELECT off_the_record FROM creator.thread WHERE id=$2 AND creator_id=$3 AND fan_id=$4)) RETURNING *",
      [
        randomUUID(),
        scope.threadId,
        scope.creatorId,
        scope.fanId,
        author,
        author === "fan" || author === "human_creator"
          ? scope.actorAccountId
          : null,
        text,
        state,
        epoch,
        seq.rows[0]!.message_sequence,
        signing?.id ?? null,
        signing?.hash ?? null,
      ],
    );
    return message(result.rows[0]!);
  }
  async read(scope: ThreadScope): Promise<ThreadTimeline> {
    return this.db.withThread(scope, async (client) => {
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
        messages: rows.rows.map(message),
      };
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
            return { message: fan, generationId };
          },
        ),
      "write",
    );
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
        await this.settle(client, scope, generation, !failed || visible);
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
      (client) =>
        idempotent(
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
            invariant(
              thread.control !== to,
              "control_unchanged",
              "The conversation already has this speaker.",
            );
            const active = await client.query<GenerationRow>(
              "SELECT * FROM creator.generation WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND state IN ($4,$5) FOR UPDATE",
              [
                scope.threadId,
                scope.creatorId,
                scope.fanId,
                "queued",
                "generating",
              ],
            );
            for (const generation of active.rows) {
              await client.query(
                "UPDATE creator.generation SET state=$1 WHERE id=$2 AND thread_id=$3 AND creator_id=$4 AND fan_id=$5",
                [
                  "interrupted",
                  generation.id,
                  scope.threadId,
                  scope.creatorId,
                  scope.fanId,
                ],
              );
              await client.query(
                "UPDATE creator.message SET delivery_state=$1 WHERE id=$2 AND thread_id=$3 AND creator_id=$4 AND fan_id=$5",
                [
                  "interrupted",
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
        ),
      "write",
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
    return this.db.withThread(scope, async (client) => {
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
    });
  }
}
