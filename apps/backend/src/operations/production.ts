import { realpath } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import express, { type Router } from "express";
import pg from "pg";
import type { BackendConfig } from "../config.js";
import { createConfiguredBackend } from "../integration.js";
import type { GuardrailProvider } from "../modules/agent/providers.js";
import type { PantopusIdentityAdapter } from "../modules/identity/adapter.js";
import {
  describeConfig,
  ProductionRefusal,
  readProductionConfig,
  type ProductionConfig,
  type RefusalReason,
} from "./production-config.js";
import {
  inspectProductionDatabase,
  type DatabaseInspection,
} from "./production-database.js";
import { Readiness, type Probe } from "./readiness.js";
import { lifecycleFailure } from "./telemetry.js";

/** The production composition root. It takes the same seam the development host
 * uses (createConfiguredBackend) and fails closed: unless every adapter below is
 * injected and every setting is valid, it serves only liveness, readiness and a
 * sign-in-unavailable answer, and every other route answers 503 `host_closed`.
 * A development setting, a development identity or an unsafe database login
 * makes it refuse to start at all. Genuine adapters come from a reviewed bundled
 * module (PRODUCTION_ADAPTER_MODULE) exporting `configure(env)`, as the Trust
 * deployment does. Contract C2 (draft): docs/lanes/status/lane-2-production-root.md */

type BackendInput = Parameters<typeof createConfiguredBackend>[0];
export type ProductionTrust = Exclude<
  NonNullable<BackendInput["trust"]>,
  (...args: never[]) => unknown
>;
type SlotProbe = Probe["run"];

/** Everything a production host must be given. Missing any one keeps it closed. */
export type ProductionAdapters = {
  /** Lane 1: the Pantopus identity adapter. Never a development adapter. */
  identity: PantopusIdentityAdapter;
  /** Lane 1 and the integrator: the Trust runtime configuration (denials,
   * privacy hooks, restoration authority, crisis resources, probes). */
  trust: NonNullable<BackendInput["trust"]>;
  /** The integrator's wiring of every feature's `register<Name>`. */
  registerFeatures: NonNullable<BackendInput["registerFeatures"]>;
  signedSubjectPolicies?: BackendInput["signedSubjectPolicies"];
  providers: {
    /** Lane 3: the model provider's guardrails and its health. */
    model: { guardrails: GuardrailProvider; probe: SlotProbe };
    /** Lane 1 and lane 3: the license authority's health. */
    license: { probe: SlotProbe };
    /** Lane 4: verified processor and store ingress, and the processor's health. */
    payments: {
      stripeNotifications: Router;
      storeNotifications?: BackendInput["storeNotifications"];
      probe: SlotProbe;
    };
    /** Lane 5: the push gateway's health. */
    push: { probe: SlotProbe };
  };
};

const SLOTS: readonly {
  name: string;
  /** What must be true of the injected value for the slot to count as present. */
  present: (adapters: Partial<ProductionAdapters>) => boolean;
}[] = [
  {
    name: "identity",
    present: (a) =>
      typeof a.identity?.beginSession === "function" &&
      typeof a.identity?.resolveSession === "function",
  },
  {
    name: "trust",
    present: (a) =>
      typeof a.trust === "function" ||
      (typeof a.trust === "object" && a.trust !== null),
  },
  {
    name: "features",
    present: (a) => typeof a.registerFeatures === "function",
  },
  {
    name: "model",
    present: (a) =>
      typeof a.providers?.model?.guardrails?.checkSentence === "function" &&
      typeof a.providers.model.probe === "function",
  },
  {
    name: "license",
    present: (a) => typeof a.providers?.license?.probe === "function",
  },
  {
    name: "payments",
    present: (a) =>
      typeof a.providers?.payments?.stripeNotifications === "function" &&
      typeof a.providers.payments.probe === "function",
  },
  {
    name: "push",
    present: (a) => typeof a.providers?.push?.probe === "function",
  },
];

export type ProductionLog = (
  event: string,
  fields?: Record<string, unknown>,
  level?: "info" | "warn" | "error",
) => void;

export type ProductionHost = {
  /** What the host is doing now; it never serves domain routes while closed. */
  mode: () => "closed" | "open";
  server: () => Server;
  close: () => Promise<void>;
};

/** Reads the reviewed adapter module from the one directory it may live in. */
export async function loadAdapterModule(
  config: ProductionConfig,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Partial<ProductionAdapters>> {
  if (!config.adapterModule) return {};
  const refuse = (detail: string): never => {
    throw new ProductionRefusal([
      { code: "unusable_adapter", key: "PRODUCTION_ADAPTER_MODULE", detail },
    ]);
  };
  let path: string;
  try {
    const directory = await realpath(config.adapterDirectory);
    path = await realpath(resolve(directory, config.adapterModule));
    if (!path.startsWith(directory + sep)) refuse("outside_the_directory");
  } catch (error) {
    if (error instanceof ProductionRefusal) throw error;
    return refuse("not_found");
  }
  let module: { configure?: unknown };
  try {
    module = (await import(pathToFileURL(path).href)) as typeof module;
  } catch {
    return refuse("failed_to_load");
  }
  if (typeof module.configure !== "function") return refuse("no_configure");
  let adapters: unknown;
  try {
    adapters = await module.configure(env);
  } catch {
    // The adapter's own error may carry a credential; keep only its kind.
    return refuse("configure_failed");
  }
  if (!adapters || typeof adapters !== "object")
    return refuse("configure_returned_nothing");
  return adapters as Partial<ProductionAdapters>;
}

const listen = (server: Server, port: number, host: string) =>
  new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen({ port, host }, () => {
      server.off("error", reject);
      resolveListen();
    });
  });

