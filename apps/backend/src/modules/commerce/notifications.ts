import type { PoolClient } from "pg";
import { z } from "zod";
import { copy } from "@qelvora/copy";
import { invariant } from "../../core/errors.js";
import { contentHash } from "../../core/canonical.js";
import type { Database } from "../../db/database.js";
import { assertThreadScope, type ThreadScope } from "../access/scope.js";
import {
  EventEnvelope,
  type GrowthEvent,
  type NotificationState,
} from "../growth/contracts.js";

const ownerTypes = [
  "packet_submitted",
  "packet_submitted_creator",
  "packet_more_info",
  "packet_info_received",
  "packet_offer",
  "commitment_created",
  "commitment_delivered",
  "commitment_resolution",
  "hold_released",
  "refunded",
] as const;
type Recipient = GrowthEvent["recipients"][number];
/** Current W1 recipient identity/adult status and W8 creator/pair/account
 * denials must be held on this client through the operation. False is a known
 * denial; unavailable authority throws and leaves the event unacknowledged. */
export type CommerceNotificationRecipientAuthority = (
  client: PoolClient,
  scope: ThreadScope,
  recipient: Recipient,
) => Promise<boolean>;
type OwnerRow = {
  id: string;
  aggregate_id: string;
  aggregate_version: number;
  type: string;
  payload: Record<string, unknown>;
  created_at: Date;
  packet_id: string;
  packet_version: number;
  packet_state: string;
  current_state: string;
  snapshot: Record<string, unknown>;
  proposed_mode: Record<string, unknown> | null;
  current_version: number;
  fan_account: string;
  creator_account: string;
  display_name: string;
  verification: string;
  recovery_required: boolean;
};
const select = `SELECT e.id,e.aggregate_id,e.aggregate_version,e.type,e.payload,e.created_at,
 p.id AS packet_id,p.version AS packet_version,p.state AS packet_state,p.snapshot,p.proposed_mode,
 CASE WHEN e.type IN('commitment_created','commitment_delivered','commitment_resolution','refunded') THEN coalesce(obligation.state,p.state) ELSE p.state END AS current_state,
 CASE WHEN e.aggregate_id=p.id THEN p.version ELSE c.version END AS current_version,
 fp.account_id AS fan_account,cp.account_id AS creator_account,cp.display_name,cp.verification,cp.recovery_required
 FROM creator.commerce_event e
 LEFT JOIN creator.commerce_commitment c ON c.id=e.aggregate_id AND c.creator_id=e.creator_id AND c.fan_id=e.fan_id
 JOIN creator.commerce_packet p ON (p.id=e.aggregate_id OR (p.id=c.packet_id AND e.payload->>'packetId'=p.id::text))
   AND p.creator_id=e.creator_id AND p.fan_id=e.fan_id
 LEFT JOIN creator.commerce_commitment obligation ON obligation.packet_id=p.id AND obligation.creator_id=p.creator_id AND obligation.fan_id=p.fan_id
 JOIN creator.creator_profile cp ON cp.id=p.creator_id
 JOIN creator.fan_profile fp ON fp.id=p.fan_id
 WHERE p.thread_id=$1 AND e.creator_id=$2 AND e.fan_id=$3 AND e.type=ANY($4::text[])`;

/** Actual persisted request events only. The host enumerates genuine issued
 * scopes; there is no route, actor synthesis, schema backfill or provider I/O.
 * W7 commits its inbox before acknowledge. Current state is read again for
 * each delivery/list operation, independently from the envelope. */
