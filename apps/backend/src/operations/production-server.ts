import { ProductionRefusal } from "./production-config.js";
import { startProductionHost, type ProductionLog } from "./production.js";
import { lifecycleFailure } from "./telemetry.js";

// The production entry point. One JSON line per event on stdout, never a
// setting's value. Exit 1 means it refused to start or had to stop serving;
// an orchestrator that restarts it will see the same refusal until it is fixed.
const log: ProductionLog = (event, fields = {}, level = "info") =>
  process.stdout.write(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...fields,
    }) + "\n",
  );
const exit = (code: number) =>
  process.stdout.write("", () => process.exit(code));
const refused = (error: ProductionRefusal) => {
  log("production_refused", { reasons: error.reasons }, "error");
  exit(1);
};

process.on("uncaughtException", (error) => {
  log("production_crashed", lifecycleFailure(error), "error");
  exit(1);
});
process.on("unhandledRejection", (error) => {
  log("production_crashed", lifecycleFailure(error), "error");
  exit(1);
});

let host: Awaited<ReturnType<typeof startProductionHost>> | undefined;
let stopping = false;
const shutdown = (code: number) => {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => exit(1), 30_000);
  deadline.unref();
  void (host?.close() ?? Promise.resolve())
    .then(() => {
      log("production_stopped");
      exit(code);
    })
    .catch((error: unknown) => {
      log("production_stop_failed", lifecycleFailure(error), "error");
      exit(1);
    });
};
process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));

try {
  host = await startProductionHost({
    log,
    onFatal: (error) => {
      log("production_refused", { reasons: error.reasons }, "error");
      shutdown(1);
    },
  });
} catch (error) {
  if (error instanceof ProductionRefusal) refused(error);
  else {
    log("production_failed", lifecycleFailure(error), "error");
    exit(1);
  }
}
