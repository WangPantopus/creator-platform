// Registration of the 20261101-pilot-columns wave (0256_w1_passkey_retirement
// from #439, 0257_w7_invite_note from #397, 0258_w4_provider_inbox_worker from
// #425): on a fresh stack the pins match, the ledger holds the wave, the two
// columns have their reviewed shape and reach, the inbox login holds exactly
// its reviewed privileges, and an export and a delete run through the real
// privacy API. Runs once against a freshly built stack (a deleted fan stays
// closed; add --growth for the Growth login):
//   node infra/local/stack.mjs reset --lane 0 [--growth]
//   node tests/scenarios/integrator/pilot-columns-registration.mjs [--growth]
// REGISTRATION_LANE and REGISTRATION_BASE_PORT select another owned stack.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ACTORS, call, key, reporter, signIn, sleep } from "../lane-2/lib.mjs";

const { step, advise, finish } = reporter();
const repo = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const lane = process.env.REGISTRATION_LANE ?? "0";
const basePort = Number(process.env.REGISTRATION_BASE_PORT ?? 56400);
if (
  !/^[a-z0-9-]+$/u.test(lane) ||
  !Number.isSafeInteger(basePort) ||
  basePort < 1024 ||
  basePort > 65526
)
  throw new Error("Use an owned local stack lane and valid base port.");
