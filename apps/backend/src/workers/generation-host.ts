import pg from "pg";
import type { BackendConfig } from "../config.js";
import { invariant } from "../core/errors.js";
import {
  isConfiguredBackendRuntime,
  type BackendRuntime,
} from "../integration.js";
import type { HostUsageAccounting } from "../modules/trust/usage-accounting-host.js";
import { reviewedGenerationWorkerCustody } from "./generation-custody.js";
import { GenerationWorker } from "./generation.js";

/** Canonical loopback development host. The original worker owns execution;
 * this host owns its pool, admission lifetime and complete shutdown drain. */
export async function createDevelopmentGenerationHost(
  runtime: BackendRuntime,
  config: BackendConfig,
  accounting: HostUsageAccounting | undefined,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (env.W3_FAN_GENERATION !== "development") return undefined;
  invariant(
    env.NODE_ENV === "development" &&
      env.TRUST_LOCAL_DEVELOPMENT === "true" &&
      config.identityAdapter === "development" &&
      ["localhost", "127.0.0.1"].includes(
        new URL(config.allowedOrigin).hostname,
      ) &&
      isConfiguredBackendRuntime(runtime) &&
      accounting &&
      runtime.assertGenerationWorkerRestoredInTransaction,
    "generation_host_unconfigured",
    "Generation requires the original loopback development host, accounting and restoration authority.",
  );
  let valid = false;
  try {
    const core = new URL(config.databaseUrl ?? "");
    const worker = new URL(env.GENERATION_DATABASE_URL ?? "");
    valid =
      ["postgres:", "postgresql:"].includes(core.protocol) &&
      ["postgres:", "postgresql:"].includes(worker.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(core.hostname) &&
      core.username === "creator_runtime" &&
      worker.username === "creator_generation_worker" &&
      worker.hostname === core.hostname &&
      (worker.port || "5432") === (core.port || "5432") &&
      worker.pathname === core.pathname &&
      !worker.search &&
      !worker.hash &&
      !core.search &&
      !core.hash;
  } catch {
    // Never include a connection string or parser error in diagnostics.
  }
  invariant(
    valid,
    "generation_database_unconfigured",
    "GENERATION_DATABASE_URL must use the original worker login on the same loopback database.",
  );
  const controller = new AbortController();
  const restored = runtime.assertGenerationWorkerRestoredInTransaction;
  const custody = await reviewedGenerationWorkerCustody(
    {
      assertAllowed: restored,
      assertDiscoveryAllowed: restored,
      assertRestoredInTransaction: restored,
      assertPrivacyRegistered: accounting.assertPrivacyRegistered,
    },
    controller.signal,
  );
  const workerPool = new pg.Pool({
    connectionString: env.GENERATION_DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
    idleTimeoutMillis: 30000,
    pipeline: false,
  });
  workerPool.on("error", () => {
    console.error("An idle generation connection failed and was discarded.");
  });
  let active = false;
  let done: Promise<void> | undefined;
  let closing: Promise<void> | undefined;
  const isRunning = () => active && !controller.signal.aborted;
  return Object.freeze({
    producers: Object.freeze({
      workerPool,
      custody,
      signal: controller.signal,
      isRunning,
    }),
    start(
      worker: GenerationWorker | undefined,
      onFailure: (cause?: unknown) => void,
    ) {
      invariant(
        worker instanceof GenerationWorker && !done && !closing,
        "generation_host_unconfigured",
        "Start the fully prepared original generation worker exactly once.",
      );
      active = true;
      done = worker.run(controller.signal, (pass) => {
        if (
          pass.completed ||
          pass.failed ||
          pass.deferred ||
          pass.recovered ||
          pass.failures.length
        )
          process.stdout.write(
            JSON.stringify({ event: "generation_pass", ...pass }) + "\n",
          );
      });
      void done.then(
        () => {
          active = false;
          if (!controller.signal.aborted) onFailure();
        },
        (cause) => {
          active = false;
          onFailure(cause);
        },
      );
      process.stdout.write(
        "Generation worker: running (fictional development accounts only).\n",
      );
    },
    close(): Promise<void> {
      // Synchronous admission stop precedes any awaited provider/SQL cleanup.
      active = false;
      controller.abort();
      closing ??= (async () => {
        const failures: unknown[] = [];
        try {
          await done;
        } catch (cause) {
          failures.push(cause);
        }
        try {
          await workerPool.end();
        } catch (cause) {
          failures.push(cause);
        }
        if (failures.length)
          throw new AggregateError(
            failures,
            "Generation host shutdown failed.",
          );
      })();
      return closing;
    },
  });
}
