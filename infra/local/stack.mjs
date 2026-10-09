#!/usr/bin/env node
// One command for a complete local Qelvora stack: PostgreSQL 17 with pgvector
// in a container, every migration, the seed, the model fake, the backend (with
// its in-process generation, trust and usage workers), Maya's published AI and
// the web app, all on the synthetic development identity. Local use only.
//
//   node infra/local/stack.mjs up     --lane 2     bring everything up (safe to repeat)
//   node infra/local/stack.mjs status --lane 2     what is running and healthy
//   node infra/local/stack.mjs smoke  --lane 2     sign in, send a message, see the acknowledgment
//   node infra/local/stack.mjs env    --lane 2     addresses and the test database URL
//   node infra/local/stack.mjs logs   --lane 2 backend|web|model [-n 80]
//   node infra/local/stack.mjs reset  --lane 2     down, then up: a stack rebuilt from nothing
//   node infra/local/stack.mjs stop   --lane 2     stop everything, keep the data
//   node infra/local/stack.mjs down   --lane 2     remove everything this stack created
//
// Lane N owns ports 564N0 to 564N9 and containers named qelvora-laneN-*;
// --base-port moves the range and --lane may be a label such as 3a.
// Only objects named for this stack are ever touched. See infra/local/README.md.
import { execFile, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import { cpus, loadavg, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const IMAGE = "pgvector/pgvector:pg17";
/** The repository's documented loopback-only test constant for the database
 * administrator and the request role (tests and the working agreement use it). */
const TEST_PASSWORD = "foundation-test-only";
const SYNTHETIC_REFERENCE =
  "synthetic-review-only-unapproved-processor-20261001";
const MAYA = "20000000-0000-4000-8000-000000000001";
const MAYA_ACCOUNT = "10000000-0000-4000-8000-000000000003";
const DEVON = "20000000-0000-4000-8000-000000000002";
const DEVON_ACCOUNT = "10000000-0000-4000-8000-000000000005";
const TOTAL_MIGRATIONS = 114;

class StackError extends Error {
  constructor(message, hint = "", exit = 1) {
    super(message);
    this.hint = hint;
    this.exit = exit;
  }
}

// ---------------------------------------------------------------- arguments
function parse(argv) {
  const [command = "help", ...rest] = argv;
  const options = { env: [], webEnv: [], positional: [] };
  for (let at = 0; at < rest.length; at += 1) {
    const arg = rest[at];
    const value = () => {
      const next = rest[(at += 1)];
      if (next === undefined)
        throw new StackError(`${arg} needs a value.`, "", 2);
      return next;
    };
    if (arg === "--lane") options.lane = value();
    else if (arg === "--base-port") options.base = Number(value());
    else if (arg === "--env") options.env.push(value());
    else if (arg === "--web-env") options.webEnv.push(value());
    else if (arg === "--growth") options.growth = true;
    else if (arg === "--db-only") options.dbOnly = true;
    else if (arg === "--no-web") options.noWeb = true;
    else if (arg === "--no-ai") options.noAi = true;
    else if (arg === "--no-smoke") options.noSmoke = true;
    else if (arg === "--ack-only") options.ackOnly = true;
    else if (arg === "--require-reply") options.requireReply = true;
    else if (arg === "--keep-data") options.keepData = true;
    else if (arg === "-n") options.lines = Number(value());
    else if (arg.startsWith("-"))
      throw new StackError(`Unknown option ${arg}.`, "", 2);
    else options.positional.push(arg);
  }
  return { command, options };
}

function planFor(options) {
  const lane = options.lane ?? process.env.QELVORA_LANE;
  if (!lane || !/^[a-z0-9][a-z0-9-]{0,15}$/u.test(lane))
    throw new StackError(
      "Say which lane's ports and names to use.",
      "Add --lane 2 (or a label such as --lane 3a together with --base-port).",
      2,
    );
  const numeric = /^\d$/u.test(lane) ? 56400 + Number(lane) * 10 : undefined;
  const base = options.base ?? numeric;
  if (!Number.isInteger(base) || base < 1024 || base + 9 > 65535)
    throw new StackError(
      `No usable port range for lane "${lane}".`,
      "Pass --base-port with the first of ten free ports, for example 56430.",
      2,
    );
  const name = `lane${lane}`;
  // The real path: the private artifact store refuses any symlinked ancestor,
  // and macOS keeps its temporary directory under the /var symlink.
  const stateDir = join(realpathSync(tmpdir()), "qelvora-stack", name);
  return {
    lane,
    name,
    base,
    ports: {
      postgres: base,
      backend: base + 1,
      web: base + 2,
      model: base + 3,
    },
    container: `qelvora-${name}-postgres`,
    volume: `qelvora-${name}-pgdata`,
    database: "creator_stack",
    testDatabase: "creator_foundation",
    stateDir,
    webOutput: `.next-qelvora-${name}`,
    file: (leaf) => join(stateDir, leaf),
  };
}

// ----------------------------------------------------------------- helpers
const say = (line = "") => process.stdout.write(line + "\n");
const step = (line) => say(`  ${line}`);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function run(command, args, options = {}) {
  return new Promise((done) => {
    const child = execFile(
      command,
      args,
      {
        cwd: options.cwd,
        env: options.env ?? process.env,
        maxBuffer: 32 * 1024 * 1024,
        timeout: options.timeoutMs ?? 600_000,
      },
      (error, stdout, stderr) =>
        done({
          code: error ? (typeof error.code === "number" ? error.code : 1) : 0,
          stdout: String(stdout),
          stderr: String(stderr),
        }),
    );
    if (options.input !== undefined) child.stdin.end(options.input);
  });
}

const docker = (args, options) => run("docker", args, options);

async function ensureDocker() {
  const info = await docker(["info", "--format", "{{.ServerVersion}}"], {
    timeoutMs: 20_000,
  });
  if (info.code !== 0)
    throw new StackError(
      "Docker is not running or cannot be reached.",
      `Start Docker Desktop and run this again. Docker said: ${(info.stderr || info.stdout).trim().split("\n")[0]}`,
      3,
    );
}

function portFree(port) {
  return new Promise((done) => {
    const probe = net.createServer();
    probe.once("error", () => done(false));
    probe.listen({ port, host: "127.0.0.1" }, () =>
      probe.close(() => done(true)),
    );
  });
}

async function listener(port) {
  const out = await run("lsof", [
    "-nP",
    `-iTCP:${port}`,
    "-sTCP:LISTEN",
    "-Fpc",
  ]);
  const pid = /^p(\d+)/mu.exec(out.stdout)?.[1];
  const command = /^c(.+)$/mu.exec(out.stdout)?.[1];
  return pid ? { pid: Number(pid), command } : null;
}

const readJson = (file, fallback) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
};
const writeJson = (file, value, mode = 0o600) =>
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n", { mode });

async function started(pid) {
  const out = await run("ps", ["-o", "lstart=", "-p", String(pid)]);
  return out.code === 0 ? out.stdout.trim() : "";
}

/** A recorded process counts only if that very process (same pid, same start
 * time) is still running; a reused pid is never signalled. */
async function isOurs(record) {
  return Boolean(record?.pid) && (await started(record.pid)) === record.started;
}

async function spawnService(plan, name, args, { cwd, env }) {
  const log = plan.file(`${name}.log`);
  const fd = openSync(log, "a", 0o600);
  const child = spawn(process.execPath, args, {
    cwd,
    env,
    detached: true,
    stdio: ["ignore", fd, fd],
  });
  child.unref();
  closeSync(fd);
  await sleep(300);
  const record = {
    pid: child.pid,
    started: await started(child.pid),
    command: `${name}: ${args.join(" ").slice(0, 120)}`,
  };
  const pids = readJson(plan.file("pids.json"), {});
  pids[name] = record;
  writeJson(plan.file("pids.json"), pids);
  return record;
}

async function stopService(plan, name, graceMs = 20_000) {
  const pids = readJson(plan.file("pids.json"), {});
  const record = pids[name];
  if (!(await isOurs(record))) {
    delete pids[name];
    if (existsSync(plan.stateDir)) writeJson(plan.file("pids.json"), pids);
    return false;
  }
  // The service leads its own process group, so its helpers stop with it.
  const signal = (kind) => {
    try {
      process.kill(-record.pid, kind);
    } catch {
      /* already gone */
    }
  };
  signal("SIGTERM");
  for (
    let waited = 0;
    waited < graceMs && (await isOurs(record));
    waited += 250
  )
    await sleep(250);
  if (await isOurs(record)) signal("SIGKILL");
  delete pids[name];
  writeJson(plan.file("pids.json"), pids);
  return true;
}

async function waitFor(label, check, timeoutMs = 120_000) {
  const until = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < until) {
    try {
      const result = await check();
      if (result === true) return;
      last = String(result || "");
    } catch (error) {
      if (error instanceof StackError) throw error;
      last = error.message;
    }
    await sleep(500);
  }
  throw new StackError(
    `${label} did not become ready in ${Math.round(timeoutMs / 1000)} s.`,
    last,
  );
}

