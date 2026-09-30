import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  DecidePacket,
  SubmitPacket,
  SpendLimitCommand,
  VersionCommand,
  MoreInfoReply,
  FulfillmentCommand,
  ShareChoice,
  OfferChoice,
  ReauthorizePacket,
} from "../../../../../packages/api/src/commerce/contracts.js";
import { DomainError, invariant } from "../../core/errors.js";
import { contentHash } from "../../core/canonical.js";
import type { Actor } from "../identity/adapter.js";
import { consumeSignedAct } from "../identity/signed-acts.js";
import { assertCurrentSession } from "../identity/request-authority.js";
import type { AccessService } from "../access/scope.js";
import { capabilitySnapshot } from "../access/commerce.js";
import type { Database } from "../../db/database.js";
import type { PaymentProvider, Intent } from "../payments/provider.js";
import { CreditWallet, type CreditRules } from "./accounting.js";

export type CommercePolicy = {
  currency: string;
  limitOptions: number[];
  trialAllowance?: number;
  passEnabled: boolean;
  stripePublishableKey?: string;
  costAllowanceIntegrated?: boolean;
  credits?: { currency: string; perRead: number; monthlyCap: number };
  creditRules?: CreditRules;
  fulfillmentModes?: readonly string[];
};
type Snapshot = {
  mode: string;
  title: string;
  amount: number;
  currency: string;
  decisionHours: number;
  deliveryHours: number;
  durationSeconds: number | null;
  shareable: boolean;
  modeVersion: number;
};
type PacketRow = {
  id: string;
  thread_id: string;
  creator_id: string;
  fan_id: string;
  mode_id: string;
  snapshot: Snapshot;
  disclosure: Record<string, unknown>;
  visibility: string;
  state: string;
  payment_state: string;
  version: number;
  intent_ref: string | null;
  capacity_window: Date;
  decision_at: Date | null;
  hold_expires_at: Date | null;
  remaining_sla_seconds: number | null;
  created_at: Date;
  submitted_at: Date | null;
  accepted_at: Date | null;
  accepted_action: string | null;
  terminal_target: string | null;
  proposed_mode: Record<string, unknown> | null;
  authorization_attempt: number;
  auth_pending_until: Date | null;
};
type EffectRow = {
  id: string;
  creator_id: string;
  fan_id: string;
  packet_id: string;
  operation: string;
  provider_key: string;
  request: {
    amount: number;
    currency: string;
    paymentMethodId?: string;
    intentId?: string;
    returnState?: string;
  };
  state: string;
  attempt: number;
  reconciliation?: boolean;
  provider_ref: string | null;
  updated_at: Date;
  created_at: Date;
};
const ModeCommand = z
  .strictObject({
    title: z.string().trim().min(1).max(100),
    kind: z.enum([
      "written_reply",
      "voice_note",
      "audio_call",
      "video_call",
      "group_answer",
      "guaranteed_review",
    ]),
    amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
    publicAmount: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/u),
    decisionHours: z.number().int().min(1).max(720),
    deliveryHours: z.number().int().min(1).max(8760),
    durationSeconds: z.number().int().positive().nullable(),
    weeklyLimit: z.number().int().min(0).max(100000),
    shareable: z.boolean(),
    state: z.enum(["hidden", "offered", "paused"]),
    version: z.number().int().nonnegative(),
    idempotencyKey: z.string().min(8).max(128),
  })
  .refine((v) => v.state !== "offered" || v.amount !== null)
  .refine(
    (v) =>
      v.publicAmount === null ||
      (v.amount !== null && v.publicAmount < v.amount),
  );

