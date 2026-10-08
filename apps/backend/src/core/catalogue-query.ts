import { createHash } from "node:crypto";
import type { Pool, QueryResultRow } from "pg";

/** Reuse parsing/planning of fixed catalogue SQL on its original connection.
 * Every execution reads current rows; no authorization result is cached.
 * PostgreSQL invalidates prepared plans when their dependencies change. */
export function catalogueQuery<T extends QueryResultRow = QueryResultRow>(
  query: Pick<Pool, "query">,
  text: string,
  values: unknown[] = [],
  options: Readonly<{ query_timeout?: number }> = {},
) {
  return query.query<T>({
    name:
      "purpose-catalogue:" +
      createHash("sha256").update(text).digest("base64url"),
    text,
    values,
    ...options,
  });
}
