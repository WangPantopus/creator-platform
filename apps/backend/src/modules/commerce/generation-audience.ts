import { createHash } from "node:crypto";
import { Client, type Pool, type PoolClient } from "pg";
import { z } from "zod";
import { canonical, contentHash } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import { Database } from "../../db/database.js";
import type { AudienceSnapshot } from "../agent/pipeline.js";
import {
  GenerationIdentityAuthority,
  type GenerationPurposeConsumer,
  type GenerationTaskScope,
} from "../identity/generation-scope.js";

export const GENERATION_AUDIENCE_MIGRATION =
  "0098_w4_generation_allowance_audience";
export const GENERATION_AUDIENCE_SIGNATURE =
  "creator.generation_allowance_audience(uuid,uuid)";
export const GENERATION_AUDIENCE_OWNER = "creator_w4_generation_audience";
export const GENERATION_AUDIENCE_SQL_CHECKSUM =
  "91e56109c91c9437104d68a00ccf1c7f5cc3ea0180db8d3535becb8d72f1bb2c";
export const GENERATION_AUDIENCE_DEFINITION_CHECKSUM =
  "19880cbdf7c0a7afdeb29fb1abb0b41f7e342940e233dec01849817846db7567";
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
const Facts = z.strictObject({
  revision: Hash,
  tierIds: z.array(z.uuid()).max(1000),
  // No original group producer has been configured. Never infer group rights
  // from an accepted packet, membership tier or supplied source audience.
  groupIds: z.array(z.uuid()).length(0),
  validUntil: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value).toISOString()),
});
type Grant = { relation: string; column: string; privilege: string };
const columns: Grant[] = [];
for (const [relation, names, lock] of [
  ["schema_migration", "version checksum", false],
  [
    "generation_worker_scope",
    "id transaction_id backend_pid login_name generation_id worker_token operation task created_at",
    false,
  ],
  ["creator_profile", "id account_id verification", false],
  ["fan_profile", "id account_id", false],
  [
    "commerce_allowance_reservation",
    "id creator_id fan_id grant_id key units state cost_policy_version pass_id pass_cycle",
    true,
  ],
  [
    "commerce_membership",
    "id creator_id fan_id tier_id state period_start period_end grace_end grant_id version",
    true,
  ],
  [
    "access_grant",
    "id creator_id fan_id source state capabilities valid_from valid_until reserved",
    true,
  ],
  [
    "commerce_pass",
    "id fan_id state cycle_start cycle_end reserved version",
    true,
  ],
  [
    "commerce_pass_slot",
    "id pass_id fan_id creator_id grant_id state starts_at ends_at",
    true,
  ],
] as const) {
  for (const column of names.split(" "))
    columns.push({ relation, column, privilege: "SELECT" });
  if (lock) columns.push({ relation, column: "id", privilege: "UPDATE" });
}
const relations = [...new Set(columns.map((column) => column.relation))];
type Policy = {
  relation: string;
  name: string;
  command: string;
  role: string;
  using: string | null;
  check: string | null;
};
// Reviewed pg_get_expr receipts include every policy applicable to this role,
// including PUBLIC. A matching new policy name cannot conceal a wider predicate.
const policies: Policy[] = [];
const scope =
  "cac6c683bd50ec15f8c6def56846504c51d0b5458fc7dea693049d0eb9f06849";
const commerce =
  "bb9437efd3827a957f72bbed2bef7a9175705d3b25d3e38e6ddb5dae7b3027b8";
const fan = "0930156a142a62f3587f9888c78afaa655a97e38ad779a352be469d4598d6af8";
const owned =
  "cc13fd7490a39277bff0313275743e09e48ce96ec8bd86c6afc3bf4dececdef5";
const truth =
  "b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b";
const falsehood =
  "fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa";
const pair = "89f3cb7b7ec9a075df2d364c09a93aa3466b9a85609497047ac616e5e7536ab7";
const pass = "09525ea3b7755d53e76ebec5cab6c4e811070159090650039ff049ae3448dced";
const nonce =
  "d79d686bb9f352b4b696a4caea19ca15ca1462a76dae62f0cfc93b9d677a2a21";
for (const [name, command, using, check] of [
  ["scope_read", "r", scope, null],
  ["scope_insert", "a", null, scope],
  ["scope_update", "w", scope, scope],
  ["scope_delete", "d", scope, null],
] as const)
  policies.push({
    relation: "access_grant",
    name,
    command,
    role: "PUBLIC",
    using,
    check,
  });