async function http(url, { timeoutMs = 4000 } = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: response.status, json, text };
}

// ----------------------------------------------------------------- database
const adminUrl = (plan, database = plan.database) =>
  `postgresql://postgres:${TEST_PASSWORD}@127.0.0.1:${plan.ports.postgres}/${database}`;

async function psql(plan, sql, { database = "postgres", input } = {}) {
  const args = [
    "exec",
    ...(input === undefined ? [] : ["-i"]),
    plan.container,
    "psql",
    "-h",
    "127.0.0.1",
    "-U",
    "postgres",
    "-d",
    database,
    "-v",
    "ON_ERROR_STOP=1",
    "-qtA",
    ...(sql ? ["-c", sql] : []),
  ];
  const out = await docker(args, { input });
  if (out.code !== 0)
    throw new StackError(
      "A database command failed.",
      out.stderr.trim().split("\n").slice(-3).join(" | "),
    );
  return out.stdout.trim();
}

async function inspect(plan) {
  const out = await docker([
    "inspect",
    plan.container,
    "--format",
    "{{json .}}",
  ]);
  if (out.code !== 0) return null;
  const data = JSON.parse(out.stdout);
  return {
    running: data.State?.Running === true,
    labels: data.Config?.Labels ?? {},
    port:
      data.NetworkSettings?.Ports?.["5432/tcp"]?.[0]?.HostPort ??
      data.HostConfig?.PortBindings?.["5432/tcp"]?.[0]?.HostPort,
  };
}

/** The data volume carries this stack's label; one with the same name but no
 * label belongs to someone else and is never reused or removed. */
async function volumeLabel(plan) {
  const out = await docker([
    "volume",
    "inspect",
    plan.volume,
    "--format",
    '{{index .Labels "qelvora.stack"}}',
  ]);
  return out.code === 0 ? out.stdout.trim() : null;
}

