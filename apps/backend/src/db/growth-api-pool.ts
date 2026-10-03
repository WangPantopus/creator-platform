import pg from "pg";

/** Growth and follower-content reads share this narrowly inherited API role.
 * Identity, Conversation, Agent and Trust retain the canonical core pool.
 * A separate Boolean read cannot hold a follow decision through content commit.
 */
export async function createGrowthAPIPool(
  coreDatabaseURL: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Promise<pg.Pool | undefined> {
  if (env.GROWTH_ENABLED !== "true") return undefined;
  if (!coreDatabaseURL || !env.GROWTH_API_DATABASE_URL)
    throw new Error("Growth requires a separate GROWTH_API_DATABASE_URL.");
  const core = new URL(coreDatabaseURL),
    growth = new URL(env.GROWTH_API_DATABASE_URL);
  if (
    !["postgres:", "postgresql:"].includes(core.protocol) ||
    !["postgres:", "postgresql:"].includes(growth.protocol) ||
    !growth.username ||
    growth.username === core.username ||
    growth.hostname !== core.hostname ||
    (growth.port || "5432") !== (core.port || "5432") ||
    growth.pathname !== core.pathname
  )
    throw new Error(
      "Growth API must use a separate role on the same canonical database.",
    );
  const pool = new pg.Pool({
    connectionString: env.GROWTH_API_DATABASE_URL,
    max: 6,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 5000,
  });
  pool.on("error", () => {
    console.warn(
      "An idle Growth API database connection failed and was discarded.",
    );
  });
  try {
    const result = await pool.query<{ allowed: boolean }>(`
      WITH RECURSIVE reachable AS (
        SELECT oid,rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolinherit,rolcanlogin
        FROM pg_roles WHERE rolname=current_user
        UNION
        SELECT r.oid,r.rolname,r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,r.rolinherit,r.rolcanlogin
        FROM pg_roles r JOIN pg_auth_members m ON m.roleid=r.oid JOIN reachable p ON p.oid=m.member
      ) SELECT session_user=current_user AND
        EXISTS(SELECT FROM reachable WHERE rolname=current_user AND rolinherit AND rolcanlogin) AND
        EXISTS(SELECT FROM reachable WHERE rolname='creator_runtime') AND
        EXISTS(SELECT FROM reachable WHERE rolname='growth_runtime') AND
        NOT EXISTS(SELECT FROM reachable WHERE rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole
          OR rolname NOT IN(current_user,'creator_runtime','growth_runtime')) AND
        NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname IN('creator','growth','creator_trust') AND c.relowner IN(SELECT oid FROM reachable)) AND
        NOT EXISTS(SELECT FROM pg_namespace n WHERE n.nspname IN('creator','growth','creator_trust')
          AND n.nspowner IN(SELECT oid FROM reachable)) AND
        NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace,
          LATERAL aclexplode(c.relacl) a WHERE n.nspname IN('creator','growth','creator_trust')
          AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AND
        NOT EXISTS(SELECT FROM pg_attribute att JOIN pg_class c ON c.oid=att.attrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace,LATERAL aclexplode(att.attacl) a
          WHERE n.nspname IN('creator','growth','creator_trust')
          AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AND
        NOT EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname IN('creator','growth','creator_trust') AND p.proowner IN(SELECT oid FROM reachable)) AND
        NOT EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
          LATERAL aclexplode(p.proacl) a WHERE n.nspname IN('creator','growth','creator_trust')
          AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS allowed
    `);
    if (result.rows[0]?.allowed !== true)
      throw new Error(
        "Growth API requires only the approved core/Growth inherited roles, without ownership or direct private grants.",
      );
    return pool;
  } catch (error) {
    await pool.end();
    throw error;
  }
}
