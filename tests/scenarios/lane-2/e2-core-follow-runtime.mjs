// Operated qualification for the additive held0185 registration. Run only after
// the source/upgrade profiles qualify, against an explicitly owned fresh123.
// Genuine API sessions, provider resolution, W1 audience scopes and composed W8
// negatives supply authority. This file never inserts a session, Follow or grant,
// constructs an Actor/scope, sets request GUCs, or changes an authority clock.
// PREPARED, UNRUN: durable same-stack resume and private original expiry-token
// checkpoints remain to be implemented before first operation. Current preflight
// refuses prior content/follows/deletion; never reset them to rerun this file.
// Devon carries one real signed follower Note; Maya stays empty for the existing
// 52-publication followers pagination. Account6 is permanently deletion-requested
// at the end and must never be reused, even if a downstream privacy task blocks.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  requestAuthority,
  holdCurrentRequestSession,
  assertHeldCurrentRequestSession,
} from "../../../apps/backend/src/modules/identity/request-authority.ts";
import { AudienceIdentityAuthority } from "../../../apps/backend/src/modules/identity/audience-scope.ts";
import { SessionService } from "../../../apps/backend/src/modules/identity/sessions.ts";
import { DevelopmentIdentityAdapter } from "../../../apps/backend/src/modules/identity/development.ts";
import { canonicalCoreContentFollows } from "../../../apps/backend/src/modules/growth/core-follows.ts";
import {
  coreFollowSource,
  registeredCoreFollowMigration,
} from "../../../apps/backend/src/modules/growth/core-follow-catalogue.ts";
import { trustLocalRestorationInTransaction } from "../../../apps/backend/src/modules/trust/restoration.ts";
import { createTrustRuntime } from "../../../apps/backend/src/operations/runtime.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const requireBackend = createRequire(join(root, "apps/backend/package.json"));
const { Client, Pool } = requireBackend("pg");
const { build } = requireBackend("esbuild");
const flag = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
};
const API = flag("--api"),
  WEB = flag("--web"),
  DB = flag("--db");
