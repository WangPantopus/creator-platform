import { z } from "zod";
import type { PoolClient } from "pg";
import type { Actor } from "../identity/adapter.js";
import type { CommerceService } from "./service.js";
import type { PassCommerce } from "./pass.js";
import { contentHash } from "../../core/canonical.js";
import { invariant } from "../../core/errors.js";
import {
  PassPurchaseStart,
  PassPurchaseCancel,
  PassRenewalActivation,
  VerifiedPassQuote,
  type PassPurchaseMutation,
  type StripePassPurchases,
} from "./stripe-pass-purchases.js";

export const PASS_PURCHASE_MIGRATION_VERSION = "0054_w4_pass_purchase_effects";
type Authority = (actor: Actor, client: PoolClient) => Promise<void>;
export type PassRenewalAuthority = (
  actor: Actor,
  client: PoolClient,
  originalQuote: z.infer<typeof VerifiedPassQuote>,
) => Promise<boolean>;
type Account = {
  fan_id: string;
  currency: string;
  desired_renewal: boolean;
  version: number;
  subscription_ref: string | null;
  customer_ref: string | null;
};
type Effect = {
  id: string;
  fan_id: string;
  operation: "start" | "activate_renewal" | "cancel" | "compensate_cancel";
  provider_key: string;
  request: unknown;
  request_hash: string;
  intent_version: number;
  attempt: number;
  provider_ref: string | null;
  state: string;
  retention_policy_version: string;
};
const StartCommand = z.strictObject({
  quoteId: z.uuid(),
  version: z.number().int().positive(),
  paymentMethodId: PassPurchaseStart.shape.paymentMethodId,
  renewalConsent: z.literal(true),
  idempotencyKey: z.string().min(8).max(128),
});
const CancelCommand = z.strictObject({
  version: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(128),
});

/** The immutable journal owns fan intent and provider effects. Its live same-
 * transaction authority is mandatory; a saved account ID is never a job issuer.
 * Preparation verifies installed canonical custody before any method is usable. */
