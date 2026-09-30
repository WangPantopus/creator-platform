const pool = process.argv[2];
if (!["generation", "ingestion"].includes(pool ?? ""))
  throw new Error("Choose generation or ingestion.");
// Worker processes have separate connection/queue budgets. They cannot run against an unconfigured provider.
process.stderr.write(
  `${pool} worker is unavailable until its provider adapters and scoped job processor are configured.\n`,
);
process.exitCode = 1;
