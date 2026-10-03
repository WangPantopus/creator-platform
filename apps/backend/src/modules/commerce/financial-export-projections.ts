import type { PoolClient } from "pg";
import { invariant } from "../../core/errors.js";

/** Reviewed financial fields only. A new database column cannot silently
 * become part of either the inline or staged account export. These selects
 * supply no task authority and retain the original account/family RLS. */
const selects = Object.freeze({
  commerce_commitment:
    "SELECT id,packet_id,creator_id,fan_id,mode,state,due_at,delivered_at,delivered_message_id,evidence,outcome,dispute_open,payout_release_at,version FROM creator.commerce_commitment",
  commerce_fulfillment_member:
    "SELECT plan_id,plan_revision,packet_id,commitment_id,creator_id,fan_id,thread_id,packet_version,commitment_version,mode_id,mode_version,acceptance_id,acceptance_hash,request_hash,consent_hash,capture_id,capture_hash FROM creator.commerce_fulfillment_member",
  commerce_group_delivery:
    "SELECT plan_id,plan_revision,packet_id,creator_id,fan_id,thread_id,message_id,content_id,content_version,publication_signed_act_id,created_at FROM creator.commerce_group_delivery",
  commerce_review_attestation:
    "SELECT id,packet_id,commitment_id,creator_id,fan_id,thread_id,packet_version,commitment_version,request_hash,acceptance_id,capture_id,capture_hash,reviewer_account_id,signed_act_id,command_hash,statement,created_at FROM creator.commerce_review_attestation",
  commerce_reply_draft:
    "SELECT id,thread_id,creator_id,fan_id,source_message_id,source_message_version,text,version,created_at,updated_at FROM creator.commerce_reply_draft",
  commerce_approval:
    "SELECT id,draft_id,draft_version,thread_id,creator_id,fan_id,approver_account_id,role,signed_act_id,content_hash,text,command,approved_at,creator_epoch,key_epoch,invalidated_at,invalidated_reason,delivered_message_id FROM creator.commerce_approval",
  commerce_share_grant:
    "SELECT id,commitment_id,creator_id,fan_id,fan_choice,creator_permission,handle_display,revoked_at,version FROM creator.commerce_share_grant",
  commerce_membership:
    "SELECT id,creator_id,fan_id,tier_id,provider,provider_ref,state,period_start,period_end,grace_end,cancel_at_end,first_used_at,purchased_at,grant_id,version FROM creator.commerce_membership",
  commerce_membership_receipt:
    "SELECT id,creator_id,fan_id,membership_id,invoice_ref,line_ref,payment_ref,paid_minor,currency,period_start,period_end,created_at FROM creator.commerce_membership_receipt",
  commerce_membership_usage:
    "SELECT creator_id,fan_id,membership_id,evidence_id,kind,used_at FROM creator.commerce_membership_usage",
  commerce_pass_slot:
    "SELECT id,pass_id,fan_id,creator_id,cycle_start,position,state,starts_at,ends_at,replacement_of,grant_id FROM creator.commerce_pass_slot",
  commerce_trial:
    "SELECT creator_id,fan_id,grant_id,opened_at FROM creator.commerce_trial",
  commerce_credit_transfer:
    "SELECT id,fan_id,creator_id,amount,currency,checkout_ref,state,created_at FROM creator.commerce_credit_transfer",
  commerce_paid_coverage:
    "SELECT id,creator_id,fan_id,membership_id,provider,proof_reference,period_start,period_end,qualification,proof_hash,retention_policy_version,observed_at FROM creator.commerce_paid_coverage",
  commerce_paid_coverage_denial:
    "SELECT id,creator_id,fan_id,membership_id,provider,proof_reference,reason,proof_hash,retention_policy_version,observed_at FROM creator.commerce_paid_coverage_denial",
  commerce_mode:
    "SELECT id,creator_id,kind,title,amount,public_amount,currency,decision_hours,delivery_hours,duration_seconds,weekly_limit,eligibility,shareable,state,version FROM creator.commerce_mode",
  commerce_capacity:
    "SELECT mode_id,creator_id,window_start,window_end,capacity_limit,used,reserved,version FROM creator.commerce_capacity",
  commerce_tier:
    "SELECT id,creator_id,name,capabilities,ai_allowance,catalog,state,version FROM creator.commerce_tier",
  commerce_pool_cycle:
    "SELECT cycle,currency,pool_minor,policy_version,source_reference,snapshot_hash,created_at FROM creator.commerce_pool_cycle",
  commerce_spend_limit:
    "SELECT fan_id,currency,amount,explicit_none,pending_amount,pending_none,effective_at,reminders_on,version FROM creator.commerce_spend_limit",
  commerce_spending_notice:
    "SELECT id,fan_id,currency,period,threshold,limit_version,created_at,published_at FROM creator.commerce_spending_notice",
});

export async function financialExportSelects(client: PoolClient) {
  // Older preserved databases can precede weighted-cost or terminal-rule
  // installation. Include only these reviewed optional fields when present;
  // a partially installed receipt must refuse instead of dropping history.
  const costFields = [
    "cost_policy_version",
    "settled_units",
    "settlement_ref",
    "output_delivered",
  ] as const;
  const columns = new Set(
    (
      await client.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='creator' AND table_name='commerce_allowance_reservation' AND column_name=ANY($1::text[])",
        [[...costFields, "cost_rule"]],
      )
    ).rows.map((row) => row.column_name),
  );
  const weighted = costFields.filter((name) => columns.has(name));
  invariant(
    (weighted.length === 0 || weighted.length === costFields.length) &&
      (!columns.has("cost_rule") || weighted.length === costFields.length),
    "allowance_export_schema_incomplete",
    "Complete original allowance cost history is required before this export can finish.",
  );
  const optional = [
    ...weighted,
    ...(columns.has("cost_rule") ? ["cost_rule"] : []),
  ];
  return Object.freeze({
    ...selects,
    commerce_allowance_reservation: `SELECT id,creator_id,fan_id,grant_id,key,units,state,pass_id,pass_cycle${optional.length ? `,${optional.join(",")}` : ""} FROM creator.commerce_allowance_reservation`,
  });
}
