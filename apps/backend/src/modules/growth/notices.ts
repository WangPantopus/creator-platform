import type { Pool } from "pg";
import { z } from "zod";
import { DomainError } from "../../core/errors.js";
import {
  Destination,
  type GrowthOwners,
  type NotificationKind,
  type NotificationState,
} from "./contracts.js";
import { present } from "./notifications.js";
import type { GrowthService } from "./service.js";

type Owner = GrowthOwners["notificationState"];

/** Notification types whose truth lives in an owner's private rows (threads,
 * requests, calls, commitments). The growth worker has no authority to read
 * those rows when it creates a notice or right before it sends one, so the
 * owner records what a notice may say, from the process that already holds that
 * authority, and the worker reads only that record. Notes and reactions do not
 * use it: the content module publishes what the worker needs about them. */
export const noticeTypes = [
  "ai_reply",
  "approved_draft",
  "personal_reply",
  "request_status",
  "call_reminder",
  "new_packet",
  "creator_offer",
  "commitment_due",
] as const satisfies readonly NotificationKind[];
export type NoticeType = (typeof noticeTypes)[number];
export const isNoticeType = (type: string): type is NoticeType =>
  (noticeTypes as readonly string[]).includes(type);

const OwnerNotice = z.strictObject({
  type: z.enum(noticeTypes),
  /** The owner's object: the message, request, call or commitment. */
  aggregateId: z.uuid(),
  /** The one account this record is about. Several recipients, several records. */
  accountId: z.uuid(),
  creatorId: z.uuid(),
  /** The owner's own version of the object (a message's sequence, a request's
   * version). A record never goes back to an older version. */
  version: z.int().min(1).max(2147483647),
  authorKind: z.enum([
    "ai",
    "approved_draft",
    "human_creator",
    "human_call",
    "team",
    "system",
  ]),
  creatorName: z.string().min(1).max(80),
  /** What a notice may say. Fixed copy or a bounded label, never a message,
   * an amount or anyone else's name. */
  safePreview: z.string().min(1).max(240),
  destination: Destination,
  status: z.string().min(1).max(40).optional(),
});
export type OwnerNotice = z.input<typeof OwnerNotice>;
const Withdrawal = z.strictObject({
  type: z.enum(noticeTypes),
  aggregateId: z.uuid(),
  /** Omitted: every recipient of the object (a message deleted for all). */
  accountId: z.uuid().optional(),
  /** The owner's version at the time; omitted keeps the record's own. */
  version: z.int().min(1).max(2147483647).optional(),
});
export type OwnerWithdrawal = z.input<typeof Withdrawal>;

/** What the owners of private notification state call, in their own process, as
 * they call `GrowthRelay`. Never an HTTP surface. Record before you enqueue the
 * event, and withdraw when the object stops being something to tell anyone
 * about (a message deleted, a request withdrawn, access lost). */
export class GrowthNotices {
  constructor(private readonly service: GrowthService) {}

  async emit(input: OwnerNotice) {
    const notice = OwnerNotice.parse(input);
    // The engine's own rules decide whether this author may speak for this type
    // and whether the destination is one it can open. Refuse here, where the
    // owner can fix it, instead of later where nobody can.
    present(notice.type, snapshotState(notice, notice.version));
    return this.service.db.transaction(
      this.service.db.worker,
      async (client) => {
        // An erased person or creator is never recreated by a late owner call.
        if (
          !(await this.service.erasure.subjects(
            client,
            [notice.accountId],
            [notice.creatorId],
          ))
        )
          return { recorded: false as const, reason: "erased" as const };
        const written = await client.query(
          `INSERT INTO growth.notice(type,aggregate_id,account_id,creator_id,version,state,author_kind,creator_name,safe_preview,destination,status)
           VALUES($1,$2,$3,$4,$5,'current',$6,$7,$8,$9,$10)
           ON CONFLICT(type,aggregate_id,account_id) DO UPDATE SET
             version=excluded.version,state='current',author_kind=excluded.author_kind,
             creator_name=excluded.creator_name,safe_preview=excluded.safe_preview,
             destination=excluded.destination,status=excluded.status,updated_at=now()
           WHERE growth.notice.creator_id=excluded.creator_id
             AND (growth.notice.version<excluded.version
               OR (growth.notice.version=excluded.version AND growth.notice.state='current'))
           RETURNING version`,
          [
            notice.type,
            notice.aggregateId,
            notice.accountId,
            notice.creatorId,
            notice.version,
            notice.authorKind,
            notice.creatorName,
            notice.safePreview,
            notice.destination,
            notice.status ?? null,
          ],
        );
        if (written.rowCount) return { recorded: true as const };
        const held = (
          await client.query<{ creator_id: string }>(
            "SELECT creator_id FROM growth.notice WHERE type=$1 AND aggregate_id=$2 AND account_id=$3",
            [notice.type, notice.aggregateId, notice.accountId],
          )
        ).rows[0];
        // The same object cannot move to another creator's name.
        if (held && held.creator_id !== notice.creatorId)
          throw new DomainError(
            "notice_creator_conflict",
            "This notice already belongs to another creator.",
            409,
          );
        return { recorded: false as const, reason: "superseded" as const };
      },
    );
  }

