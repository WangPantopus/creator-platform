import { copy } from "@qelvora/copy";
import type { PrivacyHook } from "../trust/contracts.js";
import type { GrowthService } from "./service.js";
import { DomainError } from "../../core/errors.js";
import { z } from "zod";

/** Resolve a durable verified job snapshot, never client-supplied creator IDs or post-delete absence. */
export type GrowthPrivacyScope = (input: {
  jobId: string;
  accountId: string;
}) => Promise<readonly string[] | null>;
export function growthPrivacyHook(
  service: GrowthService,
  scope?: GrowthPrivacyScope,
): PrivacyHook {
  return {
    domain: "growth",
    run: async (input) => {
      if (input.scope !== "account")
        throw new DomainError(
          "growth_scope_adapter_required",
          copy.growthErrorGrowthScopeAdapterRequired,
          503,
        );
      const resolved = await scope?.({
        jobId: input.jobId,
        accountId: input.accountId,
      });
      if (!resolved)
        throw new DomainError(
          "growth_account_scope_required",
          copy.growthErrorGrowthAccountScopeRequired,
          503,
        );
      const ownedCreators = z.array(z.uuid()).max(100).parse(resolved);
      if (input.kind === "delete")
        return {
          receipt: await service.privacyDelete(input.accountId, ownedCreators),
          retained: [
            {
              category: "pseudonymous_erasure_fence",
              until: null,
              reason:
                "Worker-only HMAC subject markers prevent delayed producer replay from recreating erased records; no raw account or creator ID is stored.",
            },
            {
              category: "anonymous_event_dedupe",
              until: null,
              reason:
                "Only opaque event IDs and content hashes remain; recipient and aggregate metadata is erased.",
            },
            {
              category: "anonymous_closed_fan_aggregates",
              until: null,
              reason:
                "Closed fan aggregates contain no fan identifier or private text; removed creator snapshots are deleted.",
            },
          ],
        };
      const data = await service.db.transaction(
        service.db.worker,
        async (client) => {
          const result: Record<string, unknown> = {};
          async function collect(
            table: string,
            column: string,
            value: unknown,
          ) {
            const rows = (
              await client.query(
                `SELECT * FROM growth.${table} WHERE ${column}=$1 LIMIT 10001`,
                [value],
              )
            ).rows;
            if (rows.length > 10000)
              throw new DomainError(
                "growth_export_stream_required",
                copy.growthErrorGrowthExportStreamRequired,
                503,
              );
            return rows;
          }
          for (const table of [
            "follow",
            "preference",
            "notification",
            "share",
            "metric",
            "feedback",
            "prompt_choice",
            "entry_attribution",
          ])
            result[table] = await collect(table, "account_id", input.accountId);
          result.invites = await collect(
            "invite",
            "created_by",
            input.accountId,
          );
          result.activation = await collect(
            "activation_job",
            "creator_account_id",
            input.accountId,
          );
          result.devices = (
            await client.query(
              "SELECT installation_id,platform,permission,revoked_at,updated_at FROM growth.device WHERE account_id=$1 LIMIT 10001",
              [input.accountId],
            )
          ).rows;
          if ((result.devices as unknown[]).length > 10000)
            throw new DomainError(
              "growth_export_stream_required",
              copy.growthErrorGrowthExportStreamRequired,
              503,
            );
          const email = (
            await client.query(
              "SELECT encrypted_address,verified_at,bounced_at,unsubscribed_at FROM growth.email WHERE account_id=$1",
              [input.accountId],
            )
          ).rows[0];
          if (email)
            result.email = {
              address: service.open(email.encrypted_address),
              verifiedAt: email.verified_at,
              bouncedAt: email.bounced_at,
              unsubscribedAt: email.unsubscribed_at,
            };
          result.delivery = (
            await client.query(
              "SELECT d.id,d.notification_id,d.channel,d.state,d.attempts,d.available_at FROM growth.delivery d WHERE d.account_id=$1 LIMIT 10001",
              [input.accountId],
            )
          ).rows;
          if ((result.delivery as unknown[]).length > 10000)
            throw new DomainError(
              "growth_export_stream_required",
              copy.growthErrorGrowthExportStreamRequired,
              503,
            );
          const subjectKey = service.privacySubjectKey(input.accountId);
          result.insightSignals = (
            await client.query(
              "SELECT id,creator_id,topic_key,window_start,unresolved,version FROM growth.insight_signal WHERE subject_key=$1 LIMIT 10001",
              [subjectKey],
            )
          ).rows;
          result.thanks = (
            await client.query(
              "SELECT creator_id,window_start,quote->>'id' AS id,quote->>'text' AS text,quote->>'displayName' AS display_name FROM growth.impact CROSS JOIN LATERAL jsonb_array_elements(consented_thanks) quote WHERE quote->>'subjectKey'=$1 LIMIT 10001",
              [subjectKey],
            )
          ).rows;
          if (
            (result.insightSignals as unknown[]).length > 10000 ||
            (result.thanks as unknown[]).length > 10000
          )
            throw new DomainError(
              "growth_export_stream_required",
              copy.growthErrorGrowthExportStreamRequired,
              503,
            );
          result.creators = [];
          for (const creatorId of ownedCreators) {
            const creator: Record<string, unknown> = { id: creatorId };
            for (const table of [
              "content_public",
              "insight_snapshot",
              "insight_window",
              "recommendation",
              "impact",
              "instagram_reply",
              "experiment",
            ])
              creator[table] = await collect(table, "creator_id", creatorId);
            creator.profile =
              (
                await client.query(
                  "SELECT document FROM growth.creator_public WHERE id=$1",
                  [creatorId],
                )
              ).rows[0]?.document ?? null;
            (result.creators as unknown[]).push(creator);
          }
          return result;
        },
      );
      // W8 writes authorized data to its encrypted export artifact; never logs/telemetry.
      return {
        receipt: { domain: "growth", exported: true },
        data,
        retained: [],
      };
    },
  };
}
