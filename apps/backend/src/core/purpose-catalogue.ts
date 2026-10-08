import type { Pool } from "pg";
import { catalogueQuery } from "./catalogue-query.js";

/** Shared read-only catalogue for W2's independently reviewed fixed consumers. */
export async function generationConsumerCatalogue(
  pool: Pick<Pool, "query">,
  role: string,
  options: Readonly<{ queryTimeout?: number; signal?: AbortSignal }> = {},
) {
  if (
    options.queryTimeout !== undefined &&
    (!Number.isSafeInteger(options.queryTimeout) ||
      options.queryTimeout < 1 ||
      options.queryTimeout > 5000)
  )
    throw new Error("The original catalogue response budget is invalid.");
  const query = async (text: string, values: unknown[]) => {
    options.signal?.throwIfAborted();
    const result = await catalogueQuery(pool, text, values, {
      ...(options.queryTimeout === undefined
        ? {}
        : { query_timeout: options.queryTimeout }),
    });
    options.signal?.throwIfAborted();
    return result;
  };
  // Empty effective privilege sets need no per-privilege expansion. The
  // prefilters use the same PostgreSQL privilege functions, including PUBLIC
  // and inherited grants. Every execution still reads every relation/policy.
  const relations = (
    await query(
      `WITH policies AS MATERIALIZED (
        SELECT p.polrelid,jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
         'roles',ARRAY(SELECT CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END FROM unnest(p.polroles) r ORDER BY r),
         'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) AS entries
        FROM pg_policy p WHERE 0=ANY(p.polroles) OR (SELECT oid FROM pg_roles WHERE rolname=$1)=ANY(p.polroles)
        GROUP BY p.polrelid
       ) SELECT n.nspname AS schema,c.relname AS relation,c.relkind,pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity,c.relforcerowsecurity,
       CASE WHEN CASE WHEN c.relkind IN('r','p','v','m','f')
        THEN has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') ELSE false END THEN
       ARRAY(SELECT privilege FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege
        WHERE has_table_privilege($1,c.oid,privilege) ORDER BY privilege) ELSE ARRAY[]::text[] END AS table_privileges,
       CASE WHEN CASE WHEN c.relkind='S'
        THEN has_sequence_privilege($1,c.oid,'SELECT,UPDATE,USAGE') ELSE false END THEN
       ARRAY(SELECT privilege FROM unnest(ARRAY['SELECT','UPDATE','USAGE']) privilege
        WHERE has_sequence_privilege($1,c.oid,privilege) ORDER BY privilege) ELSE ARRAY[]::text[] END AS sequence_privileges,
       CASE WHEN CASE WHEN c.relkind IN('r','p','v','m','f')
        THEN has_any_column_privilege($1,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') ELSE false END THEN
       coalesce((SELECT jsonb_agg(jsonb_build_object('column',a.attname,'privilege',privilege) ORDER BY a.attname,privilege)
        FROM pg_attribute a CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) privilege
        WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
         AND CASE WHEN c.relkind IN('r','p','v','m','f') THEN has_column_privilege($1,c.oid,a.attnum,privilege) ELSE false END),'[]'::jsonb) ELSE '[]'::jsonb END AS columns,
       coalesce(policies.entries,'[]'::jsonb) AS policies
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       LEFT JOIN policies ON policies.polrelid=c.oid
       WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
       ORDER BY n.nspname,c.relname,c.relkind`,
      [role],
    )
  ).rows;
  const schemas = (
    await query(
      `SELECT nspname AS schema,has_schema_privilege($1,oid,'USAGE') AS usage,
       has_schema_privilege($1,oid,'CREATE') AS create FROM pg_namespace
       WHERE nspname !~ '^pg_' AND nspname<>'information_schema' ORDER BY nspname`,
      [role],
    )
  ).rows;
  return { relations, schemas };
}
