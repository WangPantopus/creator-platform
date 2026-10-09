// E2.2: a production host fails closed. Runs the real production host
// (operations/production-server.ts) as a process against the local stack's
// database, which must be up: `node infra/local/stack.mjs up --lane 2 --db-only`.
// The adapters are fixtures (the real ones belong to lanes 1, 3, 4 and 5), so
// the positive path (every adapter present, host open) is not exercised here.
//   node tests/scenarios/lane-2/e2-2-fail-closed.mjs
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reporter, sleep } from "./lib.mjs";
import {
  PORT,
  baseEnv,
  databaseUrl,
  event,
  fixtures,
  get,
  portInUse,
  release,
  sessionKey,
  startHost,
  stopHost,
  untilLiveOrExit,
} from "./production-host.mjs";

const { step, finish } = reporter();
const container = "qelvora-lane2-postgres";
const sql = (statement, database = "creator_stack") =>
  execFileSync(
    "docker",
    [
      "exec",
      container,
      "psql",
      "-h",
      "127.0.0.1",
      "-U",
      "postgres",
      "-d",
      database,
      "-qtA",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      statement,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  ).toString();
const SLOTS = [
  "identity",
  "trust",
  "features",
  "model",
  "license",
  "payments",
  "push",
];
const variant = (value) => ({ E2_2_VARIANT: JSON.stringify(value) });
const without = (env, ...keys) => (keys.forEach((key) => delete env[key]), env);
const hosts = [];
const launch = (env) => (hosts.push(startHost(env)), hosts.at(-1));
const SECRETS = [
  "foundation-test-only",
  sessionKey,
  "SECRET-IN-ERROR",
  "qe22pw",
  "wrong-password",
];
const leaked = (host) =>
  SECRETS.filter((secret) => host.raw.includes(secret)).length;
const running = (host) => host.child.exitCode === null;
const summary = (host) =>
  host.lines
    .filter((line) => line.level !== "info")
    .map(
      (line) =>
        `${line.event}${line.reasons ? `:${line.reasons.map((r) => `${r.code}/${r.key}${r.detail ? `/${r.detail}` : ""}`).join("+")}` : ""}`,
    )
    .join(" ") || "no warning in its log";
const until = async (test, ms) => {
  for (const stop = Date.now() + ms; Date.now() < stop; await sleep(500))
    if (await test().catch(() => false)) return true;
  return false;
};
const exitOf = (host, ms = 60_000) =>
  Promise.race([host.exited, sleep(ms).then(() => "timeout")]);

/** Polls the port while a host starts, to prove whether it ever listened. */
function watchPort(port = PORT) {
  const seen = { ever: false };
  let stopped = false;
  const loop = (async () => {
    while (!stopped) {
      if (await portInUse(port)) seen.ever = true;
      await sleep(20);
    }
  })();
  return Object.assign(seen, { stop: async () => ((stopped = true), loop) });
}

const ROUTES = [
  ["GET", "/v1/conversations/x/y"],
  ["POST", "/v1/conversations/begin"],
  ["GET", "/v1/agent/x/state"],
  ["GET", "/v1/commerce/x"],
  ["GET", "/v1/studio/x"],
  ["GET", "/v1/threads/x/y"],
  ["POST", "/v1/identity/continue"],
  ["POST", "/v1/identity/complete"],
  ["GET", "/v1/trust/status"],
  ["GET", "/v1/trust/help"],
  ["POST", "/v1/stripe/notifications"],
  ["OPTIONS", "/v1/conversations/x/y"],
  ["GET", "/"],
];
const route = (method, path, port = PORT) =>
  get(
    path,
    {
      method,
      headers: {
        authorization: "Bearer anything",
        "content-type": "application/json",
      },
      ...(method === "POST" ? { body: "{}" } : {}),
    },
    port,
  );
const websocket = (port = PORT) =>
  new Promise((resolve) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/v1/realtime`, [
      "pantopus-session",
      "anything",
    ]);
    const timer = setTimeout(() => (socket.close(), resolve("timeout")), 5000);
    socket.onopen = () => (
      clearTimeout(timer),
      socket.close(),
      resolve("opened")
    );
    socket.onerror = () => (clearTimeout(timer), resolve("refused"));
  });
const readiness = async (port = PORT) => {
  const ready = await get("/health/ready", {}, port);
  return {
    ready,
    rows: Object.fromEntries(
      (ready.json?.capabilities ?? []).map((row) => [
        row.name,
        `${row.state}:${row.code}`,
      ]),
    ),
  };
};

/** The host must stay up, report exactly what is missing, and answer no domain route. */
async function closedCase(
  name,
  env,
  {
    missing = [],
    database = "available:non_owner_role_verified",
    sweep = false,
  } = {},
) {
  const host = launch(env);
  const state = await untilLiveOrExit(host);
  if (
    !step(
      `${name}: the process stays up`,
      state === "live",
      state === "live" ? `pid ${host.pid}` : `${state}; ${summary(host)}`,
    )
  )
    return stopHost(host);
  const live = await get("/health/live", {}, host.port);
  const { ready, rows } = await readiness(host.port);
  step(
    `${name}: liveness green, readiness red`,
    live.status === 200 &&
      ready.status === 503 &&
      ready.json?.ready === false &&
      ready.json?.mode === "closed" &&
      ready.json?.environment === "review" &&
      ready.json?.release === release &&
      ready.headers.get("cache-control") === "no-store",
    `live ${live.status}, ready ${ready.status}`,
  );
  const names = ["database", ...SLOTS, "host_open"];
  const expected = [
    database,
    ...SLOTS.map((slot) =>
      missing.includes(slot)
        ? "unavailable:adapter_missing"
        : "available:adapter_declared",
    ),
    "unavailable:host_closed",
  ];
  const observed = names.map((row) => rows[row]);
  step(
    `${name}: readiness names exactly what is missing`,
    expected.join() === observed.join(),
    expected.join() === observed.join()
      ? missing.join(", ") || database
      : names
          .flatMap((row, i) =>
            expected[i] === observed[i] ? [] : [`${row} ${observed[i]}`],
          )
          .join("; "),
  );
  const closed = event(host, "production_closed");
  step(
    `${name}: its log line says the same`,
    JSON.stringify(closed?.missing) ===
      JSON.stringify(SLOTS.filter((slot) => missing.includes(slot))) &&
      closed?.database ===
        (database.startsWith("available") ? "ready" : database.split(":")[1]),
    JSON.stringify(closed ?? null),
  );
  const tried = sweep ? ROUTES : ROUTES.slice(0, 1);
  const answers = await Promise.all(
    tried.map(([method, path]) => route(method, path, host.port)),
  );
  step(
    `${name}: no domain route answers (${tried.length} tried)`,
    answers.every(
      (a) =>
        a.status === 503 &&
        a.json?.error?.code === "host_closed" &&
        a.headers.get("retry-after") === "30",
    ),
    answers.map((a) => a.status).join(","),
  );
  const caps = await get("/v1/identity/capabilities", {}, host.port);
  step(
    `${name}: sign-in is reported unavailable`,
    caps.json?.signInAvailable === false &&
      caps.json?.localAccountsAllowed === false,
    JSON.stringify(caps.json),
  );
  if (sweep)
    step(
      `${name}: the realtime socket is refused`,
      (await websocket(host.port)) === "refused",
    );
  const code = await stopHost(host);
  step(
    `${name}: stops on SIGTERM, nothing secret in its log`,
    code === 0 && Boolean(event(host, "production_stopped")) && !leaked(host),
    `exit ${code}, ${leaked(host)} secrets in ${host.raw.length} bytes of log`,
  );
}

/** The host must exit 1 with the named reason(s), never having listened. */
async function refusedCase(name, env, expected, detail) {
  const host = launch(env);
  const watch = watchPort(host.port);
  const exit = await exitOf(host);
  await watch.stop();
  if (exit === "timeout") host.child.kill("SIGKILL");
  const found = event(host, "production_refused")?.reasons ?? [];
  const several = Array.isArray(expected[0]);
  const matched = (several ? expected : [expected]).every(([code, key]) =>
    found.some(
      (r) =>
        r.code === code &&
        r.key === key &&
        (detail === undefined || several || r.detail === detail),
    ),
  );
  step(
    `${name}: refuses to start`,
    exit === 1 && matched && !watch.ever && !leaked(host),
    `exit ${exit}, ${found.map((r) => `${r.code}/${r.key}${r.detail ? `/${r.detail}` : ""}`).join(" ") || summary(host)}${watch.ever ? ", it listened" : ""}${leaked(host) ? `, ${leaked(host)} secrets in its log` : ""}`,
  );
}

const files = mkdtempSync(join(tmpdir(), "qe22-"));
const adapterDir = join(files, "adapters");
const file = (name, content) => {
  const path = join(files, name);
  writeFileSync(path, content);
  chmodSync(path, 0o600);
  return path;
};
const ROLES = [
  "qe22_bypass",
  "qe22_createdb",
  "qe22_createrole",
  "qe22_replication",
  "qe22_member",
  "qe22_noinherit",
  "qe22_objowner",
  "qe22_flip",
];
const cleanup = () => {
  try {
    sql("DROP SEQUENCE IF EXISTS creator.qe22_probe_seq");
  } catch {
    /* not there */
  }
  for (const role of [...ROLES].reverse()) {
    try {
      sql(`DROP OWNED BY ${role}; DROP ROLE IF EXISTS ${role}`);
    } catch {
      /* not there */
    }
  }
  try {
    sql("DROP DATABASE IF EXISTS qe22_empty", "postgres");
  } catch {
    /* not there */
  }
};

try {
  sql("select 1");
  cleanup();
  sql(`
    CREATE ROLE qe22_bypass LOGIN BYPASSRLS PASSWORD 'qe22pw';
    CREATE ROLE qe22_createdb LOGIN CREATEDB PASSWORD 'qe22pw';
    CREATE ROLE qe22_createrole LOGIN CREATEROLE PASSWORD 'qe22pw';
    CREATE ROLE qe22_replication LOGIN REPLICATION PASSWORD 'qe22pw';
    CREATE ROLE qe22_member LOGIN PASSWORD 'qe22pw' IN ROLE creator_owner;
    CREATE ROLE qe22_noinherit LOGIN NOINHERIT PASSWORD 'qe22pw' IN ROLE qe22_bypass;
    CREATE ROLE qe22_objowner LOGIN PASSWORD 'qe22pw';
    CREATE ROLE qe22_flip LOGIN PASSWORD 'qe22pw' IN ROLE creator_runtime;
    CREATE SEQUENCE creator.qe22_probe_seq;
    ALTER SEQUENCE creator.qe22_probe_seq OWNER TO qe22_objowner;
    ${ROLES.map((role) => `GRANT CONNECT ON DATABASE creator_stack TO ${role};`).join("\n")}`);
  sql("CREATE DATABASE qe22_empty", "postgres");
  mkdirSync(adapterDir);
  writeFileSync(
    join(adapterDir, "no-configure.mjs"),
    "export const nothing = true;\n",
  );
  writeFileSync(
    join(adapterDir, "throws.mjs"),
    'export async function configure(env) { throw new Error("SECRET-IN-ERROR " + env.DATABASE_URL); }\n',
  );
  writeFileSync(
    join(adapterDir, "returns-nothing.mjs"),
    "export async function configure() { return null; }\n",
  );
  writeFileSync(join(adapterDir, "broken.mjs"), "export const = ;\n");
  symlinkSync(
    join(fixtures, "e2-2-adapters.mjs"),
    join(adapterDir, "linked.mjs"),
  );

  process.stdout.write(
    "\n-- closed: something is missing, the process stays up --\n",
  );
  await closedCase(
    "no adapter module at all",
    baseEnv({ PRODUCTION_ADAPTER_MODULE: "" }),
    { missing: SLOTS, sweep: true },
  );
  for (const slot of SLOTS)
    await closedCase(
      `only ${slot} missing`,
      baseEnv(variant({ omit: [slot] })),
      { missing: [slot], sweep: slot === "identity" },
    );
  await closedCase(
    "secrets given as mounted files",
    baseEnv({
      DATABASE_URL: "",
      DATABASE_URL_FILE: file("db.url", `${databaseUrl("creator_runtime")}\n`),
      IDENTITY_SESSION_KEY: "",
      IDENTITY_SESSION_KEY_FILE: file("key.txt", `${sessionKey}\n`),
      ...variant({ omit: ["push"] }),
    }),
    { missing: ["push"] },
  );
  await closedCase(
    "wrong database password",
    baseEnv({
      DATABASE_URL: databaseUrl("creator_runtime", "wrong-password"),
      ...variant({ omit: ["push"] }),
    }),
    {
      missing: ["push"],
      database: "unavailable:database_authentication_failed",
    },
  );
  await closedCase(
    "database name does not exist",
    baseEnv({
      DATABASE_URL: databaseUrl(
        "creator_runtime",
        undefined,
        56420,
        "qe22_missing",
      ),
      ...variant({ omit: ["push"] }),
    }),
    { missing: ["push"], database: "unavailable:database_missing" },
  );
  await closedCase(
    "database not migrated yet",
    baseEnv({
      DATABASE_URL: databaseUrl(
        "creator_runtime",
        undefined,
        56420,
        "qe22_empty",
      ),
      ...variant({ omit: ["push"] }),
    }),
    { missing: ["push"], database: "unavailable:database_not_migrated" },
  );

  process.stdout.write(
    "\n-- refused: a development setting or identity anywhere --\n",
  );
  for (const [key, value] of [
    ["IDENTITY_ADAPTER", "development"],
    ["NODE_ENV", "development"],
    ["TRUST_LOCAL_DEVELOPMENT", "true"],
    ["W3_FAN_GENERATION", "development"],
    ["W8_LOCAL_DEVELOPMENT", "true"],
    ["QELVORA_FAKE_MODEL_URL", "http://127.0.0.1:1"],
  ])
    await refusedCase(`${key} is set`, baseEnv({ [key]: value }), [
      "development_configuration",
      key,
    ]);
  await refusedCase(
    "NODE_ENV is not set",
    without(baseEnv(), "NODE_ENV"),
    ["development_configuration", "NODE_ENV"],
    "unset",
  );
  await refusedCase(
    "a development identity adapter is injected",
    baseEnv(variant({ developmentIdentity: true })),
    ["development_configuration", "identity"],
  );

  process.stdout.write("\n-- refused: the database login is unsafe --\n");
  await refusedCase(
    "login is a superuser",
    baseEnv({ DATABASE_URL: databaseUrl("postgres") }),
    ["unsafe_database_role", "DATABASE_URL"],
    "superuser",
  );
  for (const [role, reason] of [
    ["qe22_bypass", "bypass_row_security"],
    ["qe22_createdb", "can_create_databases"],
    ["qe22_createrole", "can_create_roles"],
    ["qe22_replication", "replication"],
    ["qe22_member", "member_of_an_owner_role"],
    ["qe22_objowner", "owns_product_objects"],
    ["qe22_noinherit", "bypass_row_security"],
  ])
    await refusedCase(
      `login ${role}`,
      baseEnv({ DATABASE_URL: databaseUrl(role, "qe22pw") }),
      ["unsafe_database_role", "DATABASE_URL"],
      reason,
    );

  process.stdout.write(
    "\n-- refused: invalid, missing or conflicting settings, named without their values --\n",
  );
  const bad = (name, env, expected, detail) =>
    refusedCase(name, baseEnv(env), expected, detail);
  await bad("WEB_ORIGIN over http", { WEB_ORIGIN: "http://app.example.test" }, [
    "invalid_setting",
    "WEB_ORIGIN",
  ]);
  await bad(
    "WEB_ORIGIN with a path",
    { WEB_ORIGIN: "https://app.example.test/app" },
    ["invalid_setting", "WEB_ORIGIN"],
  );
  await bad(
    "PASSKEY_RP_ID that does not cover the origin",
    { PASSKEY_RP_ID: "other.test" },
    ["invalid_setting", "PASSKEY_RP_ID"],
  );
  await bad(
    "IDENTITY_SESSION_KEY of the wrong size",
    { IDENTITY_SESSION_KEY: "c2hvcnQ=" },
    ["invalid_setting", "IDENTITY_SESSION_KEY"],
  );
  await bad(
    "RELEASE_REVISION that is not a commit",
    { RELEASE_REVISION: "latest" },
    ["invalid_setting", "RELEASE_REVISION"],
  );
  await bad("PORT below 1024", { PORT: "80" }, ["invalid_setting", "PORT"]);
  await bad(
    "DEPLOYMENT_ENVIRONMENT staging from unbuilt source",
    { DEPLOYMENT_ENVIRONMENT: "staging" },
    ["invalid_setting", "DEPLOYMENT_ENVIRONMENT"],
    "unbuilt_source",
  );
  await bad(
    "staging database URL without TLS",
    { DEPLOYMENT_ENVIRONMENT: "staging" },
    ["invalid_setting", "DATABASE_URL"],
    "tls_required",
  );
  await bad(
    "DEPLOYMENT_ENVIRONMENT local",
    { DEPLOYMENT_ENVIRONMENT: "local" },
    ["invalid_setting", "DEPLOYMENT_ENVIRONMENT"],
  );
  await bad("DATABASE_URL given twice", { DATABASE_URL_FILE: "/nowhere" }, [
    "conflicting_settings",
    "DATABASE_URL",
  ]);
  await bad(
    "IDENTITY_SESSION_KEY given twice",
    { IDENTITY_SESSION_KEY_FILE: "/nowhere" },
    ["conflicting_settings", "IDENTITY_SESSION_KEY"],
  );
  await bad(
    "secret file path is relative",
    { DATABASE_URL: "", DATABASE_URL_FILE: "db.url" },
    ["invalid_setting", "DATABASE_URL_FILE"],
    "absolute_path_required",
  );
  await bad(
    "secret file path is a directory",
    { DATABASE_URL: "", DATABASE_URL_FILE: files },
    ["invalid_setting", "DATABASE_URL_FILE"],
    "not_a_small_file",
  );
  await bad(
    "secret file does not exist",
    { DATABASE_URL: "", DATABASE_URL_FILE: join(files, "nope") },
    ["invalid_setting", "DATABASE_URL_FILE"],
    "unreadable",
  );
  await refusedCase("WEB_ORIGIN missing", without(baseEnv(), "WEB_ORIGIN"), [
    "missing_setting",
    "WEB_ORIGIN",
  ]);
  await refusedCase(
    "every fault at once is reported at once",
    without(
      baseEnv({
        NODE_ENV: "development",
        IDENTITY_SESSION_KEY: "c2hvcnQ=",
        PORT: "80",
      }),
      "WEB_ORIGIN",
    ),
    [
      ["development_configuration", "NODE_ENV"],
      ["missing_setting", "WEB_ORIGIN"],
      ["invalid_setting", "IDENTITY_SESSION_KEY"],
      ["invalid_setting", "PORT"],
    ],
  );

  process.stdout.write("\n-- refused: the adapter module is unusable --\n");
  const module = (name, moduleName, detail) =>
    bad(
      name,
      {
        PRODUCTION_ADAPTER_DIR: adapterDir,
        PRODUCTION_ADAPTER_MODULE: moduleName,
      },
      ["unusable_adapter", "PRODUCTION_ADAPTER_MODULE"],
      detail,
    );
  await module("module does not exist", "missing.mjs", "not_found");
  await module("module has no configure", "no-configure.mjs", "no_configure");
  await module(
    "configure throws (its message holds a secret)",
    "throws.mjs",
    "configure_failed",
  );
  await module(
    "configure returns nothing",
    "returns-nothing.mjs",
    "configure_returned_nothing",
  );
  await module("module does not parse", "broken.mjs", "failed_to_load");
  await module(
    "module is a link out of the adapter directory",
    "linked.mjs",
    "outside_the_directory",
  );
  await bad(
    "module name tries to leave the directory",
    { PRODUCTION_ADAPTER_MODULE: "../escape.mjs" },
    ["invalid_setting", "PRODUCTION_ADAPTER_MODULE"],
    "plain_mjs_name",
  );
  await bad(
    "adapter directory is relative",
    { PRODUCTION_ADAPTER_DIR: "integrations" },
    ["invalid_setting", "PRODUCTION_ADAPTER_DIR"],
    "absolute_path_required",
  );
  await bad(
    "adapter directory does not exist",
    { PRODUCTION_ADAPTER_DIR: join(files, "none") },
    ["unusable_adapter", "PRODUCTION_ADAPTER_MODULE"],
    "not_found",
  );

  process.stdout.write(
    "\n-- refused: every adapter present, but the composition cannot be trusted --\n",
  );
  await refusedCase(
    "trust configuration is a placeholder that cannot compose",
    baseEnv(variant({})),
    ["composition_failed", "createConfiguredBackend"],
  );
  await refusedCase(
    "trust is for another environment",
    baseEnv(variant({ trust: { environment: "staging" } })),
    ["unusable_adapter", "trust"],
    "environment_release_or_identity_mismatch",
  );
  await refusedCase(
    "trust is for another release",
    baseEnv(variant({ trust: { release: "0".repeat(40) } })),
    ["unusable_adapter", "trust"],
    "environment_release_or_identity_mismatch",
  );
  await refusedCase(
    "trust says the identity is development",
    baseEnv(variant({ trust: { identityMode: "development" } })),
    ["unusable_adapter", "trust"],
    "environment_release_or_identity_mismatch",
  );

  process.stdout.write("\n-- the port is taken --\n");
  {
    const blocker = net.createServer();
    await new Promise((resolve) => blocker.listen(PORT, "127.0.0.1", resolve));
    const host = launch(baseEnv(variant({ omit: ["push"] })));
    const exit = await exitOf(host);
    blocker.close();
    step(
      "port already in use: exits 1 with a plain failure line",
      exit === 1 && Boolean(event(host, "production_failed")) && !leaked(host),
      `exit ${exit}, ${summary(host)}`,
    );
  }

  process.stdout.write(
    "\n-- the login becomes unsafe while the host is closed and waiting --\n",
  );
  {
    const host = launch(
      baseEnv({
        DATABASE_URL: databaseUrl("qe22_flip", "qe22pw"),
        ...variant({ omit: ["push"] }),
      }),
    );
    const state = await untilLiveOrExit(host);
    const { rows } = await readiness();
    step(
      "a member of the runtime role is accepted while it is safe",
      state === "live" && rows.database === "available:non_owner_role_verified",
      `${state}, ${rows.database}`,
    );
    sql("ALTER ROLE qe22_flip CREATEDB");
    const exit = await exitOf(host, 30_000);
    const found = event(host, "production_refused")?.reasons ?? [];
    step(
      "…and the host stops when it stops being safe",
      exit === 1 &&
        found.some(
          (r) =>
            r.code === "unsafe_database_role" &&
            r.detail === "can_create_databases",
        ) &&
        !(await portInUse()),
      `exit ${exit}, ${summary(host)}`,
    );
  }

  process.stdout.write(
    "\n-- the database is lost while the host runs, and comes back --\n",
  );
  {
    const host = launch(baseEnv(variant({ omit: ["push"] })));
    await untilLiveOrExit(host);
    const databaseRow = async () => (await readiness()).rows.database;
    step(
      "database up: the database row is available",
      (await databaseRow()) === "available:non_owner_role_verified",
    );
    execFileSync("docker", ["stop", container], { stdio: "ignore" });
    const lost = await until(
      async () => (await databaseRow()) === "unavailable:database_unavailable",
      30_000,
    );
    const logged = await until(
      async () => Boolean(event(host, "production_database_unavailable")),
      20_000,
    );
    step(
      "database lost: readiness red, liveness green, the loss is logged",
      lost &&
        logged &&
        (await get("/health/live")).status === 200 &&
        running(host),
      `${await databaseRow().catch(() => "no answer")}`,
    );
    execFileSync("docker", ["start", container], { stdio: "ignore" });
    const back = await until(
      async () => (await databaseRow()) === "available:non_owner_role_verified",
      120_000,
    );
    step(
      "database back: recovers on its own, without a restart",
      back &&
        running(host) &&
        Boolean(event(host, "production_database_recovered")),
      `pid ${host.pid} still running`,
    );
    step(
      "…and it still answers no domain route (push is still missing)",
      (await route("GET", "/v1/conversations/x/y")).json?.error?.code ===
        "host_closed",
    );
    step("stops on SIGTERM", (await stopHost(host)) === 0 && !leaked(host));
  }

  process.stdout.write("\n-- started while the database is down --\n");
  {
    execFileSync("docker", ["stop", container], { stdio: "ignore" });
    const a = launch(baseEnv(variant({ omit: ["push"] })));
    const b = launch(baseEnv({ PORT: String(PORT + 1), ...variant({}) }));
    const [stateA, stateB] = [
      await untilLiveOrExit(a),
      await untilLiveOrExit(b),
    ];
    step(
      "started with the database down: both stay up, closed",
      stateA === "live" &&
        stateB === "live" &&
        event(a, "production_closed")?.database === "database_unavailable" &&
        event(b, "production_closed")?.database === "database_unavailable",
      JSON.stringify([
        event(a, "production_closed"),
        event(b, "production_closed"),
      ]),
    );
    step(
      "a host with every adapter present serves no domain route while the database is down",
      (await route("GET", "/v1/conversations/x/y", PORT + 1)).json?.error
        ?.code === "host_closed" &&
        event(b, "production_closed")?.missing.length === 0,
    );
    execFileSync("docker", ["start", container], { stdio: "ignore" });
    const exit = await exitOf(b, 120_000);
    const refused = event(b, "production_refused")?.reasons ?? [];
    step(
      "the database arrives and the placeholder composition fails: it stops with a refusal",
      exit === 1 &&
        refused.some((r) => r.code === "composition_failed") &&
        Boolean(event(b, "production_database_recovered")) &&
        !leaked(b),
      `exit ${exit}, ${summary(b)}`,
    );
    const recovered = await until(
      async () =>
        (await readiness()).rows.database ===
        "available:non_owner_role_verified",
      60_000,
    );
    step(
      "the host with push missing recovers its database row and stays closed",
      recovered &&
        (await readiness()).ready.json?.ready === false &&
        running(a),
    );
    step("stops on SIGTERM", (await stopHost(a)) === 0 && !leaked(a));
  }
} finally {
  for (const host of hosts) if (running(host)) host.child.kill("SIGKILL");
  spawnSync("docker", ["start", container]);
  for (let tries = 0; tries < 90; tries += 1) {
    try {
      sql("select 1");
      break;
    } catch {
      await sleep(1000);
    }
  }
  cleanup();
  rmSync(files, { recursive: true, force: true });
}
finish();
