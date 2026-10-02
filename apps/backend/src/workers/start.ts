import { startMediaWorker } from "./media.js";
import { trustMediaWorkerDenial } from "../modules/trust/scope-restriction.js";

const pool = process.argv[2];
if (!["generation", "ingestion"].includes(pool ?? ""))
  throw new Error("Choose generation or ingestion.");
if (pool === "generation") {
  // Worker processes have separate connection/queue budgets. They cannot run against an unconfigured provider.
  process.stderr.write(
    "generation worker is unavailable until its provider adapters and scoped job processor are configured.\n",
  );
  process.exitCode = 1;
} else {
  // The ingestion pool currently hosts W6 media processing only.
  const worker = await startMediaWorker(process.env, trustMediaWorkerDenial());
  const shutdown = () => {
    void worker.close().then(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
