import { z } from "zod";
import type { PoolClient } from "pg";
import type { Actor } from "../identity/adapter.js";
import type { CommerceService } from "./service.js";
import { DomainError, invariant } from "../../core/errors.js";
import { VersionCommand } from "../../../../../packages/api/src/commerce/contracts.js";
import { membershipRefund } from "./extended.js";

export interface PaidMembershipLine {
  itemReference: string;
  tierId: string;
  creatorId: string;
  priceReference: string;
  startsAt: Date;
  endsAt: Date;
  state: "active" | "grace" | "past_due" | "cancelled" | "refunded" | "revoked";
  cancelAtEnd: boolean;
  purchasedAt: Date;
  receipt?: {
    invoiceReference: string;
    lineReference: string;
    paymentReference: string;
    paidMinor: number;
    currency: string;
  };
  /** Confirmed cash allocated by the provider to this exact invoice line. */
  refunds?: readonly { reference: string; cause: string; amount: number }[];
}
export interface BillingTruth {
  accountId: string;
  customerReference: string;
  subscriptionReference: string;
  subscriptionState: "active" | "cancelled";
  currency: string;
  lines: readonly PaidMembershipLine[];
  clientSecret?: string;
}
/** The adapter owns Stripe invoice/credit-note allocation, taxes and configured Connect topology.
 * Invoices with discounts, credits or multiple payments need a verified cash allocation, never price × quantity. */
export interface MembershipBillingProvider {
  start(input: {
    accountId: string;
    fanId: string;
    customerReference: string | null;
    subscriptionReference: string | null;
    priceReference: string;
    paymentMethodId: string;
    key: string;
  }): Promise<BillingTruth>;
  current(subscriptionReference: string): Promise<BillingTruth>;
  cancel(input: {
    subscriptionReference: string;
    itemReference: string;
    atEnd: boolean;
    key: string;
  }): Promise<BillingTruth>;
  refund(input: {
    invoiceReference: string;
    lineReference: string;
    paymentReference: string;
    amount: number;
    key: string;
  }): Promise<{ id: string; state: "pending" | "succeeded" | "failed" }>;
  currentRefund(
    reference: string,
  ): Promise<{ id: string; state: "pending" | "succeeded" | "failed" }>;
}
const Start = VersionCommand.extend({
  tierId: z.uuid(),
  paymentMethodId: z.string().regex(/^pm_[A-Za-z0-9]+$/u),
});
const Cancel = VersionCommand.extend({ refundNow: z.boolean() });
type BillingEffect = {
  id: string;
  fan_id: string;
  operation: string;
  provider_key: string;
  request: Record<string, unknown>;
  provider_ref: string | null;
  created_at: Date;
  attempt: number;
};

