// E2.1: cold start of the local stack and its edge cases, against real Docker.
// It only touches lane 2's stack (default) and a second, throwaway stack on
// lane 8's range (56480-56489); every other container, volume and process is
// compared before and after. Takes a few minutes. Run from the repository root:
//   node tests/scenarios/lane-2/e2-1-cold-start.mjs [--lane 2] [--second 8]
import { execFile, spawn } from "node:child_process";
import net from "node:net";
import { promisify } from "node:util";
import { reporter, sleep } from "./lib.mjs";

const flag = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : fallback;
};
const lane = flag("--lane", "2");
const second = flag("--second", "8");
const stackCli = "infra/local/stack.mjs";
const { step, finish } = reporter();
const exec = promisify(execFile);

const stack = async (args, env = {}) => {
  try {
    const { stdout, stderr } = await exec("node", [stackCli, ...args], {
      env: { ...process.env, ...env },
      maxBuffer: 16 * 1024 * 1024,
      timeout: 900_000,
    });
    return { code: 0, out: stdout + stderr };
  } catch (error) {
    return {
      code: error.code ?? 1,
      out: `${error.stdout ?? ""}${error.stderr ?? ""}`,
    };
  }
};
const names = async (kind) =>
  (
    await exec("docker", [
      kind,
      "ls",
      ...(kind === "container"
        ? ["-a", "--format", "{{.Names}}"]
        : ["--format", "{{.Name}}"]),
    ])
  ).stdout
    .split("\n")
    .filter(Boolean)
    .sort();
const mine = (list, id) =>
  list.filter((n) => n.startsWith(`qelvora-lane${id}-`));
const port = (id) => 56400 + Number(id) * 10;
const sql = async (id, query) =>
  (
    await exec("docker", [
      "exec",
      "-e",
      "PGPASSWORD=foundation-test-only",
      `qelvora-lane${id}-postgres`,
      "psql",
      "-h",
      "127.0.0.1",
      "-U",
      "postgres",
      "-d",
      "creator_stack",
      "-qtA",
      "-c",
      query,
    ])
  ).stdout.trim();
const counts = async (id) =>
  [
    await sql(id, "select count(*) from creator.creator_profile"),
    await sql(id, "select count(*) from creator.team_membership"),
    await sql(id, "select count(*) from creator_trust.ops_member"),
    await sql(id, "select count(*) from creator.ai_version"),
    await sql(id, "select count(*) from creator.schema_migration"),
  ].join("/");
const listen = (p) =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.listen(p, "127.0.0.1", () => resolve(server));
  });

const containersBefore = await names("container");
const volumesBefore = await names("volume");
/** Everything that existed before and is not one of this script's two stacks must still exist. */
const others = (list, before) =>
  before
    .filter((n) => !mine([n], lane).length && !mine([n], second).length)
    .every((n) => list.includes(n));

// Cold start from nothing, with the smoke acknowledgment.
await stack(["down", "--lane", lane]);
let started = Date.now();
let run = await stack(["up", "--lane", lane, "--ack-only"]);
step(
  "cold start: one command gives the whole stack and the smoke passes",
  run.code === 0 && /all steps passed/.test(run.out),
  `${Math.round((Date.now() - started) / 1000)} s`,
);
const first = await counts(lane);
step(
  "seeds and Maya's AI are in place",
  first === "2/1/3/1/114",
  `profiles/team/ops/versions/migrations = ${first}`,
);

// Run it again: nothing is duplicated, running services are kept.
run = await stack(["up", "--lane", lane, "--ack-only"]);
step(
  "repeat: succeeds and reuses what is running",
  run.code === 0 &&
    /backend already running/.test(run.out) &&
    /web already running/.test(run.out),
  `exit ${run.code}`,
);
const again = await counts(lane);
step(
  "repeat: no duplicate seeds, creators or versions",
  again === first,
  again,
);

// A port already taken: a clear error naming the port, then success once freed.
await stack(["down", "--lane", lane]);
const blocker = await listen(port(lane) + 1);
run = await stack(["up", "--lane", lane, "--no-smoke"]);
step(
  "port taken: refused with a clear message, before anything is created",
  run.code === 3 &&
    new RegExp(
      `Port ${port(lane) + 1} \\(backend\\) is already in use by pid ${process.pid}`,
    ).test(run.out) &&
    !(await names("container")).includes(`qelvora-lane${lane}-postgres`),
  `exit ${run.code}`,
);
blocker.close();
run = await stack(["up", "--lane", lane, "--ack-only"]);
step(
  "port freed: the same command now finishes the job",
  run.code === 0 && /all steps passed/.test(run.out),
  `exit ${run.code}`,
);

