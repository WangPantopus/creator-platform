import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { Actor } from "../identity/adapter.js";
import type { PrivacyHook } from "../trust/contracts.js";
import type { CommerceService } from "./service.js";
import { invariant } from "../../core/errors.js";

type ExportInput = Parameters<PrivacyHook["run"]>[0];
export interface FinancialExportWriter {
  /** Revalidate the exact current job, account, scope and private artifact lease. */
  assertCurrent(): Promise<void>;
  write(
    collection: string,
    rows: readonly Record<string, unknown>[],
  ): Promise<void>;
  /** Atomically publish only while that same job/account/scope lease is current. */
  complete(manifest: {
    recordCounts: Record<string, number>;
    sha256: string;
  }): Promise<{ artifactReference: string }>;
  abort(): Promise<void>;
}
export interface FinancialExportSink {
  /** Staged encrypted output is private and invisible until fenced completion. */
  begin(input: ExportInput): Promise<FinancialExportWriter>;
}

/** Keyset pagination under one repeatable snapshot. Every query is a fixed
 * domain projection, forced RLS remains active, and no page is silently dropped. */
export async function exportCommerceFinancial(
  service: CommerceService,
  actor: Actor,
  input: ExportInput,
  sink: FinancialExportSink,
) {
  invariant(
    input.kind === "export" &&
      actor.accountId === input.accountId &&
      ["account", "creator", "thread"].includes(input.scope) &&
      (input.scope === "account" || input.creatorId) &&
      (input.scope !== "thread" || input.threadId),
    "privacy_scope_invalid",
    "A complete current financial export authority is required.",
  );
  const writer = await sink.begin(input);
  const counts: Record<string, number> = {};
  const hash = createHash("sha256");
  try {
    await service.account(
      actor,
      async (client) => {
        const restricted = await client.query(
          "SELECT 1 FROM creator.creator_profile WHERE account_id=$1 AND verification<>'verified' LIMIT 1",
          [actor.accountId],
        );
        invariant(
          !restricted.rowCount,
          "privacy_authority_required",
          "Restricted financial records require the configured purpose-scoped privacy authority.",
        );
        const page = async (
          name: string,
          select: string,
          where: string,
          keys: readonly string[],
          parameters: unknown[] = [],
        ) => {
          counts[name] ??= 0;
          let cursor: unknown[] | undefined;
          while (true) {
            await writer.assertCurrent();
            const after = cursor
              ? ` AND (${keys.join(",")})>(${keys.map((_, index) => `$${parameters.length + index + 1}`).join(",")})`
              : "";
            const rows = (
              await client.query<Record<string, unknown>>(
                `${select} WHERE (${where})${after} ORDER BY ${keys.join(",")} LIMIT 500`,
                [...parameters, ...(cursor ?? [])],
              )
            ).rows;
            if (!rows.length) break;
            await writer.write(name, rows);
            hash.update(JSON.stringify({ collection: name, rows }) + "\n");
            counts[name]! += rows.length;
            invariant(
              Number.isSafeInteger(counts[name]),
              "privacy_export_too_large",
              "This export exceeds the supported record-count range.",
            );
            cursor = keys.map((key) => rows.at(-1)![key]);
            invariant(
              cursor.every((value) => value !== null && value !== undefined),
              "privacy_export_cursor_invalid",
              "The export cursor is incomplete; no artifact was published.",
            );
            if (rows.length < 500) break;
          }
        };
        const creator = input.scope === "account" ? null : input.creatorId;
        const thread = input.scope === "thread" ? input.threadId : null;
        const packetScope =
          "($1::uuid IS NULL OR creator_id=$1) AND ($2::uuid IS NULL OR thread_id=$2)";
        const packets = `SELECT id FROM creator.commerce_packet WHERE ${packetScope}`;
        const commitmentScope = `packet_id IN(${packets})`;
        const commitments = `SELECT id FROM creator.commerce_commitment WHERE ${commitmentScope}`;
        const parameters = [creator, thread];
        await page(
          "packets",
          "SELECT id,creator_id,fan_id,thread_id,snapshot,disclosure,visibility,state,payment_state,created_at,submitted_at,accepted_at FROM creator.commerce_packet",
          packetScope,
          ["id"],
          parameters,
        );
        await page(
          "commitments",
          "SELECT * FROM creator.commerce_commitment",
          commitmentScope,
          ["id"],
          parameters,
        );
        const approvalSchema = (
          await client.query<{
            drafts: string | null;
            approvals: string | null;
          }>(
            "SELECT to_regclass('creator.commerce_reply_draft')::text AS drafts,to_regclass('creator.commerce_approval')::text AS approvals",
          )
        ).rows[0]!;
        invariant(
          Boolean(approvalSchema.drafts) === Boolean(approvalSchema.approvals),
          "approval_schema_incomplete",
          "Draft approval history needs schema reconciliation before this export can complete.",
        );
        if (approvalSchema.approvals) {
          await page(
            "replyDrafts",
            "SELECT * FROM creator.commerce_reply_draft",
            packetScope,
            ["id"],
            parameters,
          );
          await page(
            "approvals",
            "SELECT * FROM creator.commerce_approval",
            packetScope,
            ["id"],
            parameters,
          );
        }
        await page(
          "authorizationHistory",
          "SELECT packet_id,attempt,snapshot,created_at FROM creator.commerce_authorization_lineage",
          `packet_id IN(${packets})`,
          ["packet_id", "attempt"],
          parameters,
        );
        await page(
          "sharing",
          "SELECT * FROM creator.commerce_share_grant",
          `commitment_id IN(${commitments})`,
          ["id"],
          parameters,
        );
        await page(
          "reads",
          "SELECT id,creator_id,fan_id,commitment_id,evidence_id,period,credited FROM creator.commerce_qualified_read",
          `commitment_id IN(${commitments})`,
          ["id"],
          parameters,
        );
        await page(
          "requestEffects",
          "SELECT id,packet_id,operation,state,error_code,created_at,updated_at FROM creator.commerce_effect",
          `packet_id IN(${packets})`,
          ["id"],
          parameters,
        );
        const ledgerSelect =
          "SELECT id,creator_id,fan_id,packet_id,commitment_id,kind,amount,currency,cause,refs,created_at FROM creator.commerce_ledger";
        if (input.scope === "thread")
          await page(
            "ledger",
            ledgerSelect,
            `packet_id IN(${packets})`,
            ["id"],
            parameters,
          );
        else {
          const scope = "($1::uuid IS NULL OR creator_id=$1)";
          await page("ledger", ledgerSelect, scope, ["id"], [creator]);
          for (const [name, relation, keys] of [
            ["memberships", "commerce_membership", ["id"]],
            ["membershipReceipts", "commerce_membership_receipt", ["id"]],
            [
              "membershipUsage",
              "commerce_membership_usage",
              ["membership_id", "evidence_id"],
            ],
            ["slots", "commerce_pass_slot", ["id"]],
            ["trials", "commerce_trial", ["creator_id", "fan_id"]],
            ["allowanceReservations", "commerce_allowance_reservation", ["id"]],
            ["creditTransfers", "commerce_credit_transfer", ["id"]],
          ] as const)
            await page(name, `SELECT * FROM creator.${relation}`, scope, keys, [
              creator,
            ]);
          for (const [name, relation, keys] of [
            ["modes", "commerce_mode", ["id"]],
            ["capacity", "commerce_capacity", ["mode_id", "window_start"]],
            ["tiers", "commerce_tier", ["id"]],
          ] as const)
            await page(
              name,
              `SELECT * FROM creator.${relation}`,
              `${scope} AND creator.commerce_scope(creator_id,NULL)`,
              keys,
              [creator],
            );
          await page(
            "payoutAccounts",
            "SELECT creator_id,state,details_due,version FROM creator.commerce_payout_account",
            `${scope} AND creator.commerce_scope(creator_id,NULL)`,
            ["creator_id"],
            [creator],
          );
          await page(
            "payoutEffects",
            "SELECT id,creator_id,commitment_id,amount,currency,state,error_code,created_at FROM creator.commerce_payout_effect",
            scope,
            ["id"],
            [creator],
          );
          counts.accessGrants = 0;
          await grants(client, page, creator);
        }
        if (input.scope === "account") {
          for (const [name, select, keys] of [
            [
              "spendingLimits",
              "SELECT * FROM creator.commerce_spend_limit",
              ["fan_id", "currency"],
            ],
            [
              "spendingNotices",
              "SELECT * FROM creator.commerce_spending_notice",
              ["id"],
            ],
            [
              "passes",
              "SELECT id,fan_id,state,slot_capacity,cycle_start,cycle_end,allowance,used,reserved,cancel_at_end,version FROM creator.commerce_pass",
              ["id"],
            ],
            [
              "billingAccounts",
              "SELECT fan_id,currency,version FROM creator.commerce_billing_account",
              ["fan_id"],
            ],
            [
              "billingEffects",
              "SELECT id,fan_id,operation,state,error_code,created_at,updated_at FROM creator.commerce_billing_effect",
              ["id"],
            ],
            [
              "subscriptionHistory",
              "SELECT subscription_ref,fan_id,currency,terminal,created_at FROM creator.commerce_subscription_history",
              ["subscription_ref"],
            ],
            [
              "passPurchaseHistory",
              "SELECT reference,pass_id,fan_id,created_at FROM creator.commerce_pass_purchase_history",
              ["reference"],
            ],
            [
              "events",
              "SELECT id,aggregate_id,aggregate_version,type,payload,created_at,published_at FROM creator.commerce_event",
              ["id"],
            ],
          ] as const)
            await page(name, select, "true", keys);
        }
        await writer.assertCurrent();
      },
      { isolation: "repeatable read" },
    );
    await writer.assertCurrent();
    const artifact = await writer.complete({
      recordCounts: counts,
      sha256: hash.digest("hex"),
    });
    return {
      receipt: {
        jobId: input.jobId,
        scope: input.scope,
        recordCounts: counts,
        artifactReference: artifact.artifactReference,
      },
      data: { artifactReference: artifact.artifactReference },
    };
  } catch (error) {
    await writer.abort().catch(() => undefined);
    throw error;
  }
}