for (const relation of [
  "commerce_allowance_reservation",
  "commerce_membership",
  "commerce_pass_slot",
])
  policies.push({
    relation,
    name: "commerce_scope",
    command: "*",
    role: "PUBLIC",
    using: commerce,
    check: commerce,
  });
policies.push({
  relation: "commerce_pass",
  name: "fan_scope",
  command: "*",
  role: "PUBLIC",
  using: fan,
  check: fan,
});
for (const prefix of ["creator", "fan"])
  for (const [suffix, command, using, check] of [
    ["public_identity", "r", truth, null],
    ["owned_insert", "a", null, owned],
    ["owned_update", "w", owned, owned],
  ] as const)
    policies.push({
      relation: `${prefix}_profile`,
      name: `${prefix}_${suffix}`,
      command,
      role: "PUBLIC",
      using,
      check,
    });
for (const relation of [
  "commerce_allowance_reservation",
  "commerce_membership",
  "commerce_pass_slot",
  "access_grant",
  "commerce_pass",
])
  for (const [suffix, command, check] of [
    ["read", "r", null],
    ["lock", "w", falsehood],
  ] as const)
    policies.push({
      relation,
      name: `w4_generation_audience_${suffix}`,
      command,
      role: GENERATION_AUDIENCE_OWNER,
      using: relation === "commerce_pass" ? pass : pair,
      check,
    });
policies.push({
  relation: "generation_worker_scope",
  name: "w4_generation_audience_nonce",
  command: "r",
  role: GENERATION_AUDIENCE_OWNER,
  using: nonce,
  check: null,
});
const unavailable = () =>
  new DomainError(
    "generation_audience_unavailable",
    "Current generation allowance audience is unavailable.",
    503,
  );

/** A distinct prepared financial reader. W1 owns the genuine private scope;
 * this port cannot claim a task, mint ThreadScope/Actor, admit a provider or
 * spend/release a hold. Every result remains bound to the actual held callback.
 */
export class CommerceGenerationAudience {
  private readonly issued = new WeakMap<
    Readonly<AudienceSnapshot>,
    { scope: GenerationTaskScope; client: PoolClient; hash: string }
  >();
  private constructor(
    private readonly identity: GenerationIdentityAuthority,
    private readonly receipt: GenerationPurposeConsumer,
    private readonly database: Readonly<{ name: string; oid: number }>,
  ) {}

  static async prepare(input: {
    identity: GenerationIdentityAuthority;
    database: Database;
    workerPool: Pool;
    /** Actual W8/W1 reviewed registration and pg_get_functiondef receipt.
     * Neither a caller JSON audience nor a self-approved catalog hash is used.
     */
    consumer: GenerationPurposeConsumer;
  }): Promise<CommerceGenerationAudience> {
    invariant(
      input.identity instanceof GenerationIdentityAuthority &&
        input.database instanceof Database,
      "generation_audience_unconfigured",
      "The canonical financial database and genuine worker authority are required.",
    );
    input.identity.assertPool(input.workerPool);
    const host = new Client(input.database.pool.options);
    const worker = new Client(input.workerPool.options);
    const endpoint = (client: Client) =>
      canonical({
        host: client.host,
        port: client.port,
        database: client.database,
      });
    invariant(
      host.user === "creator_runtime" &&
        worker.user === "creator_generation_worker" &&
        endpoint(host) === endpoint(worker),
      "generation_audience_pool_mismatch",
      "The canonical host and distinct worker must use the same database endpoint.",
    );
    const receipt = Object.freeze({
      ...input.consumer,
      migration: Object.freeze({ ...input.consumer.migration }),
    });
    invariant(
      receipt.signature === GENERATION_AUDIENCE_SIGNATURE &&
        receipt.owner === GENERATION_AUDIENCE_OWNER &&
        receipt.migration.version === GENERATION_AUDIENCE_MIGRATION &&
        receipt.migration.checksum === GENERATION_AUDIENCE_SQL_CHECKSUM &&
        receipt.definitionChecksum === GENERATION_AUDIENCE_DEFINITION_CHECKSUM,
      "generation_audience_unconfigured",
      "Use the exact reviewed W4 generation audience consumer.",
    );
    const hostDatabase = (
      await input.database.pool.query<{ name: string; oid: number }>(
        "SELECT current_database() AS name,(SELECT oid FROM pg_database WHERE datname=current_database()) AS oid",
      )
    ).rows[0];
    if (!hostDatabase) throw unavailable();
    const audience = new CommerceGenerationAudience(
      input.identity,
      receipt,
      Object.freeze(hostDatabase),
    );
    const client = await input.workerPool.connect();
    try {
      await audience.assertCatalog(client);
    } finally {
      client.release();
    }
    return audience;
  }