const runtimeDb = flag("--runtime-db", process.env.DATABASE_URL);
for (const value of [API, WEB, DB, runtimeDb]) {
  assert(
    value &&
      ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname),
  );
  assert(!new URL(value).search && !new URL(value).hash);
}
assert.equal(new URL(API).pathname, "/");
assert.equal(new URL(WEB).pathname, "/");
const adminLocation = new URL(DB);
function roleUrl(value, role) {
  assert(value, `Existing ${role} credentials must be supplied`);
  const location = new URL(value);
  assert(["postgres:", "postgresql:"].includes(location.protocol));
  assert.equal(location.host, adminLocation.host);
  assert.equal(location.pathname, adminLocation.pathname);
  assert.equal(location.username, role);
  assert(!location.search && !location.hash && location.password);
  return location.href;
}
roleUrl(runtimeDb, "creator_runtime");
const trustDb = roleUrl(
  process.env.TRUST_API_DATABASE_URL,
  "creator_trust_runtime",
);
const workerDb = roleUrl(
  process.env.TRUST_WORKER_DATABASE_URL,
  "creator_trust_worker",
);
const sessionKey = Buffer.from(
  process.env.IDENTITY_SESSION_KEY ?? "",
  "base64",
);
assert.equal(
  sessionKey.length,
  32,
  "Use this owned stack's existing session key",
);
assert(
  process.argv.includes("--allow-owned-block-restoration-and-account-delete"),
);
const out = resolve(flag("--out", ""));
assert(out !== root && !out.startsWith(root + sep));
await mkdir(out, { recursive: true, mode: 0o700 });
assert.equal((await stat(out)).mode & 0o077, 0);
Object.assign(process.env, {
  NODE_ENV: "development",
  TRUST_LOCAL_DEVELOPMENT: "true",
  LANE6_API: API,
  LANE6_WEB: WEB,
  LANE6_DB: DB,
});
const L = await import("../lane-6/e6-2-lib.mjs");
const creatorId = "20000000-0000-4000-8000-000000000002";
const untouchedCreator = "20000000-0000-4000-8000-000000000001";
const account = (number) =>
  `10000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const run = randomUUID();
const evidence = {
  run,
  observedAt: new Date().toISOString(),
  boundary:
    "owned fresh123; actual development provider sessions, W1 audience and W8 restoration/negative authority; actual API follows, synthetic external proof approved by real Ops, real passkey-signed follower Note; no manufactured authority or clock changes",
  steps: [],
};
const save = () =>
  writeFile(
    join(out, `core-follow-${run}.json`),
    JSON.stringify(evidence, null, 2),
    { mode: 0o600 },
  );
let currentStep = "owned source and resource preflight";
async function step(name, work) {
  currentStep = name;
  const detail = await work();
  evidence.steps.push({ name, detail });
  await save();
  console.log(`PASS ${name} :: ${JSON.stringify(detail)}`);
}
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(read, check, timeout = 10000, interval = 100) {
  const deadline = Date.now() + timeout;
  do {
    const result = await read();
    if (check(result)) return result;
    await sleep(interval);
  } while (Date.now() < deadline);
  throw new Error("operated_condition_timeout");
}
async function api(method, path, token, body, headers = {}) {
  const response = await fetch(API + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  return {
    status: response.status,
    json: await response.json().catch(() => null),
  };
}
function ok(response) {
  assert(
    response.status >= 200 && response.status < 300,
    `API refused ${response.status}/${response.json?.error?.code ?? response.json?.code ?? "unknown"}`,
  );
  return response.json;
}
function code(error) {
  return typeof error?.code === "string"
    ? error.code
    : (error?.name ?? "Error");
}
async function refuses(work, expected) {
  let observed;
  try {
    await work();
  } catch (error) {
    observed = code(error);
  }
  assert.equal(observed, expected);
  return { code: observed };
}
const configuration = {
  connectionTimeoutMillis: 5000,
  query_timeout: 5000,
  max: 5,
};
const admin = new Client({ ...configuration, connectionString: DB });
const core = new Pool({ ...configuration, connectionString: runtimeDb });
const trustPool = new Pool({ ...configuration, connectionString: trustDb });
const workerPool = new Pool({ ...configuration, connectionString: workerDb });
const sessions = new SessionService(
  core,
  new DevelopmentIdentityAdapter(WEB, "development"),
  sessionKey,
);
let host,
  audience,
  following,
  browser,
  note,
  expiry,
  main,
  owner,
  ops,
  deletionFan;
async function login(number, createFan = false) {
  const started = ok(
    await api("POST", "/v1/identity/continue", undefined, {
      returnTo: "/home",
    }),
  );
  const completed = ok(
    await api("POST", "/v1/identity/complete", undefined, {
      continuationId: started.continuationId,
      code: account(number),
    }),
  );
  assert.equal(typeof completed.token, "string");
  const resolved = await sessions.resolve(completed.token);
  assert.equal(resolved.actor.accountId, account(number));
  assert.equal(resolved.actor.adultEligible, true);
  assert(Object.isFrozen(resolved.actor));
  let fanId = (
    await admin.query(
      "SELECT id FROM creator.fan_profile WHERE account_id=$1",
      [account(number)],
    )
  ).rows[0]?.id;
  if (createFan && !fanId)
    fanId = ok(
      await api("POST", "/v1/identity/fan-profile", completed.token, {
        handle: `follow${number}${run.slice(0, 6)}`,
        intro: "",
      }),
    ).id;
  if (createFan) assert(fanId);
  return { token: completed.token, number, resolved, fanId };
}
// The record is populated solely with SessionService's actual provider result.
// A callback never receives a locally constructed Actor or adult timestamp.
async function inRequest(session, work, resolved) {
  const current = resolved ?? (await sessions.resolve(session.token));
  return requestAuthority.run(
    {
      accountId: current.actor.accountId,
      sessionId: current.sessionId,
      actor: current.actor,
      adultVerifiedAt: current.adultVerifiedAt,
    },
    () => work(current),
  );
}
async function custody(client) {
  const state = (
    await client.query(
      "SELECT pg_backend_pid() AS pid,pg_current_xact_id_if_assigned()::text AS transaction,current_user AS role,session_user AS login,current_setting('transaction_isolation') AS isolation,nullif(current_setting('app.account_id',true),'') AS account_id,nullif(current_setting('app.creator_id',true),'') AS creator_id,nullif(current_setting('app.fan_id',true),'') AS fan_id,nullif(current_setting('app.identity_session_id',true),'') AS session_id",
    )
  ).rows[0];
  assert.equal(state.role, "creator_runtime");
  assert.equal(state.login, state.role);
  assert.equal(state.isolation, "read committed");
  assert(state.transaction);
  return state;
}
async function withFamily(session, work, options = {}) {
  return inRequest(
    session,
    async (current) => {
      const scope = await audience.open(current.actor, creatorId);
      const client = await core.connect();
      try {
        await client.query("BEGIN");
        await audience.authorizeInTransaction(scope, client);
        const before = await custody(client);
        assert.equal(before.account_id, current.actor.accountId);
        assert.equal(before.creator_id, creatorId);
        assert.equal(before.fan_id, scope.fanId);
        assert.equal(before.session_id, current.sessionId);
        const value = await work(client, current, before, scope);
        if (!options.settles) assert.deepEqual(await custody(client), before);
        return value;
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    },
    options.resolved,
  );
}
const readFollow = (session, expected, callback = following) =>
  withFamily(session, async (client, current, binding) => {
    const value = await callback(client, current.actor.accountId, creatorId);
    assert.equal(value, expected);
    return { following: value, binding };
  });
async function follow(session, value) {
  const response = ok(
    await api("PUT", `/v1/growth/follow/${creatorId}`, session.token, {
      following: value,
    }),
  );
  const actual = ok(
    await api("GET", `/v1/growth/follow/${creatorId}`, session.token),
  );
  assert.equal(actual.following, value);
  return response;
}
async function browserLogin(page, number, path) {
  await page.goto(`${WEB}/auth/continue?returnTo=${encodeURIComponent(path)}`);
  await page.getByText("Continue with Pantopus").first().click();
  const caps = ok(await api("GET", "/v1/identity/capabilities"));
  const development = caps.developmentActors.find(
    (item) => item.id === account(number),
  );
  assert(development);
  await page
    .getByRole("button", { name: development.label, exact: true })
    .click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
    timeout: 60000,
  });
  if (new URL(page.url()).pathname === "/onboarding/handle") {
    await page.locator("#handle").fill(`followweb${number}${run.slice(0, 6)}`);
    await page.locator("button.handle-continue").click();
    await page.waitForURL((url) => url.pathname !== "/onboarding/handle");
  }
  if (new URL(page.url()).pathname !== path) await page.goto(WEB + path);
}
async function beginThread(session) {
  const caps = ok(
    await api("GET", "/v1/conversations/capabilities", session.token),
  );
  assert.equal(typeof caps.providers?.version, "string");
  assert.equal(caps.generationAvailable, true);
  const result = ok(
    await api("POST", "/v1/conversations/begin", session.token, {
      creatorId,
      policyVersion: caps.providers.version,
      accessNoticeAccepted: true,
      idempotencyKey: `core-follow-begin-${run}-${session.number}`,
    }),
  );
  assert.equal(result.creatorId, creatorId);
  assert.equal(result.fanId, session.fanId);
  assert.equal(result.canSend, true);
  assert.equal(result.consentCurrent, true);
  const stored = (
    await admin.query(
      "SELECT t.creator_id,t.fan_id,t.processor_consent_version,f.account_id FROM creator.thread t JOIN creator.fan_profile f ON f.id=t.fan_id WHERE t.id=$1 AND t.deleted_at IS NULL",
      [result.threadId],
    )
  ).rows[0];
  assert.deepEqual(stored, {
    creator_id: creatorId,
    fan_id: session.fanId,
    processor_consent_version: caps.providers.version,
    account_id: account(session.number),
  });
  return {
    threadId: result.threadId,
    policyVersion: caps.providers.version,
    grantBoundary:
      "Actual begin may issue its ordinary trial; no grant inserted by scenario",
  };
}

async function contentRead(session) {
  const response = await api(
    "GET",
    `/v1/content/${creatorId}/${note.id}`,
    session.token,
  );
  const value = ok(response);
  assert.equal(value.id, note.id);
  assert.equal(value.signedActId, note.signed_act_id);
  assert.equal(value.document.text, note.document.text);
  assert.equal(value.document.audience.kind, "followers");
  return {
    status: response.status,
    noteId: value.id,
    signedActId: value.signedActId,
  };
}
async function contentRefuses(session, status, expectedCode) {
  const response = await api(
    "GET",
    `/v1/content/${creatorId}/${note.id}`,
    session.token,
  );
  assert.equal(response.status, status);
  const failure = response.json?.error?.code ?? response.json?.code;
  if (expectedCode) assert.equal(failure, expectedCode);
  assert(!JSON.stringify(response.json).includes(note.document.text));
  return { status: response.status, code: failure };
}

try {
  await admin.connect();
  const installed = (
    await admin.query(
      "SELECT version,checksum FROM creator.schema_migration ORDER BY version",
    )
  ).rows;
  assert.equal(installed.length, 123);
  const descriptor = await registeredCoreFollowMigration();
  assert(
    descriptor,
    "Additive executable registration must be qualified before operation",
  );
  assert.equal(descriptor.version, "0255_w7_core_follow_metadata");
  assert.equal(descriptor.checksum, coreFollowSource.checksum);
  assert(
    installed.some(
      (entry) =>
        entry.version === descriptor.version &&
        entry.checksum === descriptor.checksum,
    ),
  );
  assert(
    !installed.some(
      (entry) => entry.version === "0185_w7_core_follow_metadata",
    ),
  );
  const binding = {
    api: new URL(API).origin,
    web: new URL(WEB).origin,
    database: {
      host: adminLocation.hostname,
      port: adminLocation.port,
      database: decodeURIComponent(adminLocation.pathname.slice(1)),
      systemIdentifier: (
        await admin.query(
          "SELECT system_identifier::text FROM pg_control_system()",
        )
      ).rows[0].system_identifier,
    },
  };
  evidence.binding = binding;
  evidence.release = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  evidence.descriptor = descriptor;
  const existingDeletion = (
    await admin.query(
      "SELECT id,account_id,state,created_at::text FROM creator_trust.privacy_job WHERE kind='delete' AND scope='account' AND account_id=ANY($1::uuid[])",
      [[account(2), account(4), account(5), account(6)]],
    )
  ).rows;
  if (existingDeletion.length) {
    evidence.existingDeletion = existingDeletion;
    await save();
    throw new Error(
      "Existing deletion: preserve actors and original job; no fresh sessions issued",
    );
  }
  const existingContent = (
    await admin.query(
      "SELECT id,creator_id FROM creator.content_index WHERE creator_id=ANY($1::uuid[])",
      [[creatorId, untouchedCreator]],
    )
  ).rows;
  assert.equal(
    existingContent.length,
    0,
    "Use a fresh separate stack; preserve all existing publications",
  );
  const existingFollows = (
    await admin.query(
      "SELECT account_id,creator_id FROM growth.follow WHERE account_id=ANY($1::uuid[]) AND creator_id=$2",
      [[account(2), account(4), account(6)], creatorId],
    )
  ).rows;
  assert.equal(existingFollows.length, 0, "Preserve pre-existing Follow state");
  assert.equal(
    (
      await admin.query(
        "SELECT account_id FROM creator.creator_profile WHERE id=$1 AND verification='verified'",
        [creatorId],
      )
    ).rows[0]?.account_id,
    account(5),
  );
  const restored = trustLocalRestorationInTransaction({
    NODE_ENV: "development",
    TRUST_LOCAL_DEVELOPMENT: "true",
    DATABASE_URL: runtimeDb,
  });
  host = await createTrustRuntime({
    environment: "local-development",
    identityMode: "development",
    release: evidence.release,
    origin: API,
    apiPool: trustPool,
    workerPool,
    actor: async () => {
      throw new Error(
        "Provider sessions are resolved explicitly on the original core pool",
      );
    },
    dependencies: {},
    privacyHooks: [],
    effectHooks: [],
    probes: [],
    crisisResources: [],
    restoreReadyInTransaction: restored,
    restoreReady: async () => {
      const client = await core.connect();
      try {
        await client.query("BEGIN");
        return await restored(client);
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    },
  });
  audience = new AudienceIdentityAuthority(core, {
    mode: "development",
    assertAllowed: host.assertAudienceAllowed,
  });
  following = canonicalCoreContentFollows(descriptor);
  // Issue the untouched expiry session first; its original15-minute wall-clock
  // lifetime runs during the real browser/lock workflows and is never refreshed.
  expiry = await login(2, true);
  evidence.expirySession = {
    sessionId: expiry.resolved.sessionId,
    accountId: expiry.resolved.actor.accountId,
    expiresAt: expiry.resolved.expiresAt,
  };
  await save();
  main = await login(2, true);
  owner = await login(5);
  ops = await login(4);
  deletionFan = await login(6, true);
  await step("genuine non-fan identity cannot open an audience", async () => {
    const nonfan = await login(3);
    assert.equal(nonfan.fanId, undefined);
    const result = await inRequest(nonfan, (current) =>
      refuses(
        () => audience.open(current.actor, creatorId),
        "audience_unavailable",
      ),
    );
    assert.equal(
      (
        await admin.query(
          "SELECT count(*)::int AS count FROM creator.fan_profile WHERE account_id=$1",
          [account(3)],
        )
      ).rows[0].count,
      0,
    );
    return result;
  });
  await step(
    "genuine current non-follower returns false on its held family client",
    () => readFollow(main, false),
  );
  await step(
    "Devon publishes the ordinary synthetic local AI before Follow and conversations",
    async () => {
      // Stock startup publishes Maya only. Reuse seed-maya's actual Studio
      // workflow for Devon, with its named synthetic license and model fake.
      // This creates no conversation, trial or policy record by SQL.
      const agent = `/v1/agent/${creatorId}`;
      const state = () => api("GET", `${agent}/state`, owner.token).then(ok);
      const send = (method, path, body) =>
        api(method, agent + path, owner.token, body, {
          "Idempotency-Key": `core-follow-ai-${randomUUID()}`,
        }).then(ok);
      let current = await state();
      if (current.liveVersion && !current.paused)
        return { reusedLiveVersion: current.liveVersion.id };
      assert(
        !current.liveVersion,
        "Do not replace or resume another existing AI publication",
      );
      await send("PUT", "/draft", {
        expectedRevision: current.revision,
        configuration: {
          mode: "companion",
          tone: "As written",
          styleCard: "",
          examples: [],
          rules: ["Always say you are the creator's AI, never the creator."],
          neverReveal: ["home address"],
          handoff: "Offer to ask Devon to step in when a question needs him.",
          dailyCostCapMicros: 5000000,
          sessionNudgeMinutes: 90,
          usefulnessCriteria: "Helpful, specific and honest about being an AI.",
          styleCriteria: "Warm, plain and short.",
        },
      });
      const termEndsAt = new Date(Date.now() + 365 * 86400000).toISOString();
      await send("POST", "/license", {
        proofReference: `development-synthetic:${creatorId}`,
        counselVersion: "development-synthetic-unreviewed",
        permittedUses: ["text_ai"],
        termEndsAt,
      });
      evidence.devonAi = {
        boundary:
          "Actual Studio APIs; named development synthetic license and local model fake",
        termEndsAt,
      };
      await save();
      current = await state();
      await send("POST", "/evaluations", {
        expectedRevision: current.revision,
      });
      current = await until(
        state,
        (value) => value.evaluation && value.evaluation.state !== "running",
        120000,
        1000,
      );
      assert.equal(current.evaluation.state, "passed");
      const evaluationId = current.evaluation.id;
      await send("POST", "/publish", {
        expectedRevision: current.revision,
        evaluationId,
        changes:
          "Initial synthetic Devon publication for genuine follower qualification conversations",
      });
      current = await state();
      assert(current.liveVersion && !current.paused);
      Object.assign(evidence.devonAi, {
        evaluationId,
        liveVersionId: current.liveVersion.id,
      });
      return evidence.devonAi;
    },
  );
  await step(
    "real Follow API produces true on the same current family",
    async () => {
      await follow(main, true);
      return readFollow(main, true);
    },
  );
  await step("absent family and wrong current pairs refuse", async () => {
    const absentFamily = await inRequest(main, async (current) => {
      const client = await core.connect();
      try {
        await client.query("BEGIN");
        return await refuses(
          () => following(client, current.actor.accountId, creatorId),
          "growth_core_follow_unconfigured",
        );
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    });
    const pairs = await withFamily(main, async (client, current) => ({
      wrongAccount: await refuses(
        () => following(client, account(6), creatorId),
        "growth_core_follow_unconfigured",
      ),
      wrongCreator: await refuses(
        () => following(client, current.actor.accountId, untouchedCreator),
        "growth_core_follow_unconfigured",
      ),
      unconfigured: await refuses(
        () =>
          canonicalCoreContentFollows()(
            client,
            current.actor.accountId,
            creatorId,
          ),
        "growth_core_follow_unconfigured",
      ),
    }));
    return { absentFamily, ...pairs };
  });
  const registryPath = join(root, "infra/migrations.json"),
    registryBytes = await readFile(registryPath);
  const registry = JSON.parse(registryBytes.toString("utf8")),
    executable = {};
  for (const entry of registry.migrations) {
    const checksum = createHash("sha256")
      .update(await readFile(join(root, entry.path)))
      .digest("hex");
    if (entry.sourceSha256) assert.equal(checksum, entry.sourceSha256);
    executable[entry.version] = {
      path: entry.path,
      owner: entry.owner,
      checksum,
    };
  }
  assert.equal(Object.keys(executable).length, 123);
  assert.deepEqual(
    installed,
    Object.entries(executable)
      .map(([version, value]) => ({ version, checksum: value.checksum }))
      .sort((a, b) =>
        a.version < b.version ? -1 : a.version > b.version ? 1 : 0,
      ),
  );
  const registered = executable[descriptor.version];
  assert.deepEqual(registered, {
    path: coreFollowSource.path,
    owner: coreFollowSource.owner,
    checksum: coreFollowSource.checksum,
  });
  async function compiled(
    variant,
    sources,
    expected,
    supplied = descriptor,
    profileOverride,
  ) {
    const outfile = join(out, `${variant}-${run}.mjs`);
    await build({
      stdin: {
        contents: `import {requestAuthority} from './apps/backend/src/modules/identity/request-authority.ts';import {canonicalCoreContentFollows} from './apps/backend/src/modules/growth/core-follows.ts';export const check=(client,current,descriptor,account,creator)=>requestAuthority.run({accountId:current.actor.accountId,sessionId:current.sessionId,actor:current.actor,adultVerifiedAt:current.adultVerifiedAt},()=>canonicalCoreContentFollows(descriptor)(client,account,creator));`,
        resolveDir: root,
        sourcefile: `${variant}.ts`,
        loader: "ts",
      },
      outfile,
      bundle: true,
      platform: "node",
      target: "node22",
      format: "esm",
      define: {
        __QELVORA_REGISTERED_MIGRATION_SOURCES__: JSON.stringify(sources),
      },
      plugins: profileOverride
        ? [
            {
              name: "compiled-core-follow-profile-drift",
              setup(builder) {
                builder.onLoad(
                  {
                    filter:
                      /[/\\]infra[/\\]migrations[/\\]reviews[/\\]20261027-core-follow\.json$/u,
                  },
                  async (args) => ({
                    contents: JSON.stringify({
                      ...JSON.parse(await readFile(args.path, "utf8")),
                      ...profileOverride,
                    }),
                    loader: "json",
                  }),
                );
              },
            },
          ]
        : [],
      logLevel: "silent",
    });
    const candidate = await import(pathToFileURL(outfile).href);
    return withFamily(main, async (client, current, held) => {
      const invoke = () =>
        candidate.check(
          client,
          current,
          supplied,
          current.actor.accountId,
          creatorId,
        );
      const result =
        expected === true
          ? { following: await invoke() }
          : await refuses(invoke, expected);
      if (expected === true) assert.equal(result.following, true);
      return {
        ...result,
        binding: held,
        bundleSha256: createHash("sha256")
          .update(await readFile(outfile))
          .digest("hex"),
      };
    });
  }
  await step(
    "exact123 compiled executable and reviewed catalogue admit true",
    () => compiled("registered", executable, true),
  );
  await step(
    "matching installed function and ledger cannot activate omitted executable registration",
    async () => {
      const omitted = { ...executable };
      delete omitted[descriptor.version];
      return compiled("omitted", omitted, "growth_core_follow_unconfigured");
    },
  );
  for (const [field, drift] of [
    ["checksum", "0".repeat(64)],
    [
      "path",
      "apps/backend/src/modules/growth/migrations/pending_w7_core_follow_metadata_drift.sql",
    ],
    ["owner", "W1"],
  ]) {
    await step(`compiled executable ${field} drift refuses`, () =>
      compiled(
        `wrong-${field}`,
        {
          ...executable,
          [descriptor.version]: { ...registered, [field]: drift },
        },
        "reviewed_migration_unavailable",
      ),
    );
  }
  await step(
    "caller descriptor cannot replace the reviewed function definition",
    () =>
      compiled(
        "wrong-definition",
        executable,
        "growth_core_follow_unconfigured",
        { ...descriptor, functionDefinitionSha256: "0".repeat(64) },
      ),
  );
  await step(
    "compiled catalogue pin drift refuses despite exact source and ledger",
    () =>
      compiled(
        "wrong-catalogue-pins",
        executable,
        "growth_core_follow_unconfigured",
        descriptor,
        {
          coreFollowCatalogueChecksum: "0".repeat(64),
          coreFollowIncomingCatalogueChecksum: "0".repeat(64),
        },
      ),
  );
  await step(
    "compiled refusals preserve all installed SQL and ledger custody",
    async () => {
      assert.deepEqual(await readFile(registryPath), registryBytes);
      assert.deepEqual(
        (
          await admin.query(
            "SELECT version,checksum FROM creator.schema_migration ORDER BY version",
          )
        ).rows,
        installed,
      );
      assert.equal(
        createHash("sha256")
          .update(await readFile(join(root, coreFollowSource.path)))
          .digest("hex"),
        coreFollowSource.checksum,
      );
      return compiled("registered-again", executable, true);
    },
  );
  await step(
    "actual negative-key contention refuses before Follow metadata",
    async () => {
      await admin.query("BEGIN");
      try {
        await admin.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [`w8-denial:creator:${creatorId}`],
        );
        const started = Date.now();
        const refused = await refuses(
          () => readFollow(main, true),
          "scope_denial_unavailable",
        );
        assert(Date.now() - started < 4000);
        return { ...refused, elapsedMs: Date.now() - started };
      } finally {
        await admin.query("ROLLBACK");
      }
    },
  );
  await step("negative release restores true on the same genuine pair", () =>
    readFollow(main, true),
  );
  await step(
    "Follow row contention refuses without waiting and releases cleanly",
    async () => {
      await admin.query("BEGIN");
      let result;
      try {
        assert.equal(
          (
            await admin.query(
              "SELECT account_id FROM growth.follow WHERE account_id=$1 AND creator_id=$2 FOR UPDATE",
              [account(2), creatorId],
            )
          ).rowCount,
          1,
        );
        const started = Date.now();
        result = await withFamily(main, (client, current) =>
          refuses(
            () => following(client, current.actor.accountId, creatorId),
            "growth_core_follow_unconfigured",
          ),
        );
        assert(Date.now() - started < 4000);
      } finally {
        await admin.query("ROLLBACK");
      }
      return { busy: result, released: await readFollow(main, true) };
    },
  );
  for (const settlement of ["ROLLBACK", "COMMIT"])
    await step(
      `actual Unfollow waits for held Follow ${settlement.toLowerCase()}`,
      async () => {
        await follow(main, true);
        const writer = await login(2);
        let pending,
          settled = false;
        const held = await withFamily(
          main,
          async (client, current, original) => {
            assert.equal(
              await following(client, current.actor.accountId, creatorId),
              true,
            );
            pending = api(
              "PUT",
              `/v1/growth/follow/${creatorId}`,
              writer.token,
              { following: false },
            ).then(
              (result) => {
                settled = true;
                return result;
              },
              (error) => {
                settled = true;
                return { transportError: code(error) };
              },
            );
            try {
              const blocked = await until(
                async () =>
                  (
                    await admin.query(
                      "SELECT a.pid,a.usename,a.wait_event_type,a.wait_event,ARRAY(SELECT l.locktype FROM pg_locks l WHERE l.pid=a.pid AND NOT l.granted ORDER BY l.locktype) AS waiting_locks FROM pg_stat_activity a WHERE $1=ANY(pg_blocking_pids(a.pid)) ORDER BY a.pid",
                      [original.pid],
                    )
                  ).rows,
                (rows) => rows.length > 0,
                4000,
              );
              assert.equal(settled, false);
              assert(
                blocked.every(
                  (row) =>
                    row.usename === "creator_review_growth_api" &&
                    row.waiting_locks.includes("transactionid"),
                ),
              );
              await client.query(settlement);
              return { binding: original, blocked };
            } finally {
              if (!settled) await client.query("ROLLBACK");
            }
          },
          { settles: true },
        );
        const response = await pending;
        ok(response);
        return {
          ...held,
          apiStatus: response.status,
          after: await readFollow(main, false),
        };
      },
    );
  await follow(main, true);
  await step(
    "opaque current-session lease refuses another client and a settled transaction",
    () =>
      withFamily(
        main,
        async (client, current, _binding, scope) => {
          const lease = await holdCurrentRequestSession(
              client,
              current.actor.accountId,
            ),
            other = await core.connect();
          let crossClient, missingFamily, freshAuthority;
          try {
            await other.query("BEGIN");
            crossClient = await refuses(
              () => assertHeldCurrentRequestSession(lease, other),
              "held_request_session_required",
            );
            missingFamily = await refuses(
              () => following(other, current.actor.accountId, creatorId),
              "growth_core_follow_unconfigured",
            );
            // A genuine AudienceScope can authorize a new transaction. The
            // original opaque held-session lease still cannot move with it.
            await audience.authorizeInTransaction(scope, other);
            assert.equal(
              await following(other, current.actor.accountId, creatorId),
              true,
            );
            freshAuthority = await custody(other);
            assert.notEqual(freshAuthority.pid, (await custody(client)).pid);
            await refuses(
              () => assertHeldCurrentRequestSession(lease, other),
              "held_request_session_required",
            );
          } finally {
            await other.query("ROLLBACK");
            other.release();
          }
          await client.query("COMMIT");
          await client.query("BEGIN");
          const stale = await refuses(
            () => assertHeldCurrentRequestSession(lease, client),
            "held_request_transaction_ended",
          );
          const staleCallback = await refuses(
            () => following(client, current.actor.accountId, creatorId),
            "growth_core_follow_unconfigured",
          );
          return {
            crossClient,
            missingFamily,
            freshAuthority,
            stale,
            staleCallback,
          };
        },
        { settles: true },
      ),
  );
  await step(
    "genuine logout revokes the original resolved session",
    async () => {
      const revoked = await login(2),
        original = await sessions.resolve(revoked.token);
      ok(await api("POST", "/v1/identity/logout", revoked.token));
      assert.equal(
        (await api("GET", "/v1/identity/session", revoked.token)).status,
        401,
      );
      return {
        resolver: await refuses(
          () => sessions.resolve(revoked.token),
          "session_expired",
        ),
        audience: await refuses(
          () =>
            withFamily(
              revoked,
              () => assert.fail("revoked audience admitted"),
              { resolved: original },
            ),
          "session_expired",
        ),
      };
    },
  );
  await step(
    "actual closed restoration marker refuses then reopens",
    async () => {
      const database = (
        await admin.query(
          "SELECT datname,shobj_description(oid,'pg_database') AS comment FROM pg_database WHERE datname=current_database()",
        )
      ).rows[0];
      assert.notEqual(
        database.comment,
        "creator-platform:restored-traffic-closed",
      );
      const identifier = `"${database.datname.replaceAll('"', '""')}"`,
        literal =
          database.comment === null
            ? "NULL"
            : `'${database.comment.replaceAll("'", "''")}'`;
      await admin.query(
        `COMMENT ON DATABASE ${identifier} IS 'creator-platform:restored-traffic-closed'`,
      );
      let closed;
      try {
        closed = await refuses(
          () => readFollow(main, true),
          "restoration_pending",
        );
      } finally {
        await admin.query(`COMMENT ON DATABASE ${identifier} IS ${literal}`);
      }
      return { closed, reopened: await readFollow(main, true) };
    },
  );
  await step(
    "synthetic Devon proof is approved through actual Ops authority",
    async () => {
      const proof = ok(
        await api("POST", `/v1/identity/${creatorId}/proof`, owner.token, {
          platform: "instagram",
          accountUrl:
            "https://instagram.com/local_synthetic_follow_qualification",
        }),
      );
      evidence.proof = { id: proof.id };
      await save();
      ok(
        await api(
          "POST",
          `/v1/identity/proof/${proof.id}/submit`,
          owner.token,
          { postUrl: `https://instagram.com/p/${proof.code}` },
        ),
      );
      ok(
        await api("POST", "/v1/trust/reports", owner.token, {
          kind: "verification",
          creatorId,
          reason: `Synthetic core Follow engineering proof ${run}; no external ownership claim.`,
          idempotencyKey: randomUUID(),
        }),
      );
      const cases = ok(
        await api("GET", "/v1/trust/cases?queue=verification", ops.token),
      ).items;
      const stored = (
        await admin.query(
          "SELECT id FROM creator_trust.safety_case WHERE creator_id=$1 AND reason LIKE $2 AND kind='verification'",
          [creatorId, `%${run}%`],
        )
      ).rows[0];
      assert(stored && cases.some((item) => item.id === stored.id));
      ok(
        await api("POST", `/v1/trust/cases/${stored.id}/access`, ops.token, {
          purpose:
            "Evaluate synthetic local creator proof for follower engineering qualification.",
          minutes: 15,
        }),
      );
      const detail = ok(
        await api("GET", `/v1/trust/cases/${stored.id}`, ops.token),
      );
      ok(
        await api("POST", `/v1/trust/cases/${stored.id}/decisions`, ops.token, {
          version: detail.version,
          resolution: "verify_creator",
          reason:
            "Synthetic proof accepted only for this isolated local engineering scenario.",
          idempotencyKey: randomUUID(),
        }),
      );
      await until(
        async () =>
          (
            await admin.query(
              "SELECT state FROM creator.creator_proof WHERE id=$1",
              [proof.id],
            )
          ).rows[0],
        (row) => row?.state === "approved",
        90000,
      );
      evidence.proof.caseId = stored.id;
      return evidence.proof;
    },
  );
  browser = await L.launch();
  const creatorPage = await L.phone(browser),
    fanPage = await L.phone(browser);
  await step(
    "real virtual-device passkey publishes one signed follower Note",
    async () => {
      await browserLogin(creatorPage.page, 5, "/studio/setup");
      await L.registerPasskey(creatorPage.page);
      const text = `Real follower authority qualification ${run}.`;
      evidence.noteIntent = { creatorId, text };
      await save();
      await creatorPage.page.goto(
        `${WEB}/studio/${creatorId}/compose?from=today`,
      );
      await creatorPage.page
        .getByRole("button", { name: "Followers", exact: true })
        .click();
      await creatorPage.page.locator("#note-text").fill(text);
      await creatorPage.page
        .getByRole("button", { name: "Review and sign", exact: true })
        .click();
      await creatorPage.page
        .getByRole("button", { name: "Sign with your passkey", exact: true })
        .click();
      await creatorPage.page.waitForURL((url) =>
        url.pathname.endsWith("/today"),
      );
      note = (
        await admin.query(
          "SELECT i.id,i.version,i.state,p.signed_act_id,r.document,a.account_id,a.creator_id,a.subject_id,a.act_type FROM creator.content_index i JOIN creator.content_revision r ON r.content_id=i.id AND r.version=i.version JOIN creator.content_publication p ON p.content_id=i.id AND p.version=i.version JOIN creator.signed_act a ON a.id=p.signed_act_id WHERE i.creator_id=$1 AND r.document->>'text'=$2",
          [creatorId, text],
        )
      ).rows[0];
      assert.equal(note?.state, "published");
      assert.equal(note.document.audience.kind, "followers");
      assert.equal(note.account_id, account(5));
      assert.equal(note.creator_id, creatorId);
      assert.equal(note.subject_id, note.id);
      assert.equal(note.act_type, "broadcast");
      evidence.note = note;
      await save();
      const signature = ok(
        await api("GET", `/v1/identity/signed-acts/${note.signed_act_id}`),
      );
      assert.equal(signature.status, "valid");
      assert.equal(signature.signedActId, note.signed_act_id);
      return {
        id: note.id,
        version: note.version,
        signedActId: note.signed_act_id,
        signatureStatus: signature.status,
      };
    },
  );
  await step(
    "actual follower content and web thread display the accepted signed Note",
    async () => {
      const content = await contentRead(main);
      const thread = await beginThread(main);
      await browserLogin(
        fanPage.page,
        2,
        `/threads/${creatorId}/${main.fanId}`,
      );
      await fanPage.page
        .getByText(note.document.text, { exact: true })
        .waitFor({ timeout: 30000 });
      await fanPage.page
        .locator(`a[href='/verify/${note.signed_act_id}']`)
        .first()
        .waitFor();
      await fanPage.page.screenshot({
        path: join(out, `follower-note-${run}.png`),
        fullPage: true,
      });
      return { ...content, ...thread };
    },
  );
  await step(
    "actual Content HTTP path retains the original negative gate",
    async () => {
      await admin.query("BEGIN");
      let denied;
      try {
        await admin.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [`w8-denial:creator:${creatorId}`],
        );
        const started = Date.now();
        denied = await contentRefuses(main, 503, "scope_denial_unavailable");
        assert(Date.now() - started < 4000);
      } finally {
        await admin.query("ROLLBACK");
      }
      return { denied, released: await contentRead(main) };
    },
  );
  await step(
    "actual Content HTTP path refuses the closed restored catalogue",
    async () => {
      const database = (
        await admin.query(
          "SELECT datname,shobj_description(oid,'pg_database') AS comment FROM pg_database WHERE datname=current_database()",
        )
      ).rows[0];
      assert.notEqual(
        database.comment,
        "creator-platform:restored-traffic-closed",
      );
      const identifier = `"${database.datname.replaceAll('"', '""')}"`,
        literal =
          database.comment === null
            ? "NULL"
            : `'${database.comment.replaceAll("'", "''")}'`;
      await admin.query(
        `COMMENT ON DATABASE ${identifier} IS 'creator-platform:restored-traffic-closed'`,
      );
      let closed;
      try {
        closed = await contentRefuses(main, 503, "restoration_pending");
      } finally {
        await admin.query(`COMMENT ON DATABASE ${identifier} IS ${literal}`);
      }
      return { closed, reopened: await contentRead(main) };
    },
  );
  await step(
    "real Unfollow removes content authority and Follow restores it",
    async () => {
      await follow(main, false);
      const denied = await contentRefuses(main, 403);
      const absent = await readFollow(main, false);
      await follow(main, true);
      const restoredContent = await contentRead(main);
      return {
        deniedStatus: denied.status,
        absent,
        restoredStatus: restoredContent.status,
        restoredFollow: await readFollow(main, true),
      };
    },
  );
  await step(
    "real blocked fan loses audience authority while the original fan remains admitted",
    async () => {
      const blocked = await login(4, true);
      await follow(blocked, true);
      const before = await readFollow(blocked, true),
        thread = await beginThread(blocked);
      const contentBefore = await contentRead(blocked);
      const request = {
        creatorId,
        reason: "Synthetic core Follow negative authority qualification.",
        idempotencyKey: `core-follow-block-${run}`,
      };
      evidence.blockRequest = { accountId: account(4), ...request };
      await save();
      const result = ok(
        await api("POST", "/v1/trust/blocks", blocked.token, request),
      );
      assert.equal(result.blocked, true);
      evidence.block = result;
      await save();
      assert.deepEqual(
        ok(await api("POST", "/v1/trust/blocks", blocked.token, request)),
        result,
      );
      const denied = await refuses(
        () => readFollow(blocked, true),
        "scope_revoked",
      );
      const contentDenied = await contentRefuses(blocked, 403, "scope_revoked");
      return {
        before,
        contentBefore,
        thread,
        block: result,
        denied,
        contentDenied,
        contentUnaffected: await contentRead(main),
        unaffected: await readFollow(main, true),
      };
    },
  );
  await step(
    "original session expires by wall clock and invalidates an already held lease",
    async () => {
      const expires = Date.parse(expiry.resolved.expiresAt);
      assert(Number.isFinite(expires));
      assert(
        Date.now() < expires - 6000,
        "Original expiry window elapsed before the held-session probe; do not refresh or fabricate it",
      );
      while (Date.now() < expires - 6000) {
        const remaining = expires - 6000 - Date.now();
        console.log(
          `WAIT original session expiry; ${Math.ceil(remaining / 1000)} seconds remain; no clock or session changes`,
        );
        await sleep(Math.min(30000, remaining));
      }
      const current = await sessions.resolve(expiry.token);
      const result = await withFamily(
        expiry,
        async (client, resolved, held) => {
          const lease = await holdCurrentRequestSession(
            client,
            resolved.actor.accountId,
          );
          assert.equal(
            await following(client, resolved.actor.accountId, creatorId),
            true,
          );
          await sleep(Math.max(0, expires + 100 - Date.now()));
          return {
            binding: held,
            expiredAt: new Date().toISOString(),
            lease: await refuses(
              () => assertHeldCurrentRequestSession(lease, client),
              "held_request_transaction_ended",
            ),
            callback: await refuses(
              () => following(client, resolved.actor.accountId, creatorId),
              "session_expired",
            ),
          };
        },
        { resolved: current },
      );
      assert.equal(
        (await api("GET", "/v1/identity/session", expiry.token)).status,
        401,
      );
      const clocks = (
        await admin.query(
          "SELECT expires_at::text,created_at::text,revoked_at FROM creator.identity_session WHERE id=$1",
          [expiry.resolved.sessionId],
        )
      ).rows[0];
      assert.equal(
        new Date(clocks.expires_at).toISOString(),
        expiry.resolved.expiresAt,
      );
      assert.equal(clocks.revoked_at, null);
      return {
        ...result,
        clocks,
        resolver: await refuses(
          () => sessions.resolve(expiry.token),
          "session_expired",
        ),
      };
    },
  );
  // All other sessions can naturally expire during the15-minute observation.
  // Fresh genuine sessions for living accounts are explicit; expiry is untouched.
  main = await login(2, true);
  owner = await login(5);
  deletionFan = await login(6, true);
  await step(
    "actual account deletion fences a real follower and preserves original job clocks",
    async () => {
      await follow(deletionFan, true);
      const before = await readFollow(deletionFan, true);
      const resolved = await sessions.resolve(deletionFan.token);
      const request = {
        kind: "delete",
        scope: "account",
        proof: "LOCAL DEVELOPMENT",
        idempotencyKey: `core-follow-delete-${run}`,
      };
      evidence.deleteRequest = { accountId: account(6), ...request };
      await save();
      let acknowledged;
      try {
        acknowledged = ok(
          await api(
            "POST",
            "/v1/trust/privacy/jobs",
            deletionFan.token,
            request,
          ),
        );
      } catch (error) {
        const recovered = (
          await admin.query(
            "SELECT response FROM creator_trust.command WHERE account_id=$1 AND operation='privacy' AND key=$2",
            [account(6), request.idempotencyKey],
          )
        ).rows[0];
        if (recovered) {
          evidence.deleteResponseRecovery = {
            provenance:
              "Read-only original command lookup after failed response; no second request",
            response: recovered.response,
          };
          await save();
        }
        throw error;
      }
      evidence.deleteAcknowledgment = acknowledged;
      await save();
      const clocks = async () =>
        (
          await admin.query(
            "SELECT j.id,j.account_id,j.kind,j.scope,j.created_at::text,t.id AS tombstone_id,t.created_at::text AS tombstone_created_at FROM creator_trust.privacy_job j JOIN creator_trust.tombstone t ON t.job_id=j.id WHERE j.id=$1 AND j.account_id=$2",
            [acknowledged.id, account(6)],
          )
        ).rows[0];
      const original = await clocks();
      assert(original?.tombstone_id);
      evidence.deleteOriginalClocks = original;
      await save();
      // Reuse the actual pre-request provider resolution if identity cleanup has
      // already revoked it. Either real current-session or Trust negative refusal
      // is recorded; neither a completed erasure nor vanished data is inferred.
      let denial;
      try {
        await withFamily(
          deletionFan,
          () => assert.fail("deleted fan admitted"),
          { resolved },
        );
      } catch (error) {
        denial = code(error);
      }
      assert(
        ["scope_revoked", "session_expired", "audience_unavailable"].includes(
          denial,
        ),
      );
      assert.deepEqual(await clocks(), original);
      const status = (
        await admin.query(
          "SELECT state FROM creator_trust.privacy_job WHERE id=$1",
          [acknowledged.id],
        )
      ).rows[0];
      const tasks = (
        await admin.query(
          "SELECT domain,state,error_code FROM creator_trust.privacy_task WHERE job_id=$1 ORDER BY domain",
          [acknowledged.id],
        )
      ).rows;
      const content = await api(
        "GET",
        `/v1/content/${creatorId}/${note.id}`,
        deletionFan.token,
      );
      const contentCode = content.json?.error?.code ?? content.json?.code;
      assert([401, 403].includes(content.status));
      assert(
        [
          "session_expired",
          "scope_revoked",
          "audience_unavailable",
          "authorization_ended",
        ].includes(contentCode),
      );
      assert(!JSON.stringify(content.json).includes(note.document.text));
      evidence.deletion = {
        id: acknowledged.id,
        state: status.state,
        tasks,
        denial,
        contentDenial: { status: content.status, code: contentCode },
        completionClaim: false,
        accountMustNeverBeReused: account(6),
      };
      await save();
      return {
        before,
        ...evidence.deletion,
        originalClocks: original,
        unaffected: await readFollow(main, true),
        contentUnaffected: await contentRead(main),
      };
    },
  );
  await step(
    "real Note withdrawal preserves signature and closes follower reads",
    async () => {
      const original = (
        await admin.query(
          "SELECT to_jsonb(a) AS value FROM creator.signed_act a WHERE id=$1",
          [note.signed_act_id],
        )
      ).rows[0].value;
      ok(
        await api(
          "POST",
          `/v1/content/${creatorId}/${note.id}/unpublish`,
          owner.token,
          {
            version: note.version,
            idempotencyKey: `core-follow-unpublish-${run}`,
          },
        ),
      );
      const content = await api(
        "GET",
        `/v1/content/${creatorId}/${note.id}`,
        main.token,
      );
      assert.equal(content.status, 403);
      assert.deepEqual(
        (
          await admin.query(
            "SELECT to_jsonb(a) AS value FROM creator.signed_act a WHERE id=$1",
            [note.signed_act_id],
          )
        ).rows[0].value,
        original,
      );
      await follow(main, false);
      assert.equal(
        (
          await admin.query(
            "SELECT count(*)::int AS count FROM creator.content_index WHERE creator_id=$1",
            [untouchedCreator],
          )
        ).rows[0].count,
        0,
      );
      assert.deepEqual(
        (
          await admin.query(
            "SELECT version,checksum FROM creator.schema_migration ORDER BY version",
          )
        ).rows,
        installed,
      );
      return {
        status: content.status,
        noteId: note.id,
        signedActId: note.signed_act_id,
        originalSignaturePreserved: true,
        mayaContentCount: 0,
        following: await readFollow(main, false),
      };
    },
  );
} catch (error) {
  evidence.failure = {
    step: currentStep,
    code: code(error),
    observedAt: new Date().toISOString(),
    location: error?.stack
      ?.split("\n")
      .find((line) => line.includes("e2-core-follow-runtime.mjs"))
      ?.trim(),
  };
  await save();
  console.error(`FAIL ${currentStep} :: ${code(error)}`);
  process.exitCode = 1;
} finally {
  const cleanup = await Promise.allSettled([
    browser?.close(),
    host?.stop(),
    admin.end(),
    core.end(),
    trustPool.end(),
    workerPool.end(),
  ]);
  evidence.cleanup = cleanup.map((result, index) => ({
    resource: ["browser", "host", "admin", "core", "trust", "worker"][index],
    state: result.status,
    ...(result.status === "rejected" ? { code: code(result.reason) } : {}),
  }));
  if (cleanup.some((result) => result.status === "rejected"))
    process.exitCode = 1;
  evidence.completed = !process.exitCode;
  evidence.finishedAt = new Date().toISOString();
  await save();
}