  async withdraw(input: OwnerWithdrawal) {
    const request = Withdrawal.parse(input);
    return this.service.db.transaction(
      this.service.db.worker,
      async (client) => ({
        withdrawn: (
          await client.query(
            `UPDATE growth.notice SET state='withdrawn',version=greatest(version,coalesce($4::int,version)),updated_at=now()
             WHERE type=$1 AND aggregate_id=$2 AND ($3::uuid IS NULL OR account_id=$3)
               AND state<>'withdrawn' AND ($4::int IS NULL OR version<=$4)`,
            [
              request.type,
              request.aggregateId,
              request.accountId ?? null,
              request.version ?? null,
            ],
          )
        ).rowCount,
      }),
    );
  }
}

const unconfigured: NotificationState = {
  retryable: true,
  available: false,
  authorized: false,
  version: 0,
  creatorName: "",
  authorKind: "system",
  safePreview: "",
  destination: "/notifications",
};
const gone: NotificationState = { ...unconfigured, retryable: false };

function snapshotState(
  row: {
    authorKind: NotificationState["authorKind"];
    creatorName: string;
    safePreview: string;
    destination: string;
    status?: string | undefined;
  },
  version: number,
): NotificationState {
  return {
    available: true,
    authorized: true,
    version,
    creatorName: row.creatorName,
    authorKind: row.authorKind,
    safePreview: row.safePreview,
    destination: row.destination,
    ...(row.status ? { status: row.status } : {}),
  };
}

/** The recorded state of a notice, read with the worker's own role and nothing
 * else. `custody` is present only when a signed-in person is reading their own
 * list: a record that is missing or behind then shows as an unavailable row
 * instead of failing the whole list; the worker's paths treat it as "the owner
 * has not recorded this yet" and wait. */
export function noticeSnapshots(worker: Pool): Owner {
  return async (event, recipient, custody) => {
    if (!isNoticeType(event.type) || event.creatorId === null)
      return unconfigured;
    let row:
      | {
          creator_id: string;
          version: number;
          state: string;
          author_kind: NotificationState["authorKind"];
          creator_name: string;
          safe_preview: string;
          destination: string;
          status: string | null;
        }
      | undefined;
    try {
      row = (
        await worker.query(
          "SELECT creator_id,version,state,author_kind,creator_name,safe_preview,destination,status FROM growth.notice WHERE type=$1 AND aggregate_id=$2 AND account_id=$3",
          [event.type, event.aggregateId, recipient.accountId],
        )
      ).rows[0];
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      // 42P01: the migration is not applied yet; 42501: this role cannot read it.
      if (code === "42P01" || code === "42501") return unconfigured;
      throw error;
    }
    if (!row || row.version < event.aggregateVersion)
      return custody ? { ...gone, authorized: true } : unconfigured;
    if (row.creator_id !== event.creatorId) return gone;
    if (row.state === "withdrawn") return { ...gone, version: row.version };
    return snapshotState(
      {
        authorKind: row.author_kind,
        creatorName: row.creator_name,
        safePreview: row.safe_preview,
        destination: row.destination,
        status: row.status ?? undefined,
      },
      row.version,
    );
  };
}

/** Ask the owner's live answer when a signed-in person reads their own list and
 * the owner is connected; everywhere else, and when it is not connected, use the
 * recorded state. The worker never asks an owner for private rows. */
export function withNoticeSnapshots(live: Owner, snapshots: Owner): Owner {
  return async (event, recipient, custody) => {
    if (!isNoticeType(event.type)) return live(event, recipient, custody);
    if (custody) {
      const state = await live(event, recipient, custody);
      if (!state.retryable) return state;
    }
    return snapshots(event, recipient, custody);
  };
}
