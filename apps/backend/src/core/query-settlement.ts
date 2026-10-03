/** Only cleanup classification. A transport/read timeout does not establish
 * that PostgreSQL consumed the query, and never supplies request authority.
 * Preserve and inspect private causes through bounded owner refusals. */
export function querySettlementUncertain(failure: unknown): boolean {
  const pending = [failure];
  const seen = new Set<object>();
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    if (seen.size > 64) return true;
    if (
      value instanceof Error &&
      [
        "Query read timeout",
        "Connection terminated",
        "Connection terminated unexpectedly",
        "Client has encountered a connection error and is not queryable",
        "Client was closed and is not queryable",
      ].includes(value.message)
    )
      return true;
    if (
      "code" in value &&
      ["ECONNRESET", "EPIPE", "ETIMEDOUT", "57P01", "57P02", "57P03"].includes(
        String(value.code),
      )
    )
      return true;
    if (value instanceof Error && value.cause !== undefined)
      pending.push(value.cause);
    if (value instanceof AggregateError) {
      if (value.errors.length > 64) return true;
      pending.push(...value.errors);
    }
  }
  return false;
}
