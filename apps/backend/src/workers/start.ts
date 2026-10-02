import { startMediaWorker } from "./media.js";
import { startPublicationWorker } from "./publication.js";
import {
  trustMediaWorkerDenial,
  trustPublicationWorkerDenial,
} from "../modules/trust/scope-restriction.js";
import { trustLocalRestorationInTransaction } from "../modules/trust/restoration.js";
import { DomainError } from "../core/errors.js";

const pool = process.argv[2];
if (!["generation", "ingestion", "publication"].includes(pool ?? ""))
  throw new Error("Choose generation, ingestion or publication.");
if (pool === "generation") {
  // Worker processes have separate connection/queue budgets. They cannot run against an unconfigured provider.
  process.stderr.write(
    "generation worker is unavailable until its provider adapters and scoped job processor are configured.\n",
  );
  process.exitCode = 1;
} else if (pool === "publication") {
  // This executable is the explicitly labelled loopback development host.
  // Production hosts inject their genuine restoration authority into the same
  // startPublicationWorker seam; the helper refuses every production mode.
  const restored = trustLocalRestorationInTransaction(process.env);
  const worker = await startPublicationWorker(process.env, {
    assertRestoredInTransaction: async (client) => {
      if (!(await restored(client)))
        throw new DomainError(
          "restored_traffic_closed",
          "Current restoration authority is unavailable.",
          503,
        );
    },
    assertAllowed: trustPublicationWorkerDenial(),
  });
  const shutdown = () => {
    void worker.close().then(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
} else {
  // The ingestion pool currently hosts W6 media processing only.
  const worker = await startMediaWorker(process.env, trustMediaWorkerDenial());
  const shutdown = () => {
    void worker.close().then(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