function stop(server: Server) {
  return new Promise<void>((resolveStop) => {
    server.close(() => resolveStop());
    server.closeIdleConnections();
    setTimeout(() => server.closeAllConnections(), 5000).unref();
  });
}

export async function startProductionHost(input: {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  loadAdapters?: (
    config: ProductionConfig,
  ) => Promise<Partial<ProductionAdapters>>;
  log: ProductionLog;
  /** Called, once, if the host later finds it must stop serving for good. */
  onFatal: (error: ProductionRefusal) => void;
}): Promise<ProductionHost> {
  const env = input.env ?? process.env;
  const config = readProductionConfig(env, input.cwd);
  const log = input.log;
  log("production_starting", describeConfig(config));
  const adapters = await (input.loadAdapters ?? loadAdapterModule)(config);

  // An identity that is not Pantopus's is a refusal, not a closed host.
  const identity = adapters.identity as { mode?: unknown } | undefined;
  if (
    identity &&
    ((identity.mode !== undefined && identity.mode !== "pantopus") ||
      "developmentActors" in identity)
  )
    throw new ProductionRefusal([
      {
        code: "development_configuration",
        key: "identity",
        detail: "development_identity_adapter",
      },
    ]);
  const missing = SLOTS.filter((slot) => !slot.present(adapters)).map(
    (slot) => slot.name,
  );

  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: 2,
    connectionTimeoutMillis: 2000,
    query_timeout: 2000,
    idleTimeoutMillis: 10_000,
  });
  // An idle connection lost to a database restart is replaced on next use.
  pool.on("error", () => undefined);
  let database: DatabaseInspection = await inspectProductionDatabase(pool);
  if (database.state === "refused") {
    await pool.end().catch(() => undefined);
    throw new ProductionRefusal(
      database.reasons.map(
        (detail): RefusalReason => ({
          code: "unsafe_database_role",
          key: "DATABASE_URL",
          detail,
        }),
      ),
    );
  }

  const readiness = new Readiness(
    [
      {
        name: "database",
        required: true,
        run: async () => {
          if (database.state === "ready") {
            try {
              await pool.query("SELECT 1");
              return { state: "available", code: "non_owner_role_verified" };
            } catch {
              return { state: "unavailable", code: "database_unavailable" };
            }
          }
          return {
            state: "unavailable",
            code: database.state === "unavailable" ? database.code : "refused",
          };
        },
      },
      ...SLOTS.map(
        (slot): Probe => ({
          name: slot.name,
          required: true,
          run: async () =>
            missing.includes(slot.name)
              ? { state: "unavailable", code: "adapter_missing" }
              : { state: "available", code: "adapter_declared" },
        }),
      ),
      {
        name: "host_open",
        required: true,
        run: async () => ({ state: "unavailable", code: "host_closed" }),
      },
    ],
    config.environment,
    config.release,
  );

  const shell = express();
  shell.disable("x-powered-by");
  shell.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  shell.get("/health/live", (_req, res) => res.json({ alive: true }));
  shell.get("/health/ready", async (_req, res) =>
    res
      .status(503)
      .json({ ...(await readiness.inspect()), ready: false, mode: "closed" }),
  );
  shell.get("/health", (_req, res) =>
    res.json({ status: "ok", ready: false, mode: "closed" }),
  );
  shell.get("/v1/identity/capabilities", (_req, res) =>
    res.json({
      signInAvailable: false,
      localAccountsAllowed: false,
      mode: "unconfigured",
    }),
  );
  shell.use((_req, res) => {
    res.setHeader("Retry-After", "30");
    res.status(503).json({
      error: {
        code: "host_closed",
        message: "The service is unavailable. Please try again.",
      },
    });
  });

  const refusedLogin = (
    found: Extract<DatabaseInspection, { state: "refused" }>,
  ) =>
    new ProductionRefusal(
      found.reasons.map(
        (detail): RefusalReason => ({
          code: "unsafe_database_role",
          key: "DATABASE_URL",
          detail,
        }),
      ),
    );
  let fatalSent = false;
  const fatal = (refusal: ProductionRefusal) => {
    if (fatalSent) return;
    fatalSent = true;
    input.onFatal(refusal);
  };
  const databaseCode = () =>
    database.state === "ready"
      ? "ready"
      : database.state === "unavailable"
        ? database.code
        : "refused";

  let current: Server = createServer(shell);
  current.requestTimeout = 15_000;
  current.headersTimeout = 10_000;
  current.keepAliveTimeout = 5000;
  let opened: Awaited<ReturnType<typeof createConfiguredBackend>> | undefined;
  let mode: "closed" | "open" = "closed";
  let closing = false;
  let busy = false;

  /** Compose the real host and put it on the port in place of the closed shell. */
  const compose = async () => {
    const complete = adapters as ProductionAdapters;
    const backend: BackendConfig = {
      port: config.port,
      featureEnabled: true,
      databaseUrl: config.databaseUrl,
      allowedOrigin: config.origin,
      rpId: config.rpId,
      identityAdapter: "pantopus",
      identitySessionKey: config.identitySessionKey,
      ...(config.passkeyOrigins
        ? { passkeyOrigins: [...config.passkeyOrigins] }
        : {}),
    };
    const providerProbes = [
      ["model", complete.providers.model.probe],
      ["license", complete.providers.license.probe],
      ["payments", complete.providers.payments.probe],
      ["push", complete.providers.push.probe],
    ] as const;
    const trust: NonNullable<BackendInput["trust"]> = async (runtime) => {
      const supplied: ProductionTrust =
        typeof complete.trust === "function"
          ? await complete.trust(runtime)
          : complete.trust;
      if (
        supplied.environment !== config.environment ||
        supplied.release !== config.release ||
        supplied.identityMode === "development"
      )
        throw new ProductionRefusal([
          {
            code: "unusable_adapter",
            key: "trust",
            detail: "environment_release_or_identity_mismatch",
          },
        ]);
      const known = new Set(supplied.probes.map((probe) => probe.name));
      return {
        ...supplied,
        probes: [
          ...supplied.probes,
          ...providerProbes
            .filter(([name]) => !known.has(name))
            .map(([name, run]): Probe => ({ name, required: true, run })),
        ],
      };
    };
    opened = await createConfiguredBackend({
      config: backend,
      identity: complete.identity,
      guardrails: complete.providers.model.guardrails,
      ...(complete.signedSubjectPolicies
        ? { signedSubjectPolicies: complete.signedSubjectPolicies }
        : {}),
      stripeNotifications: complete.providers.payments.stripeNotifications,
      ...(complete.providers.payments.storeNotifications
        ? {
            storeNotifications: complete.providers.payments.storeNotifications,
          }
        : {}),
      registerFeatures: complete.registerFeatures,
      trust,
    });
    opened.server.requestTimeout = 15_000;
    opened.server.headersTimeout = 10_000;
    opened.server.keepAliveTimeout = 5000;
    await stop(current);
    current = opened.server;
    await listen(current, config.port, config.host);
    mode = "open";
    log("production_open", { missing: [] });
  };

  /** Open the host when nothing is missing and the database is ready. A
   * refusal found at the first attempt is thrown before anything listens; one
   * found later ends the process through `onFatal`. */
  const open = async (initial = false) => {
    if (mode === "open" || closing || busy || missing.length) return;
    busy = true;
    let refusal: ProductionRefusal | undefined;
    try {
      database = await inspectProductionDatabase(pool);
      if (database.state === "refused") refusal = refusedLogin(database);
      else if (database.state === "ready")
        try {
          await compose();
        } catch (error) {
          if (opened) {
            await opened.close().catch(() => undefined);
            opened = undefined;
          }
          // A database that went away mid-start is retried; a defect is not.
          const after = await inspectProductionDatabase(pool);
          if (after.state === "unavailable") {
            database = after;
            log(
              "production_composition_deferred",
              { database: after.code },
              "warn",
            );
          } else {
            log(
              "production_composition_failed",
              lifecycleFailure(error),
              "error",
            );
            refusal =
              after.state === "refused"
                ? refusedLogin(after)
                : error instanceof ProductionRefusal
                  ? error
                  : new ProductionRefusal([
                      {
                        code: "composition_failed",
                        key: "createConfiguredBackend",
                      },
                    ]);
          }
        }
    } finally {
      busy = false;
    }
    if (refusal) {
      if (initial) throw refusal;
      fatal(refusal);
    }
  };

  try {
    await open(true);
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error;
  }
  if (mode === "closed") {
    await listen(current, config.port, config.host);
    log("production_closed", { missing, database: databaseCode() }, "warn");
  }
  const timer = setInterval(() => {
    void (async () => {
      if (mode === "open" || closing) return;
      const before = database.state === "ready" ? "ready" : "other";
      database = await inspectProductionDatabase(pool);
      if (before !== "ready" && database.state === "ready")
        log("production_database_recovered");
      else if (before === "ready" && database.state === "unavailable")
        log(
          "production_database_unavailable",
          { database: databaseCode() },
          "warn",
        );
      if (database.state === "refused") fatal(refusedLogin(database));
      else await open();
    })();
  }, 5000);
  timer.unref();

  return {
    mode: () => mode,
    server: () => current,
    close: async () => {
      closing = true;
      clearInterval(timer);
      for (let waited = 0; busy && waited < 20_000; waited += 100)
        await new Promise((done) => setTimeout(done, 100));
      if (opened) await opened.close().catch(() => undefined);
      else await stop(current);
      await pool.end().catch(() => undefined);
    },
  };
}