  private async assertCatalog(client: PoolClient): Promise<void> {
    try {
      const row = (
        await client.query<{
          ready: boolean;
          activated: boolean;
          definition: string;
        }>(
          `WITH role AS (
            SELECT oid FROM pg_roles WHERE rolname=$3 AND NOT rolcanlogin AND NOT rolinherit
             AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication
             AND NOT rolbypassrls AND rolconfig IS NULL
           ), entry AS (
            SELECT * FROM pg_proc WHERE oid=to_regprocedure($4)
           ), expected_columns AS (
            SELECT relation,"column",privilege FROM jsonb_to_recordset($5::jsonb) AS c(relation text,"column" text,privilege text)
           ), expected_policies AS (
            SELECT * FROM jsonb_to_recordset($9::jsonb) AS p(relation text,name text,command text,role text,"using" text,"check" text)
           ), actual_policies AS (
            SELECT c.relname AS relation,p.polname AS name,p.polcmd::text AS command,p.polpermissive,
             p.polroles=ARRAY[0::oid] AS public_only,p.polroles=ARRAY[(SELECT oid FROM role)] AS owner_only,
             CASE WHEN p.polqual IS NULL THEN NULL ELSE encode(sha256(convert_to(pg_get_expr(p.polqual,p.polrelid),'UTF8')),'hex') END AS "using",
             CASE WHEN p.polwithcheck IS NULL THEN NULL ELSE encode(sha256(convert_to(pg_get_expr(p.polwithcheck,p.polrelid),'UTF8')),'hex') END AS "check"
            FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='creator' AND c.relname=ANY($6::text[])
             AND (0=ANY(p.polroles) OR (SELECT oid FROM role)=ANY(p.polroles))
           ), actual_columns AS (
            SELECT n.nspname,c.relname AS relation,a.attname AS "column",acl.privilege_type AS privilege,
             acl.is_grantable,acl.grantor=c.relowner AS owner_granted
            FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
             CROSS JOIN LATERAL aclexplode(a.attacl) acl
            WHERE a.attnum>0 AND NOT a.attisdropped AND acl.grantee=(SELECT oid FROM role)
           ) SELECT EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2) AS activated,
            current_user=session_user AND session_user='creator_generation_worker'
            AND current_database()=$7 AND (SELECT oid FROM pg_database WHERE datname=current_database())=$8
            AND (SELECT count(*)=1 FROM role)
            AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM role) OR roleid=(SELECT oid FROM role))
            AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=(SELECT oid FROM role))
            AND NOT EXISTS(SELECT FROM entry e CROSS JOIN LATERAL aclexplode(coalesce(e.proacl,acldefault('f',e.proowner))) acl
             JOIN pg_roles r ON r.oid=acl.grantee WHERE r.rolname IN('creator_w2_generation_input','creator_w2_generation_retrieval')
              AND (r.rolcanlogin OR r.rolinherit OR r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls OR r.rolconfig IS NOT NULL
               OR EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
               OR EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid)
               OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
               OR EXISTS(SELECT FROM pg_database WHERE datdba=r.oid)
               OR EXISTS(SELECT FROM pg_class WHERE relowner=r.oid)))
            AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=(SELECT oid FROM role))
            AND NOT EXISTS(SELECT FROM pg_database WHERE datdba=(SELECT oid FROM role))
            AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=(SELECT oid FROM role))
            AND NOT EXISTS(SELECT FROM pg_type WHERE typowner=(SELECT oid FROM role))
            AND NOT EXISTS(SELECT FROM pg_language WHERE lanowner=(SELECT oid FROM role))
            AND NOT EXISTS(SELECT FROM pg_foreign_server WHERE srvowner=(SELECT oid FROM role))
            AND NOT EXISTS(SELECT FROM pg_foreign_data_wrapper WHERE fdwowner=(SELECT oid FROM role))
            AND NOT EXISTS(SELECT FROM pg_tablespace WHERE spcowner=(SELECT oid FROM role))
            AND NOT EXISTS(SELECT FROM pg_largeobject_metadata WHERE lomowner=(SELECT oid FROM role))
            AND (SELECT count(*)=1 FROM pg_proc WHERE proowner=(SELECT oid FROM role))
            AND (SELECT count(*)=1 FROM entry WHERE proowner=(SELECT oid FROM role) AND prokind='f'
             AND prosecdef AND provolatile='v' AND proconfig=ARRAY['search_path=pg_catalog']::text[])
            AND NOT EXISTS(SELECT FROM entry e CROSS JOIN LATERAL aclexplode(coalesce(e.proacl,acldefault('f',e.proowner))) acl
             WHERE acl.privilege_type<>'EXECUTE' OR acl.is_grantable OR acl.grantor<>e.proowner
              OR acl.grantee NOT IN(SELECT oid FROM pg_roles WHERE rolname IN(
               $3,'creator_generation_worker','creator_w2_generation_input','creator_w2_generation_retrieval')))
            AND has_function_privilege(current_user,to_regprocedure($4),'EXECUTE')
            AND has_function_privilege($3,to_regprocedure('creator.generation_scope_matches(uuid,uuid)'),'EXECUTE')
            AND NOT EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND p.prosecdef
              AND p.oid NOT IN(to_regprocedure($4),to_regprocedure('creator.generation_scope_matches(uuid,uuid)'))
              AND has_function_privilege($3,p.oid,'EXECUTE'))
            AND NOT EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
             WHERE acl.grantee=(SELECT oid FROM role)
              AND (acl.privilege_type<>'EXECUTE' OR acl.is_grantable
               OR p.oid NOT IN(to_regprocedure($4),to_regprocedure('creator.generation_scope_matches(uuid,uuid)'))))
            AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND c.relkind IN('r','p','v','m','f')
              AND (has_table_privilege($3,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
               OR (NOT(n.nspname='creator' AND c.relname=ANY($6::text[]))
                AND has_any_column_privilege($3,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))))
            AND NOT EXISTS(SELECT FROM pg_class c WHERE CASE WHEN c.relkind='S' THEN has_sequence_privilege($3,c.oid,'USAGE,SELECT,UPDATE') ELSE false END)
            AND NOT EXISTS(SELECT FROM actual_columns a WHERE a.nspname<>'creator' OR a.is_grantable OR NOT a.owner_granted
             OR NOT EXISTS(SELECT FROM expected_columns e WHERE e.relation=a.relation AND e."column"=a."column" AND e.privilege=a.privilege))
            AND (SELECT count(*) FROM actual_columns)=(SELECT count(*) FROM expected_columns)
            AND NOT EXISTS(SELECT FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
             CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) v(privilege)
             WHERE n.nspname='creator' AND c.relname=ANY($6::text[]) AND a.attnum>0 AND NOT a.attisdropped
              AND has_column_privilege($3,c.oid,a.attnum,v.privilege)
              AND NOT EXISTS(SELECT FROM expected_columns e WHERE e.relation=c.relname AND e."column"=a.attname AND e.privilege=v.privilege))
            AND NOT EXISTS(SELECT FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) acl
             WHERE acl.grantee=(SELECT oid FROM role) AND (n.nspname<>'creator' OR acl.privilege_type<>'USAGE' OR acl.is_grantable OR acl.grantor<>n.nspowner))
            AND has_schema_privilege($3,'creator','USAGE')
            AND NOT EXISTS(SELECT FROM pg_namespace n WHERE has_schema_privilege($3,n.oid,'CREATE'))
            AND NOT EXISTS(SELECT FROM pg_default_acl d LEFT JOIN LATERAL aclexplode(d.defaclacl) acl ON true
             WHERE d.defaclrole=(SELECT oid FROM role) OR acl.grantee=(SELECT oid FROM role))
            AND NOT EXISTS(SELECT FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) acl WHERE acl.grantee=(SELECT oid FROM role))
            AND NOT EXISTS(SELECT FROM pg_type t CROSS JOIN LATERAL aclexplode(t.typacl) acl WHERE acl.grantee=(SELECT oid FROM role))
            AND NOT EXISTS(SELECT FROM pg_language l CROSS JOIN LATERAL aclexplode(l.lanacl) acl WHERE acl.grantee=(SELECT oid FROM role))
            AND NOT EXISTS(SELECT FROM pg_foreign_server s CROSS JOIN LATERAL aclexplode(s.srvacl) acl WHERE acl.grantee=(SELECT oid FROM role))
            AND NOT EXISTS(SELECT FROM pg_foreign_data_wrapper w CROSS JOIN LATERAL aclexplode(w.fdwacl) acl WHERE acl.grantee=(SELECT oid FROM role))
            AND NOT EXISTS(SELECT FROM pg_tablespace t CROSS JOIN LATERAL aclexplode(t.spcacl) acl WHERE acl.grantee=(SELECT oid FROM role))
            AND NOT EXISTS(SELECT FROM pg_parameter_acl p CROSS JOIN LATERAL aclexplode(p.paracl) acl WHERE acl.grantee=(SELECT oid FROM role))
            AND NOT EXISTS(SELECT FROM pg_largeobject_metadata m CROSS JOIN LATERAL aclexplode(m.lomacl) acl WHERE acl.grantee=(SELECT oid FROM role))
            AND (SELECT count(*)=8 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='creator'
             AND c.relname=ANY($6::text[]) AND c.relname<>'schema_migration' AND c.relkind='r'
             AND c.relrowsecurity AND c.relforcerowsecurity AND pg_get_userbyid(c.relowner)='creator_owner')
            AND (SELECT count(*) FROM actual_policies)=(SELECT count(*) FROM expected_policies)
            AND NOT EXISTS(SELECT FROM actual_policies a WHERE NOT a.polpermissive OR NOT EXISTS(
             SELECT FROM expected_policies e WHERE e.relation=a.relation AND e.name=a.name AND e.command=a.command
              AND (e.role='PUBLIC' AND a.public_only OR e.role=$3 AND a.owner_only)
              AND e."using" IS NOT DISTINCT FROM a."using" AND e."check" IS NOT DISTINCT FROM a."check")) AS ready,
            (SELECT pg_get_functiondef(oid) FROM entry) AS definition`,
          [
            this.receipt.migration.version,
            this.receipt.migration.checksum,
            GENERATION_AUDIENCE_OWNER,
            GENERATION_AUDIENCE_SIGNATURE,
            JSON.stringify(columns),
            relations,
            this.database.name,
            this.database.oid,
            JSON.stringify(policies),
          ],
        )
      ).rows[0];
      if (
        row?.activated !== true ||
        row.ready !== true ||
        createHash("sha256").update(row.definition).digest("hex") !==
          this.receipt.definitionChecksum
      )
        throw unavailable();
    } catch {
      throw unavailable();
    }
  }

