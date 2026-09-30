import type { Actor } from "../identity/adapter.js";
import type { CommerceService } from "./service.js";
import { invariant } from "../../core/errors.js";

export interface VerifiedMoneyStatement {
  paymentReference: string;
  currency: string;
  capturedMinor: number;
  refundedMinor: number;
  netMinor: number;
  disputeOpen: boolean;
  fetchedAt: Date;
  entries: readonly {
    reference: string;
    kind: "fee" | "reserve" | "reserve_release";
    amount: number;
  }[];
}
/** Provider/Connect topology defines genuine fee/reserve entries and their immutable identities.
 * The client cannot supply entries, amounts, dispute state or provider references. */
export interface MoneyStatementProvider {
  current(paymentReference: string): Promise<VerifiedMoneyStatement>;
}
export class MoneyReconciliation {
  constructor(
    private readonly service: CommerceService,
    private readonly provider: MoneyStatementProvider,
  ) {}
  async reconcile(actor: Actor, packetId: string) {
    const before = await this.service.packet(actor, packetId);
    invariant(
      before.packet.intent_ref && before.commitment,
      "payment_unavailable",
      "A verified payment reference is required.",
    );
    const truth = await this.provider.current(before.packet.intent_ref);
    invariant(
      truth.paymentReference === before.packet.intent_ref &&
        truth.currency === before.packet.snapshot.currency &&
        Math.abs(Date.now() - truth.fetchedAt.getTime()) < 60000 &&
        [
          truth.capturedMinor,
          truth.refundedMinor,
          truth.netMinor,
          ...truth.entries.map((row) => row.amount),
        ].every((n) => Number.isSafeInteger(n) && n >= 0),
      "money_statement_invalid",
      "The current provider statement is invalid.",
    );
    return this.service.account(actor, async (client) => {
      const row = (
        await client.query(
          "SELECT p.intent_ref,p.version AS packet_version,c.id AS commitment_id,c.version AS commitment_version,p.creator_id,p.fan_id FROM creator.commerce_packet p JOIN creator.commerce_commitment c ON c.packet_id=p.id WHERE p.id=$1 FOR UPDATE OF p,c",
          [packetId],
        )
      ).rows[0];
      invariant(
        row && row.intent_ref === truth.paymentReference,
        "payment_changed",
        "The payment changed during reconciliation.",
      );
      // Fetch outside the transaction, then fence against the exact aggregate read.
      // Any newer reconciliation advances the commitment version, so an older
      // no-dispute response cannot clear a hold posted while it was in flight.
      invariant(
        row.packet_version === before.packet.version &&
          row.commitment_version === before.commitment.version,
        "money_statement_stale",
        "The request changed while reading provider funds. Fetch a new statement before applying it.",
      );
      const entries = (
        await client.query<{ kind: string; amount: string }>(
          "SELECT kind,amount FROM creator.commerce_ledger WHERE packet_id=$1 AND kind IN('capture','refund')",
          [packetId],
        )
      ).rows;
      const captured = entries
        .filter((e) => e.kind === "capture")
        .reduce((n, e) => n + BigInt(e.amount), 0n);
      const refunded = entries
        .filter((e) => e.kind === "refund")
        .reduce((n, e) => n + BigInt(e.amount), 0n);
      invariant(
        captured === BigInt(truth.capturedMinor) &&
          refunded === BigInt(truth.refundedMinor),
        "cash_reconciliation_required",
        "Capture and refund causes must reconcile before accounting adjustments.",
      );
      for (const entry of truth.entries) {
        invariant(
          entry.reference.length > 0 && entry.reference.length <= 200,
          "money_reference_invalid",
          "The provider accounting reference is invalid.",
        );
        const kind =
          entry.kind === "reserve_release" ? "adjustment" : entry.kind;
        const cause = `money:${packetId}:${entry.kind}:${entry.reference}`;
        const prior = (
          await client.query(
            "SELECT kind,amount,currency,refs FROM creator.commerce_ledger WHERE kind=$1 AND cause=$2",
            [kind, cause],
          )
        ).rows[0];
        invariant(
          !prior ||
            (BigInt(prior.amount) === BigInt(entry.amount) &&
              prior.currency === truth.currency &&
              prior.refs.direction ===
                (entry.kind === "reserve_release" ? "credit" : "debit")),
          "money_entry_changed",
          "A posted provider entry changed; a new cause-linked adjustment is required.",
        );
        await client.query(
          "INSERT INTO creator.commerce_ledger(creator_id,fan_id,packet_id,commitment_id,kind,amount,currency,cause,provider_ref,refs) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING",
          [
            row.creator_id,
            row.fan_id,
            packetId,
            row.commitment_id,
            kind,
            entry.amount,
            truth.currency,
            cause,
            entry.reference,
            JSON.stringify({
              direction: entry.kind === "reserve_release" ? "credit" : "debit",
              sourcePayment: truth.paymentReference,
              entryKind: entry.kind,
            }),
          ],
        );
      }
      const net = (
        await client.query<{ amount: string }>(
          "SELECT coalesce(sum(CASE WHEN kind='capture' OR (kind='adjustment' AND refs->>'direction'='credit') THEN amount ELSE -amount END),0)::text AS amount FROM creator.commerce_ledger WHERE packet_id=$1 AND kind IN('capture','refund','fee','reserve','adjustment')",
          [packetId],
        )
      ).rows[0]!;
      invariant(
        BigInt(net.amount) === BigInt(truth.netMinor),
        "ledger_reconciliation_required",
        "The append-only ledger does not match available provider funds.",
      );
      await client.query(
        "UPDATE creator.commerce_commitment SET dispute_open=$2,version=version+1 WHERE id=$1",
        [row.commitment_id, truth.disputeOpen],
      );
      return {
        packetId,
        netMinor: net.amount,
        currency: truth.currency,
        disputeOpen: truth.disputeOpen,
      };
    });
  }
}