export class CommerceService {
  constructor(
    readonly pool: Pool,
    private readonly db: Database,
    private readonly access: AccessService,
    readonly policy: CommercePolicy,
    readonly provider?: PaymentProvider,
  ) {}
  async account<T>(
    actor: Actor,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    invariant(
      actor.adultEligible,
      "adult_eligibility_required",
      "Adult eligibility is required.",
    );
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.account_id',$1,true)", [
        actor.accountId,
      ]);
      await assertCurrentSession(client, actor.accountId);
      const value = await work(client);
      await client.query("COMMIT");
      return value;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  async command<T>(
    client: PoolClient,
    actor: Actor,
    operation: string,
    key: string,
    body: unknown,
    work: () => Promise<T>,
  ): Promise<T> {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${actor.accountId}:${operation}:${key}`,
    ]);
    const hash = contentHash({ operation, body });
    const prior = (
      await client.query<{ request_hash: string; response: T }>(
        "SELECT request_hash,response FROM creator.idempotency_key WHERE actor_account_id=$1 AND operation=$2 AND key=$3",
        [actor.accountId, operation, key],
      )
    ).rows[0];
    if (prior) {
      invariant(
        prior.request_hash === hash,
        "idempotency_conflict",
        "This retry key was used for another action.",
      );
      return prior.response;
    }
    const result = await work();
    await client.query(
      "INSERT INTO creator.idempotency_key(actor_account_id,operation,key,request_hash,response) VALUES($1,$2,$3,$4,$5)",
      [actor.accountId, operation, key, hash, JSON.stringify(result)],
    );
    return result;
  }
  private async fan(client: PoolClient, actor: Actor) {
    const fan = (
      await client.query<{ id: string; handle: string }>(
        "SELECT id,handle FROM creator.fan_profile WHERE account_id=$1",
        [actor.accountId],
      )
    ).rows[0];
    invariant(fan, "fan_profile_required", "Set up your fan profile first.");
    return fan;
  }
  private async creator(client: PoolClient, actor: Actor, creatorId: string) {
    const row = (
      await client.query<{ id: string; display_name: string }>(
        "SELECT id,display_name FROM creator.creator_profile WHERE id=$1 AND account_id=$2 AND verification='verified' AND NOT recovery_required",
        [creatorId, actor.accountId],
      )
    ).rows[0];
    invariant(
      row,
      "creator_required",
      "Only the verified creator can change these offers.",
    );
    return row;
  }
  private async event(
    client: PoolClient,
    p: Pick<PacketRow, "id" | "creator_id" | "fan_id" | "version">,
    type: string,
    payload: Record<string, unknown> = {},
  ) {
    await client.query(
      "INSERT INTO creator.commerce_event(creator_id,fan_id,aggregate_id,aggregate_version,type,payload) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
      [p.creator_id, p.fan_id, p.id, p.version, type, JSON.stringify(payload)],
    );
  }
  private async ledger(
    client: PoolClient,
    p: PacketRow,
    kind: string,
    cause: string,
    amount = p.snapshot.amount,
    reference: string | null = p.intent_ref,
  ) {
    await client.query(
      "INSERT INTO creator.commerce_ledger(creator_id,fan_id,packet_id,kind,amount,currency,cause,provider_ref) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(kind,cause) DO NOTHING",
      [
        p.creator_id,
        p.fan_id,
        p.id,
        kind,
        amount,
        p.snapshot.currency,
        cause,
        reference,
      ],
    );
  }
  async overview(actor: Actor, creatorId?: string) {
    return this.account(actor, async (client) => {
      const fan =
        (
          await client.query<{ id: string; handle: string }>(
            "SELECT id,handle FROM creator.fan_profile WHERE account_id=$1",
            [actor.accountId],
          )
        ).rows[0] ?? null;
      const creators = (
        await client.query(
          "SELECT id,handle,display_name FROM creator.creator_profile WHERE verification='verified' AND ($1::uuid IS NULL OR id=$1) ORDER BY handle LIMIT 100",
          [creatorId ?? null],
        )
      ).rows;
      const owned = (
        await client.query(
          "SELECT id,display_name,verification FROM creator.creator_profile WHERE account_id=$1",
          [actor.accountId],
        )
      ).rows;
      const packets = (
        await client.query(
          `SELECT p.*,c.id AS commitment_id,c.state AS commitment_state,c.due_at,c.delivered_at,c.outcome FROM creator.commerce_packet p LEFT JOIN creator.commerce_commitment c ON c.packet_id=p.id WHERE ($1::uuid IS NULL OR p.creator_id=$1) ORDER BY p.created_at DESC,p.id DESC LIMIT 50`,
          [creatorId ?? null],
        )
      ).rows;
      const modes = (
        await client.query(
          `SELECT m.*,coalesce(c.used,0) AS used,coalesce(c.reserved,0) AS reserved FROM creator.commerce_mode m LEFT JOIN creator.commerce_capacity c ON c.mode_id=m.id AND c.window_start=date_trunc('week',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' WHERE ($1::uuid IS NULL OR m.creator_id=$1) AND (m.state<>'hidden' OR EXISTS(SELECT 1 FROM creator.creator_profile cp WHERE cp.id=m.creator_id AND cp.account_id=$2)) ORDER BY m.title,m.id LIMIT 100`,
          [creatorId ?? null, actor.accountId],
        )
      ).rows;
      const memberships = (
        await client.query(
          "SELECT m.*,t.name,t.capabilities,t.ai_allowance FROM creator.commerce_membership m JOIN creator.commerce_tier t ON t.id=m.tier_id ORDER BY m.purchased_at DESC LIMIT 100",
        )
      ).rows;
      if (fan) await this.effectiveLimit(client, fan.id, this.policy.currency);
      const tiers = (
        await client.query(
          "SELECT t.id,t.creator_id,t.name,t.capabilities,t.ai_allowance,t.catalog,t.state,t.version FROM creator.commerce_tier t JOIN creator.creator_profile cp ON cp.id=t.creator_id WHERE (t.state='active' OR cp.account_id=$2) AND cp.verification='verified' AND NOT cp.recovery_required AND ($1::uuid IS NULL OR t.creator_id=$1) ORDER BY t.name,t.id LIMIT 100",
          [creatorId ?? null, actor.accountId],
        )
      ).rows;
      const limits = fan
        ? (
            await client.query(
              "SELECT * FROM creator.commerce_spend_limit WHERE fan_id=$1",
              [fan.id],
            )
          ).rows
        : [];
      const exposure = fan
        ? await this.exposure(client, fan.id, this.policy.currency)
        : null;
      const spendingNotices = fan
        ? await this.spendingNotices(client, fan.id, this.policy.currency)
        : [];
      const payoutAccounts = owned.length
        ? (
            await client.query(
              "SELECT creator_id,state,details_due,version FROM creator.commerce_payout_account",
            )
          ).rows
        : [];
      const ledger = (
        await client.query(
          "SELECT * FROM creator.commerce_ledger ORDER BY created_at DESC,id DESC LIMIT 100",
        )
      ).rows;
      const pass = fan
        ? (
            await client.query(
              "SELECT * FROM creator.commerce_pass WHERE fan_id=$1",
              [fan.id],
            )
          ).rows
        : [];
      const slots = fan
        ? (
            await client.query(
              "SELECT s.*,cp.display_name FROM creator.commerce_pass_slot s JOIN creator.creator_profile cp ON cp.id=s.creator_id WHERE fan_id=$1 ORDER BY cycle_start DESC,position LIMIT 100",
              [fan.id],
            )
          ).rows
        : [];
      return {
        serverTime: new Date().toISOString(),
        fan,
        creators,
        owned,
        payoutAccounts,
        packets,
        modes,
        memberships,
        limits,
        exposure,
        spendingNotices,
        ledger,
        pass,
        slots,
        policy: {
          currency: this.policy.currency,
          limitOptions: this.policy.limitOptions,
          passEnabled: this.policy.passEnabled,
        },
        tiers,
        capabilities: {
          paymentsAvailable: Boolean(this.provider),
          stripePublishableKey: this.provider
            ? (this.policy.stripePublishableKey ?? null)
            : null,
          membershipAvailable: false,
          nativeReplyPurchase: false,
          storeVerificationAvailable: false,
        },
      };
    });
  }
  private async exposure(client: PoolClient, fanId: string, currency: string) {
    const totals = (
      await client.query<{ captured: string; held: string }>(
        `SELECT coalesce(sum(CASE WHEN kind='capture' THEN amount ELSE 0 END),0)::text AS captured FROM creator.commerce_ledger WHERE fan_id=$1 AND currency=$2 AND created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
        [fanId, currency],
      )
    ).rows[0]!;
    const held = (
      await client.query<{ amount: string }>(
        `SELECT coalesce(sum((snapshot->>'amount')::bigint),0)::text AS amount FROM creator.commerce_packet WHERE fan_id=$1 AND snapshot->>'currency'=$2 AND state IN ('submitting','submitted','more_info','offer_pending','accepting','releasing')`,
        [fanId, currency],
      )
    ).rows[0]!;
    const billing = (
      await client.query<{ amount: string }>(
        "SELECT coalesce(sum((request->>'amount')::bigint),0)::text AS amount FROM creator.commerce_billing_effect WHERE fan_id=$1 AND operation='start' AND request->>'currency'=$2 AND state IN('pending','processing','unknown')",
        [fanId, currency],
      )
    ).rows[0]!;
    const heldTotal = BigInt(held.amount) + BigInt(billing.amount);
    const total = BigInt(totals.captured) + heldTotal;
    invariant(
      total <= BigInt(Number.MAX_SAFE_INTEGER),
      "balance_reconciliation_required",
      "This balance needs reconciliation before new spending.",
    );
    return {
      captured: Number(totals.captured),
      held: Number(heldTotal),
      total: Number(total),
      currency,
    };
  }
  async checkSpend(
    client: PoolClient,
    fanId: string,
    amount: number,
    currency: string,
  ) {
    invariant(
      Number.isSafeInteger(amount) && amount >= 0,
      "invalid_amount",
      "The configured price is invalid.",
    );
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `spend:${fanId}:${currency}`,
    ]);
    const limit = await this.effectiveLimit(client, fanId, currency);
    invariant(
      limit,
      "spend_limit_required",
      "Choose a monthly limit or explicitly no limit before spending.",
    );
    const exposure = await this.exposure(client, fanId, currency);
    invariant(
      limit.explicit_none ||
        BigInt(exposure.total) + BigInt(amount) <= BigInt(limit.amount!),
      "spend_limit",
      "This action exceeds your current monthly spending limit.",
    );
  }
  /** W7 delivery consumes only the private percentage; no amount belongs in a lock-screen preview. */
  async spendingNotices(client: PoolClient, fanId: string, currency: string) {
    const limit = await this.effectiveLimit(client, fanId, currency);
    if (
      limit?.reminders_on &&
      !limit.explicit_none &&
      BigInt(limit.amount ?? 0) > 0n
    ) {
      const spend = await this.exposure(client, fanId, currency);
      for (const threshold of [50, 100])
        if (
          BigInt(spend.captured) * 100n >=
          BigInt(limit.amount!) * BigInt(threshold)
        )
          await client.query(
            "INSERT INTO creator.commerce_spending_notice(fan_id,currency,period,threshold,limit_version) VALUES($1,$2,(date_trunc('month',now() AT TIME ZONE 'UTC'))::date,$3,$4) ON CONFLICT DO NOTHING",
            [fanId, currency, threshold, limit.version],
          );
    }
    return (
      await client.query(
        "SELECT id,threshold,created_at FROM creator.commerce_spending_notice WHERE fan_id=$1 AND currency=$2 AND period=(date_trunc('month',now() AT TIME ZONE 'UTC'))::date ORDER BY threshold",
        [fanId, currency],
      )
    ).rows;
  }
  private async effectiveLimit(
    client: PoolClient,
    fanId: string,
    currency: string,
  ) {
    await client.query(
      `UPDATE creator.commerce_spend_limit SET amount=pending_amount,explicit_none=pending_none,pending_amount=NULL,pending_none=NULL,effective_at=NULL,version=version+1 WHERE fan_id=$1 AND currency=$2 AND effective_at<=now()`,
      [fanId, currency],
    );
    return (
      await client.query<{
        amount: string | null;
        explicit_none: boolean;
        reminders_on: boolean;
        version: number;
      }>(
        "SELECT * FROM creator.commerce_spend_limit WHERE fan_id=$1 AND currency=$2 FOR UPDATE",
        [fanId, currency],
      )
    ).rows[0];
  }
  async setLimit(actor: Actor, input: unknown) {
    const body = SpendLimitCommand.parse(input);
    return this.account(actor, (client) =>
      this.command(
        client,
        actor,
        "spend_limit",
        body.idempotencyKey,
        body,
        async () => {
          const fan = await this.fan(client, actor);
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            [`spend:${fan.id}:${body.currency}`],
          );
          const prior = await this.effectiveLimit(
            client,
            fan.id,
            body.currency,
          );
          const increase = Boolean(
            prior &&
              !prior.explicit_none &&
              (body.amount === null || body.amount > Number(prior.amount)),
          );
          if (!prior)
            await client.query(
              "INSERT INTO creator.commerce_spend_limit(fan_id,currency,amount,explicit_none,reminders_on) VALUES($1,$2,$3,$4,$5)",
              [
                fan.id,
                body.currency,
                body.amount,
                body.explicitNone,
                body.remindersOn,
              ],
            );
          else if (increase)
            await client.query(
              `UPDATE creator.commerce_spend_limit SET pending_amount=$3,pending_none=$4,effective_at=now()+interval '24 hours',reminders_on=$5,version=version+1 WHERE fan_id=$1 AND currency=$2`,
              [
                fan.id,
                body.currency,
                body.amount,
                body.explicitNone,
                body.remindersOn,
              ],
            );
          else
            await client.query(
              "UPDATE creator.commerce_spend_limit SET amount=$3,explicit_none=$4,pending_amount=NULL,pending_none=NULL,effective_at=NULL,reminders_on=$5,version=version+1 WHERE fan_id=$1 AND currency=$2",
              [
                fan.id,
                body.currency,
                body.amount,
                body.explicitNone,
                body.remindersOn,
              ],
            );
          return {
            delay: increase ? "24 hours" : null,
            limit: (
              await client.query(
                "SELECT * FROM creator.commerce_spend_limit WHERE fan_id=$1 AND currency=$2",
                [fan.id, body.currency],
              )
            ).rows[0],
            exposure: await this.exposure(client, fan.id, body.currency),
          };
        },
      ),
    );
  }
  async saveMode(
    actor: Actor,
    creatorId: string,
    modeId: string | null,
    input: unknown,
  ) {
    const body = ModeCommand.parse(input);
    invariant(
      body.state !== "offered" ||
        body.kind === "written_reply" ||
        this.policy.fulfillmentModes?.includes(body.kind),
      "fulfillment_unavailable",
      "This mode needs its verified delivery service before it can be offered.",
    );
    invariant(
      !["audio_call", "video_call"].includes(body.kind) ||
        body.state !== "offered" ||
        body.durationSeconds,
      "duration_required",
      "An offered call needs its promised duration.",
    );
    return this.account(actor, (client) =>
      this.command(
        client,
        actor,
        "mode",
        body.idempotencyKey,
        { creatorId, modeId, ...body },
        async () => {
          await this.creator(client, actor, creatorId);
          const id = modeId ?? randomUUID();
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            [`commerce.mode:${id}`],
          );
          if (modeId) {
            // Serialize mode edits with submissions; the one capacity row is authoritative.
            await client.query(
              "SELECT id FROM creator.commerce_mode WHERE id=$1 AND creator_id=$2 FOR UPDATE",
              [modeId, creatorId],
            );
            const capacity = (
              await client.query<{ used: number; reserved: number }>(
                "SELECT used,reserved FROM creator.commerce_capacity WHERE mode_id=$1 AND window_end>now() FOR UPDATE",
                [modeId],
              )
            ).rows;
            invariant(
              capacity.every((c) => c.used + c.reserved <= body.weeklyLimit),
              "capacity_below_obligations",
              "The weekly limit cannot be lower than existing reservations and accepted requests.",
            );
            const updated = await client.query(
              `UPDATE creator.commerce_mode SET title=$3,kind=$4,amount=$5,public_amount=$6,currency=$7,decision_hours=$8,delivery_hours=$9,duration_seconds=$10,weekly_limit=$11,shareable=$12,state=$13,version=version+1 WHERE id=$1 AND creator_id=$2 AND version=$14 RETURNING *`,
              [
                id,
                creatorId,
                body.title,
                body.kind,
                body.amount,
                body.publicAmount,
                body.currency,
                body.decisionHours,
                body.deliveryHours,
                body.durationSeconds,
                body.weeklyLimit,
                body.shareable,
                body.state,
                body.version,
              ],
            );
            invariant(
              updated.rowCount === 1,
              "stale_mode",
              "The offer changed. Refresh before editing.",
            );
            await client.query(
              "UPDATE creator.commerce_capacity SET capacity_limit=$2,version=version+1 WHERE mode_id=$1 AND window_end>now()",
              [modeId, body.weeklyLimit],
            );
            if (!body.shareable) {
              const revoked = (
                await client.query(
                  "UPDATE creator.commerce_share_grant g SET creator_permission=false,revoked_at=now(),version=g.version+1 FROM creator.commerce_commitment c JOIN creator.commerce_packet p ON p.id=c.packet_id WHERE g.commitment_id=c.id AND p.mode_id=$1 AND g.revoked_at IS NULL RETURNING g.id,g.creator_id,g.fan_id,g.version,g.commitment_id",
                  [modeId],
                )
              ).rows;
              for (const grant of revoked)
                await this.event(client, grant, "share_changed", {
                  commitmentId: grant.commitment_id,
                });
            }
            return updated.rows[0];
          }
          return (
            await client.query(
              `INSERT INTO creator.commerce_mode(id,creator_id,title,kind,amount,public_amount,currency,decision_hours,delivery_hours,duration_seconds,weekly_limit,shareable,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
              [
                id,
                creatorId,
                body.title,
                body.kind,
                body.amount,
                body.publicAmount,
                body.currency,
                body.decisionHours,
                body.deliveryHours,
                body.durationSeconds,
                body.weeklyLimit,
                body.shareable,
                body.state,
              ],
            )
          ).rows[0];
        },
      ),
    );
  }
  async accessFor(actor: Actor, creatorId: string, fanId: string) {
    const scope = await this.access.openThread(actor, creatorId, fanId, false);
    return this.db.withThread(scope, (client) =>
      capabilitySnapshot(client, scope),
    );
  }
  async packetDisclosure(actor: Actor, creatorId: string, fanId: string) {
    const scope = await this.access.openThread(actor, creatorId, fanId, false);
    invariant(
      scope.authority === "fan",
      "fan_required",
      "Only the fan can choose the request disclosure.",
    );
    return this.db.withThread(scope, async (client) => {
      const messages = (
        await client.query(
          "SELECT id,author_kind,text,version FROM creator.message WHERE thread_id=$1 ORDER BY sequence DESC LIMIT 100",
          [scope.threadId],
        )
      ).rows.reverse();
      return {
        messages,
        recentIds: messages.slice(-10).map((m) => m.id as string),
        accessNoticeVersion: "C06-1",
      };
    });
  }
  async openTrial(actor: Actor, creatorId: string, fanId: string) {
    const scope = await this.access.openThread(actor, creatorId, fanId, false);
    invariant(
      scope.authority === "fan",
      "fan_required",
      "Only the fan can open a first conversation.",
    );
    const allowance = this.policy.trialAllowance;
    invariant(
      allowance !== undefined && this.policy.costAllowanceIntegrated === true,
      "trial_unconfigured",
      "The first conversation allowance is not configured.",
    );
    return this.db.withThread(scope, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`trial:${creatorId}:${fanId}`],
      );
      const prior = await client.query(
        "SELECT grant_id FROM creator.commerce_trial WHERE creator_id=$1 AND fan_id=$2",
        [creatorId, fanId],
      );
      if (!prior.rowCount) {
        const grant = (
          await client.query<{ id: string }>(
            `INSERT INTO creator.access_grant(creator_id,fan_id,capabilities,source,state,valid_from,valid_until,allowance) VALUES($1,$2,ARRAY['ai_message'],'trial','active',now(),now()+interval '24 hours',$3) RETURNING id`,
            [creatorId, fanId, allowance],
          )
        ).rows[0]!;
        await client.query(
          "INSERT INTO creator.commerce_trial(creator_id,fan_id,grant_id) VALUES($1,$2,$3)",
          [creatorId, fanId, grant.id],
        );
      }
      return capabilitySnapshot(client, scope);
    });
  }
  async submit(actor: Actor, input: unknown) {
    const body = SubmitPacket.parse(input);
    invariant(
      this.provider,
      "payment_unconfigured",
      "Card holds are unavailable until payment configuration is complete.",
    );
    const scope = await this.access.openThread(
      actor,
      body.creatorId,
      body.fanId,
      false,
    );
    invariant(
      scope.authority === "fan",
      "fan_required",
      "Only the fan can submit this request.",
    );
    const result = await this.db.withThread(scope, (client) =>
      this.command(
        client,
        actor,
        "submit_packet",
        body.idempotencyKey,
        body,
        async () => {
          await client.query(
            "SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))",
            [`commerce.mode:${body.modeId}`],
          );
          const mode = (
            await client.query<{
              id: string;
              kind: string;
              title: string;
              amount: string;
              public_amount: string | null;
              currency: string;
              decision_hours: number;
              delivery_hours: number;
              duration_seconds: number | null;
              weekly_limit: number;
              shareable: boolean;
              version: number;
              eligibility: string[];
            }>(
              `SELECT m.* FROM creator.commerce_mode m JOIN creator.creator_profile cp ON cp.id=m.creator_id WHERE m.id=$1 AND m.creator_id=$2 AND m.state='offered' AND cp.verification='verified'`,
              [body.modeId, scope.creatorId],
            )
          ).rows[0];
          invariant(
            mode && mode.version === body.modeVersion,
            "mode_unavailable",
            "This offer changed. Refresh before sending.",
          );
          const caps = await capabilitySnapshot(client, scope);
          invariant(
            !mode.eligibility.length ||
              mode.eligibility.some((c) => caps.capabilities.includes(c)),
            "mode_access_required",
            "This mode is not included in your current access.",
          );
          invariant(
            !body.disclosure.attachmentIds.length,
            "attachments_unavailable",
            "Attachments are not connected yet. Remove them before sending.",
          );
          invariant(
            body.disclosure.identity === "handle",
            "intro_unavailable",
            "Shared intro disclosure is not connected yet.",
          );
          invariant(
            mode.kind === "written_reply" ||
              this.policy.fulfillmentModes?.includes(mode.kind),
            "fulfillment_unavailable",
            "This promised service is not connected yet.",
          );
          const amount = Number(
            body.visibility === "public" ? mode.public_amount : mode.amount,
          );
          invariant(
            amount > 0 && Number.isSafeInteger(amount),
            "public_price_unconfigured",
            "The selected answer price is not configured.",
          );
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            [`spend:${scope.fanId}:${mode.currency}`],
          );
          const limit = await this.effectiveLimit(
            client,
            scope.fanId,
            mode.currency,
          );
          invariant(
            limit,
            "spend_limit_required",
            "Choose a monthly limit before placing a hold.",
          );
          const exposure = await this.exposure(
            client,
            scope.fanId,
            mode.currency,
          );
          invariant(
            limit.explicit_none ||
              exposure.total + amount <= Number(limit.amount),
            "spend_limit",
            "This request would exceed your current monthly limit. Nothing was reserved or held.",
          );
          const messages = (
            await client.query(
              "SELECT id,author_kind,text,version FROM creator.message WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND ($4 OR id=ANY($5::uuid[])) ORDER BY sequence LIMIT 101",
              [
                scope.threadId,
                scope.creatorId,
                scope.fanId,
                body.disclosure.wholeThread,
                body.disclosure.messageIds,
              ],
            )
          ).rows;
          invariant(
            messages.length <= 100,
            "disclosure_too_large",
            "Select at most 100 messages.",
          );
          invariant(
            body.disclosure.wholeThread ||
              messages.length === new Set(body.disclosure.messageIds).size,
            "disclosure_unavailable",
            "A selected message is unavailable. Refresh your selection.",
          );
          const window = (
            await client.query<{ start: Date; end: Date }>(
              `SELECT date_trunc('week',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS start,(date_trunc('week',now() AT TIME ZONE 'UTC')+interval '7 days') AT TIME ZONE 'UTC' AS end`,
            )
          ).rows[0]!;
          await client.query(
            "INSERT INTO creator.commerce_capacity(mode_id,creator_id,window_start,window_end,capacity_limit) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
            [
              mode.id,
              scope.creatorId,
              window.start,
              window.end,
              mode.weekly_limit,
            ],
          );
          await client.query(
            "SELECT mode_id FROM creator.commerce_capacity WHERE mode_id=$1 AND window_start=$2 FOR UPDATE",
            [mode.id, window.start],
          );
          const reservation = await client.query(
            "UPDATE creator.commerce_capacity SET reserved=reserved+1,version=version+1 WHERE mode_id=$1 AND window_start=$2 AND used+reserved<capacity_limit RETURNING mode_id",
            [mode.id, window.start],
          );
          invariant(
            reservation.rowCount === 1,
            "capacity_full",
            "Fully booked this week. Nothing was held.",
          );
          const snapshot: Snapshot = {
            mode: mode.kind,
            title: mode.title,
            amount,
            currency: mode.currency,
            decisionHours: mode.decision_hours,
            deliveryHours: mode.delivery_hours,
            durationSeconds: mode.duration_seconds,
            shareable: mode.shareable,
            modeVersion: mode.version,
          };
          const id = randomUUID();
          const disclosure = {
            ...body.disclosure,
            summary: body.disclosure.includeSummary
              ? body.disclosure.summary
              : null,
            messages,
          };
          await client.query(
            `INSERT INTO creator.commerce_packet(id,thread_id,creator_id,fan_id,mode_id,snapshot,disclosure,visibility,state,payment_state,capacity_window,auth_pending_until) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'submitting','authorization_pending',$9,now()+interval '30 minutes')`,
            [
              id,
              scope.threadId,
              scope.creatorId,
              scope.fanId,
              mode.id,
              JSON.stringify(snapshot),
              JSON.stringify(disclosure),
              body.visibility,
              window.start,
            ],
          );
          const effect = (
            await client.query<{ id: string }>(
              `INSERT INTO creator.commerce_effect(creator_id,fan_id,packet_id,operation,provider_key,request) VALUES($1,$2,$3,'authorize',$4,$5) RETURNING id`,
              [
                scope.creatorId,
                scope.fanId,
                id,
                `${id}:authorize:1`,
                JSON.stringify({
                  amount,
                  currency: mode.currency,
                  paymentMethodId: body.paymentMethodId,
                }),
              ],
            )
          ).rows[0]!;
          return { packetId: id, effectId: effect.id };
        },
      ),
    );
    await this.runEffect(actor, result.effectId);
    return this.packet(actor, result.packetId);
  }
  async packet(actor: Actor, id: string) {
    return this.account(actor, async (client) => {
      const p = (
        await client.query<PacketRow>(
          "SELECT * FROM creator.commerce_packet WHERE id=$1",
          [id],
        )
      ).rows[0];
      invariant(p, "request_unavailable", "This request is unavailable.");
      const commitment =
        (
          await client.query(
            "SELECT * FROM creator.commerce_commitment WHERE packet_id=$1",
            [id],
          )
        ).rows[0] ?? null;
      const ledger = (
        await client.query(
          "SELECT kind,amount,currency,cause,created_at FROM creator.commerce_ledger WHERE packet_id=$1 ORDER BY created_at,id",
          [id],
        )
      ).rows;
      const share =
        (
          await client.query(
            "SELECT * FROM creator.commerce_share_grant WHERE commitment_id=$1",
            [commitment?.id ?? null],
          )
        ).rows[0] ?? null;
      return { packet: p, commitment, ledger, share };
    });
  }
  private async packetScope(actor: Actor, id: string) {
    const { packet } = await this.packet(actor, id);
    return this.access.openThread(
      actor,
      packet.creator_id,
      packet.fan_id,
      false,
    );
  }
  async withdraw(actor: Actor, id: string, input: unknown) {
    const body = VersionCommand.parse(input);
    const scope = await this.packetScope(actor, id);
    invariant(
      scope.authority === "fan",
      "fan_required",
      "Only the fan can withdraw.",
    );
    const effect = await this.db.withThread(scope, (client) =>
      this.command(
        client,
        actor,
        "withdraw",
        body.idempotencyKey,
        { id, ...body },
        async () => {
          const p = await this.lockPacket(client, id);
          invariant(
            p.version === body.version,
            "stale_request",
            "The request changed. Refresh first.",
          );
          invariant(
            ["submitting", "submitted", "more_info", "offer_pending"].includes(
              p.state,
            ),
            "request_committed",
            "This request can no longer be withdrawn.",
          );
          return this.queueRelease(client, p, "withdrawn");
        },
      ),
    );
    if (effect) await this.runEffect(actor, effect);
    return this.packet(actor, id);
  }
  private async lockPacket(client: PoolClient, id: string) {
    const p = (
      await client.query<PacketRow>(
        "SELECT * FROM creator.commerce_packet WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    invariant(p, "request_unavailable", "This request is unavailable.");
    return p;
  }
  private async queueRelease(client: PoolClient, p: PacketRow, target: string) {
    await client.query(
      "UPDATE creator.commerce_packet SET state='releasing',payment_state='releasing',terminal_target=$2,version=version+1,updated_at=now() WHERE id=$1",
      [p.id, target],
    );
    const effect = (
      await client.query<{ id: string }>(
        `INSERT INTO creator.commerce_effect(creator_id,fan_id,packet_id,operation,provider_key,request) VALUES($1,$2,$3,'release',$4,$5) ON CONFLICT(provider_key) DO UPDATE SET next_at=now() RETURNING id`,
        [
          p.creator_id,
          p.fan_id,
          p.id,
          `${p.id}:release:${p.authorization_attempt}`,
          JSON.stringify({
            intentId: p.intent_ref,
            amount: p.snapshot.amount,
            currency: p.snapshot.currency,
          }),
        ],
      )
    ).rows[0]!;
    return effect.id;
  }
  async decide(actor: Actor, id: string, input: unknown) {
    const body = DecidePacket.parse(input);
    const scope = await this.packetScope(actor, id);
    invariant(
      scope.authority === "creator",
      "creator_required",
      "Only the creator can decide this personal request.",
    );
    const result = await this.db.withThread(scope, (client) =>
      this.command(
        client,
        actor,
        "decide",
        body.idempotencyKey,
        { id, ...body },
        async () => {
          const p = await this.lockPacket(client, id);
          invariant(
            p.version === body.version,
            "stale_request",
            "The request changed. Refresh first.",
          );
          invariant(
            ["submitted", "more_info", "offer_pending"].includes(p.state),
            "decision_unavailable",
            "The request is not ready for a decision.",
          );
          invariant(
            p.decision_at && p.decision_at.getTime() > Date.now(),
            "decision_expired",
            "The decision window ended. Reconcile this request first.",
          );
          invariant(
            p.payment_state === "requires_capture" &&
              p.hold_expires_at &&
              p.hold_expires_at.getTime() - 6 * 3600000 > Date.now(),
            "authorization_expiring",
            "The fan must re-authorize before acceptance.",
          );
          if (body.action === "decline" || body.action === "ai_answer") {
            await client.query(
              "UPDATE creator.commerce_packet SET reason=$2 WHERE id=$1",
              [id, body.action],
            );
            return { effectId: await this.queueRelease(client, p, "declined") };
          }
          if (body.action === "more_info") {
            invariant(
              p.state !== "more_info",
              "question_pending",
              "Wait for the fan's answer before asking another question.",
            );
            invariant(
              body.text,
              "question_required",
              "Write the question for the fan.",
            );
            await client.query(
              `UPDATE creator.commerce_packet SET state='more_info',question=$2,remaining_sla_seconds=greatest(0,extract(epoch FROM decision_at-now())::integer),decision_at=hold_expires_at-interval '6 hours',version=version+1,updated_at=now() WHERE id=$1`,
              [id, body.text],
            );
            await this.event(
              client,
              { ...p, version: p.version + 1 },
              "packet_more_info",
            );
            return { effectId: null };
          }
          if (body.action === "group_offer") {
            invariant(
              body.proposedModeId,
              "changed_offer_required",
              "Select the configured group offer.",
            );
            const mode = (
              await client.query<{
                id: string;
                kind: string;
                amount: string;
                currency: string;
                version: number;
              }>(
                "SELECT id,kind,amount,currency,version FROM creator.commerce_mode WHERE id=$1 AND creator_id=$2 AND kind='group_answer' AND state='offered'",
                [body.proposedModeId, p.creator_id],
              )
            ).rows[0];
            invariant(
              mode &&
                mode.currency === p.snapshot.currency &&
                Number(mode.amount) < p.snapshot.amount,
              "group_offer_unavailable",
              "A lower-price group offer in this currency is required.",
            );
            invariant(
              body.signedActId,
              "signed_act_required",
              "Sign the exact changed offer first.",
            );
            await consumeSignedAct(client, scope, body.signedActId, {
              actType: "accept",
              subjectId: scope.threadId,
              content: {
                packetId: p.id,
                packetVersion: p.version,
                snapshot: p.snapshot,
                action: "group_offer",
                proposedMode: mode,
              },
            });
            await client.query(
              "UPDATE creator.commerce_packet SET state='offer_pending',proposed_mode=$2,version=version+1,updated_at=now() WHERE id=$1",
              [id, JSON.stringify(mode)],
            );
            await this.event(
              client,
              { ...p, version: p.version + 1 },
              "packet_offer",
            );
            return { effectId: null };
          }
          const actions: Record<string, string[]> = {
            written_reply: ["reply_myself", "approve_draft"],
            voice_note: ["voice_note"],
            audio_call: ["offer_times"],
            video_call: ["offer_times"],
            group_answer: ["reply_myself"],
            guaranteed_review: ["reply_myself"],
          };
          invariant(
            actions[p.snapshot.mode]?.includes(body.action),
            "mode_mismatch",
            "That action does not fulfill the requested mode.",
          );
          invariant(
            body.signedActId,
            "signed_act_required",
            "Sign the exact acceptance first.",
          );
          await consumeSignedAct(client, scope, body.signedActId, {
            actType: "accept",
            subjectId: scope.threadId,
            content: {
              packetId: p.id,
              packetVersion: p.version,
              snapshot: p.snapshot,
              action: body.action,
            },
          });
          await client.query(
            "UPDATE creator.commerce_packet SET state='accepting',payment_state='capturing',accepted_act_id=$2,accepted_action=$3,version=version+1,updated_at=now() WHERE id=$1",
            [id, body.signedActId, body.action],
          );
          const effect = (
            await client.query<{ id: string }>(
              `INSERT INTO creator.commerce_effect(creator_id,fan_id,packet_id,operation,provider_key,request) VALUES($1,$2,$3,'capture',$4,$5) RETURNING id`,
              [
                p.creator_id,
                p.fan_id,
                p.id,
                `${p.id}:capture:${p.authorization_attempt}`,
                JSON.stringify({
                  intentId: p.intent_ref,
                  amount: p.snapshot.amount,
                  currency: p.snapshot.currency,
                }),
              ],
            )
          ).rows[0]!;
          return { effectId: effect.id };
        },
      ),
    );
    if (result.effectId) await this.runEffect(actor, result.effectId);
    return this.packet(actor, id);
  }
  async moreInfo(actor: Actor, id: string, input: unknown) {
    const body = MoreInfoReply.parse(input);
    const scope = await this.packetScope(actor, id);
    invariant(
      scope.authority === "fan",
      "fan_required",
      "Only the fan can answer.",
    );
    return this.db.withThread(scope, (client) =>
      this.command(
        client,
        actor,
        "more_info_reply",
        body.idempotencyKey,
        { id, ...body },
        async () => {
          const p = await this.lockPacket(client, id);
          invariant(
            p.version === body.version && p.state === "more_info",
            "stale_request",
            "This question changed. Refresh first.",
          );
          invariant(
            p.hold_expires_at &&
              p.hold_expires_at.getTime() - 6 * 3600000 > Date.now(),
            "reauthorization_required",
            "The authorization is expiring. Re-authorize or withdraw.",
          );
          await client.query(
            `UPDATE creator.commerce_packet SET state='submitted',fan_answer=$2,decision_at=least(now()+($3*interval '1 second'),hold_expires_at-interval '6 hours'),version=version+1,updated_at=now() WHERE id=$1`,
            [id, body.text, p.remaining_sla_seconds ?? 0],
          );
          await this.event(
            client,
            { ...p, version: p.version + 1 },
            "packet_info_received",
          );
          return { packetId: id };
        },
      ),
    );
  }
  async offerChoice(actor: Actor, id: string, input: unknown) {
    const body = OfferChoice.parse(input),
      scope = await this.packetScope(actor, id);
    invariant(
      scope.authority === "fan",
      "fan_required",
      "Only the fan may accept a changed service.",
    );
    const result = await this.db.withThread(scope, (client) =>
      this.command(
        client,
        actor,
        "offer_choice",
        body.idempotencyKey,
        { id, ...body },
        async () => {
          const p = await this.lockPacket(client, id);
          invariant(
            p.version === body.version &&
              p.state === "offer_pending" &&
              p.proposed_mode,
            "stale_offer",
            "This offer changed. Refresh first.",
          );
          invariant(
            p.decision_at && p.decision_at.getTime() > Date.now(),
            "offer_expired",
            "This offer expired. Refresh the request before choosing.",
          );
          if (!body.accept) {
            await client.query(
              "UPDATE creator.commerce_packet SET state='submitted',proposed_mode=NULL,version=version+1 WHERE id=$1",
              [id],
            );
            return { effectId: null };
          }
          // A different price/service needs consent and a new authorization in the same lineage.
          await client.query(
            "UPDATE creator.commerce_packet SET proposed_mode=jsonb_set(proposed_mode,'{fanConsented}','true'::jsonb) WHERE id=$1",
            [id],
          );
          return { effectId: await this.queueRelease(client, p, "draft") };
        },
      ),
    );
    if (result.effectId) await this.runEffect(actor, result.effectId);
    return this.packet(actor, id);
  }
  async reauthorize(actor: Actor, id: string, input: unknown) {
    const body = ReauthorizePacket.parse(input),
      scope = await this.packetScope(actor, id);
    invariant(
      scope.authority === "fan",
      "fan_required",
      "Only the fan may authorize a new hold.",
    );
    invariant(
      this.provider,
      "payment_unconfigured",
      "Card authorization is unavailable.",
    );
    const prior = await this.packet(actor, id);
    invariant(
      prior.packet.intent_ref,
      "authorization_unavailable",
      "The original authorization is unavailable.",
    );
    // Confirm the old money truth outside all capacity locks.
    const old = await this.provider.fetchIntent(prior.packet.intent_ref);
    invariant(
      ["canceled", "requires_payment_method"].includes(old.status),
      "old_authorization_open",
      "Release the original authorization before placing a new hold.",
    );
    const effectId = await this.db.withThread(scope, (client) =>
      this.command(
        client,
        actor,
        "reauthorize",
        body.idempotencyKey,
        { id, ...body },
        async () => {
          const lockedModeId =
            prior.packet.proposed_mode?.fanConsented === true
              ? String(prior.packet.proposed_mode.id)
              : prior.packet.mode_id;
          await client.query(
            "SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))",
            [`commerce.mode:${lockedModeId}`],
          );
          const p = await this.lockPacket(client, id);
          invariant(
            p.version === body.version &&
              (["draft", "expired"].includes(p.state) ||
                (p.state === "submitted" && p.payment_state === "failed")),
            "stale_request",
            "This request changed. Refresh first.",
          );
          invariant(
            p.payment_state !== "failed" ||
              (p.auth_pending_until &&
                p.auth_pending_until.getTime() > Date.now()),
            "reauthorization_expired",
            "The reauthorization window ended. Reconcile and start a new request.",
          );
          const modeId =
            p.proposed_mode?.fanConsented === true
              ? String(p.proposed_mode.id)
              : p.mode_id;
          invariant(
            modeId === lockedModeId,
            "changed_offer",
            "The selected offer changed. Refresh before authorizing.",
          );
          const mode = (
            await client.query<{
              id: string;
              kind: string;
              title: string;
              amount: string;
              public_amount: string | null;
              currency: string;
              decision_hours: number;
              delivery_hours: number;
              duration_seconds: number | null;
              shareable: boolean;
              weekly_limit: number;
              version: number;
              eligibility: string[];
            }>(
              "SELECT m.* FROM creator.commerce_mode m JOIN creator.creator_profile cp ON cp.id=m.creator_id WHERE m.id=$1 AND m.creator_id=$2 AND m.state='offered' AND cp.verification='verified'",
              [modeId, p.creator_id],
            )
          ).rows[0];
          invariant(
            mode && mode.currency === p.snapshot.currency,
            "mode_unavailable",
            "The selected service is unavailable.",
          );
          invariant(
            modeId === p.mode_id || mode.version === p.proposed_mode?.version,
            "changed_offer",
            "The group offer changed. Review a new offer before authorizing.",
          );
          const caps = await capabilitySnapshot(client, scope);
          invariant(
            !mode.eligibility.length ||
              mode.eligibility.some((c) => caps.capabilities.includes(c)),
            "mode_access_required",
            "Current access does not include this offer.",
          );
          invariant(
            mode.kind === "written_reply" ||
              this.policy.fulfillmentModes?.includes(mode.kind),
            "fulfillment_unavailable",
            "This promised service is not connected yet.",
          );
          const amount = Number(
            modeId === p.mode_id
              ? p.visibility === "public"
                ? mode.public_amount
                : mode.amount
              : mode.amount,
          );
          invariant(
            Number.isSafeInteger(amount) && amount > 0,
            "price_unconfigured",
            "The price is unavailable.",
          );
          invariant(
            modeId !== p.mode_id
              ? amount < p.snapshot.amount
              : amount === p.snapshot.amount &&
                  mode.version === p.snapshot.modeVersion,
            "changed_offer",
            "The price or service changed. Review a new request.",
          );
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            [`spend:${p.fan_id}:${mode.currency}`],
          );
          const limit = await this.effectiveLimit(
              client,
              p.fan_id,
              mode.currency,
            ),
            exposure = await this.exposure(client, p.fan_id, mode.currency);
          const existingExposure =
            p.state === "submitted" ? p.snapshot.amount : 0;
          invariant(
            limit &&
              (limit.explicit_none ||
                exposure.total - existingExposure + amount <=
                  Number(limit.amount)),
            "spend_limit",
            "This would exceed your current monthly limit. Nothing was held.",
          );
          if (p.state === "submitted") await this.releaseCapacity(client, p);
          const window = (
            await client.query<{ start: Date; end: Date }>(
              "SELECT date_trunc('week',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS start,(date_trunc('week',now() AT TIME ZONE 'UTC')+interval '7 days') AT TIME ZONE 'UTC' AS end",
            )
          ).rows[0]!;
          await client.query(
            "INSERT INTO creator.commerce_capacity(mode_id,creator_id,window_start,window_end,capacity_limit) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
            [
              mode.id,
              p.creator_id,
              window.start,
              window.end,
              mode.weekly_limit,
            ],
          );
          const reserved = await client.query(
            "UPDATE creator.commerce_capacity SET reserved=reserved+1,version=version+1 WHERE mode_id=$1 AND window_start=$2 AND used+reserved<capacity_limit RETURNING mode_id",
            [mode.id, window.start],
          );
          invariant(
            reserved.rowCount === 1,
            "capacity_full",
            "Fully booked. Nothing was held.",
          );
          await client.query(
            "INSERT INTO creator.commerce_authorization_lineage(packet_id,creator_id,fan_id,attempt,intent_ref,snapshot) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
            [
              p.id,
              p.creator_id,
              p.fan_id,
              p.authorization_attempt,
              p.intent_ref,
              JSON.stringify(p.snapshot),
            ],
          );
          const snapshot: Snapshot = {
            mode: mode.kind,
            title: mode.title,
            amount,
            currency: mode.currency,
            decisionHours: mode.decision_hours,
            deliveryHours: mode.delivery_hours,
            durationSeconds: mode.duration_seconds,
            shareable: mode.shareable,
            modeVersion: mode.version,
          };
          await client.query(
            "UPDATE creator.commerce_packet SET state='submitting',payment_state='authorization_pending',mode_id=$2,snapshot=$3,visibility=CASE WHEN $4 THEN 'public' ELSE visibility END,capacity_window=$5,intent_ref=NULL,authorization_attempt=authorization_attempt+1,auth_pending_until=now()+interval '30 minutes',decision_at=NULL,hold_expires_at=NULL,accepted_act_id=NULL,accepted_action=NULL,proposed_mode=NULL,version=version+1,updated_at=now() WHERE id=$1",
            [
              p.id,
              mode.id,
              JSON.stringify(snapshot),
              modeId !== p.mode_id,
              window.start,
            ],
          );
          return (
            await client.query<{ id: string }>(
              "INSERT INTO creator.commerce_effect(creator_id,fan_id,packet_id,operation,provider_key,request) VALUES($1,$2,$3,'authorize',$4,$5) RETURNING id",
              [
                p.creator_id,
                p.fan_id,
                p.id,
                `${p.id}:authorize:${p.authorization_attempt + 1}`,
                JSON.stringify({
                  amount,
                  currency: mode.currency,
                  paymentMethodId: body.paymentMethodId,
                }),
              ],
            )
          ).rows[0]!.id;
        },
      ),
    );
    await this.runEffect(actor, effectId);
    return this.packet(actor, id);
  }
  async deliver(actor: Actor, id: string, input: unknown) {
    const body = FulfillmentCommand.parse(input);
    const scope = await this.packetScope(actor, id);
    invariant(
      scope.authority === "creator",
      "creator_required",
      "Only the creator can fulfill a personal request.",
    );
    return this.db.withThread(scope, (client) =>
      this.command(
        client,
        actor,
        "deliver",
        body.idempotencyKey,
        { id, ...body },
        async () => {
          const p = await this.lockPacket(client, id);
          const c = (
            await client.query<{
              id: string;
              version: number;
              state: string;
              due_at: Date;
            }>(
              "SELECT * FROM creator.commerce_commitment WHERE packet_id=$1 FOR UPDATE",
              [id],
            )
          ).rows[0];
          invariant(
            c &&
              c.version === body.version &&
              ["due", "in_progress"].includes(c.state),
            "commitment_unavailable",
            "This commitment changed. Refresh first.",
          );
          invariant(
            c.due_at.getTime() > Date.now(),
            "deadline_passed",
            "The deadline passed. Refund reconciliation is required.",
          );
          invariant(
            p.snapshot.mode === "written_reply",
            "media_evidence_required",
            "This mode needs verified media, session, published group or review evidence.",
          );
          const message = (
            await client.query<{
              id: string;
              author_kind: string;
              signed_act_id: string;
              text: string;
              version: number;
            }>(
              `SELECT m.* FROM creator.message m JOIN creator.signed_act sa ON sa.id=m.signed_act_id JOIN creator.passkey_credential pc ON pc.id=sa.credential_id AND pc.revoked_at IS NULL JOIN creator.creator_profile cp ON cp.id=m.creator_id AND cp.verification='verified' WHERE m.id=$1 AND m.thread_id=$2 AND m.creator_id=$3 AND m.fan_id=$4 AND m.author_account_id=$5 AND m.author_kind IN ('human_creator','approved_draft') AND m.delivery_state='delivered' AND m.created_at >= $6`,
              [
                body.messageId,
                scope.threadId,
                scope.creatorId,
                scope.fanId,
                scope.creatorAccountId,
                p.accepted_at,
              ],
            )
          ).rows[0];
          invariant(
            message,
            "signed_delivery_required",
            "A delivered exact creator-signed reply is required.",
          );
          await client.query(
            `UPDATE creator.commerce_commitment SET state='delivered',delivered_at=now(),delivered_message_id=$2,evidence=$3,payout_release_at=now()+interval '7 days',version=version+1 WHERE id=$1`,
            [
              c.id,
              message.id,
              JSON.stringify({
                messageId: message.id,
                messageVersion: message.version,
                signedActId: message.signed_act_id,
                authorKind: message.author_kind,
                contentHash: contentHash({ text: message.text }),
              }),
            ],
          );
          await this.event(
            client,
            { ...p, version: p.version + 1 },
            "commitment_delivered",
            { commitmentId: c.id },
          );
          return { commitmentId: c.id };
        },
      ),
    );
  }
  async share(actor: Actor, id: string, input: unknown) {
    const body = ShareChoice.parse(input);
    const scope = await this.packetScope(actor, id);
    return this.db.withThread(scope, (client) =>
      this.command(
        client,
        actor,
        "share",
        body.idempotencyKey,
        { id, ...body },
        async () => {
          const modeId = (
            await client.query(
              "SELECT mode_id FROM creator.commerce_packet WHERE id=$1",
              [id],
            )
          ).rows[0]?.mode_id;
          invariant(
            modeId,
            "request_unavailable",
            "This request is unavailable.",
          );
          await client.query(
            "SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))",
            [`commerce.mode:${modeId}`],
          );
          // Mode -> packet -> sharing is the same order as mode edits and
          // publication revocation. Re-read current permission under this lock.
          const permission = (
            await client.query<{ shareable: boolean }>(
              "SELECT m.shareable FROM creator.commerce_mode m WHERE m.id=$1",
              [modeId],
            )
          ).rows[0];
          const p = await this.lockPacket(client, id);
          invariant(
            p.mode_id === modeId,
            "changed_offer",
            "The request mode changed. Refresh before choosing sharing.",
          );
          const c = (
            await client.query<{ id: string; state: string }>(
              "SELECT id,state FROM creator.commerce_commitment WHERE packet_id=$1",
              [id],
            )
          ).rows[0];
          invariant(
            c?.state === "delivered",
            "delivery_required",
            "Sharing needs a delivered reply.",
          );
          const prior = (
            await client.query<{ version: number; revoked_at: Date | null }>(
              "SELECT version,revoked_at FROM creator.commerce_share_grant WHERE commitment_id=$1 FOR UPDATE",
              [c.id],
            )
          ).rows[0];
          invariant(
            !prior || prior.version === body.version,
            "stale_share",
            "Sharing changed. Refresh first.",
          );
          if (scope.authority === "creator") {
            invariant(
              !body.enabled,
              "fan_consent_required",
              "Only the fan can choose to share.",
            );
            await client.query(
              `INSERT INTO creator.commerce_share_grant(commitment_id,creator_id,fan_id,fan_choice,creator_permission,handle_display,revoked_at) VALUES($1,$2,$3,false,false,'hidden',now()) ON CONFLICT(commitment_id) DO UPDATE SET creator_permission=false,revoked_at=now(),version=creator.commerce_share_grant.version+1`,
              [c.id, p.creator_id, p.fan_id],
            );
          } else {
            invariant(
              scope.authority === "fan",
              "fan_required",
              "Only the fan can choose sharing.",
            );
            invariant(
              !body.enabled ||
                (p.snapshot.shareable &&
                  permission?.shareable &&
                  !prior?.revoked_at),
              "sharing_unavailable",
              "Sharing is unavailable or revoked.",
            );
            await client.query(
              `INSERT INTO creator.commerce_share_grant(commitment_id,creator_id,fan_id,fan_choice,creator_permission,handle_display,revoked_at) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $4 THEN NULL ELSE now() END) ON CONFLICT(commitment_id) DO UPDATE SET fan_choice=excluded.fan_choice,handle_display=excluded.handle_display,revoked_at=CASE WHEN excluded.fan_choice THEN creator.commerce_share_grant.revoked_at ELSE now() END,version=creator.commerce_share_grant.version+1`,
              [
                c.id,
                p.creator_id,
                p.fan_id,
                body.enabled,
                p.snapshot.shareable && Boolean(permission?.shareable),
                body.handleDisplay,
              ],
            );
          }
          const grant = (
            await client.query<{ id: string; version: number }>(
              "SELECT id,version FROM creator.commerce_share_grant WHERE commitment_id=$1",
              [c.id],
            )
          ).rows[0]!;
          await this.event(
            client,
            { ...p, id: grant.id, version: grant.version },
            "share_changed",
            { commitmentId: c.id },
          );
          return { commitmentId: c.id };
        },
      ),
    );
  }

  /** Domain adapters (W6 outcome / authorized W8 case) call this; never a client amount route. */
  async requestRefund(
    actor: Actor,
    id: string,
    amount: number,
    cause: string,
    outcome: string,
  ) {
    invariant(
      Number.isSafeInteger(amount) &&
        amount > 0 &&
        cause.length >= 8 &&
        cause.length <= 160,
      "invalid_refund",
      "The refund instruction is invalid.",
    );
    const effectId = await this.account(actor, (client) =>
      this.command(
        client,
        actor,
        "commerce.refund",
        cause,
        { id, amount, outcome },
        async () => {
          const p = await this.lockPacket(client, id);
          const c = (
            await client.query(
              "SELECT * FROM creator.commerce_commitment WHERE packet_id=$1 FOR UPDATE",
              [id],
            )
          ).rows[0];
          invariant(
            c &&
              p.intent_ref &&
              ["captured", "refund_pending"].includes(p.payment_state),
            "refund_unavailable",
            "A confirmed captured commitment is required.",
          );
          const pending = (
            await client.query<{ amount: string }>(
              "SELECT coalesce(sum((request->>'amount')::bigint),0)::text AS amount FROM creator.commerce_effect WHERE packet_id=$1 AND operation='refund' AND state<>'failed'",
              [id],
            )
          ).rows[0]!;
          invariant(
            BigInt(pending.amount) + BigInt(amount) <=
              BigInt(p.snapshot.amount),
            "refund_exceeds_balance",
            "The refund exceeds the remaining captured amount.",
          );
          const result = (
            await client.query<{ id: string }>(
              "INSERT INTO creator.commerce_effect(creator_id,fan_id,packet_id,operation,provider_key,request) VALUES($1,$2,$3,'refund',$4,$5) RETURNING id",
              [
                p.creator_id,
                p.fan_id,
                p.id,
                `${p.id}:refund:${cause}`,
                JSON.stringify({
                  intentId: p.intent_ref,
                  amount,
                  currency: p.snapshot.currency,
                  returnState:
                    c.state === "delivered" ? "delivered" : "resolved",
                }),
              ],
            )
          ).rows[0]!;
          await client.query(
            "UPDATE creator.commerce_packet SET payment_state='refund_pending',version=version+1 WHERE id=$1",
            [id],
          );
          await client.query(
            "UPDATE creator.commerce_commitment SET state=CASE WHEN state='delivered' THEN state ELSE 'refund_pending' END,outcome=$2,version=version+1 WHERE id=$1",
            [c.id, outcome],
          );
          return result.id;
        },
      ),
    );
    await this.runEffect(actor, effectId);
    return this.packet(actor, id);
  }

  /** Claim durably, commit, then call the provider. No capacity/spend lock spans network I/O. */
  async runEffect(actor: Actor, effectId: string) {
    invariant(
      this.provider,
      "payment_unconfigured",
      "Payment processing is unavailable.",
    );
    const effect = await this.account(actor, async (client) => {
      const result = await client.query<EffectRow>(
        `UPDATE creator.commerce_effect SET state='processing',attempt=attempt+1,lease_until=now()+interval '30 seconds',updated_at=now() WHERE id=$1 AND state IN ('pending','unknown','processing') AND next_at<=now() AND (lease_until IS NULL OR lease_until<now()) RETURNING *`,
        [effectId],
      );
      return result.rows[0];
    });
    if (!effect) return;
    try {
      if (effect.operation === "authorize") {
        const { packet } = await this.packet(actor, effect.packet_id);
        if (
          effect.provider_key !==
          `${packet.id}:authorize:${packet.authorization_attempt}`
        ) {
          await this.account(actor, (client) =>
            client.query(
              "UPDATE creator.commerce_effect SET state='done',lease_until=NULL,error_code='historical_authorization' WHERE id=$1 AND attempt=$2 AND state='processing'",
              [effect.id, effect.attempt],
            ),
          );
          return;
        }
        // Stripe can prune idempotency records after 24h. Never recreate an ambiguous hold.
        invariant(
          packet.intent_ref !== null ||
            Date.now() - effect.created_at.getTime() < 23 * 3600000,
          "operator_reconciliation_required",
          "The original authorization needs provider reconciliation; no new hold is attempted.",
        );
        const intent = packet.intent_ref
          ? await this.provider.fetchIntent(packet.intent_ref)
          : await this.provider.authorize({
              packetId: effect.packet_id,
              amount: effect.request.amount,
              currency: effect.request.currency,
              paymentMethodId: effect.request.paymentMethodId!,
              key: effect.provider_key,
            });
        await this.applyIntent(actor, effect, intent);
      } else {
        let intentId = effect.request.intentId;
        if (!intentId) {
          const { packet } = await this.packet(actor, effect.packet_id);
          intentId = packet.intent_ref ?? undefined;
          invariant(
            intentId,
            "authorization_unknown",
            "Confirming the existing authorization before release.",
          );
        }
        const current = await this.provider.fetchIntent(intentId);
        if (effect.operation === "capture") {
          const intent =
            current.status === "succeeded"
              ? current
              : await this.provider.capture(intentId, effect.provider_key);
          await this.applyIntent(actor, effect, intent);
        } else if (effect.operation === "release") {
          const intent =
            current.status === "canceled"
              ? current
              : await this.provider.release(intentId, effect.provider_key);
          await this.applyIntent(actor, effect, intent);
        } else if (effect.operation === "refund") {
          invariant(
            effect.provider_ref ||
              Date.now() - effect.created_at.getTime() < 23 * 3600000,
            "operator_reconciliation_required",
            "The original refund needs provider reconciliation; no second refund is attempted.",
          );
          const refund = effect.provider_ref
            ? await this.provider.fetchRefund(effect.provider_ref)
            : await this.provider.refund(
                intentId,
                effect.request.amount,
                effect.provider_key,
              );
          await this.account(actor, async (client) => {
            const p = await this.lockPacket(client, effect.packet_id);
            await this.fenceEffect(client, effect);
            if (refund.state === "succeeded") {
              await this.ledger(
                client,
                p,
                "refund",
                effect.provider_key,
                effect.request.amount,
                refund.id,
              );
              if (this.policy.creditRules)
                await new CreditWallet(
                  this.policy.creditRules,
                ).revokeAnswerCredits(client, p.id, refund.id);
              const refunded = (
                await client.query<{ amount: string }>(
                  "SELECT coalesce(sum(amount),0)::text AS amount FROM creator.commerce_ledger WHERE packet_id=$1 AND kind='refund'",
                  [p.id],
                )
              ).rows[0]!;
              const full = BigInt(refunded.amount) >= BigInt(p.snapshot.amount);
              await client.query(
                "UPDATE creator.commerce_packet SET payment_state=$2,version=version+1 WHERE id=$1",
                [p.id, full ? "refunded" : "captured"],
              );
              await client.query(
                "UPDATE creator.commerce_commitment SET state=$2,version=version+1 WHERE packet_id=$1",
                [
                  p.id,
                  full
                    ? "refunded"
                    : (effect.request.returnState ?? "resolved"),
                ],
              );
              await this.event(
                client,
                { ...p, version: p.version + 1 },
                "refunded",
              );
            }
            await client.query(
              "UPDATE creator.commerce_effect SET state=$2,provider_ref=$3,lease_until=NULL,next_at=now()+interval '30 seconds',updated_at=now() WHERE id=$1",
              [
                effect.id,
                refund.state === "succeeded"
                  ? "done"
                  : refund.state === "failed"
                    ? "failed"
                    : "unknown",
                refund.id,
              ],
            );
          });
        }
      }
    } catch (error) {
      await this.account(actor, async (client) => {
        const changed = await client.query(
          "UPDATE creator.commerce_effect SET state='unknown',error_code=$2,lease_until=NULL,next_at=now()+interval '30 seconds',updated_at=now() WHERE id=$1 AND attempt=$3 AND state='processing'",
          [
            effect.id,
            error instanceof DomainError ? error.code : "provider_unknown",
            effect.attempt,
          ],
        );
        if (!changed.rowCount) return;
        await client.query(
          "UPDATE creator.commerce_packet SET payment_state='unknown',updated_at=now() WHERE id=$1 AND state NOT IN ('accepted','declined','withdrawn','expired')",
          [effect.packet_id],
        );
      });
      // Even a 4xx can follow a concurrent provider mutation. Current object truth resolves it;
      // a timeout or server error never releases capacity on an assumption.
      if (
        error instanceof DomainError &&
        error.code === "provider_rejected" &&
        effect.request.intentId
      ) {
        try {
          const current = await this.provider.fetchIntent(
            effect.request.intentId,
          );
          if (
            effect.operation === "capture" &&
            ["canceled", "requires_payment_method"].includes(current.status)
          ) {
            await this.account(actor, async (client) => {
              const p = await this.lockPacket(client, effect.packet_id);
              const own = await client.query(
                "SELECT id FROM creator.commerce_effect WHERE id=$1 AND attempt=$2 AND state='unknown' FOR UPDATE",
                [effect.id, effect.attempt],
              );
              if (p.state !== "accepting" || !own.rowCount) return;
              await client.query(
                "UPDATE creator.commerce_packet SET state='submitted',payment_state='failed',auth_pending_until=now()+interval '24 hours',accepted_act_id=NULL,accepted_action=NULL,version=version+1,updated_at=now() WHERE id=$1",
                [p.id],
              );
              await client.query(
                "UPDATE creator.commerce_effect SET state='failed',error_code='capture_failed',lease_until=NULL WHERE id=$1",
                [effect.id],
              );
            });
          }
        } catch {
          /* The durable unknown effect remains visible for reconciliation. */
        }
      }
    }
  }
  private async fenceEffect(client: PoolClient, effect: EffectRow) {
    const own = await client.query(
      "SELECT state,attempt FROM creator.commerce_effect WHERE id=$1 FOR UPDATE",
      [effect.id],
    );
    invariant(
      own.rows[0] &&
        (effect.reconciliation
          ? own.rows[0].state !== "processing" &&
            own.rows[0].attempt === effect.attempt
          : own.rows[0].state === "processing" &&
            own.rows[0].attempt === effect.attempt),
      "effect_lease_lost",
      "A newer payment worker owns this recovery.",
    );
  }
  private async applyIntent(actor: Actor, effect: EffectRow, intent: Intent) {
    return this.account(actor, async (client) => {
      const p = await this.lockPacket(client, effect.packet_id);
      await this.fenceEffect(client, effect);
      if (
        (effect.operation === "authorize" &&
          effect.provider_key !==
            `${p.id}:authorize:${p.authorization_attempt}`) ||
        (effect.operation !== "authorize" &&
          effect.request.intentId &&
          effect.request.intentId !== p.intent_ref)
      ) {
        await client.query(
          "UPDATE creator.commerce_effect SET state='done',lease_until=NULL,error_code='historical_authorization' WHERE id=$1",
          [effect.id],
        );
        return;
      }
      // Actor was checked through packet RLS. Pair settings permit only its capacity/grant mutations.
      await client.query(
        "SELECT set_config('app.creator_id',$1,true),set_config('app.fan_id',$2,true)",
        [p.creator_id, p.fan_id],
      );
      invariant(
        intent.amount === p.snapshot.amount &&
          intent.currency === p.snapshot.currency &&
          intent.metadata.packet_id === p.id,
        "provider_mismatch",
        "Payment reconciliation found a mismatch.",
      );
      if (effect.operation === "authorize") {
        if (
          ["draft", "expired", "declined", "withdrawn", "accepted"].includes(
            p.state,
          )
        ) {
          invariant(
            ["canceled", "requires_payment_method"].includes(intent.status),
            "authorization_state_conflict",
            "Closed request payment needs operator reconciliation.",
          );
          await client.query(
            "UPDATE creator.commerce_effect SET state='done',provider_ref=$2,lease_until=NULL WHERE id=$1",
            [effect.id, intent.id],
          );
          return;
        }
        await client.query(
          "UPDATE creator.commerce_packet SET intent_ref=$2 WHERE id=$1",
          [p.id, intent.id],
        );
        if (intent.status === "requires_capture") {
          invariant(
            intent.captureBefore &&
              intent.captureBefore.getTime() - 6 * 3600000 > Date.now(),
            "authorization_expiry_unknown",
            "Authorization expiry needs reconciliation.",
          );
          await this.ledger(
            client,
            { ...p, intent_ref: intent.id },
            "hold",
            effect.provider_key,
          );
          if (p.state === "releasing") {
            await client.query(
              "UPDATE creator.commerce_effect SET request=jsonb_set(request,'{intentId}',to_jsonb($2::text)),next_at=now() WHERE packet_id=$1 AND operation='release'",
              [p.id, intent.id],
            );
          } else {
            await client.query(
              `UPDATE creator.commerce_packet SET state='submitted',payment_state='requires_capture',hold_expires_at=$2,decision_at=least(now()+($3*interval '1 hour'),$2::timestamptz-interval '6 hours'),submitted_at=now(),version=version+1,updated_at=now() WHERE id=$1 AND state='submitting'`,
              [p.id, intent.captureBefore, p.snapshot.decisionHours],
            );
            await this.event(
              client,
              { ...p, version: p.version + 1 },
              "packet_submitted",
            );
            if (p.state === "submitting") {
              await client.query(
                "INSERT INTO creator.commerce_membership_usage(creator_id,fan_id,membership_id,evidence_id,kind) SELECT creator_id,fan_id,id,$3,'request' FROM creator.commerce_membership WHERE creator_id=$1 AND fan_id=$2 AND state IN('active','grace','cancelled') AND period_start<=now() AND period_end>now() ON CONFLICT DO NOTHING",
                [p.creator_id, p.fan_id, `packet:${p.id}`],
              );
              await client.query(
                "UPDATE creator.commerce_membership SET first_used_at=coalesce(first_used_at,now()) WHERE creator_id=$1 AND fan_id=$2 AND state IN('active','grace','cancelled') AND period_start<=now() AND period_end>now()",
                [p.creator_id, p.fan_id],
              );
            }
          }
        } else if (intent.status === "requires_action") {
          await client.query(
            "UPDATE creator.commerce_packet SET payment_state='requires_action',version=version+1,updated_at=now() WHERE id=$1 AND state='submitting'",
            [p.id],
          );
        } else if (
          ["canceled", "requires_payment_method"].includes(intent.status)
        ) {
          await this.releaseCapacity(client, p);
          if (intent.status === "canceled" && p.submitted_at)
            await this.ledger(
              client,
              p,
              "release",
              `${p.id}:bank_release:${p.authorization_attempt}`,
            );
          await client.query(
            "UPDATE creator.commerce_packet SET state=$2,payment_state=$3,version=version+1,updated_at=now() WHERE id=$1",
            [
              p.id,
              p.state === "releasing"
                ? p.terminal_target
                : p.submitted_at && intent.status === "canceled"
                  ? "expired"
                  : "draft",
              intent.status === "canceled" ? "released" : "failed",
            ],
          );
        } else throw new DomainError("provider_unknown", "Confirming payment.");
      } else if (effect.operation === "capture") {
        if (p.state === "accepted" && intent.status === "succeeded") {
          await client.query(
            "UPDATE creator.commerce_effect SET state='done',provider_ref=$2,lease_until=NULL WHERE id=$1",
            [effect.id, intent.id],
          );
          return;
        }
        invariant(
          intent.status === "succeeded" &&
            intent.amountReceived === p.snapshot.amount &&
            p.state === "accepting",
          "capture_unknown",
          "Acceptance is waiting for payment confirmation.",
        );
        await client.query(
          "SELECT mode_id FROM creator.commerce_capacity WHERE mode_id=$1 AND window_start=$2 FOR UPDATE",
          [p.mode_id, p.capacity_window],
        );
        const cap = await client.query(
          "UPDATE creator.commerce_capacity SET reserved=reserved-1,used=used+1,version=version+1 WHERE mode_id=$1 AND window_start=$2 AND reserved>0 RETURNING mode_id",
          [p.mode_id, p.capacity_window],
        );
        invariant(
          cap.rowCount === 1,
          "capacity_inconsistent",
          "Capacity needs reconciliation.",
        );
        await this.ledger(client, p, "capture", effect.provider_key);
        await client.query(
          "UPDATE creator.commerce_packet SET state='accepted',payment_state='captured',accepted_at=now(),version=version+1,updated_at=now() WHERE id=$1",
          [p.id],
        );
        await client.query(
          `INSERT INTO creator.commerce_commitment(packet_id,creator_id,fan_id,mode,state,due_at) VALUES($1,$2,$3,$4,'due',now()+($5*interval '1 hour')) ON CONFLICT(packet_id) DO NOTHING`,
          [
            p.id,
            p.creator_id,
            p.fan_id,
            p.snapshot.mode,
            p.snapshot.deliveryHours,
          ],
        );
        await this.event(
          client,
          { ...p, version: p.version + 1 },
          "commitment_created",
        );
      } else if (effect.operation === "release") {
        invariant(
          intent.status === "canceled",
          "release_unknown",
          "The hold release is still processing.",
        );
        if (p.state === "releasing") {
          await this.releaseCapacity(client, p);
          await this.ledger(client, p, "release", effect.provider_key);
          await client.query(
            "UPDATE creator.commerce_packet SET state=$2,payment_state='released',version=version+1,updated_at=now() WHERE id=$1",
            [p.id, p.terminal_target],
          );
          await this.event(
            client,
            { ...p, version: p.version + 1 },
            "hold_released",
          );
        }
      }
      await client.query(
        "UPDATE creator.commerce_effect SET state='done',provider_ref=$2,lease_until=NULL,updated_at=now() WHERE id=$1",
        [effect.id, intent.id],
      );
    });
  }
  private async releaseCapacity(client: PoolClient, p: PacketRow) {
    const r = await client.query(
      "UPDATE creator.commerce_capacity SET reserved=reserved-1,version=version+1 WHERE mode_id=$1 AND window_start=$2 AND reserved>0 RETURNING mode_id",
      [p.mode_id, p.capacity_window],
    );
    invariant(
      r.rowCount === 1,
      "capacity_inconsistent",
      "Capacity needs reconciliation.",
    );
  }
  async reconcile(actor: Actor, id: string) {
    let { packet } = await this.packet(actor, id);
    invariant(
      this.provider,
      "payment_unconfigured",
      "Payment processing is unavailable.",
    );
    const effects = await this.account(
      actor,
      async (client) =>
        (
          await client.query<{ id: string }>(
            "SELECT id FROM creator.commerce_effect WHERE packet_id=$1 AND state<>'done' ORDER BY updated_at LIMIT 10",
            [id],
          )
        ).rows,
    );
    for (const effect of effects) await this.runEffect(actor, effect.id);
    ({ packet } = await this.packet(actor, id));
    if (packet.intent_ref) {
      const intent = await this.provider.fetchIntent(packet.intent_ref);
      invariant(
        intent.metadata.packet_id === packet.id &&
          intent.amount === packet.snapshot.amount &&
          intent.currency === packet.snapshot.currency,
        "provider_mismatch",
        "Provider money does not match the request. Reconciliation is required.",
      );
      const auth = await this.account(
        actor,
        async (client) =>
          (
            await client.query<EffectRow>(
              "SELECT * FROM creator.commerce_effect WHERE packet_id=$1 AND operation='authorize' ORDER BY updated_at DESC LIMIT 1",
              [id],
            )
          ).rows[0],
      );
      if (
        auth?.provider_key ===
          `${packet.id}:authorize:${packet.authorization_attempt}` &&
        ["submitting", "submitted", "more_info", "offer_pending"].includes(
          packet.state,
        ) &&
        (packet.payment_state === "requires_action" ||
          ["canceled", "requires_payment_method"].includes(intent.status))
      )
        await this.applyIntent(
          actor,
          { ...auth, reconciliation: true },
          intent,
        );
      if (packet.state === "accepted") {
        const current = await this.packet(actor, id);
        const refunded = current.ledger
          .filter((l) => l.kind === "refund")
          .reduce((n, l) => n + BigInt(l.amount), 0n);
        invariant(
          intent.status === "succeeded" && refunded === BigInt(intent.refunded),
          "ledger_reconciliation_required",
          "Provider funds need reconciliation before settlement.",
        );
      }
    }
    return this.packet(actor, id);
  }
  async paymentAuthentication(actor: Actor, id: string) {
    const scope = await this.packetScope(actor, id);
    invariant(
      scope.authority === "fan",
      "fan_required",
      "Only the fan can authenticate payment.",
    );
    const { packet } = await this.packet(actor, id);
    invariant(
      packet.payment_state === "requires_action" &&
        packet.intent_ref &&
        this.provider,
      "authentication_unavailable",
      "Payment authentication is unavailable.",
    );
    const intent = await this.provider.fetchIntent(packet.intent_ref);
    return { clientSecret: intent.clientSecret };
  }
  async reconcileDeadlines(actor: Actor) {
    const effects = await this.account(actor, async (client) => {
      const rows = (
        await client.query<PacketRow>(
          `SELECT * FROM creator.commerce_packet WHERE (state IN ('submitted','more_info','offer_pending') AND payment_state<>'failed' AND decision_at<=now()) OR (state='submitted' AND payment_state='failed' AND auth_pending_until<=now()) OR (state='submitting' AND auth_pending_until<=now()) ORDER BY updated_at LIMIT 50 FOR UPDATE SKIP LOCKED`,
        )
      ).rows;
      const ids: string[] = [];
      for (const p of rows)
        ids.push(await this.queueRelease(client, p, "expired"));
      const overdue = (
        await client.query<{ packet_id: string }>(
          "SELECT packet_id FROM creator.commerce_commitment WHERE state IN ('due','in_progress') AND due_at<=now() ORDER BY due_at LIMIT 50 FOR UPDATE SKIP LOCKED",
        )
      ).rows;
      for (const row of overdue) {
        const p = await this.lockPacket(client, row.packet_id);
        await client.query(
          "UPDATE creator.commerce_commitment SET state='refund_pending',outcome='deadline_missed',version=version+1 WHERE packet_id=$1",
          [p.id],
        );
        await client.query(
          "UPDATE creator.commerce_packet SET payment_state='refund_pending',version=version+1 WHERE id=$1",
          [p.id],
        );
        const effect = (
          await client.query<{ id: string }>(
            `INSERT INTO creator.commerce_effect(creator_id,fan_id,packet_id,operation,provider_key,request) VALUES($1,$2,$3,'refund',$4,$5) ON CONFLICT(provider_key) DO UPDATE SET next_at=now() RETURNING id`,
            [
              p.creator_id,
              p.fan_id,
              p.id,
              `${p.id}:refund:deadline`,
              JSON.stringify({
                intentId: p.intent_ref,
                amount: p.snapshot.amount,
                currency: p.snapshot.currency,
              }),
            ],
          )
        ).rows[0]!;
        ids.push(effect.id);
        await this.event(
          client,
          { ...p, version: p.version + 1 },
          "commitment_resolution",
        );
      }
      return ids;
    });
    for (const id of effects) await this.runEffect(actor, id);
    return { processing: effects.length };
  }
}
