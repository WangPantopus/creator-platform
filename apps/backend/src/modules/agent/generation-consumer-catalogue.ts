import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { contentHash } from "../../core/canonical.js";
import { DomainError } from "../../core/errors.js";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";
import type { GenerationPurposeConsumer } from "../identity/generation-scope.js";

export { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";

/** Metadata qualification only. The actual W1 issuer separately checks its
 * registered source and private current purpose. Retain the independently
 * reviewed receipts; a later catalogue read must never approve its own drift. */
export type GenerationConsumerCustody = Readonly<{
  owner: string;
  consumers: readonly GenerationPurposeConsumer[];
  catalogueChecksum: string;
  /** Other original fixed NOLOGIN consumers that call these executables. */
  callers: readonly string[];
  dependencies: readonly string[];
}>;

export async function assertGenerationConsumerCustody(
  query: Pick<Pool, "query">,
  custody: GenerationConsumerCustody,
): Promise<void> {
  try {
    const ready = (
      await query.query<{ ready: boolean }>(
        `SELECT session_user='creator_generation_worker' AND current_user=session_user
         AND EXISTS(SELECT FROM pg_roles r WHERE r.rolname=$1 AND NOT r.rolcanlogin
          AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolbypassrls
          AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication
          AND (r.rolconfig IS NULL OR cardinality(r.rolconfig)=0)
          AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
          AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
          AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=r.oid)
          AND (SELECT count(*) FROM pg_proc WHERE proowner=r.oid)=$2)
         AND NOT EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
           AND pg_get_userbyid(p.proowner)<>$1
           AND NOT p.oid=ANY(ARRAY(SELECT to_regprocedure(signature)::oid FROM unnest($3::text[]) signature))
           AND ((p.prosecdef AND has_function_privilege($1,p.oid,'EXECUTE'))
            OR EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
             WHERE a.grantee=(SELECT oid FROM pg_roles WHERE rolname=$1) AND a.privilege_type='EXECUTE')))
         AND NOT EXISTS(SELECT FROM pg_roles r WHERE r.rolname=ANY($4::text[])
          AND (r.rolcanlogin OR r.rolinherit OR r.rolsuper OR r.rolbypassrls
           OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication
           OR (r.rolconfig IS NOT NULL AND cardinality(r.rolconfig)<>0)
           OR EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
           OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
           OR EXISTS(SELECT FROM pg_class WHERE relowner=r.oid)))
         AS ready`,
        [
          custody.owner,
          custody.consumers.length,
          custody.dependencies,
          custody.callers,
        ],
      )
    ).rows[0]?.ready;
    if (ready !== true) throw new Error("Changed fixed consumer owner");
    for (const consumer of custody.consumers) {
      const proof = (
        await query.query<{ ready: boolean; definition: string }>(
          `SELECT EXISTS(SELECT FROM creator.schema_migration WHERE version=$2 AND checksum=$3)
           AND p.prosecdef AND p.prokind='f' AND p.provolatile='v'
           AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)=$4
           AND has_function_privilege(session_user,p.oid,'EXECUTE')
           AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
            LEFT JOIN pg_roles recipient ON recipient.oid=a.grantee
            WHERE a.privilege_type<>'EXECUTE' OR recipient.rolname IS NULL
             OR NOT recipient.rolname=ANY($5::text[])
             OR (a.grantee<>p.proowner AND a.is_grantable)) AS ready,
           pg_get_functiondef(p.oid) AS definition FROM pg_proc p WHERE p.oid=to_regprocedure($1)`,
          [
            consumer.signature,
            consumer.migration.version,
            consumer.migration.checksum,
            custody.owner,
            [custody.owner, "creator_generation_worker", ...custody.callers],
          ],
        )
      ).rows[0];
      if (
        proof?.ready !== true ||
        createHash("sha256").update(proof.definition).digest("hex") !==
          consumer.definitionChecksum
      )
        throw new Error("Changed fixed executable custody");
    }
    if (
      contentHash(await generationConsumerCatalogue(query, custody.owner)) !==
      custody.catalogueChecksum
    )
      throw new Error("Changed effective consumer catalogue");
  } catch (cause) {
    const failure = new DomainError(
      "generation_consumer_custody_changed",
      "The reviewed fixed generation executable and permission catalogue are unavailable.",
      503,
    );
    Object.defineProperty(failure, "cause", {
      value: cause,
      configurable: true,
      writable: true,
    });
    throw failure;
  }
}
