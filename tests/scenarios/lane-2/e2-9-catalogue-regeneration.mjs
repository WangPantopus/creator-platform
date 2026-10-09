// E2.9: a new migration changes the pinned catalogues, export refuses until they
// are regenerated, the tool regenerates them, export works again, and the tool
// fails loudly if regeneration was forgotten. Runs against lane 2's own stack:
//   node infra/local/stack.mjs up --lane 2 --no-web --no-smoke
//   node tests/scenarios/lane-2/e2-9-catalogue-regeneration.mjs
// It edits one tracked file (the head review's pins) and restores it byte for
// byte at the end, even if a step fails. It restarts the stack's backend.
//
// The "migration" is one empty table applied by hand to the stack's disposable
// database. It is not registered in infra/migrations.json (that is the
// integrator's file); the pins hash the list of relations, so a registered
// migration that adds a relation changes them in exactly the same way.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACTORS,
  MAYA_CREATOR_ID,
  call,
  key,
  reporter,
  signIn,
  sleep,
} from "./lib.mjs";

const { step, advise, finish } = reporter();
const repo = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const REVIEW = "infra/migrations/reviews/20261008-comparison.json";
const reviewPath = join(repo, REVIEW);
const BASE = "http://127.0.0.1:56421";
const DATABASE =
  "postgresql://postgres:foundation-test-only@127.0.0.1:56420/creator_stack";
const FIVE = ["commerce", "content", "identity", "media", "trust"];
const work = mkdtempSync(join(tmpdir(), "qe29-"));
const snapshotFile = join(work, "before.json");
const sha = (text) => createHash("sha256").update(text).digest("hex");

const psql = (sql) =>
  execFileSync(
    "docker",
    [
      "exec",
      "qelvora-lane2-postgres",
      "psql",
      "-h",
      "127.0.0.1",
      "-U",
      "postgres",
      "-d",
      "creator_stack",
      "-qtA",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  ).toString();
const pins = (...args) => {
  const run = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "src/operations/catalogues/catalogue-pins.ts",
      ...args,
      "--database-url",
      DATABASE,
    ],
    { cwd: join(repo, "apps/backend"), encoding: "utf8" },
  );
  return { status: run.status, out: (run.stdout ?? "") + (run.stderr ?? "") };
};
const stack = (...args) => {
  const run = spawnSync(
    process.execPath,
    [join(repo, "infra/local/stack.mjs"), ...args, "--lane", "2"],
    { cwd: repo, encoding: "utf8", timeout: 300_000 },
  );
  return { status: run.status, out: (run.stdout ?? "") + (run.stderr ?? "") };
};
const restartBackend = () => {
  stack("stop");
  return stack("up", "--no-web", "--no-smoke");
};

/** Ask for an export as one fan and watch the five domains that can complete here. */
async function exportOnce(account, done, timeoutMs) {
  try {
    const { token } = await signIn(BASE, account);
    const created = await call(BASE, "POST", "/v1/trust/privacy/jobs", {
      token,
      body: {
        kind: "export",
        scope: "account",
        proof: "LOCAL DEVELOPMENT",
        idempotencyKey: key("e29"),
      },
    });
    if (created.status !== 202)
      return {
        error: `${created.status} ${created.text.slice(0, 160)}`,
        tasks: {},
        seconds: 0,
      };
    const began = Date.now();
    let tasks = {};
    do {
      const job = await call(
        BASE,
        "GET",
        `/v1/trust/privacy/jobs/${created.json.id}`,
        { token },
      );
      tasks = Object.fromEntries(
        (job.json?.tasks ?? []).map((t) => [
          t.domain,
          t.error_code ? `${t.state}:${t.error_code}` : t.state,
        ]),
      );
      if (done(tasks)) break;
      await sleep(3000);
    } while (Date.now() - began < timeoutMs);
    return { tasks, seconds: Math.round((Date.now() - began) / 1000) };
  } catch (error) {
    return {
      error: String(error?.cause?.code ?? error?.message ?? error),
      tasks: {},
      seconds: 0,
    };
  }
}

