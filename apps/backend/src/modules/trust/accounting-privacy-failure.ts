/** Pending accounting must be rechecked until its original finite deadline;
 * eight ordinary transport retries cannot silently end the retention process.
 * A breach or absent original evidence requires operator reconciliation. */
export function accountingPrivacyFailure(code: string) {
  if (
    code === "accounting_reconciliation_required" ||
    code === "accounting_reconciliation_escalated"
  )
    return { state: "retry" as const, retrySeconds: 3600 };
  if (
    [
      "accounting_retention_breach",
      "accounting_uncertainty_time_unavailable",
      "accounting_settlement_time_unavailable",
    ].includes(code)
  )
    return { state: "blocked" as const, retrySeconds: 3600 };
  return undefined;
}