export class CommerceRequestNotifications {
  readonly producer = "commerce" as const;
  private constructor(
    private readonly database: Database,
    private readonly scope: ThreadScope,
    private readonly recipients: CommerceNotificationRecipientAuthority,
    private readonly registered: () => Promise<void>,
  ) {}
  static async prepare(input: {
    database: Database;
    scope: ThreadScope;
    assertRecipientAllowed: CommerceNotificationRecipientAuthority;
    /** Actual owner outbox export/deletion/retention registration. */
    assertPrivacyRegistered(): Promise<void>;
  }) {
    assertThreadScope(input.scope);
    invariant(
      typeof input.assertRecipientAllowed === "function" &&
        typeof input.assertPrivacyRegistered === "function",
      "commerce_notifications_unconfigured",
      "Request notifications require current recipient authority and registered privacy ownership.",
    );
    await input.database.assertRuntimeRole();
    const registered = input.assertPrivacyRegistered.bind(input);
    await registered();
    await input.database.withThread(input.scope, async (client) => {
      const ready = (
        await client.query<{ ready: boolean }>(
          `SELECT c.relrowsecurity AND c.relforcerowsecurity AND c.relowner<>r.oid
           AND has_table_privilege(current_user,c.oid,'SELECT') AND has_table_privilege(current_user,c.oid,'UPDATE') AS ready
           FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN pg_roles r
           WHERE n.nspname='creator' AND c.relname='commerce_event' AND r.rolname=current_user`,
        )
      ).rows[0];
      invariant(
        ready?.ready,
        "commerce_notifications_unconfigured",
        "The canonical non-owner commerce outbox is required.",
      );
    });
    return new CommerceRequestNotifications(
      input.database,
      input.scope,
      input.assertRecipientAllowed.bind(input),
      registered,
    );
  }
  private parameters() {
    return [
      this.scope.threadId,
      this.scope.creatorId,
      this.scope.fanId,
      ownerTypes,
    ];
  }
  private kind(row: OwnerRow): GrowthEvent["type"] {
    if (row.type === "packet_submitted_creator") return "new_packet";
    // Older offers have no retained exact signature metadata. They remain a
    // System request update, without inventing a named creator act.
    if (
      row.type === "packet_offer" &&
      z.uuid().safeParse(row.payload.signedActId).success &&
      typeof row.payload.signedContentHash === "string" &&
      /^[a-f0-9]{64}$/u.test(row.payload.signedContentHash)
    )
      return "creator_offer";
    return "request_status";
  }
  private recipient(row: OwnerRow): Recipient {
    return row.type === "packet_submitted_creator"
      ? { accountId: row.creator_account, role: "creator" }
      : { accountId: row.fan_account, role: "fan" };
  }
  private async state(
    client: PoolClient,
    row: OwnerRow,
  ): Promise<NotificationState> {
    const kind = this.kind(row);
    let available =
      row.verification === "verified" &&
      !row.recovery_required &&
      row.current_version >= row.aggregate_version;
    if (kind === "new_packet")
      available &&=
        row.packet_state === "submitted" &&
        row.current_version === row.aggregate_version;
    if (kind === "creator_offer") {
      available &&=
        row.packet_state === "offer_pending" &&
        row.current_version === row.aggregate_version;
      available &&=
        row.payload.signedContentHash ===
        contentHash({
          actType: "accept",
          subjectId: this.scope.threadId,
          content: {
            packetId: row.packet_id,
            packetVersion: row.aggregate_version - 1,
            snapshot: row.snapshot,
            action: "group_offer",
            proposedMode: row.proposed_mode,
          },
        });
      const signature = await client.query(
        `SELECT id FROM creator.signed_verification WHERE id=$1 AND creator_id=$2 AND account_id=$3
         AND act_type='accept' AND content_hash=$4 AND NOT key_revoked AND NOT creator_revoked AND NOT withdrawn`,
        [
          row.payload.signedActId,
          this.scope.creatorId,
          row.creator_account,
          row.payload.signedContentHash,
        ],
      );
      available &&= signature.rowCount === 1;
    }
    const authorized = await this.recipients(
      client,
      this.scope,
      this.recipient(row),
    );
    return {
      available,
      authorized,
      version: row.current_version,
      creatorName: row.display_name,
      authorKind: kind === "creator_offer" ? "human_creator" : "system",
      safePreview: kind === "new_packet" ? copy.queueNew : copy.requestUpdate,
      // C09's present destination contract cannot name the actual commerce
      // or Studio detail routes. Keep the safe inbox target until coordinated.
      destination: "/notifications",
      status: row.current_state,
    };
  }
  async pending(
    limit: number,
  ): Promise<readonly { id: string; event: GrowthEvent | null }[]> {
    const bound = z.int().min(1).max(100).parse(limit);
    await this.registered();
    return this.database.withThread(this.scope, async (client) => {
      const rows = (
        await client.query<OwnerRow>(
          `${select} AND e.published_at IS NULL ORDER BY e.created_at,e.id LIMIT $5`,
          [...this.parameters(), bound],
        )
      ).rows;
      const pending = [];
      for (const row of rows) {
        const state = await this.state(client, row);
        pending.push({
          id: row.id,
          event:
            state.available && state.authorized
              ? EventEnvelope.parse({
                  id: row.id,
                  schemaVersion: 1,
                  type: this.kind(row),
                  creatorId: this.scope.creatorId,
                  aggregateId: row.aggregate_id,
                  aggregateVersion: row.aggregate_version,
                  // The actual owner event causes its mapped C09 envelope; the packet
                  // is the existing correlation aggregate. No new UUID is invented.
                  causationId: row.id,
                  correlationId: row.packet_id,
                  occurredAt: row.created_at.toISOString(),
                  recipients: [this.recipient(row)],
                })
              : null,
        });
      }
      await this.registered();
      return pending;
    });
  }
  async acknowledge(id: string): Promise<void> {
    z.uuid().parse(id);
    await this.registered();
    await this.database.withThread(this.scope, async (client) => {
      const row = (
        await client.query<OwnerRow>(`${select} AND e.id=$5`, [
          ...this.parameters(),
          id,
        ])
      ).rows[0];
      invariant(
        row,
        "commerce_event_unavailable",
        "This event is outside the current issued request family.",
      );
      // A denied/stale event can be discarded; authority failures throw. The
      // inbox must already be durable when W7 acknowledges an available event.
      await this.state(client, row);
      await client.query(
        "UPDATE creator.commerce_event SET published_at=coalesce(published_at,now()) WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
        [id, this.scope.creatorId, this.scope.fanId],
      );
      await this.registered();
    });
  }
  async current(
    event: GrowthEvent,
    recipient: Recipient,
  ): Promise<NotificationState> {
    const envelope = EventEnvelope.parse(event);
    await this.registered();
    return this.database.withThread(this.scope, async (client) => {
      const row = (
        await client.query<OwnerRow>(`${select} AND e.id=$5`, [
          ...this.parameters(),
          envelope.id,
        ])
      ).rows[0];
      if (!row)
        return {
          available: false,
          authorized: false,
          version: 0,
          creatorName: "",
          authorKind: "system",
          safePreview: "",
          destination: "/notifications",
        };
      const actual = this.recipient(row);
      invariant(
        envelope.creatorId === this.scope.creatorId &&
          envelope.aggregateId === row.aggregate_id &&
          envelope.aggregateVersion === row.aggregate_version &&
          envelope.type === this.kind(row) &&
          envelope.causationId === row.id &&
          envelope.correlationId === row.packet_id &&
          envelope.occurredAt === row.created_at.toISOString() &&
          envelope.recipients.length === 1 &&
          envelope.recipients[0]!.accountId === actual.accountId &&
          envelope.recipients[0]!.role === actual.role &&
          recipient.accountId === actual.accountId &&
          recipient.role === actual.role,
        "commerce_event_mismatch",
        "Use this original event and its actual current recipient.",
      );
      const state = await this.state(client, row);
      await this.registered();
      return state;
    });
  }
}
