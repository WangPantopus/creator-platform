import type { PoolClient } from "pg";
import { createHash } from "node:crypto";
import { invariant } from "../../core/errors.js";
import { canonical } from "../../core/canonical.js";
import {
  requireResolvedAccounting,
  unresolvedAccountingInTransaction,
} from "./accounting-uncertainty.js";
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
    reason: string;
  }>;
  knownRetention(
    client: PoolClient,
    job: JournalPrivacyJob,
    family: JournalPrivacyFamily,
    generationIds: readonly string[],
  ): Promise<
    readonly {
      generationId: string;
      settledAt: string;
      accountingUntil: string;
      financialDispositionReference: string;
    }[]
  >;
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
      typeof input.retention.knownRetention === "function" &&
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
    knownRetention: input.retention.knownRetention.bind(input.retention),
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
      requireResolvedAccounting(
        await unresolvedAccountingInTransaction(
          client,
          family.creatorId,
          family,
          signal,
        ),
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
      invariant(
        /^[a-f0-9]{64}$/u.test(plan.financialDispositionReference) &&
          plan.reason.length >= 12 &&
          plan.reason.length <= 2000,
        "accounting_retention_unconfigured",
        "Original financial disposition and the reviewed accounting policy are required.",
      );
      const hash = createHash("sha256");
      let cursor: string | null = null;
      let unlinkedCount = 0;
      let unlinkedMetadataBytes = 0;
      let knownCount = 0;
      let retainedKnownCount = 0;
      let expiredKnownCount = 0;
      let latestRetainedUntil: string | undefined;
      for (;;) {
        signal.throwIfAborted();
        await assert(client, job, family);
        type UsageRow = {
          id: string;
          cost_micros: string | null;
          created_at: string;
          generation_id: string | null;
        };
        const rows: UsageRow[] = (
          await client.query<UsageRow>(
            `SELECT u.id,u.cost_micros,u.created_at::text,
             coalesce(u.generation_id,(SELECT a.generation_id FROM creator.ai_generation_attempt a
              WHERE a.creator_id=$1 AND a.thread_id=$2 AND a.fan_id=$3 AND a.creator_hold_id=u.creator_hold_id)) AS generation_id
             FROM creator.ai_usage u WHERE creator_id=$1 AND ${usagePredicate}
             AND ($4::uuid IS NULL OR id>$4::uuid) ORDER BY id LIMIT 100 FOR UPDATE OF u`,
            [...bind(family), cursor],
          )
        ).rows;
        if (!rows.length) break;
        invariant(
          rows.every(
            (row) => row.cost_micros !== null && row.generation_id !== null,
          ),
          "accounting_reconciliation_required",
          "This known-cost purge cannot erase or assign settlement dates to unresolved or unbound usage.",
        );
        const generationIds = [
          ...new Set(rows.map((row) => row.generation_id!)),
        ];
        const deadlines = await retention.knownRetention(
          client,
          job,
          family,
          generationIds,
        );
        const byGeneration = new Map(
          deadlines.map((row) => [row.generationId, row]),
        );
        invariant(
          deadlines.length === generationIds.length &&
            byGeneration.size === generationIds.length &&
            rows.every((row) => {
              const original = byGeneration.get(row.generation_id!);
              return (
                original &&
                /^[a-f0-9]{64}$/u.test(
                  original.financialDispositionReference,
                ) &&
                Number.isFinite(Date.parse(original.settledAt)) &&
                Date.parse(original.settledAt) >= Date.parse(row.created_at) &&
                Date.parse(original.accountingUntil) >
                  Date.parse(original.settledAt)
              );
            }),
          "accounting_settlement_time_unavailable",
          "Every locked usage record requires its own generation's original settlement and expiry.",
        );
        // Keep attempt/hold membership until every page has been processed.
        // Expired known costs are erased under this actual family deletion;
        // remaining costs retain their exact amount, original reference/date.
        const applied = await client.query<{
          action: string;
          until: string | null;
        }>(
          `WITH plans AS (
             SELECT * FROM jsonb_to_recordset($2::jsonb) AS p(id uuid,until timestamptz,reference text)
           ), retained AS (
             UPDATE creator.ai_usage u SET thread_id=NULL,fan_id=NULL,generation_id=NULL,attempt_id=NULL,
              call_ordinal=NULL,creator_hold_id=NULL,accounting_retained_until=p.until,
              accounting_retention_version=$3,accounting_retention_reason=$4,accounting_disposition_reference=p.reference
             FROM plans p WHERE u.creator_id=$1 AND u.id=p.id AND p.until>transaction_timestamp()
             RETURNING u.accounting_retained_until::text AS until
           ), expired AS (
             DELETE FROM creator.ai_usage u USING plans p WHERE u.creator_id=$1 AND u.id=p.id
              AND p.until<=transaction_timestamp() AND u.cost_micros IS NOT NULL
              AND u.created_at<date_trunc('day',transaction_timestamp()) RETURNING u.id
           ) SELECT 'retained' AS action,until FROM retained
             UNION ALL SELECT 'expired' AS action,NULL::text AS until FROM expired`,
          [
            family.creatorId,
            JSON.stringify(
              rows.map((row) => {
                const original = byGeneration.get(row.generation_id!)!;
                return {
                  id: row.id,
                  until: original.accountingUntil,
                  reference: original.financialDispositionReference,
                };
              }),
            ),
            retention.version,
            plan.reason,
          ],
        );
        invariant(
          applied.rowCount === rows.length,
          "accounting_cleanup_pending",
          "Every locked known cost must be retained to its original deadline or erased after it.",
        );
        for (const row of applied.rows) {
          if (row.action === "expired") expiredKnownCount++;
          else {
            retainedKnownCount++;
            if (
              !latestRetainedUntil ||
              Date.parse(row.until!) > Date.parse(latestRetainedUntil)
            )
              latestRetainedUntil = row.until!;
          }
        }
        for (const row of rows) {
          const metadata = `${canonical({ id: row.id, costMicros: row.cost_micros })}\n`;
          hash.update(metadata);
          unlinkedMetadataBytes += Buffer.byteLength(metadata);
          knownCount++;
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
      const current = await retention.current(client, job, family);
      invariant(
        current.financialDispositionReference ===
          plan.financialDispositionReference && current.reason === plan.reason,
        "accounting_retention_changed",
        "The exact reviewed accounting disposition must stay current through completion.",
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
          schemaVersion: 3,
          domain: "agent",
          jobId: job.jobId,
          family: { ...family },
          threadAccountingPurged: true,
          retentionVersion: retention.version,
          financialDispositionReference: plan.financialDispositionReference,
          unlinkedCount,
          unlinkedMetadataBytes,
          knownCount,
          retainedKnownCount,
          expiredKnownCount,
          unlinkedSha256: hash.digest("hex"),
          hashEncoding: "canonical-json-lines-uuid-order",
          deleted,
        },
        retained: [
          ...(retainedKnownCount
            ? [
                {
                  category: "unlinked_agent_accounting",
                  until: latestRetainedUntil!,
                  reason: plan.reason,
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
      const receipt = await journal.sealFamily(
        client,
        job,
        family,
        generationId,
        authority,
      );
      if (receipt.state === "unknown") {
        requireResolvedAccounting(
          await unresolvedAccountingInTransaction(
            client,
            family.creatorId,
            family,
            job.signal,
          ),
        );
        invariant(
          false,
          "accounting_uncertainty_time_unavailable",
          "Unresolved accounting has no complete original timestamp evidence.",
        );
      }
      return receipt;
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
  });
}
export type GenerationAccountingLifecycle = ReturnType<
  typeof generationAccountingLifecycle
>;
