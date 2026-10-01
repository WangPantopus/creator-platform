import { z } from "zod";
import {
  CreatorEarnings,
  CreatorLedgerPage,
  Currency,
} from "../../../../../packages/api/src/commerce/contracts.js";
import { DomainError, invariant } from "../../core/errors.js";
import type { PoolClient } from "pg";
import type { Actor } from "../identity/adapter.js";
import type { CommerceService } from "./service.js";

const Cursor = z.strictObject({
  creatorId: z.uuid(),
  currency: Currency,
  createdAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
});
function decodeCursor(encoded: string) {
  try {
    return Cursor.parse(
      JSON.parse(
        Buffer.from(
          z
            .string()
            .min(1)
            .max(512)
            .regex(/^[A-Za-z0-9_-]+$/u)
            .parse(encoded),
          "base64url",
        ).toString("utf8"),
      ),
    );
  } catch {
    throw new DomainError(
      "invalid_earnings_cursor",
      "Refresh this creator's ledger history.",
      400,
    );
  }
}

/** Complete confirmed amounts and bounded, owner-only history. Pool money has
 * its own original-cycle projection. Neither overview limits nor fan history
 * may change these totals. This reader never grants provider authority. */
export class CreatorEarningsReader {
  constructor(private readonly service: CommerceService) {}
  private async owner(client: PoolClient, actor: Actor, creatorId: string) {
    await this.service.assertCreatorFinancialRead(client, actor, creatorId);
  }
  private async page(
    client: PoolClient,
    creatorId: string,
    currency: string,
    encoded?: string,
  ) {
    Currency.parse(currency);
    const cursor = encoded ? decodeCursor(encoded) : null;
    invariant(
      !cursor ||
        (cursor.creatorId === creatorId && cursor.currency === currency),
      "earnings_cursor_changed",
      "Continue this creator's own ledger history.",
    );
    const rows = (
      await client.query<{
        id: string;
        packet_id: string | null;
        kind: string;
        amount: string;
        currency: string;
        created_at: Date;
        cursor_time: string;
      }>(
        `SELECT id,packet_id,kind,amount::text,currency,created_at,
       to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time
       FROM creator.commerce_ledger WHERE creator_id=$1 AND currency=$2 AND kind<>'pool_alloc'
       AND refs->>'pool' IS DISTINCT FROM 'true'
       AND ($3::timestamptz IS NULL OR (created_at,id)<($3::timestamptz,$4::uuid))
       ORDER BY created_at DESC,id DESC LIMIT 101`,
        [creatorId, currency, cursor?.createdAt ?? null, cursor?.id ?? null],
      )
    ).rows;
    const visible = rows.slice(0, 100),
      last = visible.at(-1);
    return CreatorLedgerPage.parse({
      currency,
      entries: visible.map((r) => ({
        id: r.id,
        packetId: r.packet_id,
        kind: r.kind,
        amount: r.amount,
        currency: r.currency,
        createdAt: r.created_at.toISOString(),
      })),
      nextCursor:
        rows.length > 100 && last
          ? Buffer.from(
              JSON.stringify({
                creatorId,
                currency,
                createdAt: last.cursor_time,
                id: last.id,
              }),
            ).toString("base64url")
          : null,
    });
  }
  async ledger(
    actor: Actor,
    creatorId: string,
    currency: string,
    cursor?: string,
  ) {
    return this.service.account(
      actor,
      async (client) => {
        await this.owner(client, actor, creatorId);
        return this.page(client, creatorId, currency, cursor);
      },
      { isolation: "repeatable read" },
    );
  }
  async read(actor: Actor, creatorId: string) {
    return this.service.account(
      actor,
      async (client) => {
        await this.owner(client, actor, creatorId);
        const totals = (
          await client.query<{
            currency: string;
            captured: string;
            requests: string;
            memberships: string;
            refunded: string;
            transferred: string;
            reversed: string;
            pending: string;
            unconfirmed_cash: boolean;
            reversal_pending: boolean;
          }>(
            `WITH ledger AS (
          SELECT currency,
          coalesce(sum(amount) FILTER(WHERE kind='capture'),0)::text AS captured,
          coalesce(sum(amount) FILTER(WHERE kind='capture' AND packet_id IS NOT NULL),0)::text AS requests,
          coalesce(sum(amount) FILTER(WHERE kind='capture' AND refs ? 'membershipId'),0)::text AS memberships,
          coalesce(sum(amount) FILTER(WHERE kind='refund'),0)::text AS refunded,
          coalesce(sum(amount) FILTER(WHERE kind='payout'),0)::text AS transferred,
          coalesce(sum(amount) FILTER(WHERE kind='adjustment' AND refs->>'direction'='credit' AND refs ? 'sourceTransfer'),0)::text AS reversed
          FROM creator.commerce_ledger WHERE creator_id=$1 AND kind<>'pool_alloc'
          AND refs->>'pool' IS DISTINCT FROM 'true' GROUP BY currency
        ), effects AS (
          SELECT e.currency,count(*) FILTER(WHERE e.state IN('pending','processing','unknown'))::text AS pending,
          bool_or((e.state<>'failed' OR e.error_code IS DISTINCT FROM 'provider_transfer_failed')
            AND NOT EXISTS(SELECT 1 FROM creator.commerce_ledger cash WHERE cash.creator_id=e.creator_id
              AND cash.kind='payout' AND cash.cause=e.provider_key AND cash.provider_ref=e.provider_ref
              AND cash.amount=e.amount AND cash.currency=e.currency)) AS unconfirmed_cash,
          bool_or(e.provider_ref IS NOT NULL AND e.state IN('pending','processing','unknown')) AS reversal_pending
          FROM creator.commerce_payout_effect e WHERE e.creator_id=$1 GROUP BY e.currency
        ) SELECT coalesce(l.currency,e.currency) AS currency,
          coalesce(l.captured,'0') AS captured,coalesce(l.requests,'0') AS requests,
          coalesce(l.memberships,'0') AS memberships,coalesce(l.refunded,'0') AS refunded,
          coalesce(l.transferred,'0') AS transferred,coalesce(l.reversed,'0') AS reversed,
          coalesce(e.pending,'0') AS pending,coalesce(e.unconfirmed_cash,false) AS unconfirmed_cash,
          coalesce(e.reversal_pending,false) AS reversal_pending
          FROM ledger l FULL JOIN effects e ON e.currency=l.currency ORDER BY currency`,
            [creatorId],
          )
        ).rows;
        for (const t of totals)
          invariant(
            BigInt(t.reversed) <= BigInt(t.transferred),
            "earnings_cash_conflict",
            "Recorded payout cash needs reconciliation.",
          );
        return CreatorEarnings.parse({
          creatorId,
          observedAt: new Date().toISOString(),
          currencies: totals.map((t) => ({
            currency: t.currency,
            capturedMinor: t.captured,
            requestMinor: t.requests,
            membershipMinor: t.memberships,
            refundedMinor: t.refunded,
            transferredMinor: t.unconfirmed_cash ? null : t.transferred,
            reversedMinor:
              t.unconfirmed_cash || t.reversal_pending ? null : t.reversed,
            pendingPayouts: Number(t.pending),
          })),
          ledger: await this.page(
            client,
            creatorId,
            totals[0]?.currency ?? this.service.policy.currency,
          ),
        });
      },
      { isolation: "repeatable read" },
    );
  }
}