const BASE = `http://127.0.0.1:${basePort + 1}`;
const registry = JSON.parse(
  readFileSync(join(repo, "infra/migrations.json"), "utf8"),
);
const wave = JSON.parse(
  readFileSync(
    join(repo, "infra/migrations/waves/20261101-pilot-columns.json"),
    "utf8",
  ),
).wave;
const growth = process.argv.includes("--growth");
const sql = (text) =>
  execFileSync(
    "docker",
    [
      "exec",
      `qelvora-lane${lane}-postgres`,
      "psql",
      "-U",
      "postgres",
      "-d",
      "creator_stack",
      "-qtA",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      text,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  )
    .toString()
    .trim();

const pins = spawnSync(
  process.execPath,
  [
    join(repo, "infra/local/stack.mjs"),
    "catalogues",
    "check",
    "--lane",
    lane,
    "--base-port",
    String(basePort),
  ],
  { cwd: repo, encoding: "utf8" },
);
const summary =
  (pins.stdout ?? "").split("\n").find((l) => /pin groups match/u.test(l)) ??
  "";
const pinFailures = (pins.stdout ?? "")
  .split("\n")
  .filter((line) => line.startsWith("FAIL  "));
// With the Growth login the single runtimeCatalogues.family pin stays the
// no-Growth diagnostic; the runtime accepts the original-incoming profile.
const expectedGrowthDifference =
  pins.status === 1 &&
  /48 of 49/u.test(summary) &&
  pinFailures.length === 1 &&
  pinFailures[0].startsWith("FAIL  runtimeCatalogues.family  ");
step(
  "the pinned catalogues match this database",
  growth ? expectedGrowthDifference : pins.status === 0,
  growth
    ? `${summary} (with the Growth login: the known runtimeCatalogues.family difference)`
    : summary,
);
const ledger = sql(
  `SELECT count(*)||' '||string_agg(version||'='||checksum,',' ORDER BY version) FILTER (WHERE version IN (${wave.map((s) => `'${s.version}'`).join(",")})) FROM creator.schema_migration`,
);
step(
  "the ledger holds the whole registry, the three wave sources with their checksums",
  ledger ===
    `${registry.migrations.length} ${wave.map((s) => `${s.version}=${s.checksum}`).join(",")}`,
  ledger.split(" ")[0],
);

const column = (table, name) =>
  sql(
    `SELECT format_type(atttypid,atttypmod)||' '||CASE WHEN attnotnull THEN 'not null' ELSE 'null' END||' '||coalesce(pg_get_expr(d.adbin,d.adrelid),'-')
     FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
     WHERE a.attrelid='${table}'::regclass AND a.attname='${name}' AND NOT a.attisdropped`,
  );
step(
  "passkey_credential.retired_at is a nullable timestamp with no default",
  column("creator.passkey_credential", "retired_at") ===
    "timestamp with time zone null -",
);
step(
  "invite.note is required text, empty by default, at most 600 characters",
  column("growth.invite", "note") === "text not null ''::text" &&
    /char_length\(note\) <= 600/u.test(
      sql(
        `SELECT string_agg(pg_get_constraintdef(oid),' ') FROM pg_constraint WHERE conrelid='growth.invite'::regclass AND contype='c'`,
      ),
    ),
);
const columnReach = (role, table, name) =>
  sql(
    `SELECT string_agg(p,'' ORDER BY p) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) p
     WHERE has_column_privilege('${role}','${table}','${name}',p)`,
  );
step(
  "creator_runtime reads, inserts and updates retired_at through its table grants",
  columnReach("creator_runtime", "creator.passkey_credential", "retired_at") ===
    "INSERTSELECTUPDATE",
);
step(
  "growth_runtime and growth_worker read, insert and update note through their table grants",
  ["growth_runtime", "growth_worker"].every(
    (role) =>
      columnReach(role, "growth.invite", "note") === "INSERTSELECTUPDATE",
  ),
);

// The inbox login: a separate login with exactly the file's privileges.
const attributes = sql(
  `SELECT concat_ws(',',rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolconfig IS NULL,
     NOT EXISTS(SELECT FROM pg_auth_members m WHERE m.member=r.oid OR m.roleid=r.oid),
     NOT EXISTS(SELECT FROM pg_class c WHERE c.relowner=r.oid) AND NOT EXISTS(SELECT FROM pg_proc p WHERE p.proowner=r.oid)
       AND NOT EXISTS(SELECT FROM pg_namespace n WHERE n.nspowner=r.oid))
   FROM pg_roles r WHERE rolname='creator_commerce_inbox'`,
);
step(
  "creator_commerce_inbox is a login with no inherited, elevated or member privileges, owning nothing",
  attributes === "t,f,f,f,f,f,f,t,t,t",
  attributes,
);
const grants = sql(
  `WITH r AS (SELECT oid FROM pg_roles WHERE rolname='creator_commerce_inbox'), acl AS (
     SELECT 'schema '||n.nspname AS object,a.privilege_type,a.is_grantable FROM pg_namespace n,LATERAL aclexplode(n.nspacl) a WHERE a.grantee=(SELECT oid FROM r)
     UNION ALL SELECT 'relation '||c.oid::regclass,a.privilege_type,a.is_grantable FROM pg_class c,LATERAL aclexplode(c.relacl) a WHERE a.grantee=(SELECT oid FROM r)
     UNION ALL SELECT 'column '||c.oid::regclass||'.'||t.attname,a.privilege_type,a.is_grantable FROM pg_attribute t JOIN pg_class c ON c.oid=t.attrelid,LATERAL aclexplode(t.attacl) a WHERE a.grantee=(SELECT oid FROM r)
     UNION ALL SELECT 'function '||p.oid::regprocedure,a.privilege_type,a.is_grantable FROM pg_proc p,LATERAL aclexplode(p.proacl) a WHERE a.grantee=(SELECT oid FROM r)
     UNION ALL SELECT 'default '||d.defaclobjtype,a.privilege_type,a.is_grantable FROM pg_default_acl d,LATERAL aclexplode(d.defaclacl) a WHERE a.grantee=(SELECT oid FROM r)
   ) SELECT string_agg(object||' '||privilege_type||CASE WHEN is_grantable THEN '*' ELSE '' END,'; ' ORDER BY object,privilege_type) FROM acl`,
);
const inbox = "creator.commerce_provider_inbox";
const expected = [
  ...[
    "attempt",
    "event_id",
    "event_type",
    "lease_until",
    "object_ref",
    "provider",
    "received_at",
    "state",
  ].map((name) => `column ${inbox}.${name} SELECT`),
  ...["attempt", "error_code", "lease_until", "state"].map(
    (name) => `column ${inbox}.${name} UPDATE`,
  ),
  "schema creator USAGE",
]
  .sort()
  .join("; ");
step(
  "it holds exactly schema USAGE, SELECT on 8 and UPDATE on 4 inbox columns, and nothing else",
  grants.split("; ").sort().join("; ") === expected,
  `${grants.split("; ").length} privileges`,
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
  return {
    id: created.json.id,
    token,
    tasks,
    seconds: Math.round((Date.now() - began) / 1000),
  };
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
if (growth) {
  // The creator writes an invitation note through the real API; with Growth
  // every domain can finish, so the creator's export downloads.
  const note = `Pilot columns registration ${key("note")}`;
  const { token } = await signIn(BASE, ACTORS.maya, "/studio/ai");
  const invite = await call(BASE, "POST", "/v1/growth/invites", {
    token,
    body: { contextId: null, note },
  });
  step(
    "Maya creates an invitation with a note",
    invite.status === 201 &&
      (await call(BASE, "GET", `/v1/growth/public/invites/${invite.json?.id}`))
        .json?.note === note,
    `${invite.status} ${invite.json?.error?.code ?? ""}`.trim(),
  );
  const creator = await job(ACTORS.maya, "export");
  const ready = Object.values(creator.tasks ?? {}).every(
    (s) => s === "complete",
  );
  step(
    "an export as Maya finishes in every domain",
    ready,
    creator.error ?? `${show(creator.tasks)} (${creator.seconds} s)`,
  );
  if (ready) {
    const download = await call(
      BASE,
      "GET",
      `/v1/trust/privacy/jobs/${creator.id}/download`,
      { token: creator.token, timeoutMs: 60000 },
    );
    const identity = (download.json?.domains ?? []).find(
      (d) => d.domain === "identity",
    );
    const passkeys = identity?.data?.passkeys;
    step(
      "the downloaded identity export carries retired_at on every passkey row",
      download.status === 200 &&
        Array.isArray(passkeys) &&
        passkeys.every((row) => Object.hasOwn(row, "retired_at")),
      `${download.status}, ${passkeys?.length ?? "no"} passkey row(s)`,
    );
    const growthFile = await fetch(
      `${BASE}/v1/trust/privacy/jobs/${creator.id}/download/growth`,
      { headers: { authorization: `Bearer ${creator.token}` } },
    );
    const invites = (await growthFile.text())
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((line) => line.collection === "invites");
    step(
      "the downloaded Growth export carries the note on every invitation row",
      growthFile.status === 200 &&
        invites.some((row) => row.data?.note === note) &&
        invites.every((row) => typeof row.data?.note === "string"),
      `${growthFile.status}, ${invites.length} invitation row(s)`,
    );
  }
}
const removed = await job(ACTORS.fanTwo, "delete");
advise(
  "a delete as fan two settles in every domain (several refuse until retention is decided)",
  !removed.error && Object.keys(removed.tasks ?? {}).length > 0,
  removed.error ?? `${show(removed.tasks)} (${removed.seconds} s)`,
);
finish();
