import type { Pool, PoolClient } from "pg";
import { createHash } from "node:crypto";
import type { WebhookEvent } from "livekit-server-sdk";
import { z } from "zod";
import { DomainError } from "../../core/errors.js";
import { assertRegisteredMigration } from "../../db/reviewed-migration.js";
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
const source = Object.freeze({
  path: "apps/backend/src/modules/session/livekit-schema.sql",
  owner: "W6",
  name: "w6_provider_callback_ingress",
  checksum: "d3b16596e2dee78df13705414077cc0993f0612022ddf8d05b76ab8c01045a8c",
});
const ledgerSource = Object.freeze({
  path: "apps/backend/migrations/0201_w8_worker_migration_metadata.sql",
  owner: "W8",
  name: "w8_worker_migration_metadata",
  checksum: "2fce1ce5aa6c9f571067d999e2a62ac8d71b8e147b97393e7e87091227159e6f",
});

/** Genuine signed ingress, never an Actor or a history-completeness assertion.
 * W8 holds the original0092 source as0176. No app.* scope or fallback. */
export class LiveKitCallbackJournal {
  constructor(
    private readonly pool: Pool,
    private readonly provider:
      | "livekit-cloud"
      | "livekit-self-hosted-development",
    private readonly apiKey: string,
  ) {}
  async ready() {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      await this.assertReady(client);
      await client.query("ROLLBACK");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  private async assertReady(client: PoolClient) {
    await assertRegisteredMigration(client, ledgerSource);
    await assertRegisteredMigration(client, source);
    const result =
      await client.query(`SELECT r.rolname,r.rolcanlogin,r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolinherit,r.rolconfig,
      EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid) AS member,
      EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid) AS role_settings,
      EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid) OR EXISTS(SELECT FROM pg_class WHERE relowner=r.oid) OR EXISTS(SELECT FROM pg_proc WHERE proowner=r.oid) OR EXISTS(SELECT FROM pg_database WHERE datdba=r.oid) AS owns,
      to_regprocedure('creator.begin_call_callback(text,text,text,text,text,text,timestamptz,uuid,uuid,uuid)') IS NOT NULL AS issuer,
      to_regprocedure('creator.append_call_callback(uuid)') IS NOT NULL AS append,
      (SELECT count(*)=2 AND bool_and(p.prosecdef AND a.rolname='creator_call_callback_authority'
        AND NOT a.rolcanlogin AND NOT a.rolsuper AND NOT a.rolbypassrls AND NOT a.rolinherit
        AND NOT a.rolcreatedb AND NOT a.rolcreaterole AND NOT a.rolreplication
        AND (a.rolconfig IS NULL OR cardinality(a.rolconfig)=0)
        AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=a.oid OR roleid=a.oid)
        AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=a.oid)
        AND p.proconfig @> ARRAY['search_path=pg_catalog','statement_timeout=5s']
        AND has_function_privilege(current_user,p.oid,'EXECUTE')
        AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
          WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'))
        FROM pg_proc p JOIN pg_roles a ON a.oid=p.proowner
        WHERE p.oid IN(to_regprocedure('creator.begin_call_callback(text,text,text,text,text,text,timestamptz,uuid,uuid,uuid)'),
          to_regprocedure('creator.append_call_callback(uuid)'))) AS sealed_functions,
      (SELECT count(*)=4 FROM pg_proc p JOIN (VALUES
        ('creator.guard_call_provider_binding()','creator_owner','7a4e3b1e82ea03f24564ccec2b3dab8f35696bd1decc3a6984b74edc32c4254d'),
        ('creator.begin_call_callback(text,text,text,text,text,text,timestamptz,uuid,uuid,uuid)','creator_call_callback_authority','5963ea971f6812f64240c3110e0a732f16a5ee83df1389be27e07f48152fb4de'),
        ('creator.append_call_callback(uuid)','creator_call_callback_authority','e4aba38dc55025cc4923f9ceeb9a6a61645b151faec73693f2034dd0dd66dfbc'),
        ('creator.fence_call_callback_commit()','creator_call_callback_authority','36e34fb447f72eaaa9d9928634a9962ad24c876c0baf5078b28b5899a58b083f')
      ) expected(signature,owner,checksum) ON p.oid=to_regprocedure(expected.signature)
        WHERE pg_get_userbyid(p.proowner)=expected.owner
          AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=expected.checksum) AS definitions,
      (SELECT count(*)=4 AND bool_and(c.relrowsecurity AND c.relforcerowsecurity AND pg_get_userbyid(c.relowner)='creator_owner')
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='creator' AND c.relname IN('call_provider_room','call_provider_identity','call_provider_callback','call_callback_scope')) AS tables,
      EXISTS(SELECT FROM pg_trigger WHERE tgrelid=to_regclass('creator.call_callback_scope')
        AND tgname='call_callback_commit' AND tgfoid=to_regprocedure('creator.fence_call_callback_commit()')
        AND tgdeferrable AND tginitdeferred AND tgenabled='O' AND tgtype=5) AS commit_fence,
      EXISTS(SELECT FROM pg_trigger WHERE tgrelid=to_regclass('creator.call_provider_room')
        AND tgname='actual_call_provider_room' AND tgfoid=to_regprocedure('creator.guard_call_provider_binding()')
        AND tgenabled='O' AND tgtype=7) AND
      EXISTS(SELECT FROM pg_trigger WHERE tgrelid=to_regclass('creator.call_provider_identity')
        AND tgname='actual_call_provider_identity' AND tgfoid=to_regprocedure('creator.guard_call_provider_binding()')
        AND tgenabled='O' AND tgtype=7) AS binding_fences,
      EXISTS(SELECT FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=to_regclass('creator.call_provider_callback') AND a.attname='history_complete'
          AND a.atttypid='bool'::regtype AND a.attnotnull AND pg_get_expr(d.adbin,d.adrelid)='false') AND
      EXISTS(SELECT FROM pg_constraint WHERE conrelid=to_regclass('creator.call_provider_callback')
        AND contype='c' AND convalidated AND pg_get_expr(conbin,conrelid)='(NOT history_complete)') AS incomplete_history,
      NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='creator' AND c.relname IN('call_provider_room','call_provider_identity','call_provider_callback','call_callback_scope')
        AND (has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')
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
      role.role_settings ||
      role.owns ||
      !role.issuer ||
      !role.append ||
      !role.sealed_functions ||
      !role.definitions ||
      !role.tables ||
      !role.commit_fence ||
      !role.binding_fences ||
      !role.incomplete_history ||
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
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      await client.query(
        "SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','1000',true)",
      );
      await this.assertReady(client);
      consumeLiveKitCallbackProof(proof, event, sha256, this.apiKey);
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
      await this.assertReady(client);
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
