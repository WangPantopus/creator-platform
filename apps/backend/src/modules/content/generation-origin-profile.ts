import { createHash } from "node:crypto";
import type { PoolClient, QueryConfig } from "pg";
import { DomainError } from "../../core/errors.js";
import { contentHash } from "../../core/canonical.js";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";
import { registeredMigration } from "../../db/reviewed-migration.js";

/** Separate additive source custody. A reservation cannot activate this fence. */
export const GENERATION_CONTENT_ORIGIN_PROFILE_FENCE_SOURCE = Object.freeze({
  owner: "W5",
  name: "w5_generation_origin_profile_fence",
  path: "apps/backend/src/modules/content/schema-generation-origin-profile-fence.sql",
  checksum: "09d3df2f3549d0267dce2fe049789e575b1c8f212ee887d2d5396f110bafc047",
});

export function originUnavailable(cause?: unknown): DomainError {
  const error = new DomainError(
    "generation_content_origin_unconfigured",
    "The reviewed current content origin reader is not activated.",
    503,
  );
  // Keep transport settlement evidence private while preserving it for the
  // original issuer's finalizer. It is not included in the public error body.
  if (cause !== undefined)
    Object.defineProperty(error, "cause", { value: cause, configurable: true });
  return error;
}

/** Metadata only, on the actual held worker client. No role, task or scope is
 * issued here, and no positive lease is reacquired after the signature family.
 * The predicate checksum must come from independent source qualification.
 */
export async function assertOriginProfileFence(
  client: PoolClient,
  definitionChecksum: string,
  catalogueChecksum: string,
): Promise<void> {
  try {
    const migration = await registeredMigration(
      GENERATION_CONTENT_ORIGIN_PROFILE_FENCE_SOURCE,
    );
    if (!migration) throw originUnavailable();
    // Installed pg implements query_timeout; its QueryConfig type omits it.
    const query: QueryConfig & { query_timeout: number } = {
      text: `SELECT session_user='creator_generation_worker' AND current_user=session_user
         AND EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
         AND NOT r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolbypassrls
         AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication
         AND (r.rolconfig IS NULL OR cardinality(r.rolconfig)=0)
         AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
         AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid)
         AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
         AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=r.oid)
         AND (SELECT count(*)=1 FROM pg_proc WHERE proowner=r.oid)
         AND p.polcmd='r' AND NOT p.polpermissive AND p.polroles=ARRAY[r.oid]
         AND p.polwithcheck IS NULL
         AND (SELECT count(*)=2 FROM pg_class WHERE
          oid=ANY(ARRAY['creator.creator_profile'::regclass,'creator.generation_worker_scope'::regclass])
          AND relkind='r' AND relrowsecurity AND relforcerowsecurity
          AND pg_get_userbyid(relowner)='creator_owner')
         AS ready,pg_get_expr(p.polqual,p.polrelid) AS definition
         FROM pg_policy p JOIN pg_roles r ON r.rolname='creator_w5_generation_origin'
         WHERE p.polrelid=to_regclass('creator.creator_profile')
          AND p.polname='w5_generation_origin_original_creator'`,
      values: [migration.version, migration.checksum],
      query_timeout: 5000,
    };
    const proof = (
      await client.query<{ ready: boolean; definition: string }>(query)
    ).rows[0];
    if (
      proof?.ready !== true ||
      typeof proof.definition !== "string" ||
      createHash("sha256").update(proof.definition).digest("hex") !==
        definitionChecksum
    )
      throw originUnavailable();
    if (
      contentHash(
        await generationConsumerCatalogue(
          client,
          "creator_w5_generation_origin",
          { queryTimeout: 5000 },
        ),
      ) !== catalogueChecksum
    )
      throw originUnavailable();
  } catch (error) {
    throw originUnavailable(error);
  }
}
