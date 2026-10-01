import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { contentHash } from "../../core/canonical.js";
import { invariant } from "../../core/errors.js";

export const PayoutTransferRequestSchema = z.strictObject({
  destination: z.string().min(1).max(200),
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.string().regex(/^[A-Z]{3}$/u),
  sourcePayment: z.string().min(1).max(200),
  sourceTransaction: z.string().min(1).max(200),
  key: z.string().min(1).max(200),
});
export type PayoutTransferRequest = z.infer<typeof PayoutTransferRequestSchema>;
export type PayoutEffectIdentity = {
  id: string;
  creator_id: string;
  commitment_id: string;
  amount: string;
  currency: string;
  provider_key: string;
};
export const PAYOUT_CUSTODY_SOURCE_SHA256 =
  "311d5a4ead33f3b39c14bae3063971b7a0e4e71d531aca345fb7090128a10323";

/** Original request custody must commit with the effect before any transfer.
 * No migration number or installation is inferred from a proposal's existence. */
export class PayoutCustody {
  private constructor(
    private readonly database: string,
    private readonly migration: Readonly<{ version: string; checksum: string }>,
  ) {}
  static async prepare(
    pool: Pool,
    migration: { version: string; checksum: string },
  ) {
    invariant(
      /^\d{4}_w4_payout_custody$/u.test(migration.version) &&
        migration.checksum === PAYOUT_CUSTODY_SOURCE_SHA256,
      "payout_custody_unconfigured",
      "Payouts require the exact registered original-request migration.",
    );
    const database = (
      await pool.query<{ name: string }>("SELECT current_database() AS name")
    ).rows[0]!.name;
    const custody = new PayoutCustody(
      database,
      Object.freeze({ ...migration }),
    );
    const client = await pool.connect();
    try {
      await custody.assertCurrent(client);
    } finally {
      client.release();
    }
    return custody;
  }
  async assertCurrent(client: PoolClient) {
    const ready = (
      await client.query<{ ready: boolean }>(
        `SELECT current_database()=$3 AND NOT r.rolsuper AND NOT r.rolbypassrls
         AND EXISTS(SELECT 1 FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
         AND EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='creator' AND c.relname='commerce_payout_custody'
           AND c.relrowsecurity AND c.relforcerowsecurity AND c.relowner<>r.oid
           AND (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid=c.oid
             AND t.tgname IN('payout_custody_immutable','payout_custody_matches') AND t.tgenabled='O')=2)
         AND EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('creator.commerce_payout_effect')
           AND t.tgname='payout_identity_fence' AND t.tgenabled='O') AS ready
         FROM pg_roles r WHERE r.rolname=current_user`,
        [this.migration.version, this.migration.checksum, this.database],
      )
    ).rows[0];
    invariant(
      ready?.ready,
      "payout_custody_unconfigured",
      "Payout recovery requires its installed immutable custody and non-owner role.",
    );
  }
  async record(
    client: PoolClient,
    effect: PayoutEffectIdentity,
    request: PayoutTransferRequest,
  ) {
    await this.assertCurrent(client);
    const body = this.validate(effect, request);
    await client.query(
      `INSERT INTO creator.commerce_payout_custody(effect_id,creator_id,commitment_id,destination,source_payment,source_transaction,amount,currency,provider_key,request_hash)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        effect.id,
        effect.creator_id,
        effect.commitment_id,
        body.destination,
        body.sourcePayment,
        body.sourceTransaction,
        body.amount,
        body.currency,
        body.key,
        contentHash({ schemaVersion: 1, request: body }),
      ],
    );
  }
  async original(client: PoolClient, effect: PayoutEffectIdentity) {
    await this.assertCurrent(client);
    const row = (
      await client.query<{
        creator_id: string;
        commitment_id: string;
        destination: string;
        source_payment: string;
        source_transaction: string;
        amount: string;
        currency: string;
        provider_key: string;
        request_hash: string;
      }>("SELECT * FROM creator.commerce_payout_custody WHERE effect_id=$1", [
        effect.id,
      ])
    ).rows[0];
    invariant(
      row &&
        row.creator_id === effect.creator_id &&
        row.commitment_id === effect.commitment_id,
      "payout_original_request_missing",
      "The original payout needs reviewed provider recovery; current settings cannot replace it.",
    );
    const body = this.validate(effect, {
      destination: row.destination,
      amount: Number(row.amount),
      currency: row.currency,
      sourcePayment: row.source_payment,
      sourceTransaction: row.source_transaction,
      key: row.provider_key,
    });
    invariant(
      contentHash({ schemaVersion: 1, request: body }) === row.request_hash,
      "payout_original_request_changed",
      "The original payout request requires custody reconciliation.",
    );
    return Object.freeze(body);
  }
  private validate(
    effect: PayoutEffectIdentity,
    request: PayoutTransferRequest,
  ) {
    const body = PayoutTransferRequestSchema.parse(request);
    invariant(
      BigInt(body.amount) === BigInt(effect.amount) &&
        body.currency === effect.currency &&
        body.key === effect.provider_key,
      "payout_original_request_changed",
      "Payout terms must match their original effect.",
    );
    return body;
  }
}
