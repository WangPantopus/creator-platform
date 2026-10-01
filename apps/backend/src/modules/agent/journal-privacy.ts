import type { PoolClient } from "pg";
import { invariant } from "../../core/errors.js";
import {
  type PreparedGenerationJournal,
  type JournalPrivacyAuthority,
  type JournalPrivacyFamily,
  type JournalPrivacyJob,
} from "./generation-journal.js";

/** W4/W8 supply actual disposition and reviewed Q16 retention on this client's
 * verified job. No default successful callback or caller-provided policy. */
export interface JournalPrivacyRetention {
  version: string;
  current(
    client: PoolClient,
    job: JournalPrivacyJob,
    family: JournalPrivacyFamily,
  ): Promise<{
    financialDispositionReference: string;
    accountingUntil: string;
    reason: string;
  }>;
}

/** W3 calls only after its actual authority.assertFamily and thread lock.
 * This repeats current W8 authority and touches only W2-owned records. */
export function generationAccountingLifecycle(input: {
  journal: PreparedGenerationJournal;
  authority: JournalPrivacyAuthority;
  retention: JournalPrivacyRetention;
}) {
  invariant(
    input.retention.version === input.journal.retentionPolicyVersion &&
      typeof input.retention.current === "function",
    "accounting_retention_unconfigured",
    "Actual reviewed accounting retention and original-policy disposition are required.",
  );
  const journal = input.journal;
  const authority = input.authority;
  const retention = Object.freeze({
    version: input.retention.version,
    current: input.retention.current.bind(input.retention),
  });
  const assert = (
    client: PoolClient,
    job: JournalPrivacyJob,
    family: JournalPrivacyFamily,
  ) => journal.assertPrivacyFamily(client, job, family, authority);
  const bind = (family: JournalPrivacyFamily) => [
    family.creatorId,
    family.threadId,
    family.fanId,
  ];
  return Object.freeze({
    async sealGeneration(
      client: PoolClient,
      job: JournalPrivacyJob,
      family: JournalPrivacyFamily,
      generationId: string,
    ) {
      return journal.sealFamily(client, job, family, generationId, authority);
    },
    async currentReceipt(
      client: PoolClient,
      job: JournalPrivacyJob,
      family: JournalPrivacyFamily,
      generationId: string,
    ) {
      return journal.currentFamily(
        client,
        job,
        family,
        generationId,
        authority,
      );
    },
    async exportMetadata(
      client: PoolClient,
      job: JournalPrivacyJob,
      family: JournalPrivacyFamily,
    ) {
      invariant(
        job.kind === "export",
        "privacy_kind_mismatch",
        "This is a verified export operation.",
      );
      await assert(client, job, family);
      await client.query(
        "SELECT creator_id FROM creator.ai_workspace WHERE creator_id=$1 FOR UPDATE",
        [family.creatorId],
      );
      const records: Record<string, unknown[]> = {};
      for (const table of [
        "ai_generation_admission",
        "ai_generation_attempt",
        "ai_generation_receipt",
        "ai_usage",
      ]) {
        const rows = (
          await client.query(
            `SELECT * FROM creator.${table} WHERE creator_id=$1 AND thread_id=$2 AND fan_id=$3 LIMIT 2001`,
            bind(family),
          )
        ).rows;
        invariant(
          rows.length <= 2000,
          "bounded_subjob_required",
          "This family needs a complete paginated accounting subjob; no truncated export was completed.",
        );
        records[table] = rows;
      }
      const events = (
        await client.query(
          "SELECT * FROM creator.ai_event WHERE creator_id=$1 AND type='ai.generation_receipt' AND payload->>'threadId'=$2 AND payload->>'fanId'=$3 LIMIT 2001",
          bind(family),
        )
      ).rows;
      invariant(
        events.length <= 2000,
        "bounded_subjob_required",
        "Receipt notifications need a complete paginated subjob.",
      );
      records.receiptNotifications = events;
      await assert(client, job, family);
      return { schemaVersion: 1, records };
    },
    async purgeFamily(
      client: PoolClient,
      job: JournalPrivacyJob,
      family: JournalPrivacyFamily,
    ) {
      invariant(
        job.kind === "delete",
        "privacy_kind_mismatch",
        "This is a verified deletion operation.",
      );
      await assert(client, job, family);
      await client.query(
        "SELECT creator_id FROM creator.ai_workspace WHERE creator_id=$1 FOR UPDATE",
        [family.creatorId],
      );
      const open = await client.query(
        "SELECT generation_id FROM creator.ai_generation_admission WHERE creator_id=$1 AND thread_id=$2 AND fan_id=$3 AND state='open' LIMIT 1",
        bind(family),
      );
      invariant(
        !open.rowCount,
        "accounting_cleanup_pending",
        "Close initialized generation admissions before financial disposition and deletion.",
      );
      const plan = await retention.current(client, job, family);
      const budgetEnd = (
        await client.query<{ at: Date }>(
          "SELECT date_trunc('day',now())+interval '1 day' AS at",
        )
      ).rows[0]!.at;
      invariant(
        plan.financialDispositionReference.length >= 8 &&
          plan.reason.length >= 12 &&
          Number.isFinite(Date.parse(plan.accountingUntil)) &&
          Date.parse(plan.accountingUntil) >= budgetEnd.getTime(),
        "accounting_retention_unconfigured",
        "Reviewed financial disposition and minimal accounting retention through the active cap window are required.",
      );
      const usage = (
        await client.query<{ id: string }>(
          `SELECT id FROM creator.ai_usage WHERE creator_id=$1 AND ((thread_id=$2 AND fan_id=$3) OR creator_hold_id IN (SELECT creator_hold_id FROM creator.ai_generation_attempt WHERE creator_id=$1 AND thread_id=$2 AND fan_id=$3)) LIMIT 2001`,
          bind(family),
        )
      ).rows;
      invariant(
        usage.length <= 2000,
        "bounded_subjob_required",
        "This deletion needs complete bounded accounting subjobs.",
      );
      // Preserve known charges and unresolved cost rather than making privacy
      // deletion replenish a creator cap. Detach every fan/generation/hold link.
      // The actual reviewed owner plan governs retained minimal counters/expiry.
      await client.query(
        "UPDATE creator.ai_usage SET thread_id=NULL,fan_id=NULL,generation_id=NULL,attempt_id=NULL,call_ordinal=NULL,creator_hold_id=NULL WHERE creator_id=$1 AND id=ANY($2::uuid[])",
        [family.creatorId, usage.map((row) => row.id)],
      );
      await client.query(
        "DELETE FROM creator.ai_event WHERE creator_id=$1 AND type='ai.generation_receipt' AND payload->>'threadId'=$2 AND payload->>'fanId'=$3",
        bind(family),
      );
      for (const table of [
        "ai_generation_receipt",
        "ai_generation_attempt",
        "ai_generation_admission",
      ])
        await client.query(
          `DELETE FROM creator.${table} WHERE creator_id=$1 AND thread_id=$2 AND fan_id=$3`,
          bind(family),
        );
      await assert(client, job, family);
      return {
        receipt: {
          domain: "agent",
          jobId: job.jobId,
          threadAccountingPurged: true,
          retentionVersion: retention.version,
          financialDispositionReference: plan.financialDispositionReference,
          unlinkedAccountingIds: usage.map((row) => row.id),
        },
        retained: usage.length
          ? [
              {
                category: "unlinked_agent_accounting",
                until: plan.accountingUntil,
                reason: plan.reason,
              },
            ]
          : [],
      };
    },
  });
}
export type GenerationAccountingLifecycle = ReturnType<
  typeof generationAccountingLifecycle
>;
