import type { PoolClient } from "pg";
import { invariant } from "../../core/errors.js";
import { assertRegisteredMigration } from "../../db/reviewed-migration.js";

// Executable source custody, never reservations or manually installed purposes.
// Body pins match the frozen originals and this unactivated continuation.
// Source custody does not qualify SQL installation or approve the held wave.
const sources = Object.freeze([
  {
    path: "apps/backend/src/modules/identity/schema-publication-scope.sql",
    owner: "W1",
    name: "w1_publication_worker_scope",
    checksum:
      "100e319216568ee1ed27081be0520dbfdb3b7019659946c2c5de1f6859d32cc1",
  },
  {
    path: "apps/backend/src/modules/identity/schema-signature-read-fence.sql",
    owner: "W1",
    name: "w1_signature_read_fence",
    checksum:
      "157640de84f22d6d638d788dfe04314fd193efaed80a829f288bec7cbcb815b5",
  },
  {
    path: "apps/backend/src/modules/commerce/schema-fulfillment-publication-consumer.sql",
    owner: "W4",
    name: "w4_fulfillment_publication_consumer",
    checksum:
      "b2eecdea88d937fb46018ceee1a4385502d366f3a82a061b3c4d5de5696981f0",
  },
  {
    path: "apps/backend/src/modules/identity/schema-publication-preparation.sql",
    owner: "W1",
    name: "w1_publication_preparation",
    checksum:
      "ec7b685f3486032af62942a27aabf508a6c29f147c02242528ed7d358b4790fd",
  },
  {
    path: "apps/backend/migrations/0073_w8_publication_worker_denial.sql",
    owner: "W8",
    name: "w8_publication_worker_denial",
    checksum:
      "87f8766331b59a174e0cf7e837e3a3a9cdfd9d9a1662aa2b39ed9aa2dc308d80",
  },
  {
    path: "apps/backend/migrations/0201_w8_worker_migration_metadata.sql",
    owner: "W8",
    name: "w8_worker_migration_metadata",
    checksum:
      "2fce1ce5aa6c9f571067d999e2a62ac8d71b8e147b97393e7e87091227159e6f",
  },
]);
const functions = Object.freeze([
  {
    signature: "creator_trust.publication_worker_denial(uuid,uuid)",
    argumentNames: ["c", "p"],
    bodyHash:
      "92c413ee0b754ec69077782971fb2f7ce26247eac46d84911c3fd457248a9dfe",
    owner: "creator_trust_denial",
    definer: true,
    configuration: ["search_path=pg_catalog"],
    returnType: "text",
    executable: true,
  },
  {
    signature: "creator.require_publication_scope_cleanup()",
    argumentNames: [],
    bodyHash:
      "a03924c9e408384024bb2829134a721bcff3904dccf16062ae48f043ec1ab294",
    owner: "creator_publication_authority",
    definer: true,
    configuration: ["search_path=pg_catalog"],
    returnType: "trigger",
    executable: false,
  },
  {
    signature:
      "creator.publication_task_proof(uuid,uuid,integer,uuid,uuid,text,text,boolean)",
    argumentNames: ["c", "o", "v", "p", "s", "operation", "h", "finished"],
    bodyHash:
      "427a053176626ab5b8d99ddd087e8cfa11e98f9ab4036497d802c77fed7c469b",
    owner: "creator_publication_authority",
    definer: true,
    configuration: ["search_path=pg_catalog"],
    returnType: "jsonb",
    executable: false,
  },
  {
    signature: "creator.read_publication_task(uuid,uuid,integer,uuid,uuid)",
    argumentNames: ["c", "o", "v", "p", "s"],
    bodyHash:
      "01efaf8c632bec34681b2064eaa6b1a9cd5e5e9362e7a2178a8b7c1b548191ec",
    owner: "creator_publication_authority",
    definer: true,
    configuration: ["search_path=pg_catalog"],
    returnType: "jsonb",
    executable: false,
  },
  {
    signature:
      "creator.begin_publication_scope(uuid,uuid,integer,uuid,uuid,text,text)",
    argumentNames: ["c", "o", "v", "p", "s", "h", "command_text"],
    bodyHash:
      "4f63de94616cd7f6c06496ba5b8908202f68d6d2b34951702fe145679e3331c3",
    owner: "creator_publication_authority",
    definer: true,
    configuration: ["search_path=pg_catalog"],
    returnType: "boolean",
    executable: false,
  },
  {
    signature: "creator.publication_scope_matches(uuid,uuid,integer)",
    argumentNames: ["c", "o", "v"],
    bodyHash:
      "ec629084da7ff6db963cc15a9edfce32d51d3d006733cceddae98e8c08287f7c",
    owner: "creator_publication_authority",
    definer: true,
    configuration: ["search_path=pg_catalog"],
    returnType: "boolean",
    executable: true,
  },
  {
    signature: "creator.end_publication_scope()",
    argumentNames: [],
    bodyHash:
      "3551dbfb8745033a9a84cd9dbecb8987362ddf0832eb6e68b1c9c5a19cb601ce",
    owner: "creator_publication_authority",
    definer: true,
    configuration: ["search_path=pg_catalog"],
    returnType: "void",
    executable: false,
  },
  {
    signature: "creator.fence_signature_metadata_write()",
    argumentNames: [],
    bodyHash:
      "5de9abf23bd5ee2f09022dd4cbde046d0408df384aaffb4c63215f6a377f2c97",
    owner: "creator_owner",
    definer: false,
    configuration: ["search_path=pg_catalog"],
    returnType: "trigger",
    executable: false,
  },
  {
    signature:
      "creator.commerce_fulfillment_publication_document_ready(uuid,uuid,integer)",
    argumentNames: ["c", "i", "v"],
    bodyHash:
      "4c880babf30d317d3c017d7d58b3f6acb3cac93a1a706fe4f919f405dc1ca316",
    owner: "creator_fulfillment_publication_metadata",
    definer: true,
    configuration: ["search_path=pg_catalog"],
    returnType: "boolean",
    executable: true,
  },
  {
    signature:
      "creator.prepare_commerce_fulfillment_publication(uuid,uuid,integer,uuid,uuid)",
    argumentNames: ["c", "i", "v", "p", "s"],
    bodyHash:
      "840914eb516bbf11be69d301947a03187bf026c5b4037cfe880081938e54a6ef",
    owner: "creator_fulfillment_publication_metadata",
    definer: true,
    configuration: ["search_path=pg_catalog"],
    returnType: "uuid",
    executable: false,
  },
  {
    signature: "creator.bind_commerce_fulfillment_publication(uuid,uuid)",
    argumentNames: ["n", "w"],
    bodyHash:
      "07b9047631d367ced02af8f3ae5638c0c6311ccfcb9472f64516fa6e613327c1",
    owner: "creator_fulfillment_publication_metadata",
    definer: true,
    configuration: ["search_path=pg_catalog"],
    returnType: "boolean",
    executable: false,
  },
  {
    signature: "creator.commerce_fulfillment_publication_matches(uuid)",
    argumentNames: ["n"],
    bodyHash:
      "7f4cfc32f1cab9c17485baae2ab3f3c661a0a5022e61f699392b96c2f5bd1c9c",
    owner: "creator_fulfillment_publication_metadata",
    definer: true,
    configuration: ["search_path=pg_catalog"],
    returnType: "boolean",
    executable: true,
  },
  {
    signature: "creator.end_commerce_fulfillment_publication(uuid)",
    argumentNames: ["n"],
    bodyHash:
      "5ce6de98184ee78099bcc398b9b3fb3b2577139cdbe376c693a45631b29ab101",
    owner: "creator_fulfillment_publication_metadata",
    definer: true,
    configuration: ["search_path=pg_catalog"],
    returnType: "void",
    executable: false,
  },
  {
    signature: "creator.require_fulfillment_publication_cleanup()",
    argumentNames: [],
    bodyHash:
      "dc0ff4f5b0bdeaf07d06beb7ebc742e379bdcec7ff4abed418e920fba38063f4",
    owner: "creator_fulfillment_publication_metadata",
    definer: true,
    configuration: ["search_path=pg_catalog"],
    returnType: "trigger",
    executable: false,
  },
  {
    signature: "creator.require_publication_preparation_cleanup()",
    argumentNames: [],
    bodyHash:
      "73b22de45bc00e435f27e780d144e8f6cbcd5fd45928aba6c7ead8b20b73de8d",
    owner: "creator_publication_authority",
    definer: true,
    configuration: ["search_path=pg_catalog"],
    returnType: "trigger",
    executable: false,
  },
  {
    signature: "creator.prepare_publication_task(uuid,uuid,integer,uuid,uuid)",
    argumentNames: ["c", "o", "v", "p", "s"],
    bodyHash:
      "4557fe76e47f1c0065529b27cd653d8135ee47722e68ff8086551f73918374c1",
    owner: "creator_publication_authority",
    definer: true,
    configuration: ["search_path=pg_catalog", "statement_timeout=5s"],
    returnType: "uuid",
    executable: true,
  },
  {
    signature: "creator.read_prepared_publication_task(uuid)",
    argumentNames: ["n"],
    bodyHash:
      "fa9f65895c951cc1068c6ec05dfb9fcfe6e179ce5e7878b942c8f049845bebd6",
    owner: "creator_publication_authority",
    definer: true,
    configuration: ["search_path=pg_catalog", "statement_timeout=5s"],
    returnType: "jsonb",
    executable: true,
  },
  {
    signature: "creator.begin_prepared_publication_scope(uuid,text,text)",
    argumentNames: ["n", "h", "command_text"],
    bodyHash:
      "6984958e935ebe056481302563ad94e718368b472af1c7d7549026c35db79062",
    owner: "creator_publication_authority",
    definer: true,
    configuration: ["search_path=pg_catalog", "statement_timeout=5s"],
    returnType: "boolean",
    executable: true,
  },
  {
    signature: "creator.finalize_prepared_publication_scope(uuid)",
    argumentNames: ["n"],
    bodyHash:
      "808344c4b74d55cbd34fb088d03d9fb74a0d083c8698b0bf052caf94d28be409",
    owner: "creator_publication_authority",
    definer: true,
    configuration: ["search_path=pg_catalog", "statement_timeout=5s"],
    returnType: "boolean",
    executable: true,
  },
]);