async function grants(
  client: PoolClient,
  page: (
    name: string,
    select: string,
    where: string,
    keys: readonly string[],
    parameters?: unknown[],
  ) => Promise<void>,
  creator: unknown,
) {
  const pairs = `SELECT creator_id,fan_id FROM creator.commerce_membership UNION SELECT creator_id,fan_id FROM creator.commerce_pass_slot UNION SELECT creator_id,fan_id FROM creator.commerce_trial UNION SELECT creator_id,fan_id FROM creator.commerce_allowance_reservation`;
  let after: { creator_id: string; fan_id: string } | undefined;
  while (true) {
    const rows = (
      await client.query<{ creator_id: string; fan_id: string }>(
        `SELECT creator_id,fan_id FROM (${pairs}) pairs WHERE ($1::uuid IS NULL OR creator_id=$1) ${after ? "AND (creator_id,fan_id)>($2::uuid,$3::uuid)" : ""} ORDER BY creator_id,fan_id LIMIT 500`,
        [creator, ...(after ? [after.creator_id, after.fan_id] : [])],
      )
    ).rows;
    for (const pair of rows) {
      await client.query(
        "SELECT set_config('app.creator_id',$1,true),set_config('app.fan_id',$2,true)",
        [pair.creator_id, pair.fan_id],
      );
      const ids = `SELECT grant_id FROM creator.commerce_membership WHERE creator_id=$1 AND fan_id=$2 UNION SELECT grant_id FROM creator.commerce_pass_slot WHERE creator_id=$1 AND fan_id=$2 UNION SELECT grant_id FROM creator.commerce_trial WHERE creator_id=$1 AND fan_id=$2 UNION SELECT grant_id FROM creator.commerce_allowance_reservation WHERE creator_id=$1 AND fan_id=$2`;
      const missing = await client.query(
        `SELECT 1 FROM (${ids}) refs WHERE grant_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM creator.access_grant WHERE id=refs.grant_id) LIMIT 1`,
        [pair.creator_id, pair.fan_id],
      );
      invariant(
        !missing.rowCount,
        "privacy_export_incomplete",
        "The current authority cannot resolve a linked access grant. No incomplete artifact was published.",
      );
      await page(
        "accessGrants",
        "SELECT id,creator_id,fan_id,capabilities,source,state,valid_from,valid_until,allowance,used,reserved FROM creator.access_grant",
        `creator_id=$1 AND fan_id=$2 AND id IN(${ids})`,
        ["id"],
        [pair.creator_id, pair.fan_id],
      );
    }
    if (rows.length < 500) break;
    after = rows.at(-1)!;
  }
}