// Docker not reachable (the client is pointed at a dead socket; the real daemon is not touched).
run = await stack(["status", "--lane", lane], {
  DOCKER_HOST: "unix:///nonexistent/docker.sock",
});
step(
  "Docker unreachable: clear error, not a crash",
  /Docker is not running/.test(run.out),
  run.out
    .split("\n")
    .find((l) => /Docker/.test(l))
    ?.trim()
    .slice(0, 80),
);
run = await stack(["up", "--lane", lane], {
  DOCKER_HOST: "unix:///nonexistent/docker.sock",
});
step(
  "Docker unreachable: up refuses with exit 3 and changes nothing",
  run.code === 3 &&
    (await names("container")).includes(`qelvora-lane${lane}-postgres`),
  `exit ${run.code}`,
);

// Killed in the middle of a first run, then resumed.
await stack(["down", "--lane", lane]);
const killed = spawn("node", [stackCli, "up", "--lane", lane], {
  stdio: "ignore",
});
await sleep(9000);
killed.kill("SIGKILL");
await sleep(500);
run = await stack(["up", "--lane", lane, "--ack-only"]);
step(
  "killed mid-run: the next run resumes and the smoke passes",
  run.code === 0 && /all steps passed/.test(run.out),
  `exit ${run.code}`,
);
step(
  "killed mid-run: still exactly one of everything",
  (await counts(lane)) === first,
  await counts(lane),
);

// Stop keeps the data; up brings it back without a second AI version.
await stack(["stop", "--lane", lane]);
run = await stack(["up", "--lane", lane, "--ack-only"]);
step(
  "stop then up: data and Maya's AI survive",
  run.code === 0 &&
    /all steps passed/.test(run.out) &&
    (await counts(lane)) === first,
  `exit ${run.code}`,
);

// A second stack on another port range at the same time.
run = await stack(["up", "--lane", second, "--ack-only"]);
step(
  "second stack on its own range comes up beside the first",
  run.code === 0 && /all steps passed/.test(run.out),
  `ports ${port(second)}-${port(second) + 9}`,
);
const a = await stack(["status", "--lane", lane]);
const b = await stack(["status", "--lane", second]);
step(
  "both stacks are healthy at once",
  a.code === 0 && b.code === 0,
  `exit ${a.code}/${b.code}`,
);
step(
  "their containers and volumes are separate",
  mine(await names("container"), lane).length === 1 &&
    mine(await names("container"), second).length === 1,
);
await stack(["down", "--lane", second]);
const afterSecond = await stack(["status", "--lane", lane]);
step(
  "tearing one down leaves the other running",
  afterSecond.code === 0,
  `exit ${afterSecond.code}`,
);

// A foreign container or volume that happens to carry this stack's names is
// never reused and never removed (lane 9 has no real owner; the decoys are this script's own).
await exec("docker", [
  "create",
  "--name",
  "qelvora-lane9-postgres",
  "pgvector/pgvector:pg17",
]);
run = await stack(["up", "--lane", "9", "--no-smoke"]);
step(
  "foreign container with its name: up refuses and creates nothing",
  run.code === 3 &&
    /not created by this stack/.test(run.out) &&
    (await names("volume")).every((n) => n !== "qelvora-lane9-pgdata"),
  `exit ${run.code}`,
);
run = await stack(["down", "--lane", "9"]);
step(
  "foreign container with its name: down leaves it alone",
  run.code === 0 &&
    (await names("container")).includes("qelvora-lane9-postgres") &&
    /left qelvora-lane9-postgres alone/.test(run.out),
  `exit ${run.code}`,
);
await exec("docker", ["rm", "qelvora-lane9-postgres"]);
await exec("docker", ["volume", "create", "qelvora-lane9-pgdata"]);
run = await stack(["up", "--lane", "9", "--no-smoke"]);
step(
  "foreign volume with its name: up refuses and creates no container",
  run.code === 3 &&
    /was not created by this stack/.test(run.out) &&
    !(await names("container")).includes("qelvora-lane9-postgres"),
  `exit ${run.code}`,
);
run = await stack(["down", "--lane", "9"]);
step(
  "foreign volume with its name: down leaves it alone",
  run.code === 0 && (await names("volume")).includes("qelvora-lane9-pgdata"),
  `exit ${run.code}`,
);
await exec("docker", ["volume", "rm", "qelvora-lane9-pgdata"]);

// Teardown removes only this stack's own objects.
await stack(["down", "--lane", lane]);
const containersAfter = await names("container");
const volumesAfter = await names("volume");
step(
  "teardown: its container and volume are gone",
  mine(containersAfter, lane).length === 0 &&
    mine(volumesAfter, lane).length === 0,
);
step(
  "teardown: every other container and volume is untouched",
  others(containersAfter, containersBefore) &&
    others(volumesAfter, volumesBefore),
  `${containersBefore.length - mine(containersBefore, lane).length - mine(containersBefore, second).length} others checked`,
);
run = await stack(["down", "--lane", lane]);
step("teardown twice is harmless", run.code === 0, `exit ${run.code}`);
finish();
