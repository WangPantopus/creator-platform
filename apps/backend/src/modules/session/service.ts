import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import {
  ConsentCommandSchema,
  EndCallSchema,
  OfferTimesSchema,
  SelectTimeSchema,
  CallSummaryNoteSchema,
  CallRevisionSchema,
  type CallRole,
  type CallSession,
  type SessionEvidence,
  type CallOfferView,
  type CallOfferContext,
} from "../../../../../packages/api/src/session.js";
import type { ThreadScope } from "../access/scope.js";
import type { Database } from "../../db/database.js";
import { DomainError, invariant } from "../../core/errors.js";
import { idempotent } from "../../core/idempotency.js";
import { validateProviderState, type CallProvider } from "./provider.js";
import { calculateClocks, determineOutcome } from "./clocks.js";
import type { AvailabilityService } from "./availability.js";
import { withDeadline } from "../media/deadline.js";

export interface CallAuthorization {
  commitmentId: string;
  creatorAccountId: string;
  fanAccountId: string;
  creatorName: string;
  mediaMode: "audio" | "video";
  durationSeconds: number;
  graceSeconds: number;
  authorizationVersion: number;
  packet: CallSession["packet"];
}
/** W4 owns signed acceptance/capacity/capture and current authorization. No cross-owner SQL. */
export interface SchedulingAuthority {
  current(
    scope: ThreadScope,
    commitmentId: string,
    client: PoolClient,
  ): Promise<CallAuthorization | null>;
  /** W4 authorizes retained receipts/consented summaries after settlement; never a join or booking grant. */
  retained?(
    scope: ThreadScope,
    commitmentId: string,
    client: PoolClient,
  ): Promise<CallAuthorization | null>;
  acceptOffer(
    scope: ThreadScope,
    command: z.infer<typeof OfferTimesSchema>,
    client: PoolClient,
  ): Promise<CallAuthorization>;
  assignSlot(
    scope: ThreadScope,
    commitmentId: string,
    at: string,
    client: PoolClient,
  ): Promise<void>;
  cancel(
    scope: ThreadScope,
    commitmentId: string,
    client: PoolClient,
  ): Promise<void>;
}
type SessionRow = {
  id: string;
  room_id: string;
  document: CallSession;
  ended_by: "creator" | "fan" | "timer" | "failure" | null;
  fan_ended_by_choice: boolean;
  end_requested_at: Date | null;
  revoked_at: Date | null;
  worker_lease_until: Date | null;
};
const providerTimestamp = z.iso.datetime({ offset: true });
export function validateZone(zone: string) {
  try {
    return new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions()
      .timeZone;
  } catch {
    throw new DomainError(
      "time_zone_invalid",
      "Choose a valid time zone.",
      400,
    );
  }
}
function participant(scope: ThreadScope): CallRole {
  invariant(
    scope.authority === "fan" ||
      (scope.authority === "creator" &&
        scope.actorAccountId === scope.creatorAccountId),
    "call_participant_required",
    "Only the fan and the verified creator can join this personal call.",
  );
  return scope.authority;
}
/** The creator's working note is a summary input, not a new fan-visible message. */
export function visibleSession(
  scope: ThreadScope,
  document: CallSession,
): CallSession {
  if (scope.actorAccountId === document.creatorAccountId) return document;
  const { creatorSummaryNote: _note, ...view } = document;
  void _note;
  return view;
}
export class SessionService {
  constructor(
    readonly db: Database,
    private readonly authority: SchedulingAuthority,
    readonly provider: CallProvider,
    readonly availability?: AvailabilityService,
  ) {}
  /** Internal cleanup/evidence read under an already-issued tenant scope, without renewing join authority. */
  async lifecycleRow(
    scope: ThreadScope,
    client: PoolClient,
    id: string,
    lock = false,
  ): Promise<SessionRow | null> {
    return (
      (
        await client.query<SessionRow>(
          `SELECT * FROM creator.call_session WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND thread_id=$4 ${lock ? "FOR UPDATE" : ""}`,
          [id, scope.creatorId, scope.fanId, scope.threadId],
        )
      ).rows[0] ?? null
    );
  }
  async row(
    scope: ThreadScope,
    client: PoolClient,
    id: string,
    lock = false,
  ): Promise<SessionRow> {
    participant(scope);
    const found = await client.query<SessionRow>(
      `SELECT * FROM creator.call_session WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND thread_id=$4 ${lock ? "FOR UPDATE" : ""}`,
      [id, scope.creatorId, scope.fanId, scope.threadId],
    );
    const row = found.rows[0];
    invariant(
      row && !row.revoked_at,
      "call_unavailable",
      "This call is unavailable.",
    );
    let current = await this.authority.current(
      scope,
      row.document.commitmentId,
      client,
    );
    if (!current && ["ended", "cancelled"].includes(row.document.state))
      current =
        (await this.authority.retained?.(
          scope,
          row.document.commitmentId,
          client,
        )) ?? null;
    invariant(
      current &&
        current.creatorAccountId === row.document.creatorAccountId &&
        current.fanAccountId === row.document.fanAccountId,
      "call_authorization_revoked",
      "Call authorization has changed.",
    );
    invariant(
      scope.actorAccountId ===
        (scope.authority === "creator"
          ? current.creatorAccountId
          : current.fanAccountId),
      "call_participant_required",
      "This account cannot join the call.",
    );
    return row;
  }
  async persist(
    scope: ThreadScope,
    client: PoolClient,
    document: CallSession,
    clockOnly = false,
  ) {
    const next = {
      ...document,
      version: document.version + (clockOnly ? 0 : 1),
      serverNow: new Date().toISOString(),
    };
    await client.query(
      "UPDATE creator.call_session SET document=$1,state=$2,version=$3,next_check_at=now() WHERE id=$4 AND creator_id=$5 AND fan_id=$6",
      [
        JSON.stringify(next),
        next.state,
        next.version,
        next.id,
        scope.creatorId,
        scope.fanId,
      ],
    );
    if (!clockOnly)
      await client.query(
        "INSERT INTO creator.call_event(session_id,creator_id,fan_id,type,payload,actor_account_id) VALUES($1,$2,$3,$4,$5,$6)",
        [
          next.id,
          scope.creatorId,
          scope.fanId,
          "session_changed",
          JSON.stringify({
            sessionId: next.id,
            version: next.version,
            state: next.state,
          }),
          scope.actorAccountId,
        ],
      );
    return next;
  }
  async offer(scope: ThreadScope, input: unknown) {
    const command = OfferTimesSchema.parse(input);
    invariant(
      participant(scope) === "creator",
      "creator_required",
      "Only the creator can offer times.",
    );
    validateZone(command.creatorTimeZone);
    validateZone(command.fanTimeZone);
    const starts = command.startsAt.map((value) =>
      new Date(value).toISOString(),
    );
    invariant(
      new Set(starts).size === starts.length &&
        starts.every((value) => Date.parse(value) > Date.now()) &&
        Date.parse(command.expiresAt) > Date.now() &&
        Date.parse(command.expiresAt) <= Math.min(...starts.map(Date.parse)),
      "offer_times_invalid",
      "Offer future times and an expiry before the first time.",
    );
    return this.db.withThread(scope, async (client) =>
      idempotent(
        client,
        scope,
        "session.offer",
        command.idempotencyKey,
        command,
        async () => {
          // Match selection's lock order before W4 locks the commitment.
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            [`call-schedule:${scope.creatorId}`],
          );
          const auth = await this.authority.acceptOffer(scope, command, client);
          invariant(
            auth.authorizationVersion ===
              command.expectedAuthorizationVersion &&
              auth.creatorAccountId === scope.actorAccountId,
            "offer_stale",
            "The request changed. Review it before offering times.",
          );
          invariant(
            auth.durationSeconds > 0 && auth.graceSeconds > 0,
            "call_policy_unavailable",
            "The call policy is unavailable.",
          );
          await this.expireOffers(scope, client);
          invariant(
            this.availability,
            "availability_unconfigured",
            "Call availability is not connected yet.",
          );
          for (const start of starts)
            invariant(
              await this.availability.covers(
                scope,
                start,
                new Date(
                  Date.parse(start) + (auth.durationSeconds + 180) * 1000,
                ).toISOString(),
                client,
              ),
              "call_outside_availability",
              "Each offered time must fit the creator's availability, including the reconnect allowance.",
            );
          const offerId = randomUUID();
          await client.query(
            "INSERT INTO creator.call_offer(id,creator_id,fan_id,thread_id,commitment_id,creator_time_zone,fan_time_zone,expires_at,authorization_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
            [
              offerId,
              scope.creatorId,
              scope.fanId,
              scope.threadId,
              auth.commitmentId,
              command.creatorTimeZone,
              command.fanTimeZone,
              command.expiresAt,
              auth.authorizationVersion,
            ],
          );
          const slots = [];
          for (const start of starts) {
            const slotId = randomUUID();
            // Exclusion constraints cover every fan's offered and selected slots, including reconnect allowance.
            await client.query(
              "INSERT INTO creator.call_slot(id,offer_id,creator_id,fan_id,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6)",
              [
                slotId,
                offerId,
                scope.creatorId,
                scope.fanId,
                start,
                new Date(
                  Date.parse(start) + (auth.durationSeconds + 180) * 1000,
                ).toISOString(),
              ],
            );
            slots.push({ id: slotId, startsAt: start });
          }
          return {
            id: offerId,
            version: 1,
            slots,
            expiresAt: new Date(command.expiresAt).toISOString(),
            creatorTimeZone: command.creatorTimeZone,
            fanTimeZone: command.fanTimeZone,
            acceptance: "accepted_by_commerce",
          };
        },
      ),
    );
  }
  async offerContext(
    scope: ThreadScope,
    commitmentId: string,
  ): Promise<CallOfferContext> {
    invariant(
      participant(scope) === "creator",
      "creator_required",
      "Only the creator may review offered appointment times.",
    );
    return this.db.withThread(scope, async (client) => {
      const current = await this.authority.current(scope, commitmentId, client);
      invariant(
        current && current.creatorAccountId === scope.actorAccountId,
        "call_authorization_revoked",
        "Open the current captured call request before offering times.",
      );
      return {
        commitmentId: current.commitmentId,
        threadId: scope.threadId,
        authorizationVersion: current.authorizationVersion,
        creatorName: current.creatorName,
        durationSeconds: current.durationSeconds,
        mediaMode: current.mediaMode,
      };
    });
  }
  async offers(scope: ThreadScope) {
    participant(scope);
    return this.db.withThread(scope, async (client) => {
      await this.expireOffers(scope, client);
      const rows = await client.query<{
        id: string;
        commitment_id: string;
        version: number;
        creator_time_zone: string;
        fan_time_zone: string;
        expires_at: Date;
        selected_session_id: string | null;
        state: CallOfferView["state"];
      }>(
        "SELECT o.id,o.commitment_id,o.version,o.creator_time_zone,o.fan_time_zone,o.expires_at,o.state,CASE WHEN o.state='selected' THEN s.id ELSE NULL END AS selected_session_id FROM creator.call_offer o LEFT JOIN creator.call_session s ON s.commitment_id=o.commitment_id AND s.creator_id=o.creator_id AND s.fan_id=o.fan_id AND s.thread_id=o.thread_id AND s.revoked_at IS NULL WHERE o.creator_id=$1 AND o.fan_id=$2 AND o.thread_id=$3 ORDER BY o.expires_at DESC LIMIT 32",
        [scope.creatorId, scope.fanId, scope.threadId],
      );
      const offers: CallOfferView[] = [];
      for (const offer of rows.rows) {
        if (!(await this.authority.current(scope, offer.commitment_id, client)))
          continue;
        const slots = await client.query<{ id: string; starts_at: Date }>(
          "SELECT id,starts_at FROM creator.call_slot WHERE offer_id=$1 AND creator_id=$2 AND fan_id=$3 AND active ORDER BY starts_at",
          [offer.id, scope.creatorId, scope.fanId],
        );
        offers.push({
          id: offer.id,
          commitmentId: offer.commitment_id,
          version: offer.version,
          creatorTimeZone: offer.creator_time_zone,
          fanTimeZone: offer.fan_time_zone,
          expiresAt: offer.expires_at.toISOString(),
          state: offer.state,
          selectedSessionId: offer.selected_session_id,
          slots: slots.rows.map((slot) => ({
            id: slot.id,
            startsAt: slot.starts_at.toISOString(),
          })),
        });
      }
      return offers;
    });
  }
  async expireOffers(scope: ThreadScope, client: PoolClient) {
    const expired = await client.query<{ id: string }>(
      "UPDATE creator.call_offer SET state='expired',version=version+1 WHERE creator_id=$1 AND fan_id=$2 AND state='offered' AND expires_at<=now() RETURNING id",
      [scope.creatorId, scope.fanId],
    );
    for (const offer of expired.rows)
      await client.query(
        "UPDATE creator.call_slot SET active=false WHERE creator_id=$1 AND fan_id=$2 AND offer_id=$3",
        [scope.creatorId, scope.fanId, offer.id],
      );
  }
  async select(scope: ThreadScope, offerId: string, input: unknown) {
    const body = SelectTimeSchema.parse(input);
    invariant(
      participant(scope) === "fan",
      "fan_required",
      "Only the fan can choose an offered time.",
    );
    return this.db.withThread(scope, async (client) =>
      idempotent(
        client,
        scope,
        "session.select",
        body.idempotencyKey,
        { offerId, ...body },
        async () => {
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            [`call-schedule:${scope.creatorId}`],
          );
          const offer = (
            await client.query<{
              commitment_id: string;
              authorization_version: number;
            }>(
              "SELECT * FROM creator.call_offer WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND state='offered' AND expires_at>now() AND version=$4 FOR UPDATE",
              [offerId, scope.creatorId, scope.fanId, body.expectedVersion],
            )
          ).rows[0];
          invariant(
            offer,
            "call_offer_expired",
            "This offer changed or expired. Ask for new times.",
          );
          const auth = await this.authority.current(
            scope,
            offer.commitment_id,
            client,
          );
          invariant(
            auth && auth.authorizationVersion === offer.authorization_version,
            "call_authorization_revoked",
            "Call authorization has changed.",
          );
          const slot = (
            await client.query<{ starts_at: Date; ends_at: Date }>(
              "SELECT starts_at,ends_at FROM creator.call_slot WHERE id=$1 AND offer_id=$2 AND creator_id=$3 AND fan_id=$4 AND active AND starts_at>now() FOR UPDATE",
              [body.slotId, offerId, scope.creatorId, scope.fanId],
            )
          ).rows[0];
          invariant(
            slot,
            "call_slot_unavailable",
            "This time is no longer available.",
          );
          await this.authority.assignSlot(
            scope,
            auth.commitmentId,
            slot.starts_at.toISOString(),
            client,
          );
          const id = randomUUID();
          const document: CallSession = {
            id,
            commitmentId: auth.commitmentId,
            threadId: scope.threadId,
            creatorId: scope.creatorId,
            fanId: scope.fanId,
            creatorName: auth.creatorName,
            creatorAccountId: auth.creatorAccountId,
            fanAccountId: auth.fanAccountId,
            mediaMode: auth.mediaMode,
            scheduledAt: slot.starts_at.toISOString(),
            hardEndAt: slot.ends_at.toISOString(),
            durationSeconds: auth.durationSeconds,
            graceSeconds: auth.graceSeconds,
            reconnectBudgetSeconds: 180,
            connectedMilliseconds: 0,
            reconnectUsedMilliseconds: 0,
            state: "scheduled",
            version: 1,
            serverNow: new Date().toISOString(),
            present: [],
            recordingState: "off",
            consents: [],
            outcome: null,
            reconciliation: "pending",
            packet: auth.packet,
            summary: null,
            summaryState: "absent",
            summaryRevision: 0,
            recordingOccurred: false,
          };
          await client.query(
            "INSERT INTO creator.call_session(id,creator_id,fan_id,thread_id,commitment_id,room_id,document,state,scheduled_at,hard_end_at,next_check_at) VALUES($1,$2,$3,$4,$5,$6,$7,'scheduled',$8,$9,$8::timestamptz-interval '10 minutes')",
            [
              id,
              scope.creatorId,
              scope.fanId,
              scope.threadId,
              auth.commitmentId,
              `session-${id}`,
              JSON.stringify(document),
              document.scheduledAt,
              document.hardEndAt,
            ],
          );
          await client.query(
            "UPDATE creator.call_offer SET state='selected',version=version+1 WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
            [offerId, scope.creatorId, scope.fanId],
          );
          await client.query(
            "UPDATE creator.call_slot SET active=false WHERE offer_id=$1 AND id<>$2 AND creator_id=$3 AND fan_id=$4",
            [offerId, body.slotId, scope.creatorId, scope.fanId],
          );
          await client.query(
            "INSERT INTO creator.call_event(session_id,creator_id,fan_id,type,payload,actor_account_id) VALUES($1,$2,$3,'session_scheduled',$4,$5)",
            [
              id,
              scope.creatorId,
              scope.fanId,
              JSON.stringify({
                sessionId: id,
                commitmentId: auth.commitmentId,
                scheduledAt: document.scheduledAt,
              }),
              scope.actorAccountId,
            ],
          );
          await client.query(
            "INSERT INTO creator.call_effect(session_id,creator_id,fan_id,kind,key,payload) VALUES($1,$2,$3,'scheduled_notice',$4,$5)",
            [
              id,
              scope.creatorId,
              scope.fanId,
              `${id}:scheduled`,
              JSON.stringify({ sessionId: id }),
            ],
          );
          return document;
        },
      ),
    );
  }
  async read(scope: ThreadScope, id: string) {
    return this.db.withThread(scope, async (client) => ({
      ...(await this.row(scope, client, id)).document,
      serverNow: new Date().toISOString(),
    }));
  }
  async join(scope: ThreadScope, id: string) {
    const role = participant(scope);
    const row = await this.db.withThread(scope, async (client) => {
      const item = await this.row(scope, client, id, true);
      invariant(
        !["ending", "ended", "cancelled"].includes(item.document.state),
        "call_ended",
        "This call has ended.",
      );
      invariant(
        Date.now() >= Date.parse(item.document.scheduledAt) - 600_000 &&
          Date.now() < Date.parse(item.document.hardEndAt),
        "call_join_window",
        "The waiting room opens ten minutes before the call.",
      );
      invariant(
        this.provider.name !== "unconfigured",
        "call_provider_unconfigured",
        "Calling is not connected yet.",
      );
      invariant(
        this.provider.supportsSingleUseAdmission,
        "call_admission_unverified",
        "Secure room admission is not available yet.",
      );
      await client.query(
        "INSERT INTO creator.call_effect(session_id,creator_id,fan_id,kind,key,payload) VALUES($1,$2,$3,'ensure_room',$4,$5) ON CONFLICT(key) DO NOTHING",
        [
          id,
          scope.creatorId,
          scope.fanId,
          `${id}:ensure-room`,
          JSON.stringify({
            roomId: item.room_id,
            hardEndAt: item.document.hardEndAt,
          }),
        ],
      );
      return item;
    });
    // Deterministic room name and durable intent recover external success before local completion.
    try {
      await withDeadline(
        this.provider.ensureRoom({
          roomId: row.room_id,
          endAt: row.document.hardEndAt,
          recording: false,
        }),
        5000,
      );
    } catch (error) {
      // A failed HTTP response does not prove that the room was never created.
      await this.db.withThread(scope, async (client) => {
        await client.query(
          "UPDATE creator.call_effect SET failure_code='external_effect_unconfirmed' WHERE session_id=$1 AND creator_id=$2 AND fan_id=$3 AND kind='ensure_room' AND completed_at IS NULL",
          [id, scope.creatorId, scope.fanId],
        );
      });
      throw error;
    }
    const admission = await this.db.withThread(scope, async (client) => {
      const current = await this.row(scope, client, id, true);
      invariant(
        !current.ended_by &&
          !["ending", "ended", "cancelled"].includes(current.document.state) &&
          Date.now() < Date.parse(current.document.hardEndAt),
        "call_ended",
        "This call has ended.",
      );
      const nonce = randomUUID();
      const expiresAt = new Date(Date.now() + 30_000).toISOString();
      await client.query(
        "INSERT INTO creator.call_admission(id,session_id,creator_id,fan_id,account_id,expires_at) VALUES($1,$2,$3,$4,$5,$6)",
        [
          nonce,
          id,
          scope.creatorId,
          scope.fanId,
          scope.actorAccountId,
          expiresAt,
        ],
      );
      if (current.document.state === "scheduled")
        await this.persist(scope, client, {
          ...current.document,
          state: "waiting",
        });
      return {
        nonce,
        expiresAt,
        roomId: current.room_id,
        camera: current.document.mediaMode === "video",
      };
    });
    try {
      // Mint outside the interactive database transaction; reauthorize after the provider responds.
      const token = await withDeadline(
        this.provider.token({
          ...admission,
          accountId: scope.actorAccountId,
          role,
        }),
        5000,
      );
      await this.db.withThread(scope, async (client) => {
        const current = await this.row(scope, client, id, true);
        invariant(
          !current.ended_by &&
            !["ending", "ended", "cancelled"].includes(
              current.document.state,
            ) &&
            Date.now() < Date.parse(current.document.hardEndAt),
          "call_ended",
          "This call has ended.",
        );
        const valid = await client.query(
          "SELECT id FROM creator.call_admission WHERE id=$1 AND session_id=$2 AND account_id=$3 AND creator_id=$4 AND fan_id=$5 AND used_at IS NULL AND expires_at>now()",
          [
            admission.nonce,
            id,
            scope.actorAccountId,
            scope.creatorId,
            scope.fanId,
          ],
        );
        invariant(
          valid.rowCount === 1,
          "call_token_expired",
          "The room admission expired. Rejoin the same call.",
        );
      });
      return {
        ...token,
        nonce: admission.nonce,
        expiresAt: admission.expiresAt,
        role,
        sessionId: id,
        accountId: scope.actorAccountId,
      };
    } catch (error) {
      await this.db.withThread(scope, async (client) => {
        await client.query(
          "UPDATE creator.call_admission SET used_at=COALESCE(used_at,now()) WHERE id=$1 AND session_id=$2 AND creator_id=$3 AND fan_id=$4",
          [admission.nonce, id, scope.creatorId, scope.fanId],
        );
      });
      throw error;
    }
  }
  async redeem(scope: ThreadScope, id: string, nonce: string) {
    return this.db.withThread(scope, async (client) => {
      const current = await this.row(scope, client, id, true);
      invariant(
        !current.ended_by &&
          !["ending", "ended", "cancelled"].includes(current.document.state) &&
          Date.now() < Date.parse(current.document.hardEndAt),
        "call_ended",
        "This call has ended.",
      );
      const used = await client.query(
        "UPDATE creator.call_admission SET used_at=now() WHERE id=$1 AND session_id=$2 AND account_id=$3 AND creator_id=$4 AND fan_id=$5 AND used_at IS NULL AND expires_at>now() RETURNING id",
        [nonce, id, scope.actorAccountId, scope.creatorId, scope.fanId],
      );
      invariant(
        used.rowCount === 1,
        "call_token_reused",
        "This room token expired or was already used.",
      );
      return { admitted: true };
    });
  }
  async consent(scope: ThreadScope, id: string, input: unknown) {
    const body = ConsentCommandSchema.parse(input);
    const role = participant(scope);
    return this.db.withThread(scope, async (client) =>
      idempotent(
        client,
        scope,
        "session.consent",
        body.idempotencyKey,
        { id, ...body },
        async () => {
          const row = await this.row(scope, client, id, true);
          invariant(
            row.document.version === body.expectedVersion,
            "call_stale",
            "The call changed. Refresh before changing consent.",
          );
          invariant(
            !body.granted ||
              (row.document.state !== "cancelled" &&
                (body.purpose !== "recording" ||
                  !["ending", "ended"].includes(row.document.state))),
            "call_consent_unavailable",
            "Recording permission can only be granted before the call ends.",
          );
          const consent = {
            id: randomUUID(),
            actorAccountId: scope.actorAccountId,
            role,
            purpose: body.purpose,
            granted: body.granted,
            at: new Date().toISOString(),
            revokedAt: body.granted ? null : new Date().toISOString(),
          };
          await client.query(
            "INSERT INTO creator.call_consent(id,session_id,creator_id,fan_id,actor_account_id,role,purpose,granted) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
            [
              consent.id,
              id,
              scope.creatorId,
              scope.fanId,
              scope.actorAccountId,
              role,
              body.purpose,
              body.granted,
            ],
          );
          const consents = [
            ...row.document.consents.filter(
              (value) =>
                !(value.role === role && value.purpose === body.purpose),
            ),
            consent,
          ];
          const document = { ...row.document, consents };
          if (body.purpose === "recording") {
            const both = ["creator", "fan"].every((r) =>
              consents.some(
                (c) => c.role === r && c.purpose === "recording" && c.granted,
              ),
            );
            document.recordingState =
              both && !["ending", "ended", "cancelled"].includes(document.state)
                ? "starting"
                : ["on", "starting", "stopping"].includes(
                      document.recordingState,
                    )
                  ? "stopping"
                  : "off";
            await client.query(
              "INSERT INTO creator.call_effect(session_id,creator_id,fan_id,kind,key,payload) VALUES($1,$2,$3,'sync_recording',$4,'{}')",
              [id, scope.creatorId, scope.fanId, consent.id],
            );
          }
          if (!body.granted && body.purpose === "summary") {
            document.summary = null;
            document.summaryState = "deleted";
            document.summarySources = undefined;
            document.creatorSummaryNote = undefined;
            document.summaryRevision = (document.summaryRevision ?? 0) + 1;
          }
          if (
            body.granted &&
            body.purpose === "summary" &&
            document.state === "ended" &&
            ["creator", "fan"].every((r) =>
              consents.some(
                (c) => c.role === r && c.purpose === "summary" && c.granted,
              ),
            )
          ) {
            document.summaryState = "pending";
            await client.query(
              "INSERT INTO creator.call_effect(session_id,creator_id,fan_id,kind,key,payload) VALUES($1,$2,$3,'generate_summary',$4,'{}')",
              [id, scope.creatorId, scope.fanId, `${consent.id}:summary`],
            );
          }
          if (!body.granted)
            await client.query(
              "INSERT INTO creator.call_effect(session_id,creator_id,fan_id,kind,key,payload) VALUES($1,$2,$3,'purge_consent_assets',$4,$5)",
              [
                id,
                scope.creatorId,
                scope.fanId,
                `${consent.id}:purge`,
                JSON.stringify({ purpose: body.purpose }),
              ],
            );
          return this.persist(scope, client, document);
        },
      ),
    );
  }
  async summaryNote(scope: ThreadScope, id: string, input: unknown) {
    const body = CallSummaryNoteSchema.parse(input);
    invariant(
      participant(scope) === "creator",
      "creator_required",
      "Only the creator can add their post-call note.",
    );
    return this.db.withThread(scope, (client) =>
      idempotent(
        client,
        scope,
        "session.summary_note",
        body.idempotencyKey,
        { id, ...body },
        async () => {
          const row = await this.row(scope, client, id, true);
          invariant(
            row.document.state === "ended" &&
              row.document.version === body.expectedVersion,
            "call_stale",
            "Refresh the ended call before adding a note.",
          );
          invariant(
            ["creator", "fan"].every((role) =>
              row.document.consents.some(
                (c) => c.role === role && c.purpose === "summary" && c.granted,
              ),
            ),
            "summary_consent_required",
            "Both participants must allow a summary before its source note is stored.",
          );
          const next = {
            ...row.document,
            creatorSummaryNote: body.note,
            summary: null,
            summarySources: undefined,
            summaryState: "pending" as const,
            summaryRevision: (row.document.summaryRevision ?? 0) + 1,
          };
          await client.query(
            "INSERT INTO creator.call_effect(session_id,creator_id,fan_id,kind,key,payload) VALUES($1,$2,$3,'generate_summary',$4,'{}')",
            [
              id,
              scope.creatorId,
              scope.fanId,
              `${id}:summary:${next.summaryRevision}`,
            ],
          );
          return this.persist(scope, client, next);
        },
      ),
    );
  }
  async deleteSummary(scope: ThreadScope, id: string, input: unknown) {
    const body = CallRevisionSchema.parse(input);
    participant(scope);
    return this.db.withThread(scope, (client) =>
      idempotent(
        client,
        scope,
        "session.delete_summary",
        body.idempotencyKey,
        { id, ...body },
        async () => {
          const row = await this.row(scope, client, id, true);
          invariant(
            row.document.version === body.expectedVersion,
            "call_stale",
            "Refresh before deleting the summary.",
          );
          const next = {
            ...row.document,
            creatorSummaryNote: undefined,
            summary: null,
            summarySources: undefined,
            summaryState: "deleted" as const,
            summaryRevision: (row.document.summaryRevision ?? 0) + 1,
          };
          await client.query(
            "INSERT INTO creator.call_effect(session_id,creator_id,fan_id,kind,key,payload) VALUES($1,$2,$3,'purge_consent_assets',$4,$5)",
            [
              id,
              scope.creatorId,
              scope.fanId,
              `${id}:delete-summary:${next.summaryRevision}`,
              JSON.stringify({ purpose: "summary" }),
            ],
          );
          return this.persist(scope, client, next);
        },
      ),
    );
  }
  async cancel(scope: ThreadScope, id: string, input: unknown) {
    const body = CallRevisionSchema.parse(input);
    participant(scope);
    return this.db.withThread(scope, (client) =>
      idempotent(
        client,
        scope,
        "session.cancel",
        body.idempotencyKey,
        { id, ...body },
        async () => {
          const row = await this.row(scope, client, id, true);
          invariant(
            row.document.state === "scheduled" &&
              row.document.version === body.expectedVersion &&
              Date.parse(row.document.scheduledAt) > Date.now(),
            "call_cancel_unavailable",
            "This appointment cannot be cancelled here. Open its current resolution options.",
          );
          await this.authority.cancel(scope, row.document.commitmentId, client);
          await client.query(
            "UPDATE creator.call_slot SET active=false WHERE creator_id=$1 AND fan_id=$2 AND offer_id IN(SELECT id FROM creator.call_offer WHERE commitment_id=$3 AND creator_id=$1 AND fan_id=$2)",
            [scope.creatorId, scope.fanId, row.document.commitmentId],
          );
          await client.query(
            "INSERT INTO creator.call_effect(session_id,creator_id,fan_id,kind,key,payload) VALUES($1,$2,$3,'scheduled_notice',$4,$5)",
            [
              id,
              scope.creatorId,
              scope.fanId,
              `${id}:cancelled`,
              JSON.stringify({ sessionId: id }),
            ],
          );
          return this.persist(scope, client, {
            ...row.document,
            state: "cancelled",
          });
        },
      ),
    );
  }
  async end(scope: ThreadScope, id: string, input: unknown) {
    const body = EndCallSchema.parse(input);
    const role = participant(scope);
    return this.db.withThread(scope, async (client) =>
      idempotent(
        client,
        scope,
        "session.end",
        body.idempotencyKey,
        { id, ...body },
        async () => {
          const row = await this.row(scope, client, id, true);
          if (
            row.ended_by ||
            ["ended", "cancelled"].includes(row.document.state)
          )
            return row.document;
          invariant(
            row.document.version === body.expectedVersion,
            "call_stale",
            "The call changed. Refresh before leaving.",
          );
          invariant(
            role !== "fan" || body.fanChoice,
            "fan_end_choice_required",
            "Choose whether to end by choice or report a technical problem.",
          );
          await client.query(
            "UPDATE creator.call_session SET ended_by=$1,fan_ended_by_choice=$2,end_requested_at=now() WHERE id=$3 AND creator_id=$4 AND fan_id=$5",
            [
              role,
              role === "fan" && body.fanChoice === "end_by_choice",
              id,
              scope.creatorId,
              scope.fanId,
            ],
          );
          return this.persist(scope, client, {
            ...row.document,
            state: "ending",
          });
        },
      ),
    );
  }
  /** Provider history only. This is called by the durable session worker, never a client callback. */
  async reconcile(scope: ThreadScope, id: string, lease?: string) {
    let row: SessionRow;
    try {
      row = await this.db.withThread(scope, (client) =>
        this.row(scope, client, id),
      );
    } catch (error) {
      // Losing join authority must not strand an already-running room until its hard end.
      if (
        !(error instanceof DomainError) ||
        !["call_unavailable", "call_authorization_revoked"].includes(error.code)
      )
        throw error;
      const revoked = await this.db.withThread(scope, async (client) => {
        const current = await this.lifecycleRow(scope, client, id, true);
        if (
          !current ||
          (lease && current.worker_lease_until?.toISOString() !== lease)
        )
          return null;
        await client.query(
          "UPDATE creator.call_session SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
          [id, scope.creatorId, scope.fanId],
        );
        await this.persist(scope, client, {
          ...current.document,
          state: "ending",
          recordingState:
            current.document.recordingState === "off" ? "off" : "stopping",
        });
        return current;
      });
      if (!revoked) throw error;
      await withDeadline(this.provider.closeRoom(revoked.room_id), 5000);
      await withDeadline(
        this.provider.setRecording(
          revoked.room_id,
          false,
          `${id}:authorization-revoked`,
        ),
        5000,
      );
      const truth = validateProviderState(
        await withDeadline(this.provider.state(revoked.room_id), 5000),
      );
      invariant(
        truth.closed && !truth.recording,
        "call_revocation_unconfirmed",
        "Call closure is awaiting provider confirmation.",
      );
      return this.db.withThread(scope, async (client) => {
        const current = await this.lifecycleRow(scope, client, id, true);
        invariant(
          current?.revoked_at,
          "call_revocation_changed",
          "Call cleanup changed.",
        );
        if (lease && current.worker_lease_until?.toISOString() !== lease)
          return current.document;
        // This closes media only; it creates no fulfillment evidence or monetary outcome.
        return this.persist(scope, client, {
          ...current.document,
          state: "cancelled",
          recordingState: "off",
          present: [],
        });
      });
    }
    const doc = row.document;
    if (["ended", "cancelled"].includes(doc.state)) return doc;
    const closureRequired = Boolean(
      row.ended_by ||
        doc.state === "ending" ||
        Date.now() >= Date.parse(doc.hardEndAt),
    );
    // Persist the request phase before an external close/history outage; never report closure as confirmed.
    if (
      closureRequired &&
      (doc.state !== "ending" ||
        !["off", "stopping"].includes(doc.recordingState))
    ) {
      const ending = await this.db.withThread(scope, async (client) => {
        const current = await this.row(scope, client, id, true);
        if (
          current.document.version !== doc.version ||
          (lease && current.worker_lease_until?.toISOString() !== lease)
        )
          return current.document;
        return this.persist(scope, client, {
          ...current.document,
          state: "ending",
          recordingState:
            current.document.recordingState === "off" ? "off" : "stopping",
        });
      });
      await withDeadline(this.provider.closeRoom(row.room_id), 5000);
      return ending;
    }
    // Closing known ending/deadline paths does not depend on a healthy history API.
    // Evidence and settlement still wait for confirmed closure and complete history below.
    if (closureRequired)
      await withDeadline(this.provider.closeRoom(row.room_id), 5000);
    const provider = await withDeadline(
      this.provider.history(row.room_id),
      5000,
    );
    invariant(
      typeof provider.complete === "boolean" &&
        typeof provider.closed === "boolean" &&
        typeof provider.reference === "string" &&
        (!provider.complete || provider.reference.trim().length > 0) &&
        Array.isArray(provider.participants) &&
        provider.participants.every(
          (participant) =>
            typeof participant.accountId === "string" &&
            participant.accountId.length > 0 &&
            Array.isArray(participant.intervals) &&
            participant.intervals.every(
              (interval) =>
                providerTimestamp.safeParse(interval.start).success &&
                providerTimestamp.safeParse(interval.end).success &&
                Number.isFinite(Date.parse(interval.start)) &&
                Number.isFinite(Date.parse(interval.end)) &&
                Date.parse(interval.end) >= Date.parse(interval.start),
            ),
        ),
      "call_history_invalid",
      "Call history is awaiting valid provider evidence.",
    );
    const state = validateProviderState(
      await withDeadline(this.provider.state(row.room_id), 5000),
    );
    const now = new Date().toISOString();
    const creator = provider.participants
      .filter((p) => p.accountId === doc.creatorAccountId)
      .flatMap((p) => p.intervals);
    const fan = provider.participants
      .filter((p) => p.accountId === doc.fanAccountId)
      .flatMap((p) => p.intervals);
    const graceAt = Date.parse(doc.scheduledAt) + doc.graceSeconds * 1000;
    const creatorJoinedByGrace = creator.some(
      (i) =>
        Date.parse(i.start) < graceAt &&
        Date.parse(i.end) > Date.parse(doc.scheduledAt),
    );
    const fanJoinedByGrace = fan.some(
      (i) =>
        Date.parse(i.start) < graceAt &&
        Date.parse(i.end) > Date.parse(doc.scheduledAt),
    );
    // Missing intervals cannot establish absence. Only complete history may close a no-show early.
    const noShow =
      provider.complete &&
      Date.parse(now) >= graceAt &&
      (!row.end_requested_at || row.end_requested_at.getTime() >= graceAt) &&
      (!creatorJoinedByGrace || !fanJoinedByGrace);
    const measuredUntil = Math.min(
      Date.parse(now),
      row.end_requested_at?.getTime() ?? Infinity,
      noShow ? graceAt : Infinity,
    );
    const measuredClocks = calculateClocks({
      creator,
      fan,
      scheduledAt: doc.scheduledAt,
      measuredUntil: new Date(measuredUntil).toISOString(),
      durationSeconds: doc.durationSeconds,
      hardEndAt: doc.hardEndAt,
      reconnectBudgetSeconds: doc.reconnectBudgetSeconds,
    });
    // Incomplete history cannot establish a drop or roll back previously confirmed time.
    const clocks = provider.complete
      ? measuredClocks
      : {
          connectedMilliseconds: doc.connectedMilliseconds,
          reconnectUsedMilliseconds: doc.reconnectUsedMilliseconds,
          connectedIntervals: [],
        };
    const unexpectedClosure =
      state.closed &&
      provider.closed &&
      clocks.connectedMilliseconds > 0 &&
      clocks.connectedMilliseconds < doc.durationSeconds * 1000;
    const endDue =
      row.ended_by ||
      noShow ||
      unexpectedClosure ||
      Date.now() >= Date.parse(doc.hardEndAt) ||
      clocks.connectedMilliseconds >= doc.durationSeconds * 1000 ||
      clocks.reconnectUsedMilliseconds >= doc.reconnectBudgetSeconds * 1000;
    if (endDue && !state.closed)
      await withDeadline(this.provider.closeRoom(row.room_id), 5000);
    // A subsequent polling pass must observe provider closure plus complete history.
    const endedBy =
      row.ended_by ??
      (unexpectedClosure ||
      clocks.reconnectUsedMilliseconds >= doc.reconnectBudgetSeconds * 1000
        ? "failure"
        : "timer");
    const outcome =
      endDue && state.closed && provider.closed && provider.complete
        ? determineOutcome({
            ...clocks,
            durationSeconds: doc.durationSeconds,
            endedBy,
            fanEndedByChoice: row.fan_ended_by_choice,
            creatorJoinedByGrace,
            fanJoinedByGrace,
            graceElapsed: measuredUntil >= graceAt,
          })
        : null;
    return this.db.withThread(scope, async (client) => {
      const fresh = await this.row(scope, client, id, true);
      // A consent/end mutation while provider polling was in-flight requires another current-state pass.
      if (
        fresh.document.version !== doc.version ||
        fresh.document.serverNow !== doc.serverNow ||
        (lease && fresh.worker_lease_until?.toISOString() !== lease)
      )
        return fresh.document;
      const present: CallRole[] = [];
      if (state.presentAccountIds.includes(doc.creatorAccountId))
        present.push("creator");
      if (state.presentAccountIds.includes(doc.fanAccountId))
        present.push("fan");
      const recordingPermitted =
        ["creator", "fan"].every((role) =>
          doc.consents.some(
            (c) => c.role === role && c.purpose === "recording" && c.granted,
          ),
        ) && !endDue;
      const next: CallSession = {
        ...doc,
        ...clocks,
        present,
        state: outcome
          ? "ended"
          : endDue
            ? "ending"
            : present.length === 2 && Date.now() >= Date.parse(doc.scheduledAt)
              ? "connected"
              : clocks.connectedMilliseconds
                ? "reconnecting"
                : "waiting",
        outcome,
        reconciliation: outcome ? "complete" : endDue ? "blocked" : "pending",
        recordingState: state.recording
          ? recordingPermitted
            ? "on"
            : "stopping"
          : "off",
        recordingOccurred: Boolean(doc.recordingOccurred || state.recording),
      };
      if (state.recording && !recordingPermitted)
        await client.query(
          "INSERT INTO creator.call_effect(session_id,creator_id,fan_id,kind,key,payload) VALUES($1,$2,$3,'sync_recording',$4,'{}') ON CONFLICT(key) DO NOTHING",
          [
            id,
            scope.creatorId,
            scope.fanId,
            `${id}:recording-denied:${doc.version}`,
          ],
        );
      if (outcome) {
        if (
          !["ready", "deleted"].includes(doc.summaryState ?? "absent") &&
          ["creator", "fan"].every((role) =>
            doc.consents.some(
              (c) => c.role === role && c.purpose === "summary" && c.granted,
            ),
          )
        ) {
          next.summaryState = "pending";
          await client.query(
            "INSERT INTO creator.call_effect(session_id,creator_id,fan_id,kind,key,payload) VALUES($1,$2,$3,'generate_summary',$4,'{}') ON CONFLICT(key) DO NOTHING",
            [
              id,
              scope.creatorId,
              scope.fanId,
              `${id}:ended-summary:${doc.summaryRevision ?? 0}`,
            ],
          );
        }
        const evidence: SessionEvidence = {
          schemaVersion: 1,
          sessionId: id,
          commitmentId: doc.commitmentId,
          creatorAccountId: doc.creatorAccountId,
          fanAccountId: doc.fanAccountId,
          scheduledAt: doc.scheduledAt,
          durationSeconds: doc.durationSeconds,
          hardEndAt: doc.hardEndAt,
          connectedMilliseconds: clocks.connectedMilliseconds,
          connectedIntervals: clocks.connectedIntervals,
          reconnectBudgetSeconds: doc.reconnectBudgetSeconds,
          reconnectUsedMilliseconds: clocks.reconnectUsedMilliseconds,
          endedBy,
          fanEndedByChoice: row.fan_ended_by_choice,
          outcome,
          providerRoomId: row.room_id,
          providerHistoryReference: provider.reference,
          reconciledAt: now,
          roomClosed: true,
          evidenceComplete: true,
          consent: doc.consents,
        };
        await client.query(
          "INSERT INTO creator.call_outcome(session_id,creator_id,fan_id,evidence) VALUES($1,$2,$3,$4) ON CONFLICT(session_id) DO NOTHING",
          [id, scope.creatorId, scope.fanId, JSON.stringify(evidence)],
        );
        for (const kind of ["settle_evidence", "handback", "outcome_notice"])
          await client.query(
            "INSERT INTO creator.call_effect(session_id,creator_id,fan_id,kind,key,payload) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(key) DO NOTHING",
            [
              id,
              scope.creatorId,
              scope.fanId,
              kind,
              `${id}:${kind}`,
              JSON.stringify({ sessionId: id }),
            ],
          );
        await client.query(
          "UPDATE creator.call_slot SET active=false WHERE creator_id=$1 AND fan_id=$2 AND offer_id IN(SELECT id FROM creator.call_offer WHERE commitment_id=$3 AND creator_id=$1 AND fan_id=$2)",
          [scope.creatorId, scope.fanId, doc.commitmentId],
        );
      }
      const structural =
        next.state !== doc.state ||
        next.outcome !== doc.outcome ||
        next.recordingState !== doc.recordingState ||
        next.summaryState !== doc.summaryState ||
        JSON.stringify(next.present) !== JSON.stringify(doc.present);
      return this.persist(scope, client, next, !structural);
    });
  }
}
