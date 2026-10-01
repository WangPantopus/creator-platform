import type { Actor } from "../identity/adapter.js";
import type { EffectHook, PrivacyHook } from "../trust/contracts.js";
import type { CommerceService } from "./service.js";
import { invariant } from "../../core/errors.js";
import {
  exportCommerceFinancial,
  type FinancialExportSink,
} from "./financial-export.js";

type EffectInput = Parameters<EffectHook["run"]>[0];
type PrivacyInput = Parameters<PrivacyHook["run"]>[0];
/** W8 must revalidate the live case/job, scope and financial permission before issuing
 * the bound domain actor. This interface is server-only and has no public route. */
export interface CommerceOperationsAuthority {
  withCase<T>(
    input: EffectInput,
    purpose: "full_refund" | "partial_refund",
    work: (actor: Actor) => Promise<T>,
  ): Promise<T>;
  withPrivacyJob<T>(
    input: PrivacyInput,
    work: (actor: Actor) => Promise<T>,
  ): Promise<T>;
}

export function commerceEffectHooks(
  service: CommerceService,
  authority: CommerceOperationsAuthority,
): EffectHook[] {
  return (["full_refund", "partial_refund"] as const).map((purpose) => ({
    type: `commerce.${purpose}`,
    run: (input) =>
      authority.withCase(input, purpose, async (actor) => {
        invariant(
          input.requestId,
          "request_required",
          "A scoped request is required for this refund.",
        );
        const current = await service.packet(actor, input.requestId);
        invariant(
          current.packet.creator_id === input.creatorId,
          "case_scope_changed",
          "The case no longer matches this request.",
        );
        const already = current.ledger
          .filter((row) => row.kind === "refund")
          .reduce((n, row) => n + BigInt(row.amount), 0n);
        const cause = `ops:${input.caseId}:${input.effectId}`;
        const ledgerCause = `${input.requestId}:refund:${cause}`;
        const prior = await service.account(
          actor,
          async (client) =>
            (
              await client.query(
                "SELECT request FROM creator.commerce_effect WHERE packet_id=$1 AND operation='refund' AND provider_key=$2",
                [input.requestId, ledgerCause],
              )
            ).rows[0],
        );
        const amount = prior
          ? Number(prior.request.amount)
          : purpose === "full_refund"
            ? Number(BigInt(current.packet.snapshot.amount) - already)
            : input.amountMinor;
        if (
          current.ledger.some(
            (row) => row.kind === "refund" && row.cause === ledgerCause,
          )
        )
          return {
            receipt: { packetId: input.requestId, state: "confirmed", cause },
          };
        invariant(
          amount && Number.isSafeInteger(amount) && amount > 0,
          "refund_amount_invalid",
          "The authorized refund amount is unavailable.",
        );
        const settled = await service.requestRefund(
          actor,
          input.requestId,
          amount,
          cause,
          "ops_refund",
        );
        invariant(
          settled.ledger.some(
            (row) => row.kind === "refund" && row.cause === ledgerCause,
          ),
          "refund_confirmation_pending",
          "The refund is awaiting provider confirmation. Retry this effect before completing the case.",
        );
        return {
          receipt: {
            packetId: input.requestId,
            cause,
            state: "confirmed",
          },
        };
      }),
  }));
}

