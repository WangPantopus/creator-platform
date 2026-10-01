import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { PoolEarnings } from "../../../../../packages/api/src/commerce/contracts.js";
import { contentHash } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import type { Actor } from "../identity/adapter.js";
import type { CommerceService } from "./service.js";
import type {
  PayoutProvider,
  VerifiedPoolCycle,
  VerifiedTransfer,
} from "./accounting.js";
import { allocateSlotDayPool } from "./extended.js";
import {
  PayoutTransferRequestSchema,
  type PayoutTransferRequest,
  type PayoutClaim,
} from "./payout-custody.js";

const Original = z.strictObject({
  cycle: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u),
  creatorId: z.uuid(),
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/u),
  transfer: PayoutTransferRequestSchema,
});
export type OriginalPoolTransfer = z.infer<typeof Original>;
const Reversal = z.strictObject({
  reference: z.string().min(1).max(200),
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  key: z.string().min(1).max(200),
  createdAt: z.iso.datetime({ offset: true }),
});
export type OriginalPoolReversal = z.infer<typeof Reversal>;
export interface PoolFundingAuthority {
  /** Genuine current, complete receipt/allocation authority, outside SQL locks.
   * Unknown reads cannot authorize a transfer or its compensation. */
  current(
    actor: Actor,
    original: OriginalPoolTransfer,
  ): Promise<{
    state: "eligible" | "held" | "unknown";
    snapshotHash: string;
    destination: string;
    sourcePayment: string;
    sourceTransaction: string;
    reconciledAt: Date;
  }>;
}
export type PoolTransferProvider = Pick<
  PayoutProvider,
  "account" | "transfer" | "current"
> & {
  reverseOriginal(
    request: OriginalPoolReversal & { original: PayoutTransferRequest },
    claim: PayoutClaim,
  ): Promise<void>;
  recoverTransfer(
    request: PayoutTransferRequest,
    claim: PayoutClaim,
  ): Promise<VerifiedTransfer | undefined>;
};
type Effect = {
  id: string;
  cycle: string;
  creator_id: string;
  allocation_cause: string;
  request: unknown;
  request_hash: string;
  provider_key: string;
  source_transaction: string;
  provider_ref: string | null;
  attempt: number;
  state: string;
  created_at: Date;
  compensation_required: boolean;
  compensation_request: unknown;
};
export const POOL_EFFECT_SOURCE_SHA256 =
  "26be8430c4301b7eda9060c94e9034b7afa5fd57a9ad5bec128f26ac2aefa4ca";
export function poolSnapshotHash(truth: VerifiedPoolCycle) {
  const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return contentHash({
    schemaVersion: 1,
    cycle: truth.cycle,
    currency: truth.currency,
    policyVersion: truth.policyVersion,
    sourceReference: truth.sourceReference,
    poolMinor: truth.poolMinor.toString(),
    weights: [...truth.weights]
      .sort((a, b) => order(a.creatorId, b.creatorId))
      .map((w) => ({ ...w, slotSeconds: w.slotSeconds.toString() })),
    funding: [...truth.funding]
      .sort((a, b) => order(a.sourceTransaction, b.sourceTransaction))
      .map((s) => ({ ...s, poolMinor: s.poolMinor.toString() })),
  });
}

/** Complete durable transfer/compensation custody. No default provider,
 * economics, original receipt, creator identity or migration activation. */