/** A fan sends one message to Maya. "accepted" or the refusal's status and code. */
async function messageAsFanTwo() {
  try {
    const { token, session } = await signIn(BASE, ACTORS.fanTwo);
    let fan = session.fan;
    if (!fan)
      fan = (
        await call(BASE, "POST", "/v1/identity/fan-profile", {
          token,
          body: { handle: "stackfantwo", intro: "" },
        })
      ).json;
    const caps = (
      await call(BASE, "GET", "/v1/conversations/capabilities", { token })
    ).json;
    const begun = await call(BASE, "POST", "/v1/conversations/begin", {
      token,
      body: {
        creatorId: MAYA_CREATOR_ID,
        policyVersion: caps.providers.version,
        accessNoticeAccepted: true,
        idempotencyKey: key("begin"),
      },
    });
    if (begun.status !== 200)
      return `begin ${begun.status} ${begun.json?.error?.code ?? ""}`.trim();
    const thread = `/v1/conversations/${MAYA_CREATOR_ID}/${fan.id}`;
    const inFlight = async () =>
      ((await call(BASE, "GET", thread, { token })).json?.messages ?? []).some(
        (m) =>
          m.authorKind === "ai" &&
          ["queued", "generating"].includes(m.deliveryState),
      );
    for (let waited = 0; waited < 60 && (await inFlight()); waited += 1)
      await sleep(1000);
    const sent = await call(BASE, "POST", `${thread}/messages`, {
      token,
      body: {
        idempotencyKey: key("e29"),
        text: `E2.9 ${new Date().toISOString()}`,
        clientSequence: Date.now() % 1_000_000,
      },
    });
    return sent.status === 200
      ? "accepted"
      : `${sent.status} ${sent.json?.error?.code ?? ""}`.trim();
  } catch (error) {
    return `no answer (${error?.cause?.code ?? error?.message ?? error})`;
  }
}
const five = (tasks) => FIVE.map((d) => `${d}=${tasks[d] ?? "none"}`).join(" ");
const shown = (result, verb) =>
  result.error
    ? `no job: ${result.error}`
    : `${five(result.tasks)} ${verb} ${result.seconds} s`;
const allComplete = (tasks) => FIVE.every((d) => tasks[d] === "complete");
const allStuck = (tasks) =>
  FIVE.every((d) => /^(blocked|retry)/u.test(tasks[d] ?? ""));

const original = readFileSync(reviewPath, "utf8");
let restored = false;
let backendOnCommitted = false;
const restoreFile = () => writeFileSync(reviewPath, original);
const dropTrialTable = () => {
  try {
    psql("DROP TABLE IF EXISTS creator.e29_trial");
  } catch {
    /* the database is gone */
  }
};
/** Whatever happens, leave the tracked file and the database as they were. */
const restore = () => {
  if (restored) return;
  restored = true;
  restoreFile();
  dropTrialTable();
};
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    restore();
    process.stdout.write(
      "\nInterrupted: the review file was restored and the trial table dropped. Restart the backend (stack stop, then up).\n",
    );
    process.exit(130);
  });