export function commercePrivacyHook(
  service: CommerceService,
  authority: CommerceOperationsAuthority,
  exportSink?: FinancialExportSink,
): PrivacyHook {
  return {
    domain: "commerce",
    run: (input) =>
      authority.withPrivacyJob(input, async (actor) => {
        invariant(
          actor.accountId === input.accountId,
          "privacy_scope_changed",
          "The privacy job no longer matches this account.",
        );
        // Q16 must explicitly resolve retention/refund consequences before deletion acknowledgements.
        invariant(
          input.kind === "export",
          "commerce_retention_unconfigured",
          "Commerce deletion requires the configured legal retention and obligation policy.",
        );
        if (exportSink)
          return exportCommerceFinancial(service, actor, input, exportSink);
        return service.account(actor, async (client) => {
          const restrictedCreator = await client.query(
            "SELECT 1 FROM creator.creator_profile WHERE account_id=$1 AND verification<>'verified' LIMIT 1",
            [actor.accountId],
          );
          invariant(
            !restrictedCreator.rowCount,
            "privacy_authority_required",
            "Exporting a restricted creator's financial history requires the configured purpose-scoped privacy authority.",
          );
          invariant(
            ["account", "creator", "thread"].includes(input.scope) &&
              (input.scope === "account" || input.creatorId) &&
              (input.scope !== "thread" || input.threadId),
            "privacy_scope_invalid",
            "A complete, verified commerce export scope is required.",
          );
          const exportCreator =
            input.scope === "account" ? null : input.creatorId;
          const exportThread = input.scope === "thread" ? input.threadId : null;
          const packets = (
            await client.query(
              "SELECT id,creator_id,fan_id,thread_id,snapshot,disclosure,visibility,state,payment_state,created_at,submitted_at,accepted_at FROM creator.commerce_packet WHERE ($1::uuid IS NULL OR creator_id=$1) AND ($2::uuid IS NULL OR thread_id=$2) ORDER BY created_at,id LIMIT 2001",
              [exportCreator, exportThread],
            )
          ).rows;
          const ids = packets.map((row) => row.id);
          const commitments = (
            await client.query(
              "SELECT * FROM creator.commerce_commitment WHERE packet_id=ANY($1::uuid[]) ORDER BY id LIMIT 2001",
              [ids],
            )
          ).rows;
          const ledger = (
            await client.query(
              "SELECT id,creator_id,fan_id,packet_id,commitment_id,kind,amount,currency,cause,created_at FROM creator.commerce_ledger WHERE packet_id=ANY($1::uuid[]) ORDER BY created_at,id LIMIT 2001",
              [ids],
            )
          ).rows;
          invariant(
            packets.length <= 2000 &&
              commitments.length <= 2000 &&
              ledger.length <= 2000,
            "privacy_export_pagination_required",
            "This export needs the configured paged artifact exporter.",
          );
          const data: Record<string, unknown[]> = {
            packets,
            commitments,
            ledger,
          };
          const bounded = async (
            name: string,
            query: string,
            parameters: unknown[] = [],
          ) => {
            const rows = (await client.query(query, parameters)).rows;
            invariant(
              rows.length <= 2000,
              "privacy_export_pagination_required",
              "This export needs the configured paged artifact exporter.",
            );
            data[name] = rows;
          };
          const commitmentIds = commitments.map((row) => row.id);
          const approvalSchema = (
            await client.query<{
              drafts: string | null;
              approvals: string | null;
            }>(
              "SELECT to_regclass('creator.commerce_reply_draft')::text AS drafts,to_regclass('creator.commerce_approval')::text AS approvals",
            )
          ).rows[0]!;
          invariant(
            Boolean(approvalSchema.drafts) ===
              Boolean(approvalSchema.approvals),
            "approval_schema_incomplete",
            "Draft approval history needs schema reconciliation before this export can complete.",
          );
          if (approvalSchema.approvals)
            for (const [name, relation] of [
              ["replyDrafts", "commerce_reply_draft"],
              ["approvals", "commerce_approval"],
            ] as const)
              await bounded(
                name,
                `SELECT * FROM creator.${relation} WHERE ($1::uuid IS NULL OR creator_id=$1) AND ($2::uuid IS NULL OR thread_id=$2) ORDER BY id LIMIT 2001`,
                [exportCreator, exportThread],
              );
          await bounded(
            "authorizationHistory",
            "SELECT packet_id,attempt,snapshot,created_at FROM creator.commerce_authorization_lineage WHERE packet_id=ANY($1::uuid[]) ORDER BY packet_id,attempt LIMIT 2001",
            [ids],
          );
          await bounded(
            "sharing",
            "SELECT * FROM creator.commerce_share_grant WHERE commitment_id=ANY($1::uuid[]) ORDER BY id LIMIT 2001",
            [commitmentIds],
          );
          await bounded(
            "reads",
            "SELECT id,creator_id,fan_id,commitment_id,evidence_id,period,credited FROM creator.commerce_qualified_read WHERE commitment_id=ANY($1::uuid[]) ORDER BY id LIMIT 2001",
            [commitmentIds],
          );
          await bounded(
            "requestEffects",
            "SELECT id,packet_id,operation,state,error_code,created_at,updated_at FROM creator.commerce_effect WHERE packet_id=ANY($1::uuid[]) ORDER BY created_at,id LIMIT 2001",
            [ids],
          );
          if (input.scope !== "thread") {
            // RLS binds every private row to this account. The additional creator
            // predicate narrows creator exports; account exports include financial
            // rows that deliberately have no packet (billing, pass and credits).
            const creator = input.scope === "creator" ? input.creatorId : null;
            await bounded(
              "ledger",
              "SELECT id,creator_id,fan_id,packet_id,commitment_id,kind,amount,currency,cause,refs,created_at FROM creator.commerce_ledger WHERE ($1::uuid IS NULL OR creator_id=$1) ORDER BY created_at,id LIMIT 2001",
              [creator],
            );
            for (const [name, relation] of [
              ["memberships", "commerce_membership"],
              ["membershipReceipts", "commerce_membership_receipt"],
              ["membershipUsage", "commerce_membership_usage"],
              ["slots", "commerce_pass_slot"],
              ["trials", "commerce_trial"],
              ["allowanceReservations", "commerce_allowance_reservation"],
              ["creditTransfers", "commerce_credit_transfer"],
            ] as const) {
              await bounded(
                name,
                `SELECT * FROM creator.${relation} WHERE ($1::uuid IS NULL OR creator_id=$1) LIMIT 2001`,
                [creator],
              );
            }
            for (const [name, relation] of [
              ["modes", "commerce_mode"],
              ["capacity", "commerce_capacity"],
              ["tiers", "commerce_tier"],
            ] as const) {
              await bounded(
                name,
                `SELECT * FROM creator.${relation} WHERE creator.commerce_scope(creator_id,NULL) AND ($1::uuid IS NULL OR creator_id=$1) LIMIT 2001`,
                [creator],
              );
            }
            await bounded(
              "payoutAccounts",
              "SELECT creator_id,state,details_due,version FROM creator.commerce_payout_account WHERE creator.commerce_scope(creator_id,NULL) AND ($1::uuid IS NULL OR creator_id=$1) LIMIT 2001",
              [creator],
            );
            await bounded(
              "payoutEffects",
              "SELECT id,creator_id,commitment_id,amount,currency,state,error_code,created_at FROM creator.commerce_payout_effect WHERE ($1::uuid IS NULL OR creator_id=$1) LIMIT 2001",
              [creator],
            );
          }
          if (input.scope === "account") {
            const passSchema = (
              await client.query<{ count: string }>(
                "SELECT count(*)::text AS count FROM information_schema.tables WHERE table_schema='creator' AND table_name IN('commerce_pass_billing_account','commerce_pass_quote','commerce_pass_billing_effect','commerce_pass_receipt')",
              )
            ).rows[0]!;
            invariant(
              passSchema.count === "0" || passSchema.count === "4",
              "pass_schema_incomplete",
              "The complete pass billing history is required before publishing this export.",
            );
            if (passSchema.count === "4")
              for (const [name, query] of [
                [
                  "passBillingAccounts",
                  "SELECT fan_id,currency,desired_renewal,version,retention_policy_version FROM creator.commerce_pass_billing_account LIMIT 2001",
                ],
                [
                  "passQuotes",
                  "SELECT id,fan_id,account_version,currency,amount,monthly_amount,quoted_at,expires_at,period_end,retention_policy_version FROM creator.commerce_pass_quote LIMIT 2001",
                ],
                [
                  "passBillingEffects",
                  "SELECT id,fan_id,operation,intent_version,quote_id,state,attempt,error_code,created_at,updated_at,retention_policy_version FROM creator.commerce_pass_billing_effect LIMIT 2001",
                ],
                [
                  "passReceipts",
                  "SELECT id,fan_id,subscription_ref,invoice_ref,line_ref,payment_ref,paid_minor,currency,period_start,period_end,paid_at,created_at,retention_policy_version FROM creator.commerce_pass_receipt LIMIT 2001",
                ],
              ] as const)
                await bounded(name, query);
            for (const [name, query] of [
              [
                "spendingLimits",
                "SELECT * FROM creator.commerce_spend_limit LIMIT 2001",
              ],
              [
                "spendingNotices",
                "SELECT * FROM creator.commerce_spending_notice LIMIT 2001",
              ],
              [
                "passes",
                "SELECT id,fan_id,state,slot_capacity,cycle_start,cycle_end,allowance,used,reserved,cancel_at_end,version FROM creator.commerce_pass LIMIT 2001",
              ],
              [
                "billingAccounts",
                "SELECT fan_id,currency,version FROM creator.commerce_billing_account LIMIT 2001",
              ],
              [
                "billingEffects",
                "SELECT id,fan_id,operation,state,error_code,created_at,updated_at FROM creator.commerce_billing_effect LIMIT 2001",
              ],
              [
                "subscriptionHistory",
                "SELECT fan_id,currency,terminal,created_at FROM creator.commerce_subscription_history LIMIT 2001",
              ],
              [
                "passPurchaseHistory",
                "SELECT pass_id,fan_id,created_at FROM creator.commerce_pass_purchase_history LIMIT 2001",
              ],
              [
                "events",
                "SELECT id,aggregate_id,aggregate_version,type,payload,created_at,published_at FROM creator.commerce_event LIMIT 2001",
              ],
            ] as const)
              await bounded(name, query);
          }
          if (input.scope !== "thread") {
            const pairs = new Map<
              string,
              { creatorId: string; fanId: string; ids: Set<string> }
            >();
            for (const name of [
              "memberships",
              "slots",
              "trials",
              "allowanceReservations",
            ]) {
              for (const row of (data[name] ?? []) as Record<
                string,
                unknown
              >[]) {
                if (
                  typeof row.creator_id !== "string" ||
                  typeof row.fan_id !== "string" ||
                  typeof row.grant_id !== "string"
                )
                  continue;
                const key = `${row.creator_id}:${row.fan_id}`;
                const pair = pairs.get(key) ?? {
                  creatorId: row.creator_id,
                  fanId: row.fan_id,
                  ids: new Set<string>(),
                };
                pair.ids.add(row.grant_id);
                pairs.set(key, pair);
              }
            }
            data.accessGrants = [];
            for (const pair of pairs.values()) {
              await client.query(
                "SELECT set_config('app.creator_id',$1,true),set_config('app.fan_id',$2,true)",
                [pair.creatorId, pair.fanId],
              );
              const grants = (
                await client.query(
                  "SELECT id,creator_id,fan_id,capabilities,source,state,valid_from,valid_until,allowance,used,reserved FROM creator.access_grant WHERE id=ANY($1::uuid[]) LIMIT 2001",
                  [[...pair.ids]],
                )
              ).rows;
              invariant(
                grants.length === pair.ids.size &&
                  data.accessGrants.length + grants.length <= 2000,
                "privacy_export_incomplete",
                "The configured privacy exporter must resolve missing grants or paginate this account.",
              );
              data.accessGrants.push(...grants);
            }
          }
          return {
            receipt: {
              jobId: input.jobId,
              packetCount: packets.length,
              commitmentCount: commitments.length,
              ledgerCount: data.ledger!.length,
              scope: input.scope,
              recordCounts: Object.fromEntries(
                Object.entries(data).map(([name, rows]) => [name, rows.length]),
              ),
            },
            data,
          };
        });
      }),
  };
}