export class PassPurchaseJournal {
  private constructor(
    private readonly service: CommerceService,
    private readonly pass: PassCommerce,
    private readonly provider: StripePassPurchases,
    private readonly authority: Authority,
    private readonly renewalAuthority: PassRenewalAuthority,
    private readonly currency: string,
    private readonly retentionPolicyVersion: string,
  ) {}
  static async prepare(input: {
    service: CommerceService;
    pass: PassCommerce;
    provider: StripePassPurchases;
    authority: Authority;
    /** Current reviewed renewal/spending/country/denial rules, held through
     * this transaction. False cancels renewal under that approved policy. */
    renewalAuthority: PassRenewalAuthority;
    currency: string;
    retentionPolicyVersion: string;
    assertPrivacyRegistered: () => Promise<void>;
    /** Host validates the installed0055/current-money/pool composition before
     * pass marketing or recurring purchase can become available. */
    assertPoolRegistered: () => Promise<void>;
    migration: { version: string; checksum: string };
  }) {
    invariant(
      input.migration.version === PASS_PURCHASE_MIGRATION_VERSION &&
        /^[a-f0-9]{64}$/u.test(input.migration.checksum),
      "pass_schema_unconfigured",
      "The exact canonical pass journal installation is required.",
    );
    const installed = (
      await input.service.pool.query<{ checksum: string }>(
        "SELECT checksum FROM creator.schema_migration WHERE version=$1",
        [input.migration.version],
      )
    ).rows[0];
    const schema = (
      await input.service.pool.query<{ ready: boolean }>(
        "SELECT count(*)=4 AS ready FROM information_schema.tables WHERE table_schema='creator' AND table_name IN('commerce_pass_billing_account','commerce_pass_quote','commerce_pass_billing_effect','commerce_pass_receipt')",
      )
    ).rows[0];
    invariant(
      installed?.checksum === input.migration.checksum &&
        schema?.ready &&
        typeof input.authority === "function" &&
        typeof input.renewalAuthority === "function" &&
        input.retentionPolicyVersion.length > 0 &&
        input.retentionPolicyVersion.length <= 200 &&
        typeof input.assertPrivacyRegistered === "function" &&
        typeof input.assertPoolRegistered === "function" &&
        /^[A-Z]{3}$/u.test(input.currency),
      "pass_schema_unconfigured",
      "The complete canonical pass journal and current authority are required.",
    );
    await input.assertPrivacyRegistered();
    await input.assertPoolRegistered();
    return new PassPurchaseJournal(
      input.service,
      input.pass,
      input.provider,
      input.authority,
      input.renewalAuthority,
      input.currency,
      input.retentionPolicyVersion,
    );
  }
  get configured() {
    return (
      this.pass.configured &&
      this.service.policy.costAllowanceIntegrated === true
    );
  }
  private async account(client: PoolClient, actor: Actor): Promise<Account> {
    await this.authority(actor, client);
    const fan = (
      await client.query<{ id: string }>(
        "SELECT id FROM creator.fan_profile WHERE account_id=$1",
        [actor.accountId],
      )
    ).rows[0];
    invariant(fan, "fan_profile_required", "Set up your fan profile first.");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `pass:${fan.id}`,
    ]);
    await client.query(
      "INSERT INTO creator.commerce_pass_billing_account(fan_id,currency,retention_policy_version) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [fan.id, this.currency, this.retentionPolicyVersion],
    );
    const row = (
      await client.query<Account>(
        "SELECT * FROM creator.commerce_pass_billing_account WHERE fan_id=$1 FOR UPDATE",
        [fan.id],
      )
    ).rows[0]!;
    invariant(
      row.currency === this.currency,
      "pass_currency_changed",
      "Reconcile the original purchased currency before changing the pass.",
    );
    return row;
  }
  async quote(actor: Actor) {
    invariant(
      this.configured,
      "pass_unavailable",
      "The pass is not available yet.",
    );
    const before = await this.service.account(actor, (client) =>
      this.account(client, actor),
    );
    const quote = VerifiedPassQuote.parse(
      await this.provider.quote(
        actor,
        before.fan_id,
        before.customer_ref ?? undefined,
        before.subscription_ref ?? undefined,
      ),
    );
    return this.service.account(actor, async (client) => {
      const current = await this.account(client, actor);
      invariant(
        current.version === before.version &&
          quote.currency === current.currency &&
          quote.configurationHash === this.provider.configurationHash &&
          new Date(quote.expiresAt) > new Date(),
        "pass_quote_changed",
        "The pass quote changed. Fetch its current price again.",
      );
      const pending = await client.query(
        "SELECT id FROM creator.commerce_pass_billing_effect WHERE fan_id=$1 AND state IN('pending','processing','unknown')",
        [current.fan_id],
      );
      invariant(
        !pending.rowCount,
        "pass_processing",
        "Reconcile the original pass purchase before quoting another.",
      );
      const row = (
        await client.query<{ id: string }>(
          "INSERT INTO creator.commerce_pass_quote(fan_id,account_version,configuration_hash,currency,amount,monthly_amount,quoted_at,expires_at,period_end,provider_preview_ref,body,body_hash,retention_policy_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id",
          [
            current.fan_id,
            current.version,
            quote.configurationHash,
            quote.currency,
            quote.amount,
            quote.monthlyAmount,
            quote.createdAt,
            quote.expiresAt,
            quote.periodEndsAt,
            quote.providerPreviewReference,
            JSON.stringify(quote),
            contentHash(quote),
            this.retentionPolicyVersion,
          ],
        )
      ).rows[0]!;
      return { quoteId: row.id, version: current.version, ...quote };
    });
  }
  async status(actor: Actor) {
    return this.service.account(actor, async (client) => {
      const account = await this.account(client, actor);
      const effects = (
        await client.query<{ id: string; state: string; operation: string }>(
          "SELECT id,state,operation FROM creator.commerce_pass_billing_effect WHERE fan_id=$1 AND state IN('pending','processing','unknown') ORDER BY created_at,id LIMIT 50",
          [account.fan_id],
        )
      ).rows;
      return {
        version: account.version,
        currency: account.currency,
        desiredRenewal: account.desired_renewal,
        processing: effects.length > 0,
        effects,
      };
    });
  }
  async start(actor: Actor, raw: unknown) {
    const body = StartCommand.parse(raw);
    const effectId = await this.service.account(actor, (client) =>
      this.service.command(
        client,
        actor,
        "pass.purchase",
        body.idempotencyKey,
        body,
        async () => {
          invariant(
            this.configured,
            "pass_unavailable",
            "The pass is not available yet.",
          );
          const account = await this.account(client, actor);
          const row = (
            await client.query<{
              body: unknown;
              body_hash: string;
              account_version: number;
            }>(
              "SELECT body,body_hash,account_version FROM creator.commerce_pass_quote WHERE id=$1 AND fan_id=$2",
              [body.quoteId, account.fan_id],
            )
          ).rows[0];
          invariant(
            row &&
              row.account_version === account.version &&
              account.version === body.version,
            "pass_quote_changed",
            "Refresh the current pass quote before confirming.",
          );
          const quote = VerifiedPassQuote.parse(row.body);
          invariant(
            contentHash(quote) === row.body_hash &&
              quote.configurationHash === this.provider.configurationHash &&
              new Date(quote.expiresAt) > new Date(),
            "pass_quote_expired",
            "The original price expired. Review a fresh quote before purchasing.",
          );
          const pending = await client.query(
            "SELECT id FROM creator.commerce_pass_billing_effect WHERE fan_id=$1 AND state IN('pending','processing','unknown')",
            [account.fan_id],
          );
          invariant(
            !pending.rowCount,
            "pass_processing",
            "Wait for the current purchase to reconcile.",
          );
          await this.service.checkSpend(
            client,
            account.fan_id,
            quote.amount,
            quote.currency,
          );
          const request = PassPurchaseStart.parse({
            key: `pass:${account.fan_id}:${body.idempotencyKey}`,
            fanId: account.fan_id,
            configurationHash: quote.configurationHash,
            paymentMethodId: body.paymentMethodId,
            firstInvoiceAmount: quote.amount,
            createdAt: quote.createdAt,
            periodEndsAt: quote.periodEndsAt,
            ...(quote.customerReference
              ? { customerReference: quote.customerReference }
              : {}),
            ...(quote.replacesReference
              ? { replacesReference: quote.replacesReference }
              : {}),
          });
          await client.query(
            "UPDATE creator.commerce_pass_billing_account SET desired_renewal=true,version=version+1 WHERE fan_id=$1",
            [account.fan_id],
          );
          return this.insert(
            client,
            account.fan_id,
            "start",
            request,
            account.version + 1,
            body.quoteId,
          );
        },
      ),
    );
    return this.run(actor, effectId);
  }
  async cancel(actor: Actor, raw: unknown) {
    const body = CancelCommand.parse(raw);
    const effectId = await this.service.account(actor, (client) =>
      this.service.command(
        client,
        actor,
        "pass.cancel",
        body.idempotencyKey,
        body,
        async () => {
          const account = await this.account(client, actor);
          invariant(
            account.version === body.version,
            "pass_changed",
            "Refresh the current pass before cancelling renewal.",
          );
          await client.query(
            "UPDATE creator.commerce_pass_billing_account SET desired_renewal=false,version=version+1 WHERE fan_id=$1",
            [account.fan_id],
          );
          if (!account.subscription_ref) {
            const pending = await client.query(
              "SELECT id FROM creator.commerce_pass_billing_effect WHERE fan_id=$1 AND operation='start' AND state IN('pending','processing','unknown')",
              [account.fan_id],
            );
            return { id: null, processing: Boolean(pending.rowCount) };
          }
          return {
            id: await this.insert(
              client,
              account.fan_id,
              "cancel",
              PassPurchaseCancel.parse({
                key: `pass-cancel:${account.fan_id}:${body.idempotencyKey}`,
                fanId: account.fan_id,
                configurationHash: this.provider.configurationHash,
                reference: account.subscription_ref,
              }),
              account.version + 1,
            ),
            processing: true,
          };
        },
      ),
    );
    return effectId.id
      ? this.run(actor, effectId.id)
      : { processing: effectId.processing, cancellationRequested: true };
  }
  private async insert(
    client: PoolClient,
    fanId: string,
    operation: Effect["operation"],
    request: { key: string },
    version: number,
    quoteId?: string,
  ): Promise<string> {
    const hash = contentHash(request);
    const inserted = (
      await client.query<{ id: string }>(
        "INSERT INTO creator.commerce_pass_billing_effect(fan_id,operation,provider_key,request,request_hash,intent_version,quote_id,retention_policy_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(provider_key) DO NOTHING RETURNING id",
        [
          fanId,
          operation,
          request.key,
          JSON.stringify(request),
          hash,
          version,
          quoteId ?? null,
          this.retentionPolicyVersion,
        ],
      )
    ).rows[0];
    if (inserted) return inserted.id;
    const prior = (
      await client.query<Effect>(
        "SELECT * FROM creator.commerce_pass_billing_effect WHERE provider_key=$1",
        [request.key],
      )
    ).rows[0];
    invariant(
      prior &&
        prior.fan_id === fanId &&
        prior.operation === operation &&
        prior.request_hash === hash &&
        prior.intent_version === version,
      "pass_original_request_changed",
      "The original pass effect changed. Reconcile its stored request.",
    );
    return prior.id;
  }
  async drain(actor: Actor) {
    const rows = await this.service.account(actor, async (client) => {
      const account = await this.account(client, actor);
      return (
        await client.query<{ id: string }>(
          "SELECT id FROM creator.commerce_pass_billing_effect WHERE fan_id=$1 AND state IN('pending','processing','unknown') AND next_at<=now() ORDER BY created_at,id LIMIT 50",
          [account.fan_id],
        )
      ).rows;
    });
    const results = [];
    for (const row of rows) results.push(await this.run(actor, row.id));
    return results;
  }
  async run(
    actor: Actor,
    id: string,
  ): Promise<{ processing: boolean; effectId: string; clientSecret?: string }> {
    z.uuid().parse(id);
    let cancelledActivation = false;
    const claimed = await this.service.account(actor, async (client) => {
      const account = await this.account(client, actor);
      const effect = (
        await client.query<Effect>(
          "UPDATE creator.commerce_pass_billing_effect SET state='processing',attempt=attempt+1,lease_until=now()+interval '30 seconds',updated_at=now() WHERE id=$1 AND fan_id=$2 AND state IN('pending','processing','unknown') AND next_at<=now() AND (lease_until IS NULL OR lease_until<now()) RETURNING *",
          [id, account.fan_id],
        )
      ).rows[0];
      if (!effect) {
        const prior = (
          await client.query<{ state: string }>(
            "SELECT state FROM creator.commerce_pass_billing_effect WHERE id=$1 AND fan_id=$2",
            [id, account.fan_id],
          )
        ).rows[0];
        invariant(
          prior,
          "pass_effect_unavailable",
          "This pass change is unavailable.",
        );
        return {
          effect: null,
          processing: !["done", "failed"].includes(prior.state),
        };
      }
      invariant(
        contentHash(effect.request) === effect.request_hash,
        "pass_original_request_changed",
        "The original pass effect body changed.",
      );
      if (
        effect.operation === "activate_renewal" &&
        (!account.desired_renewal ||
          account.version !== effect.intent_version ||
          !(await this.renewalAllowed(actor, client, effect)))
      ) {
        const request = PassRenewalActivation.parse(effect.request);
        if (account.desired_renewal) {
          await client.query(
            "UPDATE creator.commerce_pass_billing_account SET desired_renewal=false,version=version+1 WHERE fan_id=$1",
            [account.fan_id],
          );
          account.desired_renewal = false;
          account.version++;
        }
        await this.compensate(client, account, request.reference);
        if (effect.attempt > 1) {
          cancelledActivation = true;
          return { effect, processing: true };
        }
        await client.query(
          "UPDATE creator.commerce_pass_billing_effect SET state='failed',lease_until=NULL,error_code='renewal_superseded' WHERE id=$1 AND attempt=$2 AND state='processing'",
          [id, effect.attempt],
        );
        return { effect: null, processing: true };
      }
      return { effect, processing: true };
    });
    if (!claimed.effect)
      return { effectId: id, processing: claimed.processing };
    const effect = claimed.effect;
    try {
      let result: PassPurchaseMutation;
      if (effect.operation === "start")
        result = await this.provider.start(actor, effect.request);
      else if (effect.operation === "activate_renewal")
        result = cancelledActivation
          ? await this.provider.recoverRenewal(actor, effect.request)
          : await this.provider.activateRenewal(actor, effect.request);
      else result = await this.provider.cancel(actor, effect.request);
      // Access uses actual current provider truth through the existing pass
      // version fence. Financial effects are not proof of an enabled roster.
      await this.pass.reconcile(actor, result.reference, async (client) => {
        await this.account(client, actor);
        await this.fence(client, effect);
      });
      const processing = await this.service.account(actor, async (client) => {
        const account = await this.account(client, actor);
        await this.fence(client, effect);
        invariant(
          result.period.accountId === actor.accountId &&
            result.reference === result.period.reference,
          "pass_account_mismatch",
          "The provider result belongs to another account.",
        );
        if (effect.operation === "start") {
          const request = PassPurchaseStart.parse(effect.request);
          invariant(
            !account.customer_ref ||
              account.customer_ref === result.customerReference,
            "pass_link_conflict",
            "The purchased pass belongs to another billing customer.",
          );
          invariant(
            !account.subscription_ref ||
              account.subscription_ref === result.reference ||
              (account.subscription_ref === request.replacesReference &&
                (account.version === effect.intent_version ||
                  !account.desired_renewal)),
            "pass_link_conflict",
            "Reconcile the original pass purchase before linking another.",
          );
          await client.query(
            "UPDATE creator.commerce_pass_billing_account SET subscription_ref=$2,customer_ref=$3 WHERE fan_id=$1",
            [account.fan_id, result.reference, result.customerReference],
          );
        } else
          invariant(
            account.subscription_ref === result.reference,
            "pass_link_conflict",
            "The original purchased pass changed.",
          );
        if (result.receipt) await this.receipt(client, account, effect, result);
        let pending =
          result.processing || result.cancellationCompensationRequired;
        if (
          account.desired_renewal &&
          result.renewalEnabled &&
          !(await this.renewalAllowed(actor, client, effect))
        ) {
          await client.query(
            "UPDATE creator.commerce_pass_billing_account SET desired_renewal=false,version=version+1 WHERE fan_id=$1",
            [account.fan_id],
          );
          account.desired_renewal = false;
          account.version++;
        }
        if (!account.desired_renewal && result.renewalEnabled) {
          // An older cancel key may already have completed before this late
          // activation reached Stripe. Persist a new fenced compensation key;
          // replaying the old completed key cannot undo the later write.
          await client.query(
            "UPDATE creator.commerce_pass_billing_account SET version=version+1 WHERE fan_id=$1",
            [account.fan_id],
          );
          account.version++;
          await this.compensate(client, account, result.reference);
          pending = true;
        } else if (
          effect.operation === "start" &&
          result.receipt &&
          result.state === "paid" &&
          account.desired_renewal &&
          !result.renewalEnabled &&
          result.processing &&
          account.version === effect.intent_version
        ) {
          await this.insert(
            client,
            account.fan_id,
            "activate_renewal",
            PassRenewalActivation.parse({
              key: `pass-renewal:${effect.id}`,
              fanId: account.fan_id,
              configurationHash: this.provider.configurationHash,
              reference: result.reference,
              start: effect.request,
            }),
            account.version,
          );
          pending = true;
        } else if (
          !account.desired_renewal &&
          !result.renewalEnabled &&
          result.state !== "processing"
        )
          pending = false;
        // A prior attempt can reach Stripe after a cancel callback. Retain
        // read-only recovery until terminal subscription truth makes that old
        // recurring write impossible. An absent marker cannot close uncertainty.
        if (cancelledActivation) pending = !result.subscriptionTerminal;
        await client.query(
          "UPDATE creator.commerce_pass_billing_effect SET state=$3,provider_ref=$4,lease_until=NULL,next_at=now()+interval '30 seconds',error_code=NULL,updated_at=now() WHERE id=$1 AND attempt=$2 AND state='processing'",
          [
            id,
            effect.attempt,
            pending
              ? "processing"
              : result.state === "failed"
                ? "failed"
                : "done",
            result.reference,
          ],
        );
        return pending;
      });
      return {
        effectId: id,
        processing,
        ...(processing && result.clientSecret
          ? { clientSecret: result.clientSecret }
          : {}),
      };
    } catch (error) {
      // Any effect may have reached Stripe before an exception. Retain its
      // original hold/reference/body and reconcile; never infer rejected cash.
      await this.service.account(actor, async (client) => {
        await this.account(client, actor);
        await client.query(
          "UPDATE creator.commerce_pass_billing_effect SET state='unknown',lease_until=NULL,next_at=now()+interval '30 seconds',error_code='provider_reconciliation_required',updated_at=now() WHERE id=$1 AND attempt=$2 AND state='processing'",
          [id, effect.attempt],
        );
      });
      throw error;
    }
  }
  private async fence(client: PoolClient, effect: Effect) {
    const held = await client.query(
      "SELECT id FROM creator.commerce_pass_billing_effect WHERE id=$1 AND fan_id=$2 AND attempt=$3 AND state='processing' AND lease_until>now() FOR UPDATE",
      [effect.id, effect.fan_id, effect.attempt],
    );
    invariant(
      held.rowCount === 1,
      "pass_attempt_superseded",
      "A newer pass worker owns this recovery.",
    );
  }
  private compensate(client: PoolClient, account: Account, reference: string) {
    return this.insert(
      client,
      account.fan_id,
      "compensate_cancel",
      PassPurchaseCancel.parse({
        key: `pass-compensate:${account.fan_id}:${account.version}`,
        fanId: account.fan_id,
        configurationHash: this.provider.configurationHash,
        reference,
      }),
      account.version,
    );
  }
  private async renewalAllowed(
    actor: Actor,
    client: PoolClient,
    effect: Effect,
  ) {
    if (effect.operation !== "start" && effect.operation !== "activate_renewal")
      return false;
    const start =
      effect.operation === "start"
        ? PassPurchaseStart.parse(effect.request)
        : PassRenewalActivation.parse(effect.request).start;
    const row = (
      await client.query<{ body: unknown; body_hash: string }>(
        "SELECT q.body,q.body_hash FROM creator.commerce_pass_quote q JOIN creator.commerce_pass_billing_effect e ON e.quote_id=q.id AND e.fan_id=q.fan_id WHERE e.fan_id=$1 AND e.operation='start' AND e.provider_key=$2",
        [effect.fan_id, start.key],
      )
    ).rows[0];
    invariant(
      row && contentHash(row.body) === row.body_hash,
      "pass_quote_changed",
      "The original renewal consent quote is unavailable.",
    );
    const quote = VerifiedPassQuote.parse(row.body);
    invariant(
      quote.configurationHash === start.configurationHash,
      "pass_original_request_changed",
      "The original purchased renewal terms changed.",
    );
    return (await this.renewalAuthority(actor, client, quote)) === true;
  }
  private async receipt(
    client: PoolClient,
    account: Account,
    effect: Effect,
    result: PassPurchaseMutation,
  ) {
    const receipt = result.receipt!;
    invariant(
      receipt.currency === account.currency &&
        receipt.lines.length > 0 &&
        receipt.lines.reduce((n, line) => n + BigInt(line.paidMinor), 0n) ===
          BigInt(receipt.paidMinor),
      "pass_cash_invalid",
      "The exact original pass cash needs reconciliation.",
    );
    for (const line of receipt.lines) {
      const refs = {
        passSubscription: result.reference,
        invoice: receipt.invoiceReference,
        line: line.lineReference,
        effectId: effect.id,
      };
      const prior = (
        await client.query(
          "SELECT * FROM creator.commerce_pass_receipt WHERE line_ref=$1",
          [line.lineReference],
        )
      ).rows[0];
      invariant(
        !prior ||
          (prior.fan_id === account.fan_id &&
            prior.subscription_ref === result.reference &&
            prior.invoice_ref === receipt.invoiceReference &&
            prior.payment_ref === receipt.paymentReference &&
            BigInt(prior.paid_minor) === BigInt(line.paidMinor) &&
            prior.currency === receipt.currency &&
            prior.paid_at.toISOString() === receipt.paidAt &&
            prior.period_start.toISOString() === line.startsAt &&
            prior.period_end.toISOString() === line.endsAt),
        "pass_cash_changed",
        "The immutable pass receipt changed. Reconcile an adjustment cause.",
      );
      await client.query(
        "INSERT INTO creator.commerce_pass_receipt(fan_id,subscription_ref,invoice_ref,line_ref,payment_ref,paid_minor,currency,period_start,period_end,paid_at,retention_policy_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(line_ref) DO NOTHING",
        [
          account.fan_id,
          result.reference,
          receipt.invoiceReference,
          line.lineReference,
          receipt.paymentReference,
          line.paidMinor,
          receipt.currency,
          line.startsAt,
          line.endsAt,
          receipt.paidAt,
          effect.retention_policy_version,
        ],
      );
      await this.ledger(
        client,
        account.fan_id,
        "capture",
        line.paidMinor,
        receipt.currency,
        `pass-cash:${line.lineReference}`,
        receipt.paymentReference,
        refs,
        receipt.paidAt,
      );
      for (const refund of line.refunds)
        await this.ledger(
          client,
          account.fan_id,
          "refund",
          refund.amount,
          receipt.currency,
          `pass-refund:${line.lineReference}:${refund.reference}`,
          refund.reference,
          { ...refs, providerCause: refund.cause },
        );
    }
  }
  private async ledger(
    client: PoolClient,
    fanId: string,
    kind: "capture" | "refund",
    amount: number,
    currency: string,
    cause: string,
    reference: string,
    refs: unknown,
    paidAt?: string,
  ) {
    invariant(
      Number.isSafeInteger(amount) && amount > 0,
      "pass_cash_invalid",
      "Verified card cash is required.",
    );
    const prior = (
      await client.query(
        "SELECT fan_id,amount,currency,provider_ref FROM creator.commerce_ledger WHERE kind=$1 AND cause=$2",
        [kind, cause],
      )
    ).rows[0];
    invariant(
      !prior ||
        (prior.fan_id === fanId &&
          BigInt(prior.amount) === BigInt(amount) &&
          prior.currency === currency &&
          prior.provider_ref === reference),
      "pass_cash_changed",
      "A pass ledger cause changed. Reconcile its actual adjustment.",
    );
    await client.query(
      "INSERT INTO creator.commerce_ledger(fan_id,kind,amount,currency,cause,provider_ref,refs,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,coalesce($8::timestamptz,now())) ON CONFLICT DO NOTHING",
      [
        fanId,
        kind,
        amount,
        currency,
        cause,
        reference,
        JSON.stringify(refs),
        paidAt ?? null,
      ],
    );
  }
}