async function ensureVolume(plan) {
  const label = await volumeLabel(plan);
  if (label === plan.name) return;
  if (label !== null)
    throw new StackError(
      `A volume named ${plan.volume} exists but was not created by this stack.`,
      "Remove it yourself, or choose another --lane. Nothing was changed.",
      3,
    );
  const made = await docker([
    "volume",
    "create",
    "--label",
    `qelvora.stack=${plan.name}`,
    plan.volume,
  ]);
  if (made.code !== 0)
    throw new StackError(
      "Docker could not create the data volume.",
      made.stderr.trim(),
    );
}

async function ensureContainer(plan) {
  const existing = await inspect(plan);
  if (existing) {
    if (existing.labels["qelvora.stack"] !== plan.name)
      throw new StackError(
        `A container named ${plan.container} exists but was not created by this stack.`,
        "Remove it yourself, or choose another --lane. Nothing was changed.",
        3,
      );
    if (existing.labels["qelvora.root"] !== root)
      throw new StackError(
        `This stack was created from another checkout (${existing.labels["qelvora.root"]}).`,
        `Run \`node infra/local/stack.mjs down --lane ${plan.lane}\` first (from either checkout), then up again.`,
        3,
      );
    if (String(existing.port) !== String(plan.ports.postgres))
      throw new StackError(
        `The ${plan.container} container publishes port ${existing.port}, not ${plan.ports.postgres}.`,
        "Run `down` first to change the port range.",
        3,
      );
    if (!existing.running) {
      step("starting the stopped database container");
      const started = await docker(["start", plan.container]);
      if (started.code !== 0)
        throw new StackError(
          "The database container would not start.",
          started.stderr.trim(),
        );
    } else step("database container already running");
    return;
  }
  await ensureVolume(plan);
  const image = await docker([
    "image",
    "inspect",
    IMAGE,
    "--format",
    "{{.Size}}",
  ]);
  if (image.code !== 0)
    throw new StackError(
      `The database image ${IMAGE} is not on this Mac.`,
      `Pulling it is a download of about 640 MB and needs the founder's yes first: docker pull ${IMAGE}`,
      3,
    );
  step(
    `creating database container ${plan.container} on 127.0.0.1:${plan.ports.postgres}`,
  );
  const created = await docker([
    "run",
    "-d",
    "--name",
    plan.container,
    "--label",
    `qelvora.stack=${plan.name}`,
    "--label",
    `qelvora.root=${root}`,
    "-v",
    `${plan.volume}:/var/lib/postgresql/data`,
    "-e",
    `POSTGRES_PASSWORD=${TEST_PASSWORD}`,
    "-p",
    `127.0.0.1:${plan.ports.postgres}:5432`,
    // The generation worker runs very large catalogue queries; JIT and parallel
    // workers only add start-up cost to them on a busy Mac.
    IMAGE,
    "-c",
    "max_connections=200",
    "-c",
    "jit=off",
    "-c",
    "max_parallel_workers_per_gather=0",
  ]);
  if (created.code !== 0)
    throw new StackError(
      "Docker could not create the database container.",
      created.stderr.trim(),
    );
}

async function bootstrapDatabase(plan, secrets, options) {
  await waitFor("The database", async () => {
    const out = await docker(
      [
        "exec",
        plan.container,
        "psql",
        "-h",
        "127.0.0.1",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-qtAc",
        "select 1",
      ],
      { timeoutMs: 15_000 },
    );
    return out.code === 0 && out.stdout.trim() === "1";
  });
  for (const database of [plan.database, plan.testDatabase])
    if (
      !(await psql(
        plan,
        `select 1 from pg_database where datname='${database}'`,
      ))
    )
      await psql(plan, `create database ${database}`);
  const backendDir = join(root, "apps/backend");
  const url = adminUrl(plan);
  const node = (script, extraEnv = {}, args = []) =>
    run(process.execPath, ["--import", "tsx", script, ...args], {
      cwd: backendDir,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        ...extraEnv,
      },
    });
  const migrate = () =>
    node("scripts/migrate-trust.ts", {
      DATABASE_MIGRATION_URL: url,
      W8_LEGACY_ROOT_MIGRATIONS: "false",
    });
  // The reviewed migration checks run while the history is incomplete. Once all
  // of it is applied they are not repeated on every `up`: a later, deliberate
  // addition such as the Growth API login would otherwise fail them.
  const applied = async () =>
    (await psql(
      plan,
      "select to_regclass('creator.schema_migration') is not null",
      { database: plan.database },
    )) === "t"
      ? Number(
          await psql(plan, "select count(*) from creator.schema_migration", {
            database: plan.database,
          }),
        )
      : 0;
  if ((await applied()) === TOTAL_MIGRATIONS)
    step(`all ${TOTAL_MIGRATIONS} migrations already applied`);
  else {
    let result = await migrate();
    if (result.code !== 0)
      throw new StackError(
        "The canonical migrations were refused.",
        result.stdout.split("\n").slice(-4).join(" | ") +
          result.stderr.trim().split("\n").slice(-4).join(" | "),
      );
    step("canonical migrations applied (verified)");
    result = await node("src/operations/local/fresh-install.ts", {}, [
      url,
      root,
    ]);
    if (result.code !== 0)
      throw new StackError(
        "The full set of migrations could not be installed.",
        (result.stderr || result.stdout)
          .trim()
          .split("\n")
          .slice(-6)
          .join(" | "),
      );
    const added = JSON.parse(result.stdout.trim().split("\n").pop()).applied;
    step(`${added} wave migrations installed in one transaction`);
    result = await migrate();
    if (result.code !== 0)
      throw new StackError(
        "The reviewed migration check failed after the install.",
        result.stdout.split("\n").slice(-4).join(" | "),
      );
    // A fresh database has no planner statistics; give the catalogue queries some.
    await psql(plan, "ANALYZE", { database: plan.database });
    const count = await applied();
    if (count !== TOTAL_MIGRATIONS)
      throw new StackError(
        `Expected ${TOTAL_MIGRATIONS} applied migrations, found ${count}.`,
      );
  }
  // Roles that can log in get passwords; the runtime role keeps the documented
  // test constant so the repository's own test suites can share this cluster.
  const roles = (
    await psql(
      plan,
      "select rolname from pg_roles where rolcanlogin and rolname<>'postgres' order by 1",
    )
  )
    .split("\n")
    .filter(Boolean);
  if (options.growth) {
    // Growth's API pool is a separate login that inherits only the two request
    // roles and owns or is granted nothing itself (db/growth-api-pool.ts).
    await psql(
      plan,
      `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='growth_api') THEN
         CREATE ROLE growth_api LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
         GRANT creator_runtime, growth_runtime TO growth_api;
       END IF; END $$`,
    );
    roles.push("growth_api");
  }
  const statements = roles.map((role) => {
    secrets.passwords[role] ??= randomBytes(18).toString("base64url");
    const password =
      role === "creator_runtime" ? TEST_PASSWORD : secrets.passwords[role];
    return `ALTER ROLE ${role} PASSWORD '${password}';`;
  });
  await psql(plan, "", { input: statements.join("\n") });
  writeJson(plan.file("secrets.json"), secrets);
  await psql(plan, "", {
    database: plan.database,
    input: readFileSync(join(here, "seed-stack.sql"), "utf8"),
  });
  step(`${roles.length} login roles ready; fictional creators seeded`);
}

