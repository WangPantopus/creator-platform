import type { PoolClient } from "pg";
import { createHash } from "node:crypto";
import { invariant } from "../../core/errors.js";
import { canonical } from "../../core/canonical.js";
import type { PreparedUsageRetention } from "./usage-retention.js";
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
  usageRetention: PreparedUsageRetention;
}) {
  invariant(
    input.retention.version === input.journal.retentionPolicyVersion &&
      typeof input.retention.current === "function" &&
      input.usageRetention?.policyVersion === input.retention.version,
    "accounting_retention_unconfigured",
    "Actual reviewed accounting retention and original-policy disposition are required.",
  );
  input.usageRetention.assertJournal(input.journal);
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
  const usagePredicate =
    "((thread_id=$2::uuid AND fan_id=$3::uuid) OR creator_hold_id IN (SELECT creator_hold_id FROM creator.ai_generation_attempt WHERE creator_id=$1 AND thread_id=$2::uuid AND fan_id=$3::uuid))";
  /** Complete keyset-paged source for W3/W8's protected export stream. The
   * caller owns this held transaction and must roll it back on interruption.
   * Unlike the bounded object adapter below, this never truncates a family. */
  const exportMetadataTo = async (
    client: PoolClient,
    job: JournalPrivacyJob,
    family: JournalPrivacyFamily,
    write: (part: string) => Promise<void>,
    signal: AbortSignal,
  ) => {
    invariant(
      job.kind === "export",
      "privacy_kind_mismatch",
      "This is a verified export operation.",
    );
    signal.throwIfAborted();
    await assert(client, job, family);
    await input.usageRetention.assertClient(client);
    await client.query(
      "SELECT creator_id FROM creator.ai_workspace WHERE creator_id=$1 FOR UPDATE",
      [family.creatorId],
    );
    const hash = createHash("sha256");
    let bytes = 0;
    const counts: Record<string, number> = {};
    const emit = async (part: string) => {
      signal.throwIfAborted();
      const encoded = Buffer.from(part, "utf8");
      invariant(
        bytes + encoded.length <= 1024 * 1024 * 1024,
        "bounded_subjob_required",
        "Split this complete family export into protected bounded jobs.",
      );
      await write(part);
      hash.update(encoded);
      bytes += encoded.length;
    };
    await emit('{"schemaVersion":1,"records":{');
    let firstTable = true;
    for (const [table, key, name] of [
      [
        "ai_generation_admission",
        "generation_id::text",
        "ai_generation_admission",
      ],
      [
        "ai_generation_attempt",
        "generation_id::text||':'||attempt_id::text",
        "ai_generation_attempt",
      ],
      ["ai_generation_receipt", "id::text", "ai_generation_receipt"],
      ["ai_usage", "id::text", "ai_usage"],
      ["ai_event", "id::text", "receiptNotifications"],
    ] as const) {
      await emit(`${firstTable ? "" : ","}${JSON.stringify(name)}:[`);
      firstTable = false;
      let cursor: string | null = null;
      let firstRow = true;
      counts[name] = 0;
      for (;;) {
        signal.throwIfAborted();
        await assert(client, job, family);
        const predicate =
          table === "ai_event"
            ? "(type='ai.generation_receipt' OR (type='ai.guardrail' AND payload->>'purpose'='generation_guardrail')) AND payload->>'threadId'=$2 AND payload->>'fanId'=$3"
            : table === "ai_usage"
              ? usagePredicate
              : "thread_id=$2::uuid AND fan_id=$3::uuid";
        const rows: { cursor: string; document: unknown }[] = (
          await client.query<{ cursor: string; document: unknown }>(
            `SELECT (${key}) COLLATE "C" AS cursor,to_jsonb(t)-'completion_capability_hash' AS document FROM creator.${table} t WHERE creator_id=$1 AND ${predicate} AND ($4::text IS NULL OR (${key}) COLLATE "C">$4::text COLLATE "C") ORDER BY cursor LIMIT 50`,
            [...bind(family), cursor],
          )
        ).rows;
        if (!rows.length) break;
        for (const row of rows) {
          await emit(`${firstRow ? "" : ","}${JSON.stringify(row.document)}`);
          firstRow = false;
          counts[name]!++;
        }
        cursor = rows[rows.length - 1]!.cursor;
      }
      await emit("]");
    }
    await emit("}}");
    signal.throwIfAborted();
    await assert(client, job, family);
    return { schemaVersion: 1, counts, bytes, sha256: hash.digest("hex") };
  };
  return Object.freeze({
    exportMetadataTo,
    /** Complete large-family deletion with bounded memory on the caller's held
     * transaction. W8 must persist this receipt only with that transaction's
     * completion; cancellation or a lost lease requires rollback, never ACK. */
    async purgeFamilyPaged(
      client: PoolClient,
      job: JournalPrivacyJob,
      family: JournalPrivacyFamily,
      signal: AbortSignal,
    ) {
      signal.throwIfAborted();
      invariant(
        job.kind === "delete",
        "privacy_kind_mismatch",
        "This is a verified deletion operation.",
      );
      await assert(client, job, family);
      await input.usageRetention.assertClient(client);
      await client.query(
        "SELECT creator_id FROM creator.ai_workspace WHERE creator_id=$1 FOR UPDATE",
        [family.creatorId],
      );
      const open = await client.query(
        "SELECT 1 FROM creator.ai_generation_admission WHERE creator_id=$1 AND thread_id=$2 AND fan_id=$3 AND state='open' UNION ALL SELECT 1 FROM creator.ai_generation_attempt WHERE creator_id=$1 AND thread_id=$2 AND fan_id=$3 AND state='open' LIMIT 1",
        bind(family),
      );
      invariant(
        !open.rowCount,
        "accounting_cleanup_pending",
        "Seal every admission and attempt before financial disposition and deletion.",
      );
      const plan = await retention.current(client, job, family);
      const budgetEnd = (
        await client.query<{ at: Date }>(
          "SELECT date_trunc('day',now())+interval '1 day' AS at",
        )
      ).rows[0]!.at;
      invariant(
        plan.financialDispositionReference.length >= 8 &&
          plan.financialDispositionReference.length <= 2048 &&
          plan.reason.length >= 12 &&
          plan.reason.length <= 2000 &&
          Number.isFinite(Date.parse(plan.accountingUntil)) &&
          Date.parse(plan.accountingUntil) >= budgetEnd.getTime(),
        "accounting_retention_unconfigured",
        "Reviewed financial disposition and minimal accounting retention through the active cap window are required.",
      );
      const hash = createHash("sha256");
      let cursor: string | null = null;
      let unlinkedCount = 0;
      let unlinkedMetadataBytes = 0;
      let knownCount = 0;
      let unknownCount = 0;
      for (;;) {
        signal.throwIfAborted();
        await assert(client, job, family);
        const rows: { id: string; cost_micros: string | null }[] = (
          await client.query<{ id: string; cost_micros: string | null }>(
            `SELECT id,cost_micros FROM creator.ai_usage WHERE creator_id=$1 AND ${usagePredicate} AND ($4::uuid IS NULL OR id>$4::uuid) ORDER BY id LIMIT 100 FOR UPDATE`,
            [...bind(family), cursor],
          )
        ).rows;
        if (!rows.length) break;
        // Attempt/hold membership stays intact until every usage page is
        // detached. Changing a page's predicate cannot hide later hold rows.
        const detached = await client.query(
          "UPDATE creator.ai_usage SET thread_id=NULL,fan_id=NULL,generation_id=NULL,attempt_id=NULL,call_ordinal=NULL,creator_hold_id=NULL,accounting_retained_until=$3,accounting_retention_version=$4,accounting_retention_reason=$5,accounting_disposition_reference=$6 WHERE creator_id=$1 AND id=ANY($2::uuid[])",
          [
            family.creatorId,
            rows.map((row) => row.id),
            plan.accountingUntil,
            retention.version,
            plan.reason,
            plan.financialDispositionReference,
          ],
        );
        invariant(
          detached.rowCount === rows.length,
          "accounting_cleanup_pending",
          "Every locked usage record must receive its actual accounting plan.",
        );
        for (const row of rows) {
          const metadata = `${canonical({ id: row.id, costMicros: row.cost_micros })}\n`;
          hash.update(metadata);
          unlinkedMetadataBytes += Buffer.byteLength(metadata);
          if (row.cost_micros === null) unknownCount++;
          else knownCount++;
        }
        unlinkedCount += rows.length;
        invariant(
          Number.isSafeInteger(unlinkedCount) &&
            Number.isSafeInteger(unlinkedMetadataBytes),
          "bounded_subjob_required",
          "Accounting counts must remain exact.",
        );
        cursor = rows[rows.length - 1]!.id;
      }
      const residual = await client.query(
        `SELECT 1 FROM creator.ai_usage WHERE creator_id=$1 AND ${usagePredicate} LIMIT 1`,
        bind(family),
      );
      invariant(
        !residual.rowCount,
        "accounting_cleanup_pending",
        "No fan-linked or attempt-hold-linked usage may remain before journal deletion.",
      );
      const deleted: Record<string, number> = {};
      for (const table of [
        "ai_event",
        "ai_generation_receipt",
        "ai_generation_attempt",
        "ai_generation_admission",
      ] as const) {
        const predicate =
          table === "ai_event"
            ? "(type='ai.generation_receipt' OR (type='ai.guardrail' AND payload->>'purpose'='generation_guardrail')) AND payload->>'threadId'=$2 AND payload->>'fanId'=$3"
            : "thread_id=$2::uuid AND fan_id=$3::uuid";
        deleted[table] = 0;
        for (;;) {
          signal.throwIfAborted();
          await assert(client, job, family);
          const page = await client.query(
            `WITH page AS (SELECT ctid FROM creator.${table} WHERE creator_id=$1 AND ${predicate} ORDER BY ctid LIMIT 100 FOR UPDATE) DELETE FROM creator.${table} WHERE ctid IN (SELECT ctid FROM page) RETURNING 1`,
            bind(family),
          );
          deleted[table]! += page.rowCount ?? 0;
          invariant(
            Number.isSafeInteger(deleted[table]),
            "bounded_subjob_required",
            "Deleted journal counts must remain exact.",
          );
          if (!page.rowCount) break;
        }
        const remaining = await client.query(
          `SELECT 1 FROM creator.${table} WHERE creator_id=$1 AND ${predicate} LIMIT 1`,
          bind(family),
        );
        invariant(
          !remaining.rowCount,
          "accounting_cleanup_pending",
          "Every journal and receipt notification page must be removed.",
        );
      }
      signal.throwIfAborted();
      await assert(client, job, family);
      const current = await retention.current(client, job, family);
      invariant(
        current.financialDispositionReference ===
          plan.financialDispositionReference &&
          current.accountingUntil === plan.accountingUntil &&
          current.reason === plan.reason,
        "accounting_retention_changed",
        "The exact reviewed accounting disposition must stay current through completion.",
      );
      await assert(client, job, family);
      const finalResidual = await client.query(
        "SELECT 1 FROM creator.ai_usage WHERE creator_id=$1 AND thread_id=$2 AND fan_id=$3 UNION ALL SELECT 1 FROM creator.ai_generation_admission WHERE creator_id=$1 AND thread_id=$2 AND fan_id=$3 UNION ALL SELECT 1 FROM creator.ai_generation_attempt WHERE creator_id=$1 AND thread_id=$2 AND fan_id=$3 UNION ALL SELECT 1 FROM creator.ai_generation_receipt WHERE creator_id=$1 AND thread_id=$2 AND fan_id=$3 UNION ALL SELECT 1 FROM creator.ai_event WHERE creator_id=$1 AND (type='ai.generation_receipt' OR (type='ai.guardrail' AND payload->>'purpose'='generation_guardrail')) AND payload->>'threadId'=$2::text AND payload->>'fanId'=$3::text LIMIT 1",
        bind(family),
      );
      invariant(
        !finalResidual.rowCount,
        "accounting_cleanup_pending",
        "A complete accounting family and its notifications must stay purged.",
      );
      signal.throwIfAborted();
      return {
        receipt: {
          schemaVersion: 2,
          domain: "agent",
          jobId: job.jobId,
          family: { ...family },
          threadAccountingPurged: true,
          retentionVersion: retention.version,
          financialDispositionReference: plan.financialDispositionReference,
          unlinkedCount,
          unlinkedMetadataBytes,
          knownCount,
          unknownCount,
          unlinkedSha256: hash.digest("hex"),
          hashEncoding: "canonical-json-lines-uuid-order",
          deleted,
        },
        retained: [
          ...(knownCount
            ? [
                {
                  category: "unlinked_agent_accounting",
                  until: plan.accountingUntil,
                  reason: plan.reason,
                },
              ]
            : []),
          ...(unknownCount
            ? [
                {
                  category: "unresolved_agent_cost",
                  until: null,
                  reason: `${plan.reason} Unresolved provider cost requires actual reconciliation; expiry cannot clear this marker.`,
                },
              ]
            : []),
        ],
      };
    },
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
      await input.usageRetention.assertClient(client);
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
        const predicate =
          table === "ai_usage"
            ? usagePredicate
            : "thread_id=$2::uuid AND fan_id=$3::uuid";
        const rows = (
          await client.query(
            `SELECT to_jsonb(t)-'completion_capability_hash' AS document FROM creator.${table} t WHERE creator_id=$1 AND ${predicate} LIMIT 2001`,
            bind(family),
          )
        ).rows.map((row) => row.document);
        invariant(
          rows.length <= 2000,
          "bounded_subjob_required",
          "This family needs a complete paginated accounting subjob; no truncated export was completed.",
        );
        records[table] = rows;
      }
      const events = (
        await client.query(
          "SELECT * FROM creator.ai_event WHERE creator_id=$1 AND (type='ai.generation_receipt' OR (type='ai.guardrail' AND payload->>'purpose'='generation_guardrail')) AND payload->>'threadId'=$2 AND payload->>'fanId'=$3 LIMIT 2001",
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
      await input.usageRetention.assertClient(client);
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
          plan.financialDispositionReference.length <= 2048 &&
          plan.reason.length >= 12 &&
          plan.reason.length <= 2000 &&
          Number.isFinite(Date.parse(plan.accountingUntil)) &&
          Date.parse(plan.accountingUntil) >= budgetEnd.getTime(),
        "accounting_retention_unconfigured",
        "Reviewed financial disposition and minimal accounting retention through the active cap window are required.",
      );
      const usage = (
        await client.query<{ id: string; cost_micros: string | null }>(
          `SELECT id,cost_micros FROM creator.ai_usage WHERE creator_id=$1 AND ((thread_id=$2 AND fan_id=$3) OR creator_hold_id IN (SELECT creator_hold_id FROM creator.ai_generation_attempt WHERE creator_id=$1 AND thread_id=$2 AND fan_id=$3)) LIMIT 2001`,
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
        "UPDATE creator.ai_usage SET thread_id=NULL,fan_id=NULL,generation_id=NULL,attempt_id=NULL,call_ordinal=NULL,creator_hold_id=NULL,accounting_retained_until=$3,accounting_retention_version=$4,accounting_retention_reason=$5,accounting_disposition_reference=$6 WHERE creator_id=$1 AND id=ANY($2::uuid[])",
        [
          family.creatorId,
          usage.map((row) => row.id),
          plan.accountingUntil,
          retention.version,
          plan.reason,
          plan.financialDispositionReference,
        ],
      );
      await client.query(
        "DELETE FROM creator.ai_event WHERE creator_id=$1 AND (type='ai.generation_receipt' OR (type='ai.guardrail' AND payload->>'purpose'='generation_guardrail')) AND payload->>'threadId'=$2 AND payload->>'fanId'=$3",
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
        retained: [
          ...(usage.some((row) => row.cost_micros !== null)
            ? [
                {
                  category: "unlinked_agent_accounting",
                  until: plan.accountingUntil,
                  reason: plan.reason,
                },
              ]
            : []),
          ...(usage.some((row) => row.cost_micros === null)
            ? [
                {
                  category: "unresolved_agent_cost",
                  until: null,
                  reason: `${plan.reason} Unresolved provider cost requires actual reconciliation; expiry cannot clear this marker.`,
                },
              ]
            : []),
        ],
      };
    },
  });
}
export type GenerationAccountingLifecycle = ReturnType<
  typeof generationAccountingLifecycle
>;