export class PassPoolJournal {
  private constructor(
    private readonly service: CommerceService,
    private readonly provider: PoolTransferProvider,
    private readonly funding: PoolFundingAuthority,
    private readonly countries: readonly string[],
    private readonly database: string,
    private readonly migration: Readonly<{ version: string; checksum: string }>,
  ) {}
  isForService(service: CommerceService) {
    return this.service === service;
  }
  async earnings(actor: Actor, creatorId: string) {
    return this.service.account(
      actor,
      async (client) => {
        await this.service.assertCreatorFinancialRead(client, actor, creatorId);
        await this.assertInstalled(client);
        // Complete creator-scoped aggregate, independent of overview row limits.
        // These are recorded slots, not a claim of current provider funding.
        const current = (
          await client.query<{
            cycle: string;
            observed_at: Date;
            closes_at: Date;
            fans: string;
            slots: string;
          }>(
            `SELECT to_char(now() AT TIME ZONE 'UTC','YYYY-MM') AS cycle,
          now() AS observed_at,
          (date_trunc('month',now() AT TIME ZONE 'UTC')+interval '1 month') AT TIME ZONE 'UTC' AS closes_at,
          count(DISTINCT fan_id)::text AS fans,count(*)::text AS slots
          FROM creator.commerce_pass_slot WHERE creator_id=$1
          AND state='active' AND grant_id IS NOT NULL AND starts_at<=now() AND ends_at>now()
          AND cycle_start=date_trunc('month',now() AT TIME ZONE 'UTC')::date`,
            [creatorId],
          )
        ).rows[0]!;
        const posted = await client.query<{
          cycle: string;
          currency: string;
          allocation_minor: string;
          transferred_minor: string;
          reversed_minor: string;
          slot_seconds: string;
          total_slot_seconds: string;
          pending_effects: string;
          unconfirmed_cash: boolean;
          reversal_pending: boolean;
          posted_at: Date;
        }>(
          `SELECT c.cycle,c.currency,l.amount::text AS allocation_minor,l.created_at AS posted_at,
          l.refs->>'slotSeconds' AS slot_seconds,l.refs->>'totalSlotSeconds' AS total_slot_seconds,
          (SELECT coalesce(sum(amount),0)::text FROM creator.commerce_ledger
            WHERE creator_id=$1 AND kind='payout' AND currency=c.currency
            AND refs->>'pool'='true' AND refs->>'cycle'=c.cycle) AS transferred_minor,
          (SELECT coalesce(sum(amount),0)::text FROM creator.commerce_ledger
            WHERE creator_id=$1 AND kind='adjustment' AND currency=c.currency
            AND refs->>'pool'='true' AND refs->>'direction'='credit' AND refs->>'cycle'=c.cycle) AS reversed_minor,
          (SELECT count(*)::text FROM creator.commerce_pool_effect
            WHERE creator_id=$1 AND cycle=c.cycle AND state IN('pending','processing','unknown')) AS pending_effects,
          ((SELECT coalesce(sum((request->'transfer'->>'amount')::bigint),0)
            FROM creator.commerce_pool_effect WHERE creator_id=$1 AND cycle=c.cycle)<>l.amount
            OR EXISTS(SELECT 1 FROM creator.commerce_pool_effect e WHERE e.creator_id=$1 AND e.cycle=c.cycle
            AND (e.state<>'failed' OR e.error_code IS DISTINCT FROM 'provider_transfer_failed')
            AND NOT EXISTS(SELECT 1 FROM creator.commerce_ledger cash WHERE cash.creator_id=e.creator_id
              AND cash.kind='payout' AND cash.cause=e.provider_key AND cash.provider_ref=e.provider_ref
              AND cash.amount=(e.request->'transfer'->>'amount')::bigint AND cash.currency=c.currency))) AS unconfirmed_cash,
          EXISTS(SELECT 1 FROM creator.commerce_pool_effect e WHERE e.creator_id=$1 AND e.cycle=c.cycle
            AND e.compensation_required AND e.state IN('pending','processing','unknown')) AS reversal_pending
          FROM creator.commerce_pool_cycle c JOIN creator.commerce_ledger l
            ON l.creator_id=$1 AND l.kind='pool_alloc' AND l.currency=c.currency
            AND l.cause='pool:'||c.cycle||':'||$1::text
          ORDER BY c.cycle DESC LIMIT 13`,
          [creatorId],
        );
        for (const cycle of posted.rows)
          invariant(
            BigInt(cycle.reversed_minor) <= BigInt(cycle.transferred_minor) &&
              BigInt(cycle.transferred_minor) <= BigInt(cycle.allocation_minor),
            "pool_cash_conflict",
            "Original posted pool cash needs reconciliation.",
          );
        return [
          PoolEarnings.parse({
            creatorId,
            cycle: current.cycle,
            observedAt: current.observed_at.toISOString(),
            closesAt: current.closes_at.toISOString(),
            fanCount: Number(current.fans),
            slotCount: Number(current.slots),
            historyLimited: posted.rows.length > 12,
            postedCycles: posted.rows.slice(0, 12).map((c) => ({
              cycle: c.cycle,
              currency: c.currency,
              allocationMinor: c.allocation_minor,
              transferredMinor: c.unconfirmed_cash ? null : c.transferred_minor,
              reversedMinor:
                c.unconfirmed_cash || c.reversal_pending
                  ? null
                  : c.reversed_minor,
              slotSeconds: c.slot_seconds,
              totalSlotSeconds: c.total_slot_seconds,
              pendingEffects: Number(c.pending_effects),
              postedAt: c.posted_at.toISOString(),
            })),
          }),
        ];
      },
      { isolation: "repeatable read" },
    );
  }
  static async prepare(input: {
    service: CommerceService;
    provider: PoolTransferProvider;
    funding: PoolFundingAuthority;
    countries: readonly string[];
    migration: { version: string; checksum: string };
  }) {
    invariant(
      input.migration.version === "0055_w4_pass_pool_effects" &&
        input.migration.checksum === POOL_EFFECT_SOURCE_SHA256 &&
        input.countries.length > 0,
      "pool_unconfigured",
      "Pool cash requires its exact registered journal, provider and approved markets.",
    );
    const database = (
      await input.service.pool.query<{ name: string }>(
        "SELECT current_database() AS name",
      )
    ).rows[0]!.name;
    const journal = new PassPoolJournal(
      input.service,
      input.provider,
      input.funding,
      Object.freeze([...input.countries]),
      database,
      Object.freeze({ ...input.migration }),
    );
    const client = await input.service.pool.connect();
    try {
      await journal.assertInstalled(client);
    } finally {
      client.release();
    }
    return journal;
  }
  private async assertInstalled(client: PoolClient) {
    const row = (
      await client.query<{ ready: boolean }>(
        `SELECT current_database()=$3 AND NOT r.rolsuper AND NOT r.rolbypassrls
       AND EXISTS(SELECT 1 FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
       AND (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='creator' AND c.relname IN('commerce_pool_cycle','commerce_pool_effect')
         AND c.relrowsecurity AND c.relforcerowsecurity AND c.relowner<>r.oid)=2
       AND EXISTS(SELECT 1 FROM pg_index i WHERE i.indexrelid=to_regclass('creator.commerce_pass_creator_cycle') AND i.indrelid=to_regclass('creator.commerce_pass_slot') AND i.indisvalid AND i.indisready)
       AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('creator.commerce_pool_cycle') AND tgname='commerce_pool_cycle_immutable' AND tgenabled='O')
       AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('creator.commerce_pool_effect') AND tgname='commerce_pool_effect_fence' AND tgenabled='O') AS ready
       FROM pg_roles r WHERE r.rolname=current_user`,
        [this.migration.version, this.migration.checksum, this.database],
      )
    ).rows[0];
    invariant(
      row?.ready,
      "pool_unconfigured",
      "Pool cash requires installed immutable custody on its prepared non-owner database.",
    );
  }
  /** Provider snapshot must contain complete approved net funding and slot-time
   * population. Deterministic slicing sums exactly to every creator allocation
   * and never spends a source charge's reviewed pool budget twice. */
  plan(truth: VerifiedPoolCycle) {
    const [year, month] = truth.cycle.split("-").map(Number);
    invariant(
      Number.isInteger(year) &&
        year! >= 2000 &&
        Number.isInteger(month) &&
        Date.UTC(year!, month!, 1) <= Date.now(),
      "pool_cycle_open",
      "A pool cycle must close before its slot time and funding can settle.",
    );
    invariant(
      /^\d{4}-(0[1-9]|1[0-2])$/u.test(truth.cycle) &&
        /^[A-Z]{3}$/u.test(truth.currency) &&
        truth.policyVersion?.length &&
        truth.policyVersion.length <= 100 &&
        truth.sourceReference.length > 0 &&
        truth.sourceReference.length <= 200 &&
        truth.poolMinor >= 0n &&
        truth.poolMinor <= BigInt(Number.MAX_SAFE_INTEGER) &&
        truth.reconciledAt instanceof Date &&
        Math.abs(Date.now() - truth.reconciledAt.getTime()) < 60000,
      "pool_evidence_invalid",
      "A complete current approved pool snapshot is required.",
    );
    const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    const sources = [...truth.funding].sort((a, b) =>
      order(a.sourceTransaction, b.sourceTransaction),
    );
    invariant(
      sources.length <= 1000 &&
        truth.weights.length <= 1000 &&
        new Set(sources.map((s) => s.sourceTransaction)).size ===
          sources.length &&
        new Set(sources.map((s) => s.sourcePayment)).size === sources.length &&
        sources.every(
          (s) =>
            /^pi_[A-Za-z0-9]+$/u.test(s.sourcePayment) &&
            /^ch_[A-Za-z0-9]+$/u.test(s.sourceTransaction) &&
            s.poolMinor > 0n &&
            s.poolMinor <= BigInt(Number.MAX_SAFE_INTEGER),
        ) &&
        sources.reduce((n, s) => n + s.poolMinor, 0n) === truth.poolMinor,
      "pool_funding_invalid",
      "Exact genuine charge budgets must sum to the reviewed net pool.",
    );
    const weights = [...truth.weights].sort((a, b) =>
      order(a.creatorId, b.creatorId),
    );
    invariant(
      weights.every(
        (w) =>
          z.uuid().safeParse(w.creatorId).success &&
          w.creatorId === w.creatorId.toLowerCase(),
      ),
      "pool_creator_invalid",
      "Pool weights require actual creator identities.",
    );
    const allocations = allocateSlotDayPool(truth.poolMinor, weights);
    const snapshotHash = poolSnapshotHash(truth);
    let index = 0,
      remaining = sources[0]?.poolMinor ?? 0n;
    const plans = allocations
      .sort((a, b) => order(a.creatorId, b.creatorId))
      .map((allocation) => {
        let amount = allocation.amount;
        const slices: {
          sourcePayment: string;
          sourceTransaction: string;
          amount: number;
        }[] = [];
        while (amount > 0n) {
          const source = sources[index];
          invariant(
            source && remaining > 0n,
            "pool_funding_invalid",
            "Pool allocation exceeded its original funding.",
          );
          const slice = amount < remaining ? amount : remaining;
          slices.push({
            sourcePayment: source.sourcePayment,
            sourceTransaction: source.sourceTransaction,
            amount: Number(slice),
          });
          amount -= slice;
          remaining -= slice;
          if (remaining === 0n) {
            index++;
            remaining = sources[index]?.poolMinor ?? 0n;
          }
        }
        return { ...allocation, slices };
      });
    invariant(
      index === sources.length && remaining === 0n,
      "pool_funding_invalid",
      "The complete allocation must consume exactly the approved pool budget.",
    );
    return { snapshotHash, plans };
  }
  async stage(
    client: PoolClient,
    truth: VerifiedPoolCycle,
    creatorId: string,
    destination: string,
  ) {
    await this.assertInstalled(client);
    const { snapshotHash, plans } = this.plan(truth);
    const plan = plans.find((p) => p.creatorId === creatorId);
    invariant(
      plan,
      "pool_creator_invalid",
      "No allocation exists for this creator.",
    );
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `pool_cycle:${truth.cycle}`,
    ]);
    const historical = await client.query(
      "SELECT id FROM creator.commerce_ledger WHERE kind='pool_alloc' AND cause=$1",
      [`pool:${truth.cycle}:${creatorId}`],
    );
    if (historical.rowCount) {
      const originalEffects = await client.query(
        "SELECT id FROM creator.commerce_pool_effect WHERE cycle=$1 AND creator_id=$2",
        [truth.cycle, creatorId],
      );
      invariant(
        originalEffects.rowCount === plan.slices.length,
        "pool_original_missing",
        "Historical allocation cannot acquire invented original funding requests.",
      );
    }
    const old = (
      await client.query<{ snapshot_hash: string }>(
        "SELECT snapshot_hash FROM creator.commerce_pool_cycle WHERE cycle=$1",
        [truth.cycle],
      )
    ).rows[0];
    if (!old) {
      const history = await client.query(
        "SELECT id FROM creator.commerce_ledger WHERE kind='pool_alloc' AND cause=$1",
        [`pool:${truth.cycle}:${creatorId}`],
      );
      invariant(
        history.rowCount === 0,
        "pool_original_missing",
        "Historical pool funding requires original evidence review before any cash transfer.",
      );
      await client.query(
        "INSERT INTO creator.commerce_pool_cycle(cycle,currency,pool_minor,policy_version,source_reference,snapshot_hash) VALUES($1,$2,$3,$4,$5,$6)",
        [
          truth.cycle,
          truth.currency,
          truth.poolMinor.toString(),
          truth.policyVersion,
          truth.sourceReference,
          snapshotHash,
        ],
      );
    }
    invariant(
      !old || old.snapshot_hash === snapshotHash,
      "pool_snapshot_changed",
      "The original pool changed; cause-linked reviewed recovery is required.",
    );
    const ids: string[] = [];
    for (const slice of plan.slices) {
      const key = `pool:${truth.cycle}:${creatorId}:${slice.sourceTransaction}`;
      const request = Original.parse({
        cycle: truth.cycle,
        creatorId,
        snapshotHash,
        transfer: { ...slice, destination, currency: truth.currency, key },
      });
      const hash = contentHash({ schemaVersion: 1, request });
      const prior = (
        await client.query<Effect>(
          "SELECT * FROM creator.commerce_pool_effect WHERE cycle=$1 AND creator_id=$2 AND source_transaction=$3",
          [truth.cycle, creatorId, slice.sourceTransaction],
        )
      ).rows[0];
      invariant(
        !prior || prior.request_hash === hash,
        "pool_original_changed",
        "The original pool destination and funding cannot be replaced.",
      );
      if (prior) ids.push(prior.id);
      else
        ids.push(
          (
            await client.query<{ id: string }>(
              "INSERT INTO creator.commerce_pool_effect(cycle,creator_id,allocation_cause,request,request_hash,provider_key,source_transaction) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
              [
                truth.cycle,
                creatorId,
                `pool:${truth.cycle}:${creatorId}`,
                JSON.stringify(request),
                hash,
                key,
                slice.sourceTransaction,
              ],
            )
          ).rows[0]!.id,
        );
    }
    return ids;
  }
  async existing(actor: Actor, creatorId: string, cycle: string) {
    return this.service.account(actor, async (client) => {
      await this.assertInstalled(client);
      const rows = await client.query<{ id: string }>(
        "SELECT id FROM creator.commerce_pool_effect WHERE creator_id=$1 AND cycle=$2 ORDER BY id LIMIT 1001",
        [creatorId, cycle],
      );
      invariant(
        rows.rows.length <= 1000,
        "pool_history_unavailable",
        "The complete pool history requires reviewed bulk reconciliation.",
      );
      return rows.rows.map((r) => r.id);
    });
  }
  private original(effect: Effect) {
    const original = Original.parse(effect.request);
    invariant(
      original.cycle === effect.cycle &&
        original.creatorId === effect.creator_id &&
        original.transfer.key === effect.provider_key &&
        original.transfer.sourceTransaction === effect.source_transaction &&
        contentHash({ schemaVersion: 1, request: original }) ===
          effect.request_hash,
      "pool_original_changed",
      "The immutable original pool request requires reconciliation.",
    );
    return original;
  }
  private async fence(client: PoolClient, effect: Effect) {
    await this.assertInstalled(client);
    const row = await client.query(
      "SELECT id FROM creator.commerce_pool_effect WHERE id=$1 AND attempt=$2 AND state='processing' AND lease_until>clock_timestamp() FOR UPDATE",
      [effect.id, effect.attempt],
    );
    invariant(
      row.rowCount === 1,
      "pool_lease_lost",
      "A newer worker owns this pool recovery.",
    );
  }
  /** Use through the genuine current account/purpose transaction. It retains
   * original recovery authority separately from current funding eligibility. */
  async assertProviderRequest(
    client: PoolClient,
    claim: PayoutClaim,
    request: PayoutTransferRequest,
    reversal?: OriginalPoolReversal,
  ) {
    await this.assertInstalled(client);
    const body = PayoutTransferRequestSchema.parse(request);
    const effect = (
      await client.query<Effect>(
        "SELECT * FROM creator.commerce_pool_effect WHERE provider_key=$1 AND id=$2 AND attempt=$3 AND state='processing' AND lease_until>clock_timestamp() FOR SHARE",
        [body.key, claim.effectId, claim.attempt],
      )
    ).rows[0];
    invariant(
      effect &&
        contentHash(this.original(effect).transfer) === contentHash(body),
      "pool_original_changed",
      "Current original pool provider custody is required.",
    );
    if (reversal)
      invariant(
        effect.compensation_required &&
          reversal.reference === effect.provider_ref &&
          contentHash(Reversal.parse(effect.compensation_request)) ===
            contentHash(Reversal.parse(reversal)),
        "pool_reversal_conflict",
        "Provider compensation must use the exact frozen original pool request.",
      );
  }
  async assertProviderReference(
    client: PoolClient,
    claim: PayoutClaim,
    reference: string,
  ) {
    await this.assertInstalled(client);
    const effect = (
      await client.query<Effect>(
        "SELECT * FROM creator.commerce_pool_effect WHERE id=$1 AND attempt=$2 AND provider_ref=$3 AND state='processing' AND lease_until>clock_timestamp() FOR SHARE",
        [claim.effectId, claim.attempt, reference],
      )
    ).rows[0];
    invariant(
      effect,
      "pool_lease_lost",
      "Current original pool reference custody is required.",
    );
    this.original(effect);
  }
  private async eligibility(actor: Actor, original: OriginalPoolTransfer) {
    const truth = await this.funding.current(actor, original);
    invariant(
      truth.state !== "unknown" &&
        truth.reconciledAt instanceof Date &&
        Math.abs(Date.now() - truth.reconciledAt.getTime()) < 60000,
      "pool_funding_unknown",
      "Current pool funding remains processing until authoritative reconciliation.",
    );
    const account = await this.provider.account(original.transfer.destination);
    return (
      truth.state === "eligible" &&
      truth.snapshotHash === original.snapshotHash &&
      truth.destination === original.transfer.destination &&
      truth.sourcePayment === original.transfer.sourcePayment &&
      truth.sourceTransaction === original.transfer.sourceTransaction &&
      account.reference === original.transfer.destination &&
      account.enabled &&
      !account.detailsDue &&
      this.countries.includes(account.country)
    );
  }
  private transferTruth(
    original: OriginalPoolTransfer,
    cash: VerifiedTransfer,
  ) {
    const body = original.transfer,
      receipts = cash.reversalReceipts ?? [];
    invariant(
      cash.id.length > 0 &&
        cash.id.length <= 200 &&
        cash.amount === body.amount &&
        cash.currency === body.currency &&
        cash.destination === body.destination &&
        cash.sourcePayment === body.sourcePayment &&
        cash.sourceTransaction === body.sourceTransaction &&
        cash.reversalReceipts !== undefined &&
        cash.keyHash === createHash("sha256").update(body.key).digest("hex") &&
        new Set(receipts.map((r) => r.reference)).size === receipts.length &&
        receipts.every(
          (r) =>
            r.reference.length > 0 &&
            r.reference.length <= 200 &&
            Number.isSafeInteger(r.amount) &&
            r.amount > 0,
        ) &&
        receipts.reduce((n, r) => n + BigInt(r.amount), 0n) <=
          BigInt(body.amount) &&
        (!cash.reversed ||
          receipts.reduce((n, r) => n + BigInt(r.amount), 0n) ===
            BigInt(body.amount)),
      "pool_cash_conflict",
      "Actual transfer and reversal receipts must match the original pool request.",
    );
  }
  private async receipt(
    client: PoolClient,
    effect: Effect,
    kind: string,
    amount: number,
    cause: string,
    reference: string,
    refs: Record<string, unknown>,
  ) {
    const body = this.original(effect).transfer;
    const prior = (
      await client.query(
        "SELECT * FROM creator.commerce_ledger WHERE kind=$1 AND cause=$2",
        [kind, cause],
      )
    ).rows[0];
    invariant(
      !prior ||
        (prior.creator_id === effect.creator_id &&
          prior.fan_id === null &&
          prior.packet_id === null &&
          prior.commitment_id === null &&
          BigInt(prior.amount) === BigInt(amount) &&
          prior.currency === body.currency &&
          prior.provider_ref === reference &&
          contentHash(prior.refs) === contentHash(refs)),
      "pool_receipt_conflict",
      "An immutable original pool cash receipt differs from provider truth.",
    );
    if (!prior)
      await client.query(
        "INSERT INTO creator.commerce_ledger(creator_id,kind,amount,currency,cause,provider_ref,refs) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          effect.creator_id,
          kind,
          amount,
          body.currency,
          cause,
          reference,
          JSON.stringify(refs),
        ],
      );
  }
  private async cash(
    client: PoolClient,
    effect: Effect,
    cash: VerifiedTransfer,
    eligible: boolean,
  ) {
    const original = this.original(effect);
    this.transferTruth(original, cash);
    invariant(
      cash.state === "succeeded" && cash.id === effect.provider_ref,
      "pool_cash_unconfirmed",
      "Only actual original transferred cash enters the ledger.",
    );
    const refs = {
      pool: true,
      cycle: effect.cycle,
      allocationCause: effect.allocation_cause,
      effectId: effect.id,
    };
    await this.receipt(
      client,
      effect,
      "payout",
      cash.amount,
      effect.provider_key,
      cash.id,
      refs,
    );
    if (eligible && !cash.reversed && !cash.reversalReceipts?.length)
      await this.receipt(
        client,
        effect,
        "payout_release",
        cash.amount,
        effect.provider_key,
        cash.id,
        refs,
      );
    for (const reversal of cash.reversalReceipts ?? [])
      await this.receipt(
        client,
        effect,
        "adjustment",
        reversal.amount,
        `pool_reversal:${reversal.reference}`,
        reversal.reference,
        { ...refs, direction: "credit", sourceTransfer: cash.id },
      );
  }
  async run(actor: Actor, id: string) {
    const effect = await this.service.account(actor, async (client) => {
      await this.assertInstalled(client);
      return (
        await client.query<Effect>(
          "UPDATE creator.commerce_pool_effect SET state='processing',attempt=attempt+1,lease_until=now()+interval '3 minutes',updated_at=now() WHERE id=$1 AND (state IN('pending','unknown','done','failed') OR (state='processing' AND lease_until<now())) RETURNING *",
          [id],
        )
      ).rows[0];
    });
    if (!effect) return { processing: true };
    const claim = { effectId: effect.id, attempt: effect.attempt };
    try {
      const original = this.original(effect);
      let cash = effect.provider_ref
        ? await this.provider.current(effect.provider_ref, claim)
        : await this.provider.recoverTransfer(original.transfer, claim);
      if (!cash) {
        invariant(
          Date.now() - effect.created_at.getTime() >= -60000 &&
            Date.now() - effect.created_at.getTime() < 23 * 3600000,
          "pool_aged_unknown",
          "An aged unknown pool transfer requires original provider review; no new transfer is attempted.",
        );
        invariant(
          !effect.compensation_required &&
            (await this.eligibility(actor, original)),
          "pool_held",
          "Pool cash is held by current funding/account eligibility.",
        );
        await this.service.account(actor, (client) =>
          this.fence(client, effect),
        );
        cash = await this.provider.transfer(original.transfer, claim);
      }
      this.transferTruth(original, cash);
      await this.service.account(actor, async (client) => {
        await this.fence(client, effect);
        invariant(
          !effect.provider_ref || effect.provider_ref === cash!.id,
          "pool_cash_conflict",
          "The original pool transfer reference changed.",
        );
        await client.query(
          "UPDATE creator.commerce_pool_effect SET provider_ref=$2 WHERE id=$1",
          [id, cash!.id],
        );
        effect.provider_ref = cash!.id;
        if (cash!.state === "succeeded")
          await this.cash(client, effect, cash!, false);
      });
      if (cash.state !== "succeeded") {
        invariant(
          cash.state === "failed",
          "pool_cash_unknown",
          "Pool cash is not yet confirmed.",
        );
        await this.service.account(actor, async (client) => {
          await this.fence(client, effect);
          await client.query(
            "UPDATE creator.commerce_pool_effect SET provider_ref=$2,state='failed',lease_until=NULL,error_code='provider_transfer_failed' WHERE id=$1",
            [id, cash!.id],
          );
        });
        return { processing: false, state: "failed" };
      }
      // A durable compensation cause or actual partial reversal cannot become
      // eligible again. Recover its frozen reversal even if funding reads fail.
      const eligible =
        !effect.compensation_required && !cash.reversalReceipts?.length
          ? await this.eligibility(actor, original)
          : false;
      const compensate =
        effect.compensation_required ||
        !eligible ||
        Boolean(cash.reversalReceipts?.length);
      if (compensate && !cash.reversed) {
        const reversal = await this.service.account(actor, async (client) => {
          await this.fence(client, effect);
          const remaining =
            cash!.amount -
            (cash!.reversalReceipts ?? []).reduce((n, r) => n + r.amount, 0);
          const row = (
            await client.query<{ compensation_request: unknown }>(
              "UPDATE creator.commerce_pool_effect SET compensation_required=true,error_code=COALESCE(error_code,'pool_eligibility_changed'),compensation_request=COALESCE(compensation_request,jsonb_build_object('reference',$2::text,'amount',$3::bigint,'key',$4::text,'createdAt',clock_timestamp())) WHERE id=$1 RETURNING compensation_request",
              [id, cash!.id, remaining, `${effect.provider_key}:reverse`],
            )
          ).rows[0]!;
          const request = Reversal.parse(row.compensation_request);
          invariant(
            request.reference === cash!.id &&
              request.key === `${effect.provider_key}:reverse` &&
              request.amount <= cash!.amount,
            "pool_reversal_conflict",
            "The immutable original pool reversal differs from its transfer.",
          );
          return request;
        });
        effect.compensation_required = true;
        await this.service.account(actor, (client) =>
          this.fence(client, effect),
        );
        await this.provider.reverseOriginal(
          { ...reversal, original: original.transfer },
          claim,
        );
        cash = await this.provider.current(cash.id, claim);
        this.transferTruth(original, cash);
      }
      const finalCash = cash;
      const pending = compensate && !finalCash.reversed;
      await this.service.account(actor, async (client) => {
        await this.fence(client, effect);
        await this.cash(client, effect, finalCash, eligible && !compensate);
        await client.query(
          "UPDATE creator.commerce_pool_effect SET state=$2,lease_until=NULL,next_at=now()+interval '1 minute',error_code=CASE WHEN $3 THEN COALESCE(error_code,'pool_compensation_pending') WHEN $4 THEN COALESCE(error_code,'pool_transfer_reversed') ELSE NULL END WHERE id=$1",
          [
            id,
            pending ? "unknown" : finalCash.reversed ? "failed" : "done",
            pending,
            finalCash.reversed,
          ],
        );
      });
      return {
        processing: pending,
        state: pending ? "unknown" : finalCash.reversed ? "failed" : "done",
      };
    } catch (error) {
      await this.service.account(actor, async (client) => {
        await this.assertInstalled(client);
        await client.query(
          "UPDATE creator.commerce_pool_effect SET state='unknown',lease_until=NULL,next_at=now()+interval '1 minute',error_code=COALESCE(error_code,$3) WHERE id=$1 AND attempt=$2 AND state='processing' AND lease_until>clock_timestamp()",
          [
            id,
            effect.attempt,
            error instanceof DomainError
              ? error.code
              : "pool_reconciliation_required",
          ],
        );
      });
      throw error;
    }
  }
}
