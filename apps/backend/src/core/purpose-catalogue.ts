import type { Pool } from "pg";

/** Shared read-only catalogue for W2's independently reviewed fixed consumers. */
export async function generationConsumerCatalogue(
  pool: Pick<Pool, "query">,
  role: string,
) {
  const relations = (
    await pool.query(
      `SELECT n.nspname AS schema,c.relname AS relation,c.relkind,pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity,c.relforcerowsecurity,
       ARRAY(SELECT privilege FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege
        WHERE CASE WHEN c.relkind IN('r','p','v','m','f') THEN has_table_privilege($1,c.oid,privilege) ELSE false END ORDER BY privilege) AS table_privileges,
       ARRAY(SELECT privilege FROM unnest(ARRAY['SELECT','UPDATE','USAGE']) privilege
        WHERE CASE WHEN c.relkind='S' THEN has_sequence_privilege($1,c.oid,privilege) ELSE false END ORDER BY privilege) AS sequence_privileges,
       coalesce((SELECT jsonb_agg(jsonb_build_object('column',a.attname,'privilege',privilege) ORDER BY a.attname,privilege)
        FROM pg_attribute a CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) privilege
        WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
         AND CASE WHEN c.relkind IN('r','p','v','m','f') THEN has_column_privilege($1,c.oid,a.attnum,privilege) ELSE false END),'[]'::jsonb) AS columns,
       coalesce((SELECT jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
         'roles',ARRAY(SELECT CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END FROM unnest(p.polroles) r ORDER BY r),
         'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname)
        FROM pg_policy p WHERE p.polrelid=c.oid AND (0=ANY(p.polroles) OR (SELECT oid FROM pg_roles WHERE rolname=$1)=ANY(p.polroles))),'[]'::jsonb) AS policies
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
       ORDER BY n.nspname,c.relname,c.relkind`,
      [role],
    )
  ).rows;
  const schemas = (
    await pool.query(
      `SELECT nspname AS schema,has_schema_privilege($1,oid,'USAGE') AS usage,
       has_schema_privilege($1,oid,'CREATE') AS create FROM pg_namespace
       WHERE nspname !~ '^pg_' AND nspname<>'information_schema' ORDER BY nspname`,
      [role],
    )
  ).rows;
  return { relations, schemas };
}
