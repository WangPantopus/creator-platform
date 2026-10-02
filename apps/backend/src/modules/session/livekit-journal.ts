import type { Pool } from "pg";
import { createHash } from "node:crypto";
import type { WebhookEvent } from "livekit-server-sdk";
import { z } from "zod";
import { DomainError } from "../../core/errors.js";
import {
  assertLiveKitCallbackProof,
  consumeLiveKitCallbackProof,
  type LiveKitCallbackProof,
} from "./livekit.js";

const events = z.enum([
  "room_started",
  "room_finished",
  "participant_joined",
  "participant_left",
  "participant_connection_aborted",
  "track_published",
  "track_unpublished",
]);

/** Genuine signed ingress, never an Actor or a history-completeness assertion.
 * Future0092 must be reviewed/activated by W8. No app.* scope or fallback. */
export class LiveKitCallbackJournal {
  constructor(
    private readonly pool: Pool,
    private readonly provider:
      | "livekit-cloud"
      | "livekit-self-hosted-development",
    private readonly apiKey: string,
  ) {}
  async ready() {
    const result = await this.pool
      .query(`SELECT r.rolname,r.rolcanlogin,r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolinherit,r.rolconfig,
      EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid) AS member,
      EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid) OR EXISTS(SELECT FROM pg_class WHERE relowner=r.oid) OR EXISTS(SELECT FROM pg_proc WHERE proowner=r.oid) AS owns,
      to_regprocedure('creator.begin_call_callback(text,text,text,text,text,text,timestamptz,uuid,uuid,uuid)') IS NOT NULL AS issuer,
      to_regprocedure('creator.append_call_callback(uuid)') IS NOT NULL AS append,
      (SELECT count(*)=2 AND bool_and(p.prosecdef AND a.rolname='creator_call_callback_authority'
        AND NOT a.rolcanlogin AND NOT a.rolsuper AND NOT a.rolbypassrls AND NOT a.rolinherit
        AND NOT a.rolcreatedb AND NOT a.rolcreaterole AND NOT a.rolreplication
        AND (a.rolconfig IS NULL OR cardinality(a.rolconfig)=0)
        AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=a.oid OR roleid=a.oid)
        AND p.proconfig @> ARRAY['search_path=pg_catalog','statement_timeout=5s']
        AND has_function_privilege(current_user,p.oid,'EXECUTE')
        AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
          WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'))
        FROM pg_proc p JOIN pg_roles a ON a.oid=p.proowner
        WHERE p.oid IN(to_regprocedure('creator.begin_call_callback(text,text,text,text,text,text,timestamptz,uuid,uuid,uuid)'),
          to_regprocedure('creator.append_call_callback(uuid)'))) AS sealed_functions,
      NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='creator' AND c.relname IN('call_provider_room','call_provider_identity','call_provider_callback','call_callback_scope')
        AND (has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          OR NOT c.relrowsecurity OR NOT c.relforcerowsecurity)) AS no_direct_tables,
      session_user=current_user AS original FROM pg_roles r WHERE rolname=current_user`);
    const role = result.rows[0];
    if (
      !role ||
      role.rolname !== "creator_call_callback_worker" ||
      !role.original ||
      !role.rolcanlogin ||
      role.rolsuper ||
      role.rolbypassrls ||
      role.rolcreatedb ||
      role.rolcreaterole ||
      role.rolreplication ||
      role.rolinherit ||
      role.rolconfig?.length ||
      role.member ||
      role.owns ||
      !role.issuer ||
      !role.append ||
      !role.sealed_functions ||
      !role.no_direct_tables
    )
      throw new DomainError(
        "call_callback_schema_unconfigured",
        "Current provider callback custody is unavailable.",
        503,
      );
  }
  async ingest(
    event: WebhookEvent,
    sha256: string,
    proof: LiveKitCallbackProof,
  ): Promise<"stored" | "duplicate"> {
    assertLiveKitCallbackProof(proof, event, sha256, this.apiKey);
    events.parse(event.event);
    z.string().min(1).max(128).parse(event.id);
    z.string()
      .regex(/^RM_[a-zA-Z0-9]{1,64}$/u)
      .parse(event.room?.sid);
    z.string()
      .regex(/^[a-f0-9]{64}$/u)
      .parse(sha256);
    const created = Number(event.createdAt);
    if (
      !Number.isSafeInteger(created) ||
      created < 1 ||
      created * 1000 > Date.now() + 120000
    )
      throw new DomainError(
        "call_callback_time_invalid",
        "Provider callback time needs confirmation.",
        503,
      );
    const participantEvent = !event.event.startsWith("room_");
    const identity = participantEvent
      ? z.uuid().parse(event.participant?.identity)
      : null;
    const admission = participantEvent
      ? z.uuid().parse(event.participant?.attributes["w6.admission"])
      : null;
    await this.ready();
    const client = await this.pool.connect();
    try {
      consumeLiveKitCallbackProof(proof, event, sha256, this.apiKey);
      await client.query("BEGIN");
      await client.query(
        "SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','1000',true)",
      );
      const issued = await client.query<{ nonce: string | null }>(
        "SELECT creator.begin_call_callback($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS nonce",
        [
          this.provider,
          createHash("sha256").update(this.apiKey).digest("hex"),
          event.room!.sid,
          event.id,
          sha256,
          event.event,
          new Date(created * 1000).toISOString(),
          identity,
          admission,
          proof.claimToken,
        ],
      );
      const nonce = issued.rows[0]?.nonce;
      if (!nonce)
        throw new DomainError(
          "call_callback_binding_unavailable",
          "Current provider identity custody is unavailable.",
          503,
        );
      const result = await client.query<{ result: string }>(
        "SELECT creator.append_call_callback($1) AS result",
        [nonce],
      );
      const disposition = z
        .enum(["stored", "duplicate"])
        .parse(result.rows[0]?.result);
      // Deferred fence accepts only actual COMMIT, rechecks the real claim,
      // binding and wall clock, and deletes its transient nonce before commit.
      await client.query("COMMIT");
      return disposition;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
