import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import { assertPrivacyTaskCatalog } from "../src/modules/trust/privacy-catalog.js";
import { assertDomainPrivacyTaskCatalog } from "../src/modules/trust/domain-privacy-catalog.js";
import { repositoryRoot, sha256 } from "./migration-custody.js";
import { WaveRoleSafetyError } from "./migration-wave-roles.js";

const purposes = [
  {
    role: "creator_privacy_fence",
    scope: "privacy_commit_scope",
    path: "apps/backend/migrations/0087_w8_privacy_task_commit_fence.sql",
    checksum:
      "33e619bfdea66355e1d8d2b90ed2d0389f21ae024fda63e1b984c99aede847ef",
    version: "0087_w8_privacy_task_commit_fence",
  },
  {
    role: "creator_domain_privacy_fence",
    scope: "domain_privacy_commit_scope",
    path: "apps/backend/migrations/0103_w8_domain_privacy_task_fence.sql",
    checksum:
      "040771e88c1cea0720519a2c162cd02319229d9c67171966fc98bc6a3476c15d",
    version: "0103_w8_domain_privacy_task_fence",
  },
];

/** Operator catalogue review only. Administrator-selected session identities
 * run the same complete application guards; they are not password-login,
 * real task, COMMIT, recovery or application acceptance receipts. */
export async function assertPrivacyWaveRoleSafety(
  client: PoolClient,
  installed: { privacy: boolean; domain: boolean },
) {
  const fail = (purpose: string): never => {
    throw new WaveRoleSafetyError(`Unsafe privacy-wave custody: ${purpose}.`);
  };
  const admin = (
    await client.query<{ safe: boolean }>(
      "SELECT current_user=session_user AND rolsuper AS safe FROM pg_roles WHERE rolname=session_user",
    )
  ).rows[0]?.safe;
  if (admin !== true) fail("separate migration administrator required");
  if (installed.domain && !installed.privacy) fail("dependency order");
  // The live privacy fence requires this exact core caller. NOINHERIT does
  // not remove SET ROLE authority from an obsolete Growth membership. Refuse
  // the same drift before rollout rather than discovering it after the DDL.
  const unsafeCore = await client.query(
    `SELECT 1 FROM pg_roles r WHERE r.rolname='creator_runtime' AND (
      r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole
      OR r.rolreplication OR r.rolinherit OR r.rolconfig IS NOT NULL
      OR EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid)
      OR EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid)
    )`,
  );
  if (unsafeCore.rowCount)
    fail("core request role attributes, membership or settings");
  let checked = 0;
  for (const [index, purpose] of purposes.entries()) {
    if (
      sha256(await readFile(new URL(purpose.path, repositoryRoot))) !==
      purpose.checksum
    )
      fail("immutable source");
    const present = index === 0 ? installed.privacy : installed.domain;
    if (!present) {
      const drift = await client.query(
        `SELECT 1 FROM pg_roles r WHERE r.rolname=$1 AND (
          r.rolcanlogin OR r.rolinherit OR r.rolsuper OR r.rolcreatedb OR r.rolcreaterole
          OR r.rolreplication OR r.rolbypassrls OR r.rolconfig IS NOT NULL
          OR EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
          OR EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid
            AND setdatabase IN(0,(SELECT oid FROM pg_database WHERE datname=current_database())))
          OR EXISTS(SELECT FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=r.oid
            AND dbid IN(0,(SELECT oid FROM pg_database WHERE datname=current_database())))
        ) UNION ALL SELECT 1 WHERE to_regclass('creator_trust.'||$2) IS NOT NULL LIMIT 1`,
        [purpose.role, purpose.scope],
      );
      if (drift.rowCount) fail("unregistered role/object capabilities");
      continue;
    }
    // Exact relation shape supplements the shared runtime guards. These scopes
    // contain transaction metadata only and must be empty outside COMMIT.
    const shape = (
      await client.query<{ ready: boolean }>(
        `WITH scope AS(SELECT to_regclass('creator_trust.'||$1) AS oid), expected AS(
        SELECT * FROM (VALUES ('pid','integer'),('xid','xid8'),('caller','name'),
          ('job_id','uuid'),('domain','text'),('lease_token','uuid'),('binding','jsonb')) e(name,type)
      ) SELECT (SELECT count(*)=7 FROM pg_attribute a JOIN expected e ON a.attname=e.name
          AND a.atttypid=to_regtype(e.type) WHERE a.attrelid=(SELECT oid FROM scope)
          AND a.attnum>0 AND NOT a.attisdropped AND a.attnotnull AND a.atttypmod=-1
          AND a.attidentity='' AND a.attgenerated='')
        AND NOT EXISTS(SELECT FROM pg_attrdef WHERE adrelid=(SELECT oid FROM scope))
        AND (SELECT count(*)=2 AND bool_and(contype IN('p','t'))
          FROM pg_constraint WHERE conrelid=(SELECT oid FROM scope)) AS ready`,
        [purpose.scope],
      )
    ).rows[0]?.ready;
    if (shape !== true) fail("private scope shape");
    const empty = await client.query(
      `SELECT 1 FROM creator_trust.${purpose.scope} LIMIT 1`,
    );
    if (empty.rowCount) fail("unfinished private transaction scope");
    checked += 1;
  }
  try {
    if (installed.privacy) {
      await client.query("SET SESSION AUTHORIZATION creator_runtime");
      await assertPrivacyTaskCatalog(client);
      await client.query("RESET SESSION AUTHORIZATION");
    }
    if (installed.domain) {
      await client.query("SET SESSION AUTHORIZATION creator_trust_worker");
      await assertDomainPrivacyTaskCatalog(client, "trust");
      await client.query("RESET SESSION AUTHORIZATION");
      await client.query("SET SESSION AUTHORIZATION growth_worker");
      await assertDomainPrivacyTaskCatalog(client, "growth");
      await client.query("RESET SESSION AUTHORIZATION");
    }
  } catch {
    // The caller must roll back. Do not turn PostgreSQL details/private values
    // into operator output, and do not try to reuse an aborted transaction.
    fail("exact activated source/role/ACL/policy/trigger catalogue");
  } finally {
    // This succeeds for catalogue denials. SQL errors leave the caller's
    // transaction aborted; its ROLLBACK restores the SET SESSION state.
    await client.query("RESET SESSION AUTHORIZATION").catch(() => undefined);
  }
  return {
    checkedPrivatePurposes: checked,
    administratorSelectedCatalogueReview: true,
  };
}
