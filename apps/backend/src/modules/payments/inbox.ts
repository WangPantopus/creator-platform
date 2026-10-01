import { Router, raw } from "express";
import type { Pool } from "pg";
import { verifyStripeWebhook } from "./provider.js";
import { invariant } from "../../core/errors.js";
import type { Actor } from "../identity/adapter.js";
import type { CommerceService } from "../commerce/service.js";

/** This pool has only INSERT on the minimal provider inbox, never domain owner privileges. */
export function createStripeInboxRouter(
  pool: Pool,
  signingSecret: string,
  collectionAccount = "platform",
) {
  invariant(
    signingSecret.startsWith("whsec_"),
    "webhook_unconfigured",
    "Notification verification is not configured.",
  );
  const router = Router();
  router.post(
    "/",
    raw({ type: "application/json", limit: "256kb" }),
    async (req, res) => {
      invariant(
        Buffer.isBuffer(req.body),
        "raw_body_required",
        "The raw notification body is required.",
      );
      const event = verifyStripeWebhook(
        req.body,
        req.get("Stripe-Signature") ?? "",
        signingSecret,
      );
      invariant(
        event.account === collectionAccount,
        "webhook_account_mismatch",
        "The notification belongs to another collection account.",
      );
      await pool.query(
        "INSERT INTO creator.commerce_provider_inbox(provider,event_id,event_type,object_ref) VALUES('stripe',$1,$2,$3) ON CONFLICT DO NOTHING",
        [event.id, event.type, event.reference],
      );
      res.sendStatus(204);
    },
  );
  return router;
}

export type CommerceWorkScope = Readonly<
  | { actor: Actor; kind?: "packet"; packetId: string }
  | { actor: Actor; kind: "billing" }
  | { actor: Actor; kind: "pass" }
  | { actor: Actor; kind: "payout"; effectId: string }
>;
export interface CommerceWorkIndex {
  // Issued by the configured identity/operations adapter. No public caller supplies an actor.
  dueScopes(limit: number): Promise<readonly CommerceWorkScope[]>;
  notificationScope(
    type: string,
    reference: string,
  ): Promise<CommerceWorkScope | null>;
  unknownCase(scope: CommerceWorkScope, cause: string): Promise<void>;
}
/** W8 supplies a non-owner inbox worker pool and current issued identity scopes. */
export class CommerceRecoveryWorker {
  constructor(
    private readonly inbox: Pool,
    private readonly service: CommerceService,
    private readonly index: CommerceWorkIndex,
    private readonly recovery?: {
      billing?: import("../commerce/billing.js").MembershipBilling;
      pass?: import("../commerce/extended.js").ExtendedCommerce;
      payout?: import("../commerce/accounting.js").CreatorSettlement;
    },
  ) {}
  private async reconcileScope(scope: CommerceWorkScope) {
    if (scope.kind === "billing") {
      invariant(
        this.recovery?.billing,
        "billing_recovery_unavailable",
        "Billing recovery is not configured.",
      );
      await this.recovery.billing.reconcile(scope.actor);
    } else if (scope.kind === "pass") {
      invariant(
        this.recovery?.pass,
        "pass_recovery_unavailable",
        "Pass recovery is not configured.",
      );
      await this.recovery.pass.transitionPass(scope.actor);
    } else if (scope.kind === "payout") {
      invariant(
        this.recovery?.payout,
        "payout_recovery_unavailable",
        "Payout recovery is not configured.",
      );
      await this.recovery.payout.run(scope.actor, scope.effectId);
    } else {
      await this.service.reconcileDeadlines(scope.actor);
      await this.service.reconcile(scope.actor, scope.packetId);
    }
  }
  async tick() {
    const notification = (
      await this.inbox.query<{
        event_id: string;
        event_type: string;
        object_ref: string;
        attempt: number;
      }>(
        `UPDATE creator.commerce_provider_inbox SET state='processing',lease_until=now()+interval '30 seconds',attempt=attempt+1 WHERE (provider,event_id) IN (SELECT provider,event_id FROM creator.commerce_provider_inbox WHERE provider='stripe' AND state IN ('pending','processing') AND (lease_until IS NULL OR lease_until<now()) ORDER BY received_at LIMIT 25 FOR UPDATE SKIP LOCKED) RETURNING event_id,event_type,object_ref,attempt`,
      )
    ).rows;
    for (const event of notification) {
      try {
        const scope = await this.index.notificationScope(
          event.event_type,
          event.object_ref,
        );
        invariant(
          scope,
          "notification_scope_unavailable",
          "Current payment scope needs reconciliation.",
        );
        // Event age/order never dictates state. The service fetches the current provider object.
        await this.reconcileScope(scope);
        await this.inbox.query(
          "UPDATE creator.commerce_provider_inbox SET state='done',lease_until=NULL,error_code=NULL WHERE provider='stripe' AND event_id=$1 AND attempt=$2 AND state='processing'",
          [event.event_id, event.attempt],
        );
      } catch {
        await this.inbox.query(
          "UPDATE creator.commerce_provider_inbox SET state='pending',lease_until=now()+interval '1 minute',error_code='current_state_unavailable' WHERE provider='stripe' AND event_id=$1 AND attempt=$2 AND state='processing'",
          [event.event_id, event.attempt],
        );
      }
    }
    for (const scope of await this.index.dueScopes(50)) {
      try {
        await this.reconcileScope(scope);
        if (scope.kind && scope.kind !== "packet") continue;
        const current = await this.service.packet(scope.actor, scope.packetId);
        if (
          current.packet.payment_state === "unknown" &&
          Date.now() - current.packet.created_at.getTime() > 3600000
        )
          await this.index.unknownCase(scope, "money_unknown_over_one_hour");
      } catch {
        await this.index.unknownCase(scope, "reconciliation_incomplete");
      }
    }
  }
}
