import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { contentHash } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import { requestAuthority } from "../identity/request-authority.js";
import type { PrivacyHook } from "../trust/contracts.js";
import { privacyTaskAuthorityInTransaction } from "../trust/privacy-authority.js";

type PrivacyInput = Parameters<PrivacyHook["run"]>[0];
export type CommercePrivacyConfiguration = Readonly<{
  migration: Readonly<{ version: string; checksum: string }>;
  /** Reviewed pg_get_functiondef SHA256, not caller-owned authorization code. */
  functionDefinitions: Readonly<{ fence: string; finish: string }>;
}>;
export type CommercePrivacyScope = Readonly<{ accountId: string }>;
export interface CommercePrivacyAuthority {
  withPrivacyJob<T>(
    input: PrivacyInput,
    work: (scope: CommercePrivacyScope) => Promise<T>,
  ): Promise<T>;
}
type Binding = {
  pool: Pool;
  job: Readonly<PrivacyInput>;
  configuration: CommercePrivacyConfiguration;
  active: boolean;
  started: boolean;
  committed: boolean;
};
const issued = new WeakMap<CommercePrivacyScope, Binding>();
const migration = "0087_w8_privacy_task_commit_fence";
const checksum =
  "33e619bfdea66355e1d8d2b90ed2d0389f21ae024fda63e1b984c99aede847ef";
/** W8's read-only reviewed0087 catalog, not a migration activation receipt. */
export const COMMERCE_PRIVACY_CONFIGURATION: CommercePrivacyConfiguration =
  Object.freeze({
    migration: Object.freeze({ version: migration, checksum }),
    functionDefinitions: Object.freeze({
      fence: "89545999948ddf8a7d237e0298df721426aea055e706e4edc82b60879ce18e6c",
      finish:
        "87ca3cb473206101c6590c79c598695cfd2e7e491e14c5e490e3d21a06ff426d",
    }),
  });
const hashes = z.strictObject({
  fence: z.string().regex(/^[a-f0-9]{64}$/u),
  finish: z.string().regex(/^[a-f0-9]{64}$/u),
});
function unavailable(): never {
  throw new DomainError(
    "commerce_privacy_authority_unavailable",
    "Current financial lifecycle authority is unavailable.",
    503,
  );
}
function tuple(input: PrivacyInput) {
  return contentHash({
    jobId: input.jobId,
    accountId: input.accountId,
    kind: input.kind,
    scope: input.scope,
    creatorId: input.creatorId,
    threadId: input.threadId,
    leaseToken: input.leaseToken,
    idempotencyKey: input.idempotencyKey,
  });
}

/** Only the genuine cancellable Commerce task can issue this process-local
 * export scope. No Actor, adult eligibility, request session, ThreadScope,
 * refund permission or grant is constructed from the task's account ID.
 */
export function createCommercePrivacyAuthority(
  pool: Pool,
  configuration?: CommercePrivacyConfiguration,
): CommercePrivacyAuthority {
  const reviewed = configuration
    ? Object.freeze({
        migration: Object.freeze({ ...configuration.migration }),
        functionDefinitions: Object.freeze({
          ...configuration.functionDefinitions,
        }),
      })
    : undefined;
  return Object.freeze({
    async withPrivacyJob<T>(
      input: PrivacyInput,
      work: (scope: CommercePrivacyScope) => Promise<T>,
    ): Promise<T> {
      if (
        !reviewed ||
        reviewed.migration.version !== migration ||
        reviewed.migration.checksum !== checksum ||
        !hashes.safeParse(reviewed.functionDefinitions).success ||
        reviewed.functionDefinitions.fence !==
          COMMERCE_PRIVACY_CONFIGURATION.functionDefinitions.fence ||
        reviewed.functionDefinitions.finish !==
          COMMERCE_PRIVACY_CONFIGURATION.functionDefinitions.finish ||
        requestAuthority.getStore() ||
        !input.signal ||
        !z.uuid().safeParse(input.leaseToken).success ||
        input.idempotencyKey !== `${input.jobId}:commerce`
      )
        unavailable();
      input.signal.throwIfAborted();
      const scope = Object.freeze({ accountId: input.accountId });
      const binding: Binding = {
        pool,
        job: Object.freeze({ ...input }),
        configuration: reviewed,
        active: true,
        started: false,
        committed: false,
      };
      issued.set(scope, binding);
      try {
        const value = await work(scope);
        input.signal.throwIfAborted();
        if (!binding.committed) unavailable();
        return value;
      } finally {
        binding.active = false;
        issued.delete(scope);
      }
    },
  });
}

