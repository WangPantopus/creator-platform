import type { ThreadScope } from "../access/scope.js";
import type {
  SessionEvidence,
  CallConsentPurpose,
} from "../../../../../packages/api/src/session.js";
import { SessionService } from "./service.js";
import { withDeadline } from "../media/deadline.js";
import { DomainError } from "../../core/errors.js";
import {
  validateProviderState,
  validateRecordingDeletion,
  validateRecordingState,
} from "./provider.js";

export interface CallEffects {
  summarize(input: {
    packet: { summary: string; attachmentIds: string[] };
    creatorNote: string;
    signal: AbortSignal;
  }): Promise<string>;
  settleEvidence(
    scope: ThreadScope,
    evidence: SessionEvidence,
    key: string,
  ): Promise<void>;
  handback(scope: ThreadScope, sessionId: string, key: string): Promise<void>;
  notify(scope: ThreadScope, sessionId: string, key: string): Promise<void>;
  purgeConsentAssets(
    scope: ThreadScope,
    sessionId: string,
    purpose: CallConsentPurpose,
    key: string,
  ): Promise<void>;
}
/** Scheduler enumerates only authorized tenant scopes using W1/W8's worker authority. */
export class SessionWorker {
  constructor(
    private readonly sessions: SessionService,
    private readonly effects: Partial<CallEffects>,
  ) {}
  async tick(scope: ThreadScope) {
    const rows = await this.sessions.db.withThread(scope, async (client) => {
      await this.sessions.expireOffers(scope, client);
      const due = await client.query<{ id: string }>(
        "SELECT id FROM creator.call_session WHERE creator_id=$1 AND fan_id=$2 AND state NOT IN('ended','cancelled') AND next_check_at<=now() AND (worker_lease_until IS NULL OR worker_lease_until<now()) ORDER BY next_check_at LIMIT 8",
        [scope.creatorId, scope.fanId],
      );
      return due.rows;
    });
    for (const row of rows) {
      const lease = new Date(Date.now() + 30_000).toISOString();
      const claimed = await this.sessions.db.withThread(
        scope,
        async (client) =>
          (
            await client.query(
              "UPDATE creator.call_session SET worker_lease_until=$4 WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND state NOT IN('ended','cancelled') AND next_check_at<=now() AND (worker_lease_until IS NULL OR worker_lease_until<now()) RETURNING id",
              [row.id, scope.creatorId, scope.fanId, lease],
            )
          ).rowCount === 1,
      );
      if (!claimed) continue;
      let failure: string | null = null;
      try {
        await this.sessions.reconcile(scope, row.id, lease);
      } catch {
        failure = "provider_reconciliation_unavailable";
      }
      await this.sessions.db.withThread(scope, async (client) => {
        await client.query(
          "UPDATE creator.call_session SET worker_lease_until=NULL,next_check_at=now()+interval '1 second',last_failure_code=$4 WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND worker_lease_until=$5",
          [row.id, scope.creatorId, scope.fanId, failure, lease],
        );
      });
    }
    await this.runEffect(scope);
    return rows.length;
  }
  private async runEffect(scope: ThreadScope) {
    const effect = await this.sessions.db.withThread(scope, async (client) => {
      const next = (
        await client.query<{
          id: string;
          session_id: string;
          kind: string;
          key: string;
          payload: { purpose?: CallConsentPurpose };
        }>(
          "SELECT * FROM creator.call_effect WHERE creator_id=$1 AND fan_id=$2 AND completed_at IS NULL AND available_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY available_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",
          [scope.creatorId, scope.fanId],
        )
      ).rows[0];
      const lease = new Date(Date.now() + 60_000).toISOString();
      if (next)
        await client.query(
          "UPDATE creator.call_effect SET lease_until=$4,attempts=attempts+1 WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
          [next.id, scope.creatorId, scope.fanId, lease],
        );
      return next ? { ...next, lease } : null;
    });
    if (!effect) return;
    let externalUnconfirmed = false;
    let recordingDeletionReference: string | null = null;
    try {
      const cleanup = [
        "close_room",
        "purge_consent_assets",
        "sync_recording",
        "settle_evidence",
        "handback",
        "outcome_notice",
        "scheduled_notice",
      ].includes(effect.kind);
      const row = await this.sessions.db.withThread(scope, (client) =>
        cleanup
          ? this.sessions.lifecycleRow(scope, client, effect.session_id)
          : this.sessions.row(scope, client, effect.session_id),
      );
      if (!row) throw new Error("session_unavailable");
      if (effect.kind === "ensure_room") {
        if (
          ["ending", "ended", "cancelled"].includes(row.document.state) ||
          row.revoked_at
        )
          throw new Error("room_creation_denied");
        externalUnconfirmed = true;
        await withDeadline(
          this.sessions.provider.ensureRoom({
            roomId: row.room_id,
            endAt: row.document.hardEndAt,
            recording: false,
          }),
          5000,
        );
        externalUnconfirmed = false;
        try {
          const current = await this.sessions.db.withThread(scope, (client) =>
            this.sessions.row(scope, client, effect.session_id),
          );
          if (["ending", "ended", "cancelled"].includes(current.document.state))
            throw new Error("room_creation_denied");
        } catch (error) {
          await withDeadline(
            this.sessions.provider.closeRoom(row.room_id),
            5000,
          );
          throw error;
        }
      } else if (effect.kind === "close_room") {
        if (
          !row.revoked_at &&
          !["ending", "ended", "cancelled"].includes(row.document.state)
        )
          throw new Error("room_closure_denied");
        await withDeadline(this.sessions.provider.closeRoom(row.room_id), 5000);
        const recording = validateRecordingState(
          await withDeadline(
            this.sessions.provider.setRecording(
              row.room_id,
              false,
              `${effect.key}:off`,
            ),
            5000,
          ),
        );
        const truth = validateProviderState(
          await withDeadline(this.sessions.provider.state(row.room_id), 5000),
        );
        if (
          recording.recording ||
          !truth.closed ||
          truth.recording ||
          truth.presentAccountIds.length !== 0
        )
          throw new Error("room_closure_unconfirmed");
        await this.sessions.db.withThread(scope, async (client) => {
          const current = await this.sessions.lifecycleRow(
            scope,
            client,
            effect.session_id,
            true,
          );
          if (!current) throw new Error("session_unavailable");
          if (
            !current.revoked_at &&
            !["ending", "ended", "cancelled"].includes(current.document.state)
          )
            throw new Error("room_closure_changed");
          await this.sessions.persist(scope, client, {
            ...current.document,
            recordingState: "off",
            present: [],
          });
        });
      } else if (effect.kind === "sync_recording") {
        // Read current consent rather than event order, then recheck after the external effect.
        const both = ["creator", "fan"].every((role) =>
          row.document.consents.some(
            (c) => c.role === role && c.purpose === "recording" && c.granted,
          ),
        );
        const enabled =
          both &&
          !row.revoked_at &&
          !["ending", "ended", "cancelled"].includes(row.document.state);
        if (enabled)
          await this.sessions.db.withThread(scope, (client) =>
            this.sessions.row(scope, client, effect.session_id),
          );
        externalUnconfirmed = true;
        const truth = validateRecordingState(
          await withDeadline(
            this.sessions.provider.setRecording(
              row.room_id,
              enabled,
              `${effect.key}:${enabled ? "on" : "off"}`,
            ),
            5000,
          ),
        );
        externalUnconfirmed = false;
        const recordingResult = await this.sessions.db
          .withThread(scope, async (client) => {
            const current = await this.sessions.lifecycleRow(
              scope,
              client,
              effect.session_id,
              true,
            );
            if (!current) throw new Error("session_unavailable");
            const permitted = ["creator", "fan"].every((role) =>
              current.document.consents.some(
                (c) =>
                  c.role === role && c.purpose === "recording" && c.granted,
              ),
            );
            let denied = Boolean(
              truth.recording &&
                (!permitted ||
                  current.revoked_at ||
                  ["ending", "ended", "cancelled"].includes(
                    current.document.state,
                  )),
            );
            if (truth.recording && !denied) {
              try {
                await this.sessions.row(scope, client, effect.session_id);
              } catch (error) {
                if (
                  !(error instanceof DomainError) ||
                  !["call_unavailable", "call_authorization_revoked"].includes(
                    error.code,
                  )
                )
                  throw error;
                denied = true;
              }
            }
            // Commit observed recording before cleanup; a thrown denial would lose its occurrence.
            const recorded = await this.sessions.persist(scope, client, {
              ...current.document,
              recordingState: truth.recording
                ? denied
                  ? "stopping"
                  : "on"
                : "off",
              recordingOccurred: Boolean(
                current.document.recordingOccurred || truth.recording,
              ),
            });
            return { denied, version: recorded.version };
          })
          .catch(async (error) => {
            await withDeadline(
              this.sessions.provider.setRecording(
                row.room_id,
                false,
                `${effect.key}:revoke`,
              ),
              5000,
            );
            throw error;
          });
        if (recordingResult.denied) {
          const stopped = validateRecordingState(
            await withDeadline(
              this.sessions.provider.setRecording(
                row.room_id,
                false,
                `${effect.key}:revoke`,
              ),
              5000,
            ),
          );
          if (stopped.recording) throw new Error("recording_stop_unconfirmed");
          await this.sessions.db.withThread(scope, async (client) => {
            const current = await this.sessions.lifecycleRow(
              scope,
              client,
              effect.session_id,
              true,
            );
            if (!current) throw new Error("session_unavailable");
            if (current.document.version !== recordingResult.version) return;
            await this.sessions.persist(scope, client, {
              ...current.document,
              recordingState: "off",
              recordingOccurred: true,
            });
          });
        }
      } else if (effect.kind === "settle_evidence") {
        if (!this.effects.settleEvidence)
          throw new Error("settlement_adapter_unconfigured");
        const evidence = await this.sessions.db.withThread(
          scope,
          async (client) =>
            (
              await client.query<{ evidence: SessionEvidence }>(
                "SELECT evidence FROM creator.call_outcome WHERE session_id=$1 AND creator_id=$2 AND fan_id=$3",
                [effect.session_id, scope.creatorId, scope.fanId],
              )
            ).rows[0]?.evidence,
        );
        if (!evidence) throw new Error("outcome_evidence_unavailable");
        await this.effects.settleEvidence(scope, evidence, effect.key);
      } else if (effect.kind === "handback") {
        if (!this.effects.handback)
          throw new Error("handback_adapter_unconfigured");
        await this.effects.handback(scope, effect.session_id, effect.key);
      } else if (
        effect.kind === "outcome_notice" ||
        effect.kind === "scheduled_notice"
      ) {
        if (!this.effects.notify)
          throw new Error("notification_adapter_unconfigured");
        await this.effects.notify(scope, effect.session_id, effect.key);
      } else if (effect.kind === "generate_summary") {
        const consented = ["creator", "fan"].every((role) =>
          row.document.consents.some(
            (c) => c.role === role && c.purpose === "summary" && c.granted,
          ),
        );
        if (
          consented &&
          row.document.summaryState === "pending" &&
          row.document.state === "ended"
        ) {
          if (!this.effects.summarize)
            throw new Error("summary_provider_unconfigured");
          const revision = row.document.summaryRevision ?? 0;
          externalUnconfirmed = true;
          const summary = await withDeadline(
            this.effects.summarize({
              packet: row.document.packet,
              creatorNote: row.document.creatorSummaryNote ?? "",
              signal: AbortSignal.timeout(30_000),
            }),
            30_000,
          );
          externalUnconfirmed = false;
          if (!summary.trim() || summary.length > 16000)
            throw new Error("summary_output_invalid");
          await this.sessions.db.withThread(scope, async (client) => {
            const current = await this.sessions.row(
              scope,
              client,
              effect.session_id,
              true,
            );
            if (
              current.document.summaryState !== "pending" ||
              (current.document.summaryRevision ?? 0) !== revision ||
              !["creator", "fan"].every((role) =>
                current.document.consents.some(
                  (c) =>
                    c.role === role && c.purpose === "summary" && c.granted,
                ),
              )
            )
              return;
            await this.sessions.persist(scope, client, {
              ...current.document,
              summary,
              summaryState: "ready",
              summarySources: {
                kind: "packet_and_creator_note",
                commitmentId: current.document.commitmentId,
                noteRevision: revision,
              },
            });
          });
        }
      } else if (effect.kind === "purge_consent_assets") {
        if (!effect.payload.purpose || !this.effects.purgeConsentAssets)
          throw new Error("consent_purge_adapter_unconfigured");
        if (effect.payload.purpose === "recording")
          recordingDeletionReference = validateRecordingDeletion(
            await withDeadline(
              this.sessions.provider.deleteRecording(row.room_id, effect.key),
              5000,
            ),
          ).reference;
        await this.effects.purgeConsentAssets(
          scope,
          effect.session_id,
          effect.payload.purpose,
          effect.key,
        );
      } else throw new Error("call_effect_unavailable");
      await this.sessions.db.withThread(scope, async (client) => {
        await client.query(
          "UPDATE creator.call_effect SET completed_at=now(),lease_until=NULL,failure_code=NULL,payload=CASE WHEN $5::text IS NULL THEN payload ELSE payload||jsonb_build_object('recordingDeletionReference',$5::text) END WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND lease_until=$4",
          [
            effect.id,
            scope.creatorId,
            scope.fanId,
            effect.lease,
            recordingDeletionReference,
          ],
        );
      });
    } catch (error) {
      await this.sessions.db.withThread(scope, async (client) => {
        await client.query(
          "UPDATE creator.call_effect SET lease_until=NULL,failure_code=CASE WHEN failure_code='external_effect_unconfirmed' OR $5 THEN 'external_effect_unconfirmed' ELSE 'effect_blocked' END,available_at=now()+interval '30 seconds' WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND lease_until=$4",
          [
            effect.id,
            scope.creatorId,
            scope.fanId,
            effect.lease,
            externalUnconfirmed ||
              (error instanceof Error &&
                error.message === "external_operation_unconfirmed") ||
              (error instanceof DomainError &&
                error.code === "call_provider_recording_invalid"),
          ],
        );
      });
    }
  }
}