export async function assertPublicationPreparation(
  client: Pick<PoolClient, "query">,
) {
  for (const source of sources) await assertRegisteredMigration(client, source);
  const role = await client.query<{
    ready: boolean;
  }>(`SELECT current_user=session_user AND r.rolcanlogin
    AND current_user='creator_publication_worker' AND NOT r.rolsuper AND NOT r.rolinherit AND NOT r.rolbypassrls
    AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND r.rolconfig IS NULL
    AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
    AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid)
    AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
    AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=r.oid)
    AND NOT EXISTS(SELECT FROM pg_proc WHERE proowner=r.oid)
    AND NOT EXISTS(SELECT FROM pg_database WHERE datdba=r.oid)
    AND to_regprocedure('creator_trust.publication_worker_denial(uuid,uuid)') IS NOT NULL
    AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='creator'
      AND c.relname IN('thread','message','generation','memory','fan_profile','identity_session','access_grant')
      AND (has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
    AND NOT has_column_privilege(current_user,'creator.passkey_credential','public_key','SELECT')
    AND NOT has_column_privilege(current_user,'creator.signed_act','assertion','SELECT')
    AND NOT has_column_privilege(current_user,'creator.signed_act','challenge','SELECT')
    AND EXISTS(SELECT FROM pg_class c WHERE c.oid=to_regclass('creator.publication_preparation')
      AND c.relkind='r' AND NOT c.relispartition AND c.relrowsecurity AND c.relforcerowsecurity
      AND pg_get_userbyid(c.relowner)='creator_owner'
      AND NOT has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      AND NOT has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')) AS ready
    FROM pg_roles r WHERE r.rolname=current_user`);
  invariant(
    role.rows[0]?.ready === true,
    "publication_worker_role_required",
    "Use the reviewed separate publication worker purpose.",
  );
  for (const entry of functions) {
    const result = await client.query<{ ready: boolean }>(
      `SELECT EXISTS(SELECT FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
      JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure($1) AND pg_get_userbyid(p.proowner)=$2
      AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreatedb
      AND NOT r.rolcreaterole AND NOT r.rolreplication AND r.rolconfig IS NULL
      AND (r.rolname='creator_owner' OR (NOT r.rolinherit AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)))
      AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid)
      AND p.provolatile='v' AND p.prosecdef=$3 AND p.proconfig=$4::text[]
      AND coalesce(p.proargnames,ARRAY[]::text[])=$5::text[] AND p.prorettype=to_regtype($6)
      AND l.lanname IN('sql','plpgsql') AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=$7
      AND has_function_privilege(current_user,p.oid,'EXECUTE')=$8
      AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE a.grantee=0 AND a.privilege_type='EXECUTE')) AS ready`,
      [
        entry.signature,
        entry.owner,
        entry.definer,
        entry.configuration,
        entry.argumentNames,
        entry.returnType,
        entry.bodyHash,
        entry.executable,
      ],
    );
    invariant(
      result.rows[0]?.ready === true,
      "publication_preparation_unconfigured",
      "The original publication producer changed or is unavailable.",
    );
  }
  const cleanup = await client.query<{
    ready: boolean;
  }>(`SELECT count(*)=3 AS ready FROM pg_trigger t
    WHERE NOT t.tgisinternal AND t.tgenabled='O' AND t.tgtype=5 AND t.tgdeferrable AND t.tginitdeferred
    AND (t.tgrelid,t.tgfoid,t.tgname) IN(
      ('creator.publication_worker_scope'::regclass,to_regprocedure('creator.require_publication_scope_cleanup()'),'require_publication_scope_cleanup'),
      ('creator.publication_preparation'::regclass,to_regprocedure('creator.require_publication_preparation_cleanup()'),'require_publication_preparation_cleanup'),
      ('creator.commerce_fulfillment_publication_scope'::regclass,to_regprocedure('creator.require_fulfillment_publication_cleanup()'),'require_fulfillment_publication_cleanup'))`);
  invariant(
    cleanup.rows[0]?.ready === true,
    "publication_preparation_unconfigured",
    "Original publication cleanup constraints are required.",
  );
  const fence = await client.query<{
    ready: boolean;
  }>(`SELECT count(*)=6 AS ready FROM pg_trigger t
    WHERE NOT t.tgisinternal AND t.tgenabled='O' AND t.tgtype=25 AND t.tgname='fence_signature_metadata_write'
    AND t.tgfoid=to_regprocedure('creator.fence_signature_metadata_write()')
    AND t.tgrelid=ANY(ARRAY['creator.creator_profile'::regclass,'creator.passkey_credential'::regclass,
      'creator.signed_act'::regclass,'creator.signed_act_consumption'::regclass,
      'creator.signed_publication'::regclass,'creator.signed_verification'::regclass])`);
  invariant(
    fence.rows[0]?.ready === true,
    "publication_preparation_unconfigured",
    "Current signature metadata fences are required.",
  );
}
