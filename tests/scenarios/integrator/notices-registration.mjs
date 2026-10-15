// Registration of #385's migrations (0247_w5_note_mute_read, 0248_w7_notice_snapshot):
// on a stack built from nothing, the pins match, an export and a delete run through
// the real privacy API, and growth.notice rows follow the fan. Runs against the
// integrator's lane 0 stack (add --growth for the Growth domain):
//   node infra/local/stack.mjs up --lane 0 --no-web [--growth]
//   node tests/scenarios/integrator/notices-registration.mjs [--growth]
// With --growth it writes one synthetic notice row per fan as growth_worker (the
// owner calls that would write them are not composed in the stock host yet).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
} from "../lane-2/lib.mjs";

const { step, advise, finish } = reporter();
const repo = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const BASE = "http://127.0.0.1:56401";
const growth = process.argv.includes("--growth");
const sql = (text) =>
  execFileSync(
    "docker",
    ["exec", "qelvora-lane0-postgres", "psql", "-U", "postgres", "-d"].concat([
      "creator_stack",
      "-qtA",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      text,
    ]),
    { stdio: ["ignore", "pipe", "pipe"] },
  )
    .toString()
    .trim();
const notice = (account) =>
  sql(
    `SET ROLE growth_worker; INSERT INTO growth.notice(type,aggregate_id,account_id,creator_id,version,state,author_kind,creator_name,safe_preview,destination)
     VALUES('ai_reply',gen_random_uuid(),'${account}','${MAYA_CREATOR_ID}',1,'current','ai','Maya','Maya''s AI replied.','/threads') ON CONFLICT DO NOTHING; RESET ROLE`,
  );
const notices = (account) =>
  Number(
    sql(`SELECT count(*) FROM growth.notice WHERE account_id='${account}'`),
  );

/** Create a privacy job as one account and poll its tasks until done(tasks). */
async function job(account, kind, done, timeoutMs) {
  const { token } = await signIn(BASE, account);
  const created = await call(BASE, "POST", "/v1/trust/privacy/jobs", {
    token,
    body: {
      kind,
      scope: "account",
      proof: "LOCAL DEVELOPMENT",
      idempotencyKey: key("i385"),
    },
  });
  if (created.status !== 202)
    return {
      error: `${created.status} ${created.text.slice(0, 200)}`,
      tasks: {},
    };
  const began = Date.now();
  let tasks = {};
  do {
    await sleep(3000);
    const read = await call(
      BASE,
      "GET",
      `/v1/trust/privacy/jobs/${created.json.id}`,
      { token },
    );
    tasks = Object.fromEntries(
      (read.json?.tasks ?? []).map((t) => [
        t.domain,
        t.error_code ? `${t.state}:${t.error_code}` : t.state,
      ]),
    );
  } while (!done(tasks) && Date.now() - began < timeoutMs);
  return {
    id: created.json.id,
    tasks,
    seconds: Math.round((Date.now() - began) / 1000),
  };
}
const settled = (tasks) =>
  Object.keys(tasks).length > 0 &&
  Object.values(tasks).every(
    (state) => !/^(pending|running|queued|leased)\b/u.test(state),
  );
const show = (tasks) =>
  Object.entries(tasks)
    .sort()
    .map(([domain, state]) => `${domain}=${state}`)
    .join(" ");

const pins = spawnSync(
  process.execPath,
  [join(repo, "infra/local/stack.mjs"), "catalogues", "check", "--lane", "0"],
  { cwd: repo, encoding: "utf8" },
);
const summary =
  (pins.stdout ?? "")
    .split("\n")
    .find((line) => /pin groups match/u.test(line)) ?? "";
step(
  "the pinned catalogues match this database",
  growth ? /43 of 45/u.test(summary) : pins.status === 0,
  growth ? `${summary} (the Growth login's two known differences)` : summary,
);
const ledger = sql(
  "SELECT count(*)||' '||string_agg(version,',' ORDER BY version) FILTER (WHERE version>='0247') FROM creator.schema_migration",
);
step(
  "both new migrations are in the ledger",
  /^116 0247_w5_note_mute_read,0248_w7_notice_snapshot$/u.test(ledger),
  ledger,
);

if (growth) {
  notice(ACTORS.fanOne);
  notice(ACTORS.fanTwo);
  step(
    "one synthetic notice row per fan",
    notices(ACTORS.fanOne) === 1 && notices(ACTORS.fanTwo) === 1,
  );
}

const exported = await job(ACTORS.fanOne, "export", settled, 300_000);
step(
  "an export as fan one: the five domains that can finish here finish",
  ["commerce", "content", "identity", "media", "trust"].every(
    (d) => exported.tasks[d] === "complete",
  ),
  exported.error ?? `${show(exported.tasks)} (${exported.seconds} s)`,
);
if (growth)
  step(
    "the Growth export finishes with the notice row present",
    exported.tasks.growth === "complete" && notices(ACTORS.fanOne) === 1,
    `growth=${exported.tasks.growth}`,
  );
if (growth) {
  // The stack's private artifact store (outside Git): the Growth export file.
  const store = join(tmpdir(), "qelvora-stack", "lane0", "artifacts");
  const meta = existsSync(store)
    ? readdirSync(store)
        .filter((name) => /^[0-9a-f-]{36}\.json$/u.test(name))
        .map((name) => JSON.parse(readFileSync(join(store, name), "utf8")))
        .find((m) => m.jobId === exported.id && m.domain === "growth")
    : undefined;
  const lines = meta
    ? readFileSync(join(store, `${meta.reference}.bin`), "utf8").split("\n")
    : [];
  const row = lines
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .find((line) => line.collection === "notice");
  step(
    "the export file carries fan one's notice row, and no message text",
    row?.data.account_id === ACTORS.fanOne &&
      row.data.safe_preview === "Maya's AI replied." &&
      !("body" in row.data),
    row ? `${row.data.type}, ${row.data.author_kind}` : "no notice line",
  );
}

const removed = await job(ACTORS.fanTwo, "delete", settled, 240_000);
advise(
  "a delete as fan two settles in every domain (most refuse until retention is decided)",
  !removed.error && settled(removed.tasks),
  removed.error ?? `${show(removed.tasks)} (${removed.seconds} s)`,
);
if (growth)
  advise(
    "fan two's notice rows are erased by the delete",
    notices(ACTORS.fanTwo) === 0,
    `${notices(ACTORS.fanTwo)} row(s) left; growth=${removed.tasks.growth}`,
  );
finish();
