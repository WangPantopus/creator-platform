// Registration of the 20261015-sign-in-and-money wave (0249_w1_qelvora_sign_in
// from #431, 0250_w4_capture_guard from #410, 0251_w2_interrupted_cost_estimate
// from #433): on a stack built from nothing, the pins match, the ledger holds the
// wave, the database grants exactly the reviewed reach, and an export and a
// delete run through the real privacy API. Runs once against a freshly built
// lane 0 stack (a deleted fan stays closed; add --growth for the Growth login):
//   node infra/local/stack.mjs reset --lane 0 [--growth]
//   node tests/scenarios/integrator/sign-in-and-money-registration.mjs [--growth]
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ACTORS, call, key, reporter, signIn, sleep } from "../lane-2/lib.mjs";

const { step, advise, finish } = reporter();
const repo = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const BASE = "http://127.0.0.1:56401";
const growth = process.argv.includes("--growth");
const sql = (text) =>
  execFileSync(
    "docker",
    ["exec", "qelvora-lane0-postgres", "psql", "-U", "postgres"].concat([
      "-d",
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
const WAVE = [
  "0249_w1_qelvora_sign_in",
  "0250_w4_capture_guard",
  "0251_w2_interrupted_cost_estimate",
];

const pins = spawnSync(
  process.execPath,
  [join(repo, "infra/local/stack.mjs"), "catalogues", "check", "--lane", "0"],
  { cwd: repo, encoding: "utf8" },
);
const summary =
  (pins.stdout ?? "").split("\n").find((l) => /pin groups match/u.test(l)) ??
  "";
step(
  "the pinned catalogues match this database",
  growth ? /44 of 45/u.test(summary) : pins.status === 0,
  growth
    ? `${summary} (with the Growth login: the known runtimeCatalogues.family difference)`
    : summary,
);
const registered = JSON.parse(
  readFileSync(join(repo, "infra/migrations.json"), "utf8"),
).migrations.length;
const ledger = sql(
  `SELECT count(*)||' '||string_agg(version,',' ORDER BY version) FILTER (WHERE version IN (${WAVE.map((v) => `'${v}'`).join(",")})) FROM creator.schema_migration`,
);
step(
  "the ledger holds the whole registry, the three wave sources included",
  ledger === `${registered} ${WAVE.join(",")}`,
  ledger,
);

// The reach the review records: creator_runtime only, exactly the file's grants.
const reach = sql(
  `SELECT string_agg(t||':'||p, ' ' ORDER BY t,p) FROM (VALUES ('account'),('account_identity'),('sign_in_continuation'),('identity_grant'),('age_signal'),('age_lock')) AS r(t),
   LATERAL (SELECT string_agg(left(x,1),'' ORDER BY x) AS p FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) x
            WHERE has_table_privilege('creator_runtime','creator.'||t,x)) q`,
);
step(
  "creator_runtime reaches the sign-in tables exactly as reviewed",
  reach ===
    "account:ISU account_identity:DISU age_lock:IS age_signal:IS identity_grant:ISU sign_in_continuation:ISU",
  reach,
);
const others = sql(
  `SELECT count(*) FROM pg_roles r, unnest(ARRAY['account','account_identity','sign_in_continuation','identity_grant','age_signal','age_lock']) t
   WHERE r.rolname NOT IN ('creator_owner','creator_runtime','postgres') AND r.rolname !~ '^pg_' AND NOT r.rolsuper
     AND NOT pg_has_role(r.oid,'creator_runtime','MEMBER')
     AND has_table_privilege(r.oid,'creator.'||t,'SELECT')`,
);
step(
  "no other role can read them (PostgreSQL's built-in roles aside)",
  others === "0",
  `${others} role-table pair(s)`,
);
step(
  "identity_session accepts the qelvora mode",
  /qelvora/u.test(
    sql(
      "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='identity_session_mode_check'",
    ),
  ),
);
const guard = sql(
  `SELECT t.tgenabled::text||' '||pg_get_userbyid(p.proowner)||' '||has_function_privilege('creator_runtime',p.oid,'EXECUTE')
   FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
   WHERE t.tgname='commerce_capture_guard' AND t.tgrelid='creator.commerce_effect'::regclass`,
);
step(
  "the capture guard fires on commerce_effect, owned by creator_owner, callable by no role",
  guard === "O creator_owner false",
  guard,
);
const definition = sql(
  "SELECT encode(sha256(convert_to(pg_get_functiondef('creator.generation_begin_agent_attempt(uuid,uuid,text,text,bigint,text)'::regprocedure),'UTF8')),'hex')",
);
const review = JSON.parse(
  readFileSync(
    join(repo, "infra/migrations/reviews/20261015-sign-in-and-money.json"),
    "utf8",
  ),
);
step(
  "the admission function carries the reviewed 0251 definition",
  definition ===
    review.generationDefinitions[
      "creator.generation_begin_agent_attempt(uuid,uuid,text,text,bigint,text)"
    ].definitionChecksum,
  definition.slice(0, 12),
);

/** Create a privacy job as one account and poll its tasks until they settle. */
async function job(account, kind) {
  const { token } = await signIn(BASE, account);
  const created = await call(BASE, "POST", "/v1/trust/privacy/jobs", {
    token,
    body: {
      kind,
      scope: "account",
      proof: "LOCAL DEVELOPMENT",
      idempotencyKey: key("wave"),
    },
  });
  if (created.status !== 202)
    return { error: `${created.status} ${created.text.slice(0, 200)}` };
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
  } while (
    !(
      Object.keys(tasks).length &&
      Object.values(tasks).every(
        (s) => !/^(pending|running|queued|leased)\b/u.test(s),
      )
    ) &&
    Date.now() - began < 300_000
  );
  return { tasks, seconds: Math.round((Date.now() - began) / 1000) };
}
const show = (tasks = {}) =>
  Object.entries(tasks)
    .sort()
    .map(([d, s]) => `${d}=${s}`)
    .join(" ");
const exported = await job(ACTORS.fanOne, "export");
step(
  "an export as fan one: the five domains that can finish here finish",
  ["commerce", "content", "identity", "media", "trust"].every(
    (d) => exported.tasks?.[d] === "complete",
  ),
  exported.error ?? `${show(exported.tasks)} (${exported.seconds} s)`,
);
const removed = await job(ACTORS.fanTwo, "delete");
advise(
  "a delete as fan two settles in every domain (several refuse until retention is decided)",
  !removed.error && Object.keys(removed.tasks ?? {}).length > 0,
  removed.error ?? `${show(removed.tasks)} (${removed.seconds} s)`,
);
finish();