const roleUrl = (plan, secrets, role) =>
  `postgresql://${role}:${role === "creator_runtime" ? TEST_PASSWORD : secrets.passwords[role]}@127.0.0.1:${plan.ports.postgres}/${plan.database}`;

// ------------------------------------------------------------- environment
async function revision() {
  const out = await run("git", ["rev-parse", "HEAD"], { cwd: root });
  const sha = out.stdout.trim();
  return /^[a-f0-9]{40}$/u.test(sha) ? sha : "0".repeat(40);
}

function extraEnv(list) {
  return Object.fromEntries(
    list.map((pair) => {
      const at = pair.indexOf("=");
      if (at < 1) throw new StackError(`"${pair}" is not KEY=VALUE.`, "", 2);
      return [pair.slice(0, at), pair.slice(at + 1)];
    }),
  );
}

/** Node's env-file format: single quotes keep a value literal. */
const quote = (value) => {
  if (!/[\s"'`$#\\]/u.test(value)) return value;
  for (const mark of ["'", "`"])
    if (!value.includes(mark)) return `${mark}${value}${mark}`;
  throw new StackError("An environment value cannot contain both ' and `.");
};

async function writeBackendConfig(plan, secrets, options) {
  mkdirSync(plan.file("artifacts"), { recursive: true, mode: 0o700 });
  writeJson(plan.file("policy.json"), {
    version: "development-unreviewed-20261008",
    reference: SYNTHETIC_REFERENCE,
    providers: [
      {
        name: "OpenAI",
        termsUrl: "https://openai.com/policies/services-agreement/",
        noTraining: true,
        noRetention: false,
      },
    ],
    verified: false,
  });
  // Development economics: a generous trial so repeated checks never run dry.
  // These values are a local knob, not a product decision.
  writeJson(plan.file("economics.json"), {
    label: "development",
    costRule: {
      version: "stack-dev-2026-10",
      microsPerUnit: 1000,
      ceilingUnits: 60,
      rounding: "ceil",
    },
    priorCostRules: [],
    trialAllowance: 1_000_000,
  });
  const rates = JSON.stringify({
    "gpt-4o-mini": {
      inputMicrosPerMillion: 150000,
      outputMicrosPerMillion: 600000,
      cachedInputMicrosPerMillion: 75000,
      cacheWriteMicrosPerMillion: 150000,
    },
    "gpt-4o": {
      inputMicrosPerMillion: 2500000,
      outputMicrosPerMillion: 10000000,
      cachedInputMicrosPerMillion: 1250000,
      cacheWriteMicrosPerMillion: 2500000,
    },
    "text-embedding-3-small": {
      inputMicrosPerMillion: 20000,
      outputMicrosPerMillion: 0,
    },
  });
  const values = {
    NODE_ENV: "development",
    IDENTITY_ADAPTER: "development",
    IDENTITY_SESSION_KEY: secrets.sessionKey,
    CREATOR_FEATURE_ENABLED: "true",
    TRUST_LOCAL_DEVELOPMENT: "true",
    PORT: String(plan.ports.backend),
    WEB_ORIGIN: `http://localhost:${plan.ports.web}`,
    PASSKEY_RP_ID: "localhost",
    RELEASE_REVISION: await revision(),
    DATABASE_URL: roleUrl(plan, secrets, "creator_runtime"),
    TRUST_API_DATABASE_URL: roleUrl(plan, secrets, "creator_trust_runtime"),
    TRUST_WORKER_DATABASE_URL: roleUrl(plan, secrets, "creator_trust_worker"),
    GENERATION_DATABASE_URL: roleUrl(
      plan,
      secrets,
      "creator_generation_worker",
    ),
    TRUST_PRIVATE_ARTIFACT_DIRECTORY: plan.file("artifacts"),
    COMMERCE_CURRENCY: "USD",
    W3_FAN_GENERATION: "development",
    W3_PROVIDER_POLICY_FILE: plan.file("policy.json"),
    W2_PROVIDER_POLICY_REFERENCE: SYNTHETIC_REFERENCE,
    W2_DEVELOPMENT_SYNTHETIC_LICENSING: "true",
    W3_DEVELOPMENT_ECONOMICS_FILE: plan.file("economics.json"),
    W3_DEVELOPMENT_INGESTION: `${MAYA}:${MAYA_ACCOUNT},${DEVON}:${DEVON_ACCOUNT}`,
    OPENAI_API_KEY: "sk-local-development-fake",
    W2_SMALL_MODEL: "gpt-4o-mini",
    W2_LARGE_MODEL: "gpt-4o",
    W2_EMBEDDING_MODEL: "text-embedding-3-small",
    W2_MODEL_RATES_JSON: rates,
    QELVORA_FAKE_MODEL_URL: `http://127.0.0.1:${plan.ports.model}`,
    ...(options.growth
      ? {
          GROWTH_ENABLED: "true",
          GROWTH_API_DATABASE_URL: roleUrl(plan, secrets, "growth_api"),
          GROWTH_WORKER_DATABASE_URL: roleUrl(plan, secrets, "growth_worker"),
          GROWTH_ENCRYPTION_KEY: secrets.growthKey,
        }
      : {}),
    ...extraEnv(options.env),
  };
  writeFileSync(
    plan.file("backend.env"),
    Object.entries(values)
      .map(([k, v]) => `${k}=${quote(v)}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

// ---------------------------------------------------------------- services
const baseEnv = () => ({
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  TMPDIR: process.env.TMPDIR,
  LANG: process.env.LANG ?? "en_US.UTF-8",
});

async function portReady(plan, name, port) {
  if (await portFree(port)) return;
  const holder = await listener(port);
  throw new StackError(
    `Port ${port} (${name}) is already in use${holder ? ` by pid ${holder.pid} (${holder.command})` : ""}.`,
    `Lane ${plan.lane} uses ${plan.base} to ${plan.base + 9}. Stop that process or choose another range with --base-port.`,
    3,
  );
}

/** Keep a service this stack already started if it is alive and answering;
 * otherwise stop it, make sure its port is free, and start it again. */
async function ensureService(plan, name, port, healthy, start) {
  const pids = readJson(plan.file("pids.json"), {});
  if ((await isOurs(pids[name])) && (await healthy().catch(() => false))) {
    step(`${name} already running`);
    return false;
  }
  if (await stopService(plan, name, 5000))
    step(`${name} was not answering; restarting it`);
  await portReady(plan, name, port);
  await start();
  return true;
}

const modelHealthy = async (plan) =>
  (await http(`http://127.0.0.1:${plan.ports.model}/__stats`)).status === 200;
const backendHealthy = async (plan) => {
  const caps = await http(
    `http://127.0.0.1:${plan.ports.backend}/v1/conversations/capabilities`,
  );
  return caps.status === 200 && caps.json?.generationAvailable === true;
};
const webHealthy = async (plan) =>
  (
    await http(`http://127.0.0.1:${plan.ports.web}/status`, {
      timeoutMs: 60_000,
    })
  ).status === 200;

async function startModel(plan) {
  step(`starting the model fake on 127.0.0.1:${plan.ports.model}`);
  await spawnService(
    plan,
    "model",
    [join(here, "fake-edge/model.mjs"), String(plan.ports.model)],
    { cwd: root, env: baseEnv() },
  );
  await waitFor("The model fake", () => modelHealthy(plan), 20_000);
}

async function startBackend(plan, hash) {
  step(`starting the backend on 127.0.0.1:${plan.ports.backend}`);
  const env = baseEnv();
  const args = [
    `--env-file=${plan.file("backend.env")}`,
    "--import",
    join(here, "fake-edge/preload.mjs"),
    "--import",
    "tsx",
    "src/server.ts",
  ];
  const record = await spawnService(plan, "backend", args, {
    cwd: join(root, "apps/backend"),
    env,
  });
  const pids = readJson(plan.file("pids.json"), {});
  pids.backend.envHash = hash;
  writeJson(plan.file("pids.json"), pids);
  await waitFor(
    "The backend",
    async () => {
      if (!(await isOurs(record)))
        throw new StackError(
          "The backend exited while starting.",
          readFileSync(plan.file("backend.log"), "utf8")
            .trim()
            .split("\n")
            .filter(Boolean)
            .slice(-4)
            .join(" | "),
        );
      const caps = await http(
        `http://127.0.0.1:${plan.ports.backend}/v1/conversations/capabilities`,
      );
      return caps.status === 200 && caps.json?.generationAvailable === true;
    },
    180_000,
  );
}

async function startWeb(plan) {
  step(`starting the web app on localhost:${plan.ports.web}`);
  const nextEnv = join(root, "apps/web/next-env.d.ts");
  if (!existsSync(plan.file("next-env.d.ts.original")))
    writeFileSync(plan.file("next-env.d.ts.original"), readFileSync(nextEnv), {
      mode: 0o600,
    });
  // The dev server rewrites this tracked, generated file. Keep it out of
  // `git status` and `git add -A` for as long as it runs; stop and down undo it.
  await run(
    "git",
    ["update-index", "--skip-worktree", "apps/web/next-env.d.ts"],
    { cwd: root },
  );
  const require = createRequire(join(root, "apps/web/package.json"));
  const env = {
    ...baseEnv(),
    QELVORA_API_URL: `http://127.0.0.1:${plan.ports.backend}`,
    W8_API_URL: `http://127.0.0.1:${plan.ports.backend}`,
    W8_LOCAL_DEVELOPMENT: "true",
    WEB_ORIGIN: `http://localhost:${plan.ports.web}`,
    QELVORA_PUBLIC_ORIGIN: `http://localhost:${plan.ports.web}`,
    W3_WEBSOCKET_URL: `ws://127.0.0.1:${plan.ports.backend}/v1/realtime`,
    CREATOR_NEXT_OUTPUT: plan.webOutput,
    NEXT_TELEMETRY_DISABLED: "1",
    ...extraEnv(plan.webExtra ?? []),
  };
  const record = await spawnService(
    plan,
    "web",
    [
      require.resolve("next/dist/bin/next"),
      "dev",
      "-p",
      String(plan.ports.web),
      "-H",
      "127.0.0.1",
    ],
    { cwd: join(root, "apps/web"), env },
  );
  await waitFor(
    "The web app",
    async () => {
      if (!(await isOurs(record)))
        throw new StackError(
          "The web app exited while starting.",
          readFileSync(plan.file("web.log"), "utf8")
            .trim()
            .split("\n")
            .filter(Boolean)
            .slice(-4)
            .join(" | "),
        );
      return (
        (
          await http(`http://127.0.0.1:${plan.ports.web}/status`, {
            timeoutMs: 60_000,
          })
        ).status === 200
      );
    },
    180_000,
  );
}

// ---------------------------------------------------------------- commands
async function withLock(plan, work) {
  mkdirSync(plan.stateDir, { recursive: true, mode: 0o700 });
  const lock = plan.file("lock");
  try {
    mkdirSync(lock);
  } catch {
    const holder = Number(readFileSync(join(lock, "pid"), "utf8").trim() || 0);
    let alive = false;
    try {
      process.kill(holder, 0);
      alive = holder !== process.pid;
    } catch {
      alive = false;
    }
    if (alive)
      throw new StackError(
        "Another stack command is already running for this lane.",
        `pid ${holder}`,
        3,
      );
    rmSync(lock, { recursive: true, force: true });
    mkdirSync(lock);
  }
  writeFileSync(join(lock, "pid"), String(process.pid));
  try {
    return await work();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

/** Every port must be free or already held by this stack's own service. */
async function preflightPorts(plan, options) {
  const pids = readJson(plan.file("pids.json"), {});
  const wanted = [
    ["postgres", plan.ports.postgres, Boolean(await inspect(plan))],
    ["model", plan.ports.model, await isOurs(pids.model)],
    ["backend", plan.ports.backend, await isOurs(pids.backend)],
    ...(options.noWeb ? [] : [["web", plan.ports.web, await isOurs(pids.web)]]),
  ];
  for (const [name, port, ours] of wanted)
    if (!ours) await portReady(plan, name, port);
}

async function up(plan, options) {
  const began = Date.now();
  say(`Bringing up stack "${plan.name}" (ports ${plan.base}-${plan.base + 9})`);
  await ensureDocker();
  await withLock(plan, async () => {
    const owned = readJson(plan.file("pids.json"), {});
    const secrets = readJson(plan.file("secrets.json"), {});
    secrets.sessionKey ??= randomBytes(32).toString("base64");
    secrets.growthKey ??= randomBytes(32).toString("hex");
    secrets.passwords ??= {};
    writeJson(plan.file("secrets.json"), secrets);
    await preflightPorts(plan, options);
    await ensureContainer(plan);
    await bootstrapDatabase(plan, secrets, options);
    // Just the database, roles and seed: for work that brings its own host.
    if (options.dbOnly) return;
    plan.webExtra = options.webEnv;
    const hash = await writeBackendConfig(plan, secrets, options);
    const backendRecord = owned.backend;
    if ((await isOurs(backendRecord)) && backendRecord.envHash !== hash) {
      step("backend configuration changed; restarting it");
      await stopService(plan, "backend");
    }
    await ensureService(
      plan,
      "model",
      plan.ports.model,
      () => modelHealthy(plan),
      () => startModel(plan),
    );
    await ensureService(
      plan,
      "backend",
      plan.ports.backend,
      () => backendHealthy(plan),
      () => startBackend(plan, hash),
    );
    if (!options.noAi) {
      step("making sure Maya's AI is published (through the Studio API)");
      const seed = await run(
        process.execPath,
        [
          join(root, "tests/scenarios/lane-2/seed-maya.mjs"),
          "--api",
          `http://127.0.0.1:${plan.ports.backend}`,
        ],
        { env: baseEnv() },
      );
      if (seed.code !== 0)
        throw new StackError(
          "Maya's AI could not be published.",
          seed.stdout.trim().split("\n").slice(-6).join(" | "),
        );
    }
    if (!options.noWeb)
      await ensureService(
        plan,
        "web",
        plan.ports.web,
        () => webHealthy(plan),
        () => startWeb(plan),
      );
  });
  say();
  if (options.dbOnly) {
    say(
      `READY  ${plan.name} database only  (${Math.round((Date.now() - began) / 1000)} s)`,
    );
    say(
      `  database  postgresql://postgres:${TEST_PASSWORD}@127.0.0.1:${plan.ports.postgres}/${plan.database}`,
    );
    return;
  }
  say(`READY  ${plan.name}  (${Math.round((Date.now() - began) / 1000)} s)`);
  await printAddresses(plan, options);
  if (!options.noSmoke) {
    say();
    say("Smoke check");
    const code = await smoke(plan, options);
    if (code !== 0)
      throw new StackError(
        "The stack is up, but the smoke check failed (see the step marked FAIL above).",
        "Run `status` and `logs backend`. After a failed reply, `reset` rebuilds the stack from nothing.",
      );
  }
}

const loadNote = () => {
  const load = loadavg()[0];
  return load > cpus().length
    ? `host load ${load.toFixed(0)} on ${cpus().length} CPUs: replies may fail while the Mac is this busy`
    : `host load ${load.toFixed(0)} on ${cpus().length} CPUs`;
};

async function printAddresses(plan, options) {
  say(
    `  web       http://localhost:${plan.ports.web}${options.noWeb ? "  (not started: --no-web)" : ""}`,
  );
  say(`  api       http://127.0.0.1:${plan.ports.backend}`);
  say(
    `  database  postgresql://postgres:${TEST_PASSWORD}@127.0.0.1:${plan.ports.postgres}/${plan.database}`,
  );
  say(
    `  tests     CREATOR_TEST_DATABASE_URL=postgresql://postgres:${TEST_PASSWORD}@127.0.0.1:${plan.ports.postgres}/${plan.testDatabase}`,
  );
  say(
    "  sign in   development accounts: fans 1 and 2, Maya (creator) 3, Ops supervisor 4",
  );
  say(`  machine   ${loadNote()}`);
}

async function smoke(plan, options = {}) {
  const args = [
    join(root, "tests/scenarios/lane-2/smoke.mjs"),
    "--api",
    `http://127.0.0.1:${plan.ports.backend}`,
  ];
  if (options.ackOnly) args.push("--ack-only");
  if (options.requireReply) args.push("--require-reply");
  const pids = readJson(plan.file("pids.json"), {});
  if (!options.noWeb && pids.web)
    args.push("--web", `http://127.0.0.1:${plan.ports.web}`);
  return await new Promise((done) => {
    const child = spawn(process.execPath, args, {
      stdio: "inherit",
      env: baseEnv(),
    });
    child.on("close", (code) => done(code ?? 1));
  });
}

async function status(plan) {
  say(`Stack "${plan.name}" (ports ${plan.base}-${plan.base + 9})`);
  let healthy = true;
  const row = (name, ok, detail) => {
    if (!ok) healthy = false;
    say(`  ${name.padEnd(9)} ${ok ? "ok     " : "DOWN   "} ${detail}`);
  };
  let container = null;
  try {
    await ensureDocker();
    container = await inspect(plan);
  } catch (error) {
    row("postgres", false, error.message);
  }
  if (container) {
    let detail = `${plan.container} on 127.0.0.1:${plan.ports.postgres}`;
    if (container.running) {
      const count = await psql(
        plan,
        "select count(*) from creator.schema_migration",
        { database: plan.database },
      ).catch(() => "?");
      detail += `, ${count} migrations applied`;
    }
    row(
      "postgres",
      container.running,
      container.running ? detail : `${plan.container} is stopped`,
    );
  } else if (healthy) row("postgres", false, "no container (run up)");
  const pids = readJson(plan.file("pids.json"), {});
  const backend = `http://127.0.0.1:${plan.ports.backend}`;
  const live = await http(`${backend}/health/live`).catch(() => null);
  const caps = live
    ? await http(`${backend}/v1/conversations/capabilities`).catch(() => null)
    : null;
  const ident = live
    ? await http(`${backend}/v1/identity/capabilities`).catch(() => null)
    : null;
  const workers =
    existsSync(plan.file("backend.log")) &&
    readFileSync(plan.file("backend.log"), "utf8").includes(
      "Generation worker: running",
    )
      ? "generation, trust and usage workers run in the process"
      : "workers not reported";
  row(
    "backend",
    Boolean(
      live?.status === 200 &&
        caps?.json?.generationAvailable &&
        ident?.json?.signInAvailable,
    ) && (await isOurs(pids.backend)),
    live
      ? `${backend}  pid ${pids.backend?.pid ?? "?"}; sign-in ${ident?.json?.signInAvailable ? "offered" : "off"}; generation ${caps?.json?.generationAvailable ? "available" : "off"}; ${workers}`
      : "not answering",
  );
  const stats = await http(
    `http://127.0.0.1:${plan.ports.model}/__stats`,
  ).catch(() => null);
  row(
    "model",
    stats?.status === 200 && (await isOurs(pids.model)),
    stats?.json
      ? `fake provider on ${plan.ports.model}, mode ${stats.json.mode}, calls ${JSON.stringify(stats.json.counts)}`
      : "not answering",
  );
  const web = pids.web
    ? await http(`http://127.0.0.1:${plan.ports.web}/status`, {
        timeoutMs: 30_000,
      }).catch(() => null)
    : null;
  row(
    "web",
    web?.status === 200 && (await isOurs(pids.web)),
    web
      ? `http://localhost:${plan.ports.web}  pid ${pids.web.pid}`
      : pids.web
        ? "not answering"
        : "not started",
  );
  say(
    "  not started: publication worker (needs held migrations 0073/0201 and its login role), ingestion worker (needs ffmpeg/clamd; media is frozen)",
  );
  say(`  machine   ${loadNote()}`);
  return healthy ? 0 : 1;
}

async function stopAll(plan) {
  const stopped = [];
  for (const name of ["web", "backend", "model"])
    if (await stopService(plan, name)) stopped.push(name);
  return stopped;
}

async function restoreNextEnv(plan) {
  const original = plan.file("next-env.d.ts.original");
  if (existsSync(original)) {
    writeFileSync(join(root, "apps/web/next-env.d.ts"), readFileSync(original));
    await run(
      "git",
      ["update-index", "--no-skip-worktree", "apps/web/next-env.d.ts"],
      { cwd: root },
    );
    step("restored apps/web/next-env.d.ts (the dev server rewrites it)");
  }
}

async function stop(plan) {
  await withLock(plan, async () => {
    const stopped = await stopAll(plan);
    step(
      stopped.length
        ? `stopped ${stopped.join(", ")}`
        : "no stack processes were running",
    );
    await restoreNextEnv(plan);
    await ensureDocker();
    const container = await inspect(plan);
    if (container?.labels["qelvora.stack"] === plan.name && container.running) {
      await docker(["stop", plan.container]);
      step("stopped the database container (data kept)");
    }
  });
  say("Stopped. `up` brings it back with its data.");
}

async function down(plan, options) {
  await withLock(plan, async () => {
    const stopped = await stopAll(plan);
    step(
      stopped.length
        ? `stopped ${stopped.join(", ")}`
        : "no stack processes were running",
    );
    await restoreNextEnv(plan);
    let dockerUp = true;
    try {
      await ensureDocker();
    } catch (error) {
      dockerUp = false;
      step(`${error.message} The container and volume could not be checked.`);
    }
    if (dockerUp) {
      const container = await inspect(plan);
      if (container?.labels["qelvora.stack"] === plan.name) {
        await docker(["rm", "-f", "-v", plan.container]);
        step(`removed container ${plan.container}`);
      } else if (container)
        step(`left ${plan.container} alone: it is not this stack's`);
      if (!options.keepData) {
        const label = await volumeLabel(plan);
        if (label === plan.name) {
          await docker(["volume", "rm", plan.volume]);
          step(`removed volume ${plan.volume}`);
        } else if (label !== null)
          step(`left volume ${plan.volume} alone: it is not this stack's`);
      }
    }
    rmSync(join(root, "apps/web", plan.webOutput), {
      recursive: true,
      force: true,
    });
  });
  if (!options.keepData)
    rmSync(plan.stateDir, { recursive: true, force: true });
  say(
    "Down. Only this stack's own processes, container, volume and files were removed.",
  );
}

async function reset(plan, options) {
  await down(plan, { ...options, keepData: false });
  await up(plan, options);
}

async function logs(plan, options) {
  const which = options.positional[0] ?? "backend";
  if (!["backend", "web", "model"].includes(which))
    throw new StackError("Choose backend, web or model.", "", 2);
  const file = plan.file(`${which}.log`);
  if (!existsSync(file))
    throw new StackError(`No ${which} log yet.`, "Run `up` first.");
  say(
    readFileSync(file, "utf8")
      .trim()
      .split("\n")
      .slice(-(options.lines ?? 60))
      .join("\n"),
  );
}

async function env(plan) {
  say(`QELVORA_API_URL=http://127.0.0.1:${plan.ports.backend}`);
  say(`QELVORA_WEB_URL=http://localhost:${plan.ports.web}`);
  say(
    `CREATOR_TEST_DATABASE_URL=postgresql://postgres:${TEST_PASSWORD}@127.0.0.1:${plan.ports.postgres}/${plan.testDatabase}`,
  );
  say(
    `QELVORA_STACK_DATABASE_URL=postgresql://postgres:${TEST_PASSWORD}@127.0.0.1:${plan.ports.postgres}/${plan.database}`,
  );
  say(`QELVORA_FAKE_MODEL_URL=http://127.0.0.1:${plan.ports.model}`);
}

const help = `Usage: node infra/local/stack.mjs <up|status|smoke|env|logs|stop|down|reset> --lane N [options]
  --lane N        lane number (ports 564N0-564N9) or a label such as 3a with --base-port
  --base-port P   first of ten ports (default 56400 + N*10)
  up options      --db-only  --growth  --no-web  --no-ai  --no-smoke  --ack-only  --require-reply  --env KEY=VALUE  --web-env KEY=VALUE
  down options    --keep-data
  logs            logs backend|web|model [-n 80]`;

async function main() {
  const { command, options } = parse(process.argv.slice(2));
  if (command === "help" || command === "--help") return say(help);
  const plan = planFor(options);
  const table = { up, status, smoke, env, logs, stop, down, reset };
  if (!table[command])
    throw new StackError(`Unknown command "${command}".`, help, 2);
  const code = await table[command](plan, options);
  process.exit(typeof code === "number" ? code : 0);
}

main().catch((error) => {
  if (error instanceof StackError) {
    process.stderr.write(
      `\nERROR: ${error.message}\n${error.hint ? `  ${error.hint}\n` : ""}`,
    );
    process.exit(error.exit);
  }
  process.stderr.write(`\nUnexpected failure: ${error.stack}\n`);
  process.exit(1);
});