function bindingFor(
  scope: CommercePrivacyScope,
  pool: Pool,
  input: PrivacyInput,
) {
  const binding = issued.get(scope);
  if (
    !binding?.active ||
    binding.pool !== pool ||
    binding.job.signal !== input.signal ||
    tuple(binding.job) !== tuple(input) ||
    requestAuthority.getStore()
  )
    unavailable();
  binding.job.signal!.throwIfAborted();
  return binding;
}

export function assertCommercePrivacyScope(
  scope: CommercePrivacyScope,
  pool: Pool,
  input: PrivacyInput,
): void {
  bindingFor(scope, pool, input);
}

async function assertCatalog(
  client: PoolClient,
  configuration: CommercePrivacyConfiguration,
) {
  const ready = (
    await client.query<{ ready: boolean }>(
      `SELECT current_user=session_user AND session_user='creator_runtime'
       AND NOT EXISTS(SELECT FROM pg_roles r WHERE r.rolname=current_user AND (r.rolsuper OR r.rolbypassrls))
       AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('creator','creator_trust') AND pg_get_userbyid(c.relowner)=current_user)
       AND EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
       AND EXISTS(SELECT FROM pg_roles r WHERE r.rolname='creator_privacy_fence' AND NOT r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT r.rolbypassrls AND r.rolconfig IS NULL)
       AND NOT EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid IN(m.member,m.roleid) WHERE r.rolname='creator_privacy_fence')
       AND (SELECT count(*)=2 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        JOIN (VALUES ('fence_privacy_task',$3::text),('finish_privacy_task_scope',$4::text)) expected(name,hash) ON p.proname=expected.name
        WHERE n.nspname='creator_trust' AND p.prosecdef AND pg_get_userbyid(p.proowner)='creator_privacy_fence'
        AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=expected.hash
        AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'))
       AND EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='creator_trust' AND p.proname='fence_privacy_task' AND has_function_privilege(current_user,p.oid,'EXECUTE'))
       AND EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='creator_trust' AND c.relname='privacy_commit_scope' AND c.relrowsecurity AND c.relforcerowsecurity AND pg_get_userbyid(c.relowner)='creator_privacy_fence'
        AND NOT has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE'))
       AND EXISTS(SELECT FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc f ON f.oid=t.tgfoid WHERE n.nspname='creator_trust' AND c.relname='privacy_commit_scope' AND t.tgname='privacy_task_commit_current' AND NOT t.tgisinternal AND t.tgenabled='O' AND t.tgdeferrable AND t.tginitdeferred AND f.proname='finish_privacy_task_scope' AND pg_get_userbyid(f.proowner)='creator_privacy_fence') AS ready`,
      [
        configuration.migration.version,
        configuration.migration.checksum,
        configuration.functionDefinitions.fence,
        configuration.functionDefinitions.finish,
      ],
    )
  ).rows[0]?.ready;
  if (ready !== true) unavailable();
}

/** Financial projection only. Actual job metadata locks precede every domain
 * query. Repeatable financial pagination retains one snapshot; 0087 supports
 * this isolation and rechecks the real wall-clock lease at a separate COMMIT.
 * The scope expires with its callback and cannot be replayed on another pool.
 */
export async function withCommercePrivacyExport<T>(
  scope: CommercePrivacyScope,
  pool: Pool,
  input: PrivacyInput,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const binding = bindingFor(scope, pool, input);
  invariant(
    input.kind === "export",
    "commerce_retention_unconfigured",
    "Commerce deletion requires the configured legal retention and obligation policy.",
  );
  if (binding.started) unavailable();
  binding.started = true;
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    await assertCatalog(client, binding.configuration);
    // W8's real issuer validates the actual verified job, immutable ownership,
    // domain and lease; its deferred constraint rejects expiration at COMMIT.
    const owned = await privacyTaskAuthorityInTransaction(client, binding.job);
    await client.query("SELECT set_config('app.account_id',$1,true)", [
      binding.job.accountId,
    ]);
    if (owned.length) {
      const current = (
        await client.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM creator.creator_profile WHERE id=ANY($1::uuid[]) AND account_id=$2 AND verification='verified'",
          [owned, binding.job.accountId],
        )
      ).rows[0];
      // Ordinary financial RLS cannot export erased/restricted creator history.
      // Never turn a missing current row into a successful empty export of the
      // immutable pre-deletion ownership snapshot. A dedicated retained-record
      // purpose and approved policy must supply that path.
      invariant(
        Number(current?.count) === owned.length,
        "privacy_authority_required",
        "Retained creator financial history requires its configured purpose and policy.",
      );
    }
    const value = await work(client);
    assertCommercePrivacyScope(scope, pool, input);
    await client.query("COMMIT");
    binding.committed = true;
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
