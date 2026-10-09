import type pg from "pg";
import { DomainError } from "../core/errors.js";
import { Database } from "../db/database.js";

/** What the production host learned about its runtime database login.
 * - ready: a non-owner role with enforced row security on a migrated schema.
 * - unavailable: closed for now; the host keeps asking and recovers by itself.
 * - refused: the login itself is unsafe; the host must not serve at all. */
export type DatabaseInspection =
  | { state: "ready" }
  | { state: "unavailable"; code: string }
  | { state: "refused"; reasons: string[] };

/** Every role reachable from the login through any membership, including
 * NOINHERIT paths a session could SET ROLE through, must be unprivileged and
 * must own nothing in the product schemas. A member of the owner role is an
 * owner. This is stricter than Database.assertRuntimeRole, which it also runs. */
const UNSAFE = `WITH RECURSIVE reachable(oid) AS (
    SELECT oid FROM pg_roles WHERE rolname=current_user
    UNION
    SELECT m.roleid FROM pg_auth_members m JOIN reachable p ON p.oid=m.member
  ), roles AS (
    SELECT r.* FROM pg_roles r JOIN reachable x ON x.oid=r.oid
  ) SELECT
    EXISTS(SELECT FROM roles WHERE rolsuper) AS superuser,
    EXISTS(SELECT FROM roles WHERE rolbypassrls) AS bypass_rls,
    EXISTS(SELECT FROM roles WHERE rolcreatedb) AS create_database,
    EXISTS(SELECT FROM roles WHERE rolcreaterole) AS create_role,
    EXISTS(SELECT FROM roles WHERE rolreplication) AS replication,
    EXISTS(SELECT FROM roles WHERE rolname IN('creator_owner','creator_trust_owner','growth_owner')) AS owner_role,
    EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN('creator','creator_trust','growth') AND c.relowner IN(SELECT oid FROM reachable))
    OR EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN('creator','creator_trust','growth') AND p.proowner IN(SELECT oid FROM reachable))
    OR EXISTS(SELECT FROM pg_namespace n
      WHERE n.nspname IN('creator','creator_trust','growth') AND n.nspowner IN(SELECT oid FROM reachable)) AS owns_objects`;

const REASONS: Record<string, string> = {
  superuser: "superuser",
  bypass_rls: "bypass_row_security",
  create_database: "can_create_databases",
  create_role: "can_create_roles",
  replication: "replication",
  owner_role: "member_of_an_owner_role",
  owns_objects: "owns_product_objects",
};

function unavailable(error: unknown): DatabaseInspection {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  return {
    state: "unavailable",
    code:
      code === "28P01" || code === "28000"
        ? "database_authentication_failed"
        : code === "3D000"
          ? "database_missing"
          : "database_unavailable",
  };
}

export async function inspectProductionDatabase(
  pool: pg.Pool,
): Promise<DatabaseInspection> {
  try {
    const row = (await pool.query<Record<string, boolean>>(UNSAFE)).rows[0];
    const reasons = Object.entries(REASONS).flatMap(([column, reason]) =>
      row?.[column] === false ? [] : [reason],
    );
    if (reasons.length) return { state: "refused", reasons };
    try {
      await new Database(pool).assertRuntimeRole();
    } catch (error) {
      if (error instanceof DomainError)
        return error.code === "database_not_migrated"
          ? { state: "unavailable", code: "database_not_migrated" }
          : { state: "refused", reasons: [error.code] };
      throw error;
    }
    return { state: "ready" };
  } catch (error) {
    return unavailable(error);
  }
}