try {
  // Preconditions: the scenario edits a tracked file, so it must start from the committed one.
  const dirty =
    spawnSync(
      "git",
      ["diff", "--quiet", "HEAD", "--", "infra/migrations/reviews"],
      { cwd: repo },
    ).status !== 0;
  if (dirty) {
    process.stdout.write(
      `FAIL  ${REVIEW} differs from the committed file; commit or restore it first, then re-run\n`,
    );
    restored = true;
    process.exit(2);
  }
  const live = await fetch(`${BASE}/health/live`, {
    signal: AbortSignal.timeout(5000),
  })
    .then((r) => r.status)
    .catch(() => 0);
  if (
    !step(
      "preconditions: the stack's backend answers and the review file is the committed one",
      live === 200,
      `health ${live}`,
    )
  )
    process.exit(2);
  psql("DROP TABLE IF EXISTS creator.e29_trial");
  // The product allows an account five data requests an hour. The run needs two
  // exports from each of two fans (before and after, and during the fault).
  const used = (account) =>
    Number(
      psql(
        `SELECT count(*) FROM creator_trust.privacy_job WHERE account_id='${account}' AND created_at>now()-interval '1 hour'`,
      ).trim(),
    );
  const [one, two] = [used(ACTORS.fanOne), used(ACTORS.fanTwo)];
  if (
    !step(
      "preconditions: both fans have room for two more data requests this hour",
      one <= 3 && two <= 3,
      `fan one has made ${one}, fan two ${two} in the last hour (the limit is 5); wait and re-run`,
    )
  )
    process.exit(2);
  const exporters =
    one <= two
      ? { steady: ACTORS.fanOne, stale: ACTORS.fanTwo }
      : { steady: ACTORS.fanTwo, stale: ACTORS.fanOne };

  process.stdout.write("\n-- baseline: pins match, export completes --\n");
  const baseline = pins("check");
  step(
    "check: every pinned digest reproduces on the freshly built database",
    baseline.status === 0,
    baseline.out.split("\n").find((l) => l.includes("pin groups match")) ??
      baseline.out.slice(0, 200),
  );
  const first = await exportOnce(exporters.steady, allComplete, 240_000);
  step(
    "export: the five domains that can complete here do",
    allComplete(first.tasks),
    shown(first, "in"),
  );
  const taken = pins("snapshot", "--out", snapshotFile);
  step(
    "snapshot: what every purpose role reaches, before the migration",
    taken.status === 0,
    taken.out.split("\n").find((l) => l.startsWith("snapshot")) ??
      taken.out.slice(0, 160),
  );

  process.stdout.write("\n-- a migration adds one relation --\n");
  psql("CREATE TABLE creator.e29_trial (id integer PRIMARY KEY, note text)");
  const stale = pins("check");
  const groups = stale.out.match(/^(\d+) of (\d+) pin groups match/mu);
  step(
    "check fails loudly: the repository's pins no longer describe the database",
    stale.status === 1 && groups !== null && Number(groups[1]) === 0,
    groups
      ? `${groups[1]} of ${groups[2]} pin groups match, exit ${stale.status}`
      : `exit ${stale.status}: ${stale.out.slice(0, 160)}`,
  );
  const refused = await exportOnce(exporters.stale, allStuck, 120_000);
  step(
    "export refuses: none of the five domains completes",
    !FIVE.some((d) => refused.tasks[d] === "complete") &&
      allStuck(refused.tasks),
    shown(refused, "after"),
  );
  const refusedMessage = await messageAsFanTwo();
  advise(
    "the running backend stops accepting fan messages until it is restarted",
    refusedMessage !== "accepted",
    refusedMessage,
  );
  const log = stack("logs", "backend", "-n", "600").out;
  advise(
    "generation stops too: the reply worker reports its terminal discovery unconfigured",
    /generation_terminal_discovery_unconfigured/u.test(log),
  );
  const diff = pins("diff", "--base", snapshotFile);
  step(
    "diff: only relations were added; no purpose role gained or lost access",
    diff.status === 0 &&
      /relations: 2 added/u.test(diff.out) &&
      /purpose roles whose reach changed: 0/u.test(diff.out),
    diff.out
      .split("\n")
      .filter((l) => /^(relations:|purpose roles)/u.test(l))
      .join("; "),
  );

  process.stdout.write("\n-- a restart alone does not repair it --\n");
  const stuckRestart = restartBackend();
  const alive = await fetch(`${BASE}/health/live`, {
    signal: AbortSignal.timeout(5000),
  })
    .then((r) => r.status)
    .catch(() => 0);
  if (alive === 200) {
    const stillRefused = await exportOnce(exporters.stale, allStuck, 120_000);
    step(
      "the backend started, and export still refuses after the restart",
      !FIVE.some((d) => stillRefused.tasks[d] === "complete") &&
        allStuck(stillRefused.tasks),
      shown(stillRefused, "after"),
    );
  } else {
    const reason =
      stack("logs", "backend", "-n", "60").out.match(
        /DomainError: ([^\n]+)/u,
      )?.[1] ?? "no reason in the log";
    step(
      "the backend refuses to start with the stale pins and the new relation",
      stuckRestart.status !== 0 &&
        /custody|catalogue|independent review|reviewed/iu.test(reason),
      `up exit ${stuckRestart.status}; ${reason}`,
    );
  }

  process.stdout.write("\n-- regenerate --\n");
  const wrote = pins("write", "--base", snapshotFile);
  const numstat = execFileSync(
    "git",
    ["diff", "--numstat", "HEAD", "--", "infra/"],
    { cwd: repo },
  )
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean);
  const [added, removed, file] = (numstat[0] ?? "").split("\t");
  step(
    "write: exactly one tracked file changed, one line per changed digest",
    wrote.status === 0 &&
      numstat.length === 1 &&
      file === REVIEW &&
      added === "45" &&
      removed === "45",
    `exit ${wrote.status}; ${numstat.length} file(s): ${file} +${added} -${removed}`,
  );
  const fresh = pins("check");
  step(
    "check passes with the regenerated pins",
    fresh.status === 0,
    fresh.out.split("\n").find((l) => l.includes("pin groups match")) ??
      fresh.out.slice(0, 200),
  );
  const afterWrite = restartBackend();
  step(
    "the backend restarts and reads them",
    afterWrite.status === 0,
    `up exit ${afterWrite.status}`,
  );
  const again = await exportOnce(exporters.steady, allComplete, 240_000);
  step(
    "export works again: the five domains complete",
    allComplete(again.tasks),
    shown(again, "in"),
  );

  process.stdout.write("\n-- put everything back --\n");
  restoreFile();
  step(
    "the review file is the committed file again, byte for byte",
    sha(readFileSync(reviewPath, "utf8")) === sha(original),
  );
  const forgotten = pins("check");
  step(
    "with the committed pins and the new table, check fails again (a forgotten regeneration is caught)",
    forgotten.status === 1,
    `exit ${forgotten.status}`,
  );
  dropTrialTable();
  const backToStart = restartBackend();
  const clean = pins("check");
  step(
    "table dropped, backend restarted on the committed pins: check passes",
    backToStart.status === 0 && clean.status === 0,
    `up exit ${backToStart.status}, check exit ${clean.status}`,
  );
  advise(
    "a fan's message is accepted again",
    (await messageAsFanTwo()) === "accepted",
  );
  backendOnCommitted = true;
} finally {
  restore();
  // A run that stopped early leaves the backend on pins that no longer match.
  if (!backendOnCommitted) restartBackend();
  rmSync(work, { recursive: true, force: true });
}
finish();