  private async read(client: PoolClient, scope: GenerationTaskScope) {
    await this.identity.authorizeInTransaction(scope, client);
    await this.assertCatalog(client);
    const raw = (
      await client.query<{ facts: unknown }>(
        "SELECT creator.generation_allowance_audience($1,$2) AS facts",
        [scope.generationId, scope.workerToken],
      )
    ).rows[0]?.facts;
    const parsed = Facts.safeParse(raw);
    if (!parsed.success) throw unavailable();
    const facts = parsed.data;
    const until = new Date(facts.validUntil).getTime();
    const now = Date.now();
    invariant(
      until > now &&
        until <= now + 5000 &&
        until <= new Date(scope.leaseUntil).getTime() &&
        new Set(facts.tierIds).size === facts.tierIds.length &&
        facts.tierIds.every(
          (id, index) => index === 0 || id > facts.tierIds[index - 1]!,
        ),
      "generation_audience_expired",
      "Refresh this actual generation's current audience before reading licensed context.",
    );
    Object.freeze(facts.tierIds);
    Object.freeze(facts.groupIds);
    await this.identity.authorizeInTransaction(scope, client);
    return Object.freeze(facts);
  }

  async currentInTransaction(
    client: PoolClient,
    scope: GenerationTaskScope,
  ): Promise<Readonly<AudienceSnapshot>> {
    const facts = await this.read(client, scope);
    this.issued.set(facts, { client, scope, hash: contentHash(facts) });
    return facts;
  }

  /** Recheck a genuine issued snapshot before a later provider/context stage.
   * A copied/retained snapshot cannot replace a new real held worker scope.
   */
  async authorizeInTransaction(
    facts: Readonly<AudienceSnapshot>,
    scope: GenerationTaskScope,
    client: PoolClient,
  ): Promise<void> {
    const binding = this.issued.get(facts);
    invariant(
      binding?.client === client &&
        binding.scope === scope &&
        binding.hash === contentHash(facts),
      "generation_audience_required",
      "Use this held generation purpose's own current audience.",
    );
    const current = await this.read(client, scope);
    invariant(
      current.revision === facts.revision &&
        canonical(current.tierIds) === canonical(facts.tierIds) &&
        canonical(current.groupIds) === canonical(facts.groupIds) &&
        new Date(facts.validUntil).getTime() > Date.now(),
      "generation_audience_changed",
      "Current generation audience ended or changed.",
    );
  }
}