export class MembershipBilling {
  get configured() {
    return Boolean(this.provider);
  }
  constructor(
    private readonly service: CommerceService,
    private readonly provider?: MembershipBillingProvider,
  ) {}
  async start(actor: Actor, input: unknown) {
    const body = Start.parse(input);
    invariant(
      this.provider,
      "membership_unavailable",
      "Membership billing is not connected yet.",
    );
    const effectId = await this.service.account(actor, (client) =>
      this.service.command(
        client,
        actor,
        "membership.start",
        body.idempotencyKey,
        body,
        async () => {
          const fan = (
            await client.query<{ id: string }>(
              "SELECT id FROM creator.fan_profile WHERE account_id=$1",
              [actor.accountId],
            )
          ).rows[0];
          invariant(
            fan,
            "fan_profile_required",
            "Set up your fan profile first.",
          );
          // Tier writers use the matching exclusive key; RLS keeps update
          // authority with creators while fans can take a shared read lease.
          await client.query(
            "SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))",
            [`commerce.tier:${body.tierId}`],
          );
          const tier = (
            await client.query(
              "SELECT t.* FROM creator.commerce_tier t JOIN creator.creator_profile cp ON cp.id=t.creator_id WHERE t.id=$1 AND t.state='active' AND cp.verification='verified' AND NOT cp.recovery_required",
              [body.tierId],
            )
          ).rows[0];
          const price = z
            .object({
              priceReference: z.string().regex(/^price_[A-Za-z0-9]+$/u),
              amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
              currency: z.string().regex(/^[A-Z]{3}$/u),
              interval: z.literal("month"),
            })
            .safeParse(tier?.catalog?.web);
          invariant(
            tier && tier.version === body.version && price.success,
            "membership_catalog_unavailable",
            "The configured membership price changed or is unavailable.",
          );
          invariant(
            !tier.ai_allowance || this.service.policy.costAllowanceIntegrated,
            "allowance_integration_unavailable",
            "Membership access is awaiting allowance integration.",
          );
          const duplicate = await client.query(
            "SELECT id FROM creator.commerce_membership WHERE fan_id=$1 AND tier_id=$2 AND state IN('pending','active','grace','cancelled') AND period_end>now()",
            [fan.id, tier.id],
          );
          invariant(
            !duplicate.rowCount,
            "membership_exists",
            "This membership is already included or processing.",
          );
          await this.service.checkSpend(
            client,
            fan.id,
            price.data.amount,
            price.data.currency,
          );
          await client.query(
            "INSERT INTO creator.commerce_billing_account(fan_id,currency) VALUES($1,$2) ON CONFLICT DO NOTHING",
            [fan.id, price.data.currency],
          );
          const account = (
            await client.query(
              "SELECT * FROM creator.commerce_billing_account WHERE fan_id=$1 FOR UPDATE",
              [fan.id],
            )
          ).rows[0]!;
          invariant(
            account.currency === price.data.currency,
            "billing_currency_mismatch",
            "Consolidated memberships must use the same configured currency.",
          );
          const pending = await client.query(
            "SELECT id FROM creator.commerce_billing_effect WHERE fan_id=$1 AND state IN('pending','processing','unknown') AND operation IN('start','cancel')",
            [fan.id],
          );
          invariant(
            !pending.rowCount,
            "billing_processing",
            "Wait for the current billing change to finish before making another.",
          );
          return (
            await client.query<{ id: string }>(
              "INSERT INTO creator.commerce_billing_effect(fan_id,operation,provider_key,request) VALUES($1,'start',$2,$3) RETURNING id",
              [
                fan.id,
                `membership:${fan.id}:${body.idempotencyKey}`,
                JSON.stringify({
                  accountId: actor.accountId,
                  fanId: fan.id,
                  tierId: tier.id,
                  amount: price.data.amount,
                  currency: price.data.currency,
                  priceReference: price.data.priceReference,
                  paymentMethodId: body.paymentMethodId,
                  customerReference: account.customer_ref,
                  subscriptionReference: account.subscription_terminal
                    ? null
                    : account.subscription_ref,
                  replacesSubscriptionReference: account.subscription_terminal
                    ? account.subscription_ref
                    : null,
                }),
              ],
            )
          ).rows[0]!.id;
        },
      ),
    );
    return this.run(actor, effectId);
  }
  async reconcile(actor: Actor) {
    invariant(
      this.provider,
      "membership_unavailable",
      "Membership billing is not connected yet.",
    );
    const recovered = await this.drain(actor);
    const account = await this.service.account(
      actor,
      async (client) =>
        (await client.query("SELECT * FROM creator.commerce_billing_account"))
          .rows[0],
    );
    if (!account?.subscription_ref)
      return {
        processing: recovered.some((row) => row.processing),
        recovered: recovered.length,
      };
    const truth = await this.provider.current(account.subscription_ref);
    await this.apply(actor, truth, account.version);
    return {
      processing: recovered.some((row) => row.processing),
      recovered: recovered.length,
    };
  }
  async drain(actor: Actor) {
    const effects = await this.service.account(
      actor,
      async (client) =>
        (
          await client.query<{ id: string }>(
            "SELECT id FROM creator.commerce_billing_effect WHERE state IN('pending','processing','unknown') AND next_at<=now() ORDER BY created_at LIMIT 50",
          )
        ).rows,
    );
    const outcomes = [];
    for (const effect of effects)
      outcomes.push(await this.run(actor, effect.id));
    return outcomes;
  }
  async cancel(actor: Actor, id: string, input: unknown) {
    const body = Cancel.parse(input);
    invariant(
      this.provider,
      "membership_unavailable",
      "Membership billing is not connected yet.",
    );
    const effectId = await this.service.account(actor, (client) =>
      this.service.command(
        client,
        actor,
        "membership.cancel",
        body.idempotencyKey,
        { id, ...body },
        async () => {
          const owner = (
            await client.query(
              "SELECT b.fan_id FROM creator.commerce_billing_account b WHERE b.fan_id=(SELECT fan_id FROM creator.commerce_membership WHERE id=$1 AND provider='stripe') FOR UPDATE",
              [id],
            )
          ).rows[0];
          invariant(
            owner,
            "membership_changed",
            "Refresh the current membership before cancelling.",
          );
          const membership = (
            await client.query(
              "SELECT m.*,b.subscription_ref FROM creator.commerce_membership m JOIN creator.commerce_billing_account b ON b.fan_id=m.fan_id WHERE m.id=$1 AND m.fan_id=$2 AND m.provider='stripe' FOR UPDATE OF m",
              [id, owner.fan_id],
            )
          ).rows[0];
          invariant(
            membership &&
              membership.version === body.version &&
              ["active", "grace", "cancelled"].includes(membership.state),
            "membership_changed",
            "Refresh the current membership before cancelling.",
          );
          const receipt = (
            await client.query(
              "SELECT * FROM creator.commerce_membership_receipt WHERE membership_id=$1 AND period_start=$2 ORDER BY created_at DESC LIMIT 1",
              [id, membership.period_start],
            )
          ).rows[0];
          invariant(
            !body.refundNow || receipt,
            "refund_receipt_unavailable",
            "The provider's paid receipt must be reconciled before a refund.",
          );
          const refund = body.refundNow
            ? membershipRefund({
                paidMinor: BigInt(receipt.paid_minor),
                purchasedAt: membership.purchased_at,
                periodStart: membership.period_start,
                periodEnd: membership.period_end,
                firstUsedAt: membership.first_used_at,
                now: new Date(),
              })
            : 0n;
          const pending = await client.query(
            "SELECT id FROM creator.commerce_billing_effect WHERE fan_id=$1 AND operation IN('start','cancel') AND state IN('pending','processing','unknown')",
            [membership.fan_id],
          );
          invariant(
            !pending.rowCount,
            "billing_processing",
            "Wait for the current billing change to finish first.",
          );
          return (
            await client.query<{ id: string }>(
              "INSERT INTO creator.commerce_billing_effect(fan_id,operation,provider_key,request) VALUES($1,'cancel',$2,$3) RETURNING id",
              [
                membership.fan_id,
                `cancel:${id}:${body.idempotencyKey}`,
                JSON.stringify({
                  membershipId: id,
                  itemReference: membership.provider_ref.slice(
                    "stripe:".length,
                  ),
                  subscriptionReference: membership.subscription_ref,
                  atEnd: !body.refundNow,
                  refundAmount: Number(refund),
                  receipt,
                }),
              ],
            )
          ).rows[0]!.id;
        },
      ),
    );
    return this.run(actor, effectId);
  }
  /** W3/W7 call with their durable evidence within the transaction that records real use. */
  async used(
    client: PoolClient,
    creatorId: string,
    fanId: string,
    kind: "ai_message" | "note_open" | "request",
    evidenceId: string,
  ) {
    await client.query(
      "INSERT INTO creator.commerce_membership_usage(creator_id,fan_id,membership_id,evidence_id,kind) SELECT creator_id,fan_id,id,$3,$4 FROM creator.commerce_membership WHERE creator_id=$1 AND fan_id=$2 AND state IN('active','grace','cancelled') AND period_start<=now() AND period_end>now() ON CONFLICT DO NOTHING",
      [creatorId, fanId, evidenceId, kind],
    );
    await client.query(
      "UPDATE creator.commerce_membership SET first_used_at=coalesce(first_used_at,now()) WHERE creator_id=$1 AND fan_id=$2 AND state IN('active','grace','cancelled') AND period_start<=now() AND period_end>now()",
      [creatorId, fanId],
    );
  }
  async run(
    actor: Actor,
    id: string,
  ): Promise<{
    processing: boolean;
    state?: string;
    reason?: string;
    clientSecret?: string;
  }> {
    invariant(
      this.provider,
      "membership_unavailable",
      "Membership billing is not connected yet.",
    );
    const effect = await this.service.account(
      actor,
      async (client) =>
        (
          await client.query<BillingEffect>(
            "UPDATE creator.commerce_billing_effect SET state='processing',attempt=attempt+1,lease_until=now()+interval '30 seconds',updated_at=now() WHERE id=$1 AND state IN('pending','processing','unknown') AND next_at<=now() AND (lease_until IS NULL OR lease_until<now()) RETURNING *",
            [id],
          )
        ).rows[0],
    );
    if (!effect)
      return this.service.account(actor, async (client) => {
        const prior = (
          await client.query(
            "SELECT state,error_code,provider_key FROM creator.commerce_billing_effect WHERE id=$1",
            [id],
          )
        ).rows[0];
        invariant(
          prior,
          "billing_effect_unavailable",
          "This billing change is unavailable.",
        );
        const child = (
          await client.query(
            "SELECT state FROM creator.commerce_billing_effect WHERE provider_key=$1",
            [`${prior.provider_key}:refund`],
          )
        ).rows[0];
        return {
          processing:
            !["done", "failed"].includes(prior.state) ||
            Boolean(child && !["done", "failed"].includes(child.state)),
          state: child?.state ?? prior.state,
          ...(prior.error_code ? { reason: prior.error_code } : {}),
        };
      });
    try {
      invariant(
        effect.provider_ref ||
          Date.now() - effect.created_at.getTime() < 23 * 3600000,
        "operator_reconciliation_required",
        "This original billing change needs provider reconciliation.",
      );
      const r = effect.request;
      if (effect.operation === "refund") {
        const receipt = r.receipt as {
          invoice_ref: string;
          line_ref: string;
          payment_ref: string;
          currency: string;
          creator_id: string;
          membership_id: string;
        };
        const result = effect.provider_ref
          ? await this.provider.currentRefund(effect.provider_ref)
          : await this.provider.refund({
              invoiceReference: receipt.invoice_ref,
              lineReference: receipt.line_ref,
              paymentReference: receipt.payment_ref,
              amount: Number(r.amount),
              key: effect.provider_key,
            });
        await this.service.account(actor, async (client) => {
          // Keep the account -> membership order used by cancellation and
          // reconciliation, and advance the aggregate before changing a grant.
          await client.query(
            "SELECT fan_id FROM creator.commerce_billing_account WHERE fan_id=$1 FOR UPDATE",
            [effect.fan_id],
          );
          await this.fence(client, effect);
          if (result.state === "succeeded") {
            await client.query(
              "UPDATE creator.commerce_billing_account SET version=version+1 WHERE fan_id=$1",
              [effect.fan_id],
            );
            await client.query(
              "INSERT INTO creator.commerce_ledger(creator_id,fan_id,kind,amount,currency,cause,provider_ref,refs) VALUES($1,$2,'refund',$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",
              [
                receipt.creator_id,
                effect.fan_id,
                r.amount,
                receipt.currency,
                `credit_note:${result.id}:${receipt.line_ref}`,
                result.id,
                JSON.stringify({
                  membershipId: receipt.membership_id,
                  invoiceId: receipt.invoice_ref,
                }),
              ],
            );
            await client.query(
              "UPDATE creator.commerce_membership SET state='refunded',version=version+1 WHERE id=$1",
              [receipt.membership_id],
            );
          }
          await client.query(
            "UPDATE creator.commerce_billing_effect SET state=$2,provider_ref=$3,lease_until=NULL,next_at=now()+interval '30 seconds' WHERE id=$1",
            [
              id,
              result.state === "succeeded"
                ? "done"
                : result.state === "failed"
                  ? "failed"
                  : "unknown",
              result.id,
            ],
          );
        });
        return { processing: result.state === "pending", state: result.state };
      }
      const before = await this.service.account(
        actor,
        async (client) =>
          (
            await client.query(
              "SELECT version FROM creator.commerce_billing_account WHERE fan_id=$1",
              [effect.fan_id],
            )
          ).rows[0],
      );
      invariant(
        before,
        "billing_link_conflict",
        "The billing account is unavailable.",
      );
      const truth = effect.provider_ref
        ? await this.provider.current(effect.provider_ref)
        : effect.operation === "start"
          ? await this.provider.start({
              ...(r as unknown as Parameters<
                MembershipBillingProvider["start"]
              >[0]),
              key: effect.provider_key,
            })
          : await this.provider.cancel({
              subscriptionReference: String(r.subscriptionReference),
              itemReference: String(r.itemReference),
              atEnd: Boolean(r.atEnd),
              key: effect.provider_key,
            });
      await this.apply(actor, truth, before.version, effect);
      const confirmed =
        effect.operation === "start"
          ? truth.lines.some(
              (line) =>
                line.tierId === r.tierId &&
                ["active", "grace", "cancelled"].includes(line.state) &&
                Boolean(line.receipt),
            )
          : r.atEnd === true
            ? truth.lines.some(
                (line) =>
                  line.itemReference === r.itemReference && line.cancelAtEnd,
              )
            : !truth.lines.some(
                (line) =>
                  line.itemReference === r.itemReference &&
                  ["active", "grace", "cancelled"].includes(line.state),
              );
      const refundId = await this.service.account(actor, async (client) => {
        await this.fence(client, effect);
        let refundId: string | undefined;
        if (
          confirmed &&
          effect.operation === "cancel" &&
          Number(r.refundAmount) > 0
        )
          refundId = (
            await client.query<{ id: string }>(
              "INSERT INTO creator.commerce_billing_effect(fan_id,operation,provider_key,request) VALUES($1,'refund',$2,$3) ON CONFLICT(provider_key) DO UPDATE SET provider_key=excluded.provider_key RETURNING id",
              [
                effect.fan_id,
                `${effect.provider_key}:refund`,
                JSON.stringify({ amount: r.refundAmount, receipt: r.receipt }),
              ],
            )
          ).rows[0]!.id;
        await client.query(
          "UPDATE creator.commerce_billing_effect SET state=$3,provider_ref=$2,lease_until=NULL,next_at=now()+interval '30 seconds',error_code=NULL WHERE id=$1",
          [id, truth.subscriptionReference, confirmed ? "done" : "unknown"],
        );
        return refundId;
      });
      const refund = refundId ? await this.run(actor, refundId) : undefined;
      return {
        processing: !confirmed || Boolean(refund?.processing),
        ...(truth.clientSecret ? { clientSecret: truth.clientSecret } : {}),
      };
    } catch (error) {
      await this.service.account(actor, (client) =>
        client.query(
          "UPDATE creator.commerce_billing_effect SET state='unknown',lease_until=NULL,next_at=now()+interval '30 seconds',error_code=$2 WHERE id=$1 AND attempt=$3 AND state='processing'",
          [
            id,
            error instanceof DomainError ? error.code : "provider_unknown",
            effect.attempt,
          ],
        ),
      );
      return { processing: true };
    }
  }
  private async fence(client: PoolClient, effect: BillingEffect) {
    const current = await client.query(
      "SELECT id FROM creator.commerce_billing_effect WHERE id=$1 AND attempt=$2 AND state='processing' FOR UPDATE",
      [effect.id, effect.attempt],
    );
    invariant(
      current.rowCount === 1,
      "effect_lease_lost",
      "A newer billing worker owns this recovery.",
    );
  }
  private async apply(
    actor: Actor,
    truth: BillingTruth,
    expectedVersion: number,
    effect?: BillingEffect,
  ) {
    invariant(
      truth.accountId === actor.accountId &&
        ["active", "cancelled"].includes(truth.subscriptionState) &&
        (truth.subscriptionState !== "cancelled" ||
          !truth.lines.some(
            (line) =>
              ["active", "grace"].includes(line.state) ||
              (line.state === "cancelled" && line.endsAt > new Date()),
          )),
      "billing_link_conflict",
      "The subscription is linked to another account.",
    );
    await this.service.account(actor, async (client) => {
      const account = (
        await client.query(
          "SELECT b.* FROM creator.commerce_billing_account b JOIN creator.fan_profile fp ON fp.id=b.fan_id WHERE fp.account_id=$1 FOR UPDATE OF b",
          [actor.accountId],
        )
      ).rows[0];
      invariant(
        account &&
          account.currency === truth.currency &&
          (!account.subscription_ref ||
            account.subscription_ref === truth.subscriptionReference ||
            (account.subscription_terminal &&
              effect?.operation === "start" &&
              effect.request.replacesSubscriptionReference ===
                account.subscription_ref)) &&
          (!account.customer_ref ||
            account.customer_ref === truth.customerReference),
        "billing_link_conflict",
        "A new consolidated subscription requires verified termination of the previous purchase and the same billing customer.",
      );
      invariant(
        account.version === expectedVersion,
        "billing_truth_stale",
        "Billing changed while the provider was being read. Reconcile current billing before applying it.",
      );
      if (effect) await this.fence(client, effect);
      const binding = (
        await client.query(
          "SELECT fan_id,customer_ref,currency FROM creator.commerce_subscription_history WHERE subscription_ref=$1",
          [truth.subscriptionReference],
        )
      ).rows[0];
      invariant(
        !binding ||
          (binding.fan_id === account.fan_id &&
            binding.customer_ref === truth.customerReference &&
            binding.currency === truth.currency),
        "billing_link_conflict",
        "This subscription already belongs to another billing account.",
      );
      invariant(
        !account.subscription_terminal ||
          account.subscription_ref !== truth.subscriptionReference ||
          truth.subscriptionState === "cancelled",
        "subscription_terminal",
        "A terminated subscription cannot restore access; reconcile a verified new purchase.",
      );
      await client.query(
        "INSERT INTO creator.commerce_subscription_history(fan_id,subscription_ref,customer_ref,currency,terminal) VALUES($1,$2,$3,$4,$5) ON CONFLICT(subscription_ref) DO UPDATE SET terminal=creator.commerce_subscription_history.terminal OR excluded.terminal",
        [
          account.fan_id,
          truth.subscriptionReference,
          truth.customerReference,
          truth.currency,
          truth.subscriptionState === "cancelled",
        ],
      );
      await client.query(
        "UPDATE creator.commerce_billing_account SET customer_ref=$2,subscription_ref=$3,subscription_terminal=$4,version=version+1 WHERE fan_id=$1",
        [
          account.fan_id,
          truth.customerReference,
          truth.subscriptionReference,
          truth.subscriptionState === "cancelled",
        ],
      );
      const present: string[] = [];
      for (const line of truth.lines) {
        invariant(
          line.endsAt > line.startsAt,
          "billing_period_invalid",
          "The paid billing period is invalid.",
        );
        await client.query(
          "SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))",
          [`commerce.tier:${line.tierId}`],
        );
        const tier = (
          await client.query(
            "SELECT t.*,cp.verification,cp.recovery_required FROM creator.commerce_tier t JOIN creator.creator_profile cp ON cp.id=t.creator_id WHERE t.id=$1 AND t.creator_id=$2",
            [line.tierId, line.creatorId],
          )
        ).rows[0];
        invariant(
          tier && tier.catalog?.web?.priceReference === line.priceReference,
          "billing_catalog_mismatch",
          "The provider item does not match its configured tier.",
        );
        const reference = `stripe:${line.itemReference}`;
        present.push(reference);
        const prior = (
          await client.query(
            "SELECT * FROM creator.commerce_membership WHERE provider_ref=$1 FOR UPDATE",
            [reference],
          )
        ).rows[0];
        invariant(
          !prior ||
            (prior.fan_id === account.fan_id &&
              prior.creator_id === line.creatorId &&
              prior.tier_id === line.tierId),
          "billing_link_conflict",
          "The paid item changed its account or tier binding.",
        );
        const active =
          ["active", "grace", "cancelled"].includes(line.state) &&
          line.startsAt <= new Date() &&
          line.endsAt > new Date();
        if (active) {
          invariant(
            tier.verification === "verified" && !tier.recovery_required,
            "creator_unavailable",
            "Current creator authority is required before restoring paid access.",
          );
          const storedReceipt = prior
            ? await client.query(
                "SELECT id FROM creator.commerce_membership_receipt WHERE membership_id=$1 AND period_start=$2 AND period_end=$3 LIMIT 1",
                [prior.id, line.startsAt, line.endsAt],
              )
            : undefined;
          invariant(
            line.receipt || storedReceipt?.rowCount,
            "paid_period_unverified",
            "A confirmed receipt for this paid period is required before granting access.",
          );
          invariant(
            !tier.ai_allowance || this.service.policy.costAllowanceIntegrated,
            "allowance_integration_unavailable",
            "Membership access is awaiting allowance integration.",
          );
          const duplicate = await client.query(
            "SELECT id FROM creator.commerce_membership WHERE fan_id=$1 AND tier_id=$2 AND provider_ref<>$3 AND state IN('active','grace','cancelled') AND period_end>now() AND provider_ref=ANY($4::text[])",
            [
              account.fan_id,
              line.tierId,
              reference,
              truth.lines.map((row) => `stripe:${row.itemReference}`),
            ],
          );
          invariant(
            !duplicate.rowCount,
            "duplicate_paid_item",
            "Overlapping paid items need provider reconciliation before access is changed.",
          );
        }
        await client.query(
          "SELECT set_config('app.creator_id',$1,true),set_config('app.fan_id',$2,true)",
          [line.creatorId, account.fan_id],
        );
        invariant(
          !active ||
            prior?.state !== "refunded" ||
            prior.period_start.getTime() !== line.startsAt.getTime(),
          "refunded_period_conflict",
          "A refunded paid period cannot restore access. Reconcile the new purchase separately.",
        );
        let grantId: string | null = prior?.grant_id ?? null;
        if (
          prior?.grant_id &&
          prior.period_start.getTime() === line.startsAt.getTime()
        )
          await client.query(
            "UPDATE creator.access_grant SET state=$2,valid_until=$3,capabilities=$4 WHERE id=$1 AND creator_id=$5 AND fan_id=$6",
            [
              prior.grant_id,
              active ? "active" : "revoked",
              line.endsAt,
              tier.capabilities,
              line.creatorId,
              account.fan_id,
            ],
          );
        else {
          if (prior?.grant_id)
            await client.query(
              "UPDATE creator.access_grant SET state='expired' WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
              [prior.grant_id, line.creatorId, account.fan_id],
            );
          if (active)
            grantId = (
              await client.query<{ id: string }>(
                "INSERT INTO creator.access_grant(creator_id,fan_id,capabilities,source,state,valid_from,valid_until,allowance) VALUES($1,$2,$3,'membership','active',$4,$5,$6) RETURNING id",
                [
                  line.creatorId,
                  account.fan_id,
                  tier.capabilities,
                  line.startsAt,
                  line.endsAt,
                  tier.ai_allowance,
                ],
              )
            ).rows[0]!.id;
        }
        const member = (
          await client.query<{ id: string }>(
            "INSERT INTO creator.commerce_membership(creator_id,fan_id,tier_id,provider,provider_ref,state,period_start,period_end,cancel_at_end,purchased_at,grant_id) VALUES($1,$2,$3,'stripe',$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(provider_ref) DO UPDATE SET state=excluded.state,period_start=excluded.period_start,period_end=excluded.period_end,cancel_at_end=excluded.cancel_at_end,purchased_at=excluded.purchased_at,grant_id=excluded.grant_id,first_used_at=CASE WHEN creator.commerce_membership.period_start=excluded.period_start THEN creator.commerce_membership.first_used_at ELSE NULL END,version=creator.commerce_membership.version+1 RETURNING id",
            [
              line.creatorId,
              account.fan_id,
              line.tierId,
              reference,
              line.state,
              line.startsAt,
              line.endsAt,
              line.cancelAtEnd,
              line.purchasedAt,
              grantId,
            ],
          )
        ).rows[0]!;
        if (line.receipt) {
          const receipt = line.receipt;
          invariant(
            Number.isSafeInteger(receipt.paidMinor) &&
              receipt.paidMinor >= 0 &&
              receipt.currency === truth.currency,
            "billing_receipt_invalid",
            "The actual paid invoice allocation is invalid.",
          );
          await client.query(
            "INSERT INTO creator.commerce_membership_receipt(creator_id,fan_id,membership_id,invoice_ref,line_ref,payment_ref,paid_minor,currency,period_start,period_end) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING",
            [
              line.creatorId,
              account.fan_id,
              member.id,
              receipt.invoiceReference,
              receipt.lineReference,
              receipt.paymentReference,
              receipt.paidMinor,
              receipt.currency,
              line.startsAt,
              line.endsAt,
            ],
          );
          await client.query(
            "INSERT INTO creator.commerce_ledger(creator_id,fan_id,kind,amount,currency,cause,provider_ref,refs) VALUES($1,$2,'capture',$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",
            [
              line.creatorId,
              account.fan_id,
              receipt.paidMinor,
              receipt.currency,
              `invoice_line:${receipt.lineReference}`,
              receipt.paymentReference,
              JSON.stringify({
                membershipId: member.id,
                invoiceId: receipt.invoiceReference,
              }),
            ],
          );
          const refunds = line.refunds ?? [];
          invariant(
            refunds.every(
              (refund) =>
                Number.isSafeInteger(refund.amount) && refund.amount > 0,
            ) &&
              refunds.reduce(
                (sum, refund) => sum + BigInt(refund.amount),
                0n,
              ) <= BigInt(receipt.paidMinor),
            "billing_refund_invalid",
            "Confirmed refunds must reconcile with the actual paid line.",
          );
          for (const refund of refunds) {
            await client.query(
              "INSERT INTO creator.commerce_ledger(creator_id,fan_id,kind,amount,currency,cause,provider_ref,refs) VALUES($1,$2,'refund',$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",
              [
                line.creatorId,
                account.fan_id,
                refund.amount,
                receipt.currency,
                refund.cause,
                refund.reference,
                JSON.stringify({
                  membershipId: member.id,
                  invoiceId: receipt.invoiceReference,
                }),
              ],
            );
          }
        }
      }
      const removed = (
        await client.query(
          "UPDATE creator.commerce_membership SET state='revoked',version=version+1 WHERE fan_id=$1 AND provider='stripe' AND NOT(provider_ref=ANY($2::text[])) AND state IN('active','grace','cancelled') RETURNING creator_id,grant_id",
          [account.fan_id, present],
        )
      ).rows;
      for (const row of removed) {
        await client.query(
          "SELECT set_config('app.creator_id',$1,true),set_config('app.fan_id',$2,true)",
          [row.creator_id, account.fan_id],
        );
        if (row.grant_id)
          await client.query(
            "UPDATE creator.access_grant SET state='revoked' WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
            [row.grant_id, row.creator_id, account.fan_id],
          );
      }
    });
  }
}
