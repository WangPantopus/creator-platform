// Operate the actual creator/fan callback with current API-issued sessions.
// Only an explicitly owned loopback122 stack: the final block is permanent
// evidence for a separate synthetic fan, and the restoration marker is restored.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { requestAuthority } from "../../../apps/backend/src/modules/identity/request-authority.ts";
import { trustCreatorFanRestrictionInTransaction } from "../../../apps/backend/src/modules/trust/scope-restriction.ts";
import { trustLocalRestorationInTransaction } from "../../../apps/backend/src/modules/trust/restoration.ts";
import { createTrustRuntime } from "../../../apps/backend/src/operations/runtime.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const requireBackend = createRequire(join(root, "apps/backend/package.json"));
const { Client, Pool } = requireBackend("pg");
const { build } = requireBackend("esbuild");
const flag = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at < 0 ? fallback : process.argv[at + 1];
};
const API = flag("--api"),
  DB = flag("--db"),
  runtimeDb = flag("--runtime-db");
for (const value of [API, DB, runtimeDb]) {
  assert(
    value &&
      ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname),
  );
}
const adminLocation = new URL(DB),
  runtimeLocation = new URL(runtimeDb);
assert.equal(adminLocation.host, runtimeLocation.host);
assert.equal(adminLocation.pathname, runtimeLocation.pathname);
assert.equal(runtimeLocation.username, "creator_runtime");
function isolatedRoleUrl(name, role) {
  const value = process.env[name];
  assert(value, `${name} must supply the existing isolated role credentials.`);
  let location;
  try {
    location = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL.`);
  }
  assert(["postgres:", "postgresql:"].includes(location.protocol));
  assert(["localhost", "127.0.0.1", "[::1]"].includes(location.hostname));
  assert.equal(location.host, adminLocation.host);
  assert.equal(location.pathname, adminLocation.pathname);
  assert.equal(location.username, role);
  assert.equal(location.search, "", "Database URL overrides are not allowed.");
  assert.equal(location.hash, "");
  assert(location.password, `${name} must supply the existing role password.`);
  return location.href;
}
const trustDb = isolatedRoleUrl(
  "TRUST_API_DATABASE_URL",
  "creator_trust_runtime",
);
const workerDb = isolatedRoleUrl(
  "TRUST_WORKER_DATABASE_URL",
  "creator_trust_worker",
);
const out = resolve(flag("--out", ""));
assert(out !== root && !out.startsWith(root + sep));
assert(process.argv.includes("--allow-owned-block-and-restoration"));
await mkdir(out, { recursive: true, mode: 0o700 });
assert.equal((await stat(out)).mode & 0o077, 0);
const creatorId = flag("--creator", "20000000-0000-4000-8000-000000000001");
const ownerNumber = Number(flag("--owner-actor", "3"));
const fanNumber = Number(flag("--fan-actor", "6"));
const blockerNumber = Number(flag("--blocker-actor", "5"));
assert(new Set([ownerNumber, fanNumber, blockerNumber]).size === 3);
const run = randomUUID();
const evidence = {
  run,
  observedAt: new Date().toISOString(),
  boundary:
    "owned local122; actual API sessions/block/logout and actual core callback; no positive tenure authority or review receipt manufactured",
  steps: [],
};
const save = () =>
  writeFile(
    join(out, `runtime-${run}.json`),
    JSON.stringify(evidence, null, 2),
    { mode: 0o600 },
  );
let currentStep = "initial authority and sessions";
async function step(name, fn) {
  currentStep = name;
  const detail = await fn();
  evidence.steps.push({ name, detail });
  await save();
  console.log(`PASS ${name} :: ${JSON.stringify(detail)}`);
}
async function api(method, path, token, body) {
  const response = await fetch(API + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  return {
    status: response.status,
    json: await response.json().catch(() => null),
  };
}
function ok(response) {
  assert(
    response.status >= 200 && response.status < 300,
    `API refused with ${response.status}/${response.json?.error?.code ?? response.json?.code ?? "unknown"}`,
  );
  return response.json;
}
async function login(n, fan = false) {
  const accountId = `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const started = ok(
    await api("POST", "/v1/identity/continue", undefined, {
      returnTo: "/home",
    }),
  );
  const done = ok(
    await api("POST", "/v1/identity/complete", undefined, {
      continuationId: started.continuationId,
      code: accountId,
    }),
  );
  assert.equal(typeof done.token, "string");
  const session = ok(await api("GET", "/v1/identity/session", done.token));
  assert.equal(session.accountId, accountId);
  assert.equal(session.adultEligible, true);
  assert.equal(typeof session.sessionId, "string");
  let fanId;
  if (fan) {
    fanId = (
      await admin.query(
        "SELECT id FROM creator.fan_profile WHERE account_id=$1",
        [accountId],
      )
    ).rows[0]?.id;
    if (!fanId)
      fanId = ok(
        await api("POST", "/v1/identity/fan-profile", done.token, {
          handle: `denial${n}${run.slice(0, 6)}`,
          intro: "",
        }),
      ).id;
    assert(fanId);
  }
  return {
    token: done.token,
    actor: { accountId, adultEligible: session.adultEligible },
    sessionId: session.sessionId,
    fanId,
  };
}
const configuration = {
  query_timeout: 5000,
  connectionTimeoutMillis: 5000,
  max: 3,
};
const admin = new Client({ ...configuration, connectionString: DB });
const core = new Pool({ ...configuration, connectionString: runtimeDb });
const trustPool = new Pool({
  ...configuration,
  connectionString: trustDb,
});
const workerPool = new Pool({
  ...configuration,
  connectionString: workerDb,
});
const restriction = trustCreatorFanRestrictionInTransaction();
let host;
async function invoke(session, pair, callback = restriction, options = {}) {
  const client = await core.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('app.account_id',$1,true),set_config('statement_timeout','4000',true)",
      [session.actor.accountId],
    );
    return await requestAuthority.run(
      { accountId: session.actor.accountId, sessionId: session.sessionId },
      async () => {
        const started = performance.now();
        let code = "allowed";
        try {
          await callback(client, session.actor, pair);
        } catch (error) {
          code = error.code ?? error.name;
        }
        const elapsedMs = Math.round(performance.now() - started);
        if (options.expected) assert.equal(code, options.expected);
        // Every refusal must leave the original transaction usable after its
        // savepoint cleanup, with partial negative try-locks released.
        const state = (
          await client.query(
            "SELECT current_setting('app.account_id',true) AS account,(SELECT count(*)::int FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory') AS advisory_locks",
          )
        ).rows[0];
        assert.equal(state.account, session.actor.accountId);
        if (code !== "allowed") assert.equal(state.advisory_locks, 0);
        return { code, elapsedMs, advisoryLocks: state.advisory_locks };
      },
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}
try {
  await admin.connect();
  const installed = (
    await admin.query(
      "SELECT version,checksum FROM creator.schema_migration ORDER BY version",
    )
  ).rows;
  assert.equal(installed.length, 122);
  assert(
    installed.some(
      (entry) =>
        entry.version === "0254_w8_creator_fan_denial" &&
        entry.checksum ===
          "0a738e0a29c77e65274931d4054b5db26a340b8c10a498e8c016457ab1a22860",
    ),
  );
  const owner = await login(ownerNumber),
    fan = await login(fanNumber, true),
    blocker = await login(blockerNumber, true);
  const pair = { creatorId, fanId: fan.fanId };
  const actualOwner = (
    await admin.query(
      "SELECT account_id FROM creator.creator_profile WHERE id=$1",
      [creatorId],
    )
  ).rows[0];
  assert.equal(actualOwner.account_id, owner.actor.accountId);
  evidence.pair = pair;
  evidence.actors = {
    owner: owner.actor.accountId,
    fan: fan.actor.accountId,
    blocker: blocker.actor.accountId,
  };
  await step("genuine current creator-owner and fan callbacks", async () => ({
    owner: await invoke(owner, pair, restriction, { expected: "allowed" }),
    fan: await invoke(fan, pair, restriction, { expected: "allowed" }),
  }));
  await step("wrong pair and wrong current participant refuse", async () => ({
    unrelatedFan: await invoke(
      fan,
      { creatorId, fanId: blocker.fanId },
      restriction,
      { expected: "scope_denial_unavailable" },
    ),
    missingCreator: await invoke(
      owner,
      { creatorId: randomUUID(), fanId: fan.fanId },
      restriction,
      { expected: "scope_denial_unavailable" },
    ),
    outsider: await invoke(blocker, pair, restriction, {
      expected: "scope_denial_unavailable",
    }),
  }));
  const registryPath = join(root, "infra/migrations.json");
  const registryBytes = await readFile(registryPath);
  const registry = JSON.parse(registryBytes.toString("utf8"));
  const executable = Object.create(null);
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
  assert.equal(Object.keys(executable).length, 122);
  const version = "0254_w8_creator_fan_denial";
  const registered = executable[version];
  assert.deepEqual(registered, {
    path: "apps/backend/migrations/0089_w8_creator_fan_denial.sql",
    owner: "W8",
    checksum:
      "0a738e0a29c77e65274931d4054b5db26a340b8c10a498e8c016457ab1a22860",
  });
  async function compiledCallback(variant, sources, expected) {
    const outfile = join(out, `${variant}-callback-${run}.mjs`);
    await build({
      stdin: {
        contents: `import {requestAuthority} from './apps/backend/src/modules/identity/request-authority.ts'; import {trustCreatorFanRestrictionInTransaction} from './apps/backend/src/modules/trust/scope-restriction.ts'; const restrict=trustCreatorFanRestrictionInTransaction(); export const check=(client,actor,pair,sessionId)=>requestAuthority.run({accountId:actor.accountId,sessionId},()=>restrict(client,actor,pair));`,
        resolveDir: root,
        sourcefile: `${variant}-callback.ts`,
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
      logLevel: "silent",
    });
    const candidate = await import(pathToFileURL(outfile).href);
    return invoke(
      owner,
      pair,
      (client, actor, tuple) =>
        candidate.check(client, actor, tuple, owner.sessionId),
      { expected },
    );
  }
  // The same compiled callback must work with the exact122 registration. Each
  // refusal then changes only its embedded descriptor, never SQL, registry files
  // or the installed ledger. Separate bundles prevent module-cache reuse.
  await step(
    "exact compiled executable registration admits current owner",
    () => compiledCallback("registered", executable, "allowed"),
  );
  await step(
    "installed function and matching ledger do not activate an unregistered callback",
    async () => {
      const omitted = { ...executable };
      delete omitted[version];
      assert.equal(Object.keys(omitted).length, 121);
      return compiledCallback(
        "unregistered",
        omitted,
        "scope_denial_unconfigured",
      );
    },
  );
  for (const [field, drift] of [
    ["checksum", "0".repeat(64)],
    [
      "path",
      "apps/backend/migrations/0082_w8_interactive_denial_try_fence.sql",
    ],
    ["owner", "W1"],
  ]) {
    assert.notEqual(registered[field], drift);
    await step(`compiled executable ${field} drift refuses`, () =>
      compiledCallback(
        `wrong-${field}`,
        { ...executable, [version]: { ...registered, [field]: drift } },
        "scope_denial_unconfigured",
      ),
    );
  }
  await step(
    "compiled drift leaves source and installed authority intact",
    async () => {
      assert.deepEqual(await readFile(registryPath), registryBytes);
      assert.equal(
        createHash("sha256")
          .update(await readFile(join(root, registered.path)))
          .digest("hex"),
        registered.checksum,
      );
      assert.deepEqual(
        (
          await admin.query(
            "SELECT version,checksum FROM creator.schema_migration ORDER BY version",
          )
        ).rows,
        installed,
      );
      return compiledCallback("restored-registration", executable, "allowed");
    },
  );
  await step(
    "contended original negative key refuses without waiting or retained partial locks",
    async () => {
      await admin.query("BEGIN");
      try {
        await admin.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [`w8-denial:creator:${creatorId}`],
        );
        const result = await invoke(owner, pair, restriction, {
          expected: "scope_denial_unavailable",
        });
        assert(
          result.elapsedMs < 4000,
          "negative contention must not consume statement deadline",
        );
        return result;
      } finally {
        await admin.query("ROLLBACK");
      }
    },
  );
  await step("negative key release restores original pair", () =>
    invoke(owner, pair, restriction, { expected: "allowed" }),
  );
  await step("actual logged-out session refuses", async () => {
    const revoked = await login(fanNumber);
    ok(await api("POST", "/v1/identity/logout", revoked.token));
    const apiResponse = await api("GET", "/v1/identity/session", revoked.token);
    assert.equal(apiResponse.status, 401);
    return {
      apiStatus: apiResponse.status,
      callback: await invoke(revoked, pair, restriction, {
        expected: "session_expired",
      }),
    };
  });
  const env = {
    NODE_ENV: "development",
    TRUST_LOCAL_DEVELOPMENT: "true",
    DATABASE_URL: runtimeDb,
  };
  Object.assign(process.env, {
    NODE_ENV: "development",
    TRUST_LOCAL_DEVELOPMENT: "true",
  });
  const restored = trustLocalRestorationInTransaction(env);
  currentStep = "configure Trust runtime with existing isolated roles";
  host = await createTrustRuntime({
    environment: "local-development",
    identityMode: "development",
    release: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    origin: API,
    apiPool: trustPool,
    workerPool,
    actor: async () => {
      throw new Error(
        "This source probe uses only API-issued sessions on the original callback.",
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
  await step(
    "configured host leases current restoration before creator/fan callback",
    () =>
      invoke(owner, pair, host.holdCreatorFanNegativeAuthority, {
        expected: "allowed",
      }),
  );
  await step(
    "actual closed database marker refuses the host callback then restores",
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
      const identifier = `"${database.datname.replaceAll('"', '""')}"`;
      const literal =
        database.comment === null
          ? "NULL"
          : `'${database.comment.replaceAll("'", "''")}'`;
      await admin.query(
        `COMMENT ON DATABASE ${identifier} IS 'creator-platform:restored-traffic-closed'`,
      );
      let closed;
      try {
        closed = await invoke(
          owner,
          pair,
          host.holdCreatorFanNegativeAuthority,
          { expected: "restoration_pending" },
        );
      } finally {
        await admin.query(`COMMENT ON DATABASE ${identifier} IS ${literal}`);
      }
      const reopened = await invoke(
        owner,
        pair,
        host.holdCreatorFanNegativeAuthority,
        { expected: "allowed" },
      );
      return { closed, reopened };
    },
  );
  const blockedPair = { creatorId, fanId: blocker.fanId };
  const blockInput = {
    creatorId,
    reason:
      "Synthetic creator/fan denial qualification on this owned local stack.",
    idempotencyKey: `denial-runtime-${creatorId}-${blocker.actor.accountId}`,
  };
  let priorBlock;
  await step(
    "genuine blocker conversation and current provider consent",
    async () => {
      const existing = (
        await admin.query(
          "SELECT case_id FROM creator_trust.block WHERE account_id=$1 AND creator_id=$2 AND revoked_at IS NULL",
          [blocker.actor.accountId, creatorId],
        )
      ).rows[0];
      const command = (
        await admin.query(
          "SELECT response FROM creator_trust.command WHERE account_id=$1 AND operation='block' AND key=$2",
          [blocker.actor.accountId, blockInput.idempotencyKey],
        )
      ).rows[0];
      if (existing || command) {
        // A successful prior run closes its own evidence path. Only replay this
        // scenario's exact persisted command; never reopen or replace an old block.
        assert(
          existing && command,
          "Existing block does not match this scenario's receipt.",
        );
        assert.equal(command.response.blocked, true);
        assert.equal(command.response.caseId, existing.case_id);
        priorBlock = command.response;
        return {
          mode: "preserved successful block; no thread or consent rewrite",
          caseId: existing.case_id,
        };
      }
      const current = ok(
        await api("GET", "/v1/identity/session", blocker.token),
      );
      assert.equal(current.accountId, blocker.actor.accountId);
      const caps = ok(
        await api("GET", "/v1/conversations/capabilities", blocker.token),
      );
      assert.equal(typeof caps.providers?.version, "string");
      assert(caps.providers.version.length > 0);
      assert.equal(caps.generationAvailable, true);
      const beforeGrants = (
        await admin.query(
          "SELECT id FROM creator.access_grant WHERE creator_id=$1 AND fan_id=$2 ORDER BY id",
          [creatorId, blocker.fanId],
        )
      ).rows.map((row) => row.id);
      const begun = ok(
        await api("POST", "/v1/conversations/begin", blocker.token, {
          creatorId,
          policyVersion: caps.providers.version,
          accessNoticeAccepted: true,
          idempotencyKey: `denial-begin-${run}`,
        }),
      );
      assert.equal(begun.creatorId, creatorId);
      assert.equal(begun.fanId, blocker.fanId);
      assert.equal(begun.canSend, true);
      assert.equal(begun.consentCurrent, true);
      const thread = (
        await admin.query(
          "SELECT t.creator_id,t.fan_id,t.processor_consent_version,f.account_id FROM creator.thread t JOIN creator.fan_profile f ON f.id=t.fan_id WHERE t.id=$1 AND t.deleted_at IS NULL",
          [begun.threadId],
        )
      ).rows[0];
      assert.deepEqual(thread, {
        creator_id: creatorId,
        fan_id: blocker.fanId,
        processor_consent_version: caps.providers.version,
        account_id: blocker.actor.accountId,
      });
      const afterGrants = (
        await admin.query(
          "SELECT id,source FROM creator.access_grant WHERE creator_id=$1 AND fan_id=$2 ORDER BY id",
          [creatorId, blocker.fanId],
        )
      ).rows;
      for (const id of beforeGrants)
        assert(afterGrants.some((grant) => grant.id === id));
      const created = afterGrants.filter(
        (grant) => !beforeGrants.includes(grant.id),
      );
      assert(created.every((grant) => grant.source === "trial"));
      return {
        mode: "actual begin API with current policy and synthetic fan consent",
        threadId: begun.threadId,
        policyVersion: caps.providers.version,
        createdTrialGrantIds: created.map((grant) => grant.id),
      };
    },
  );
  await step(
    "actual separate fan block denies creator and fan without changing the unblocked pair",
    async () => {
      await invoke(owner, blockedPair, restriction, {
        expected: priorBlock ? "scope_revoked" : "allowed",
      });
      const block = ok(
        await api("POST", "/v1/trust/blocks", blocker.token, blockInput),
      );
      assert.equal(block.blocked, true);
      if (priorBlock) assert.deepEqual(block, priorBlock);
      const replay = ok(
        await api("POST", "/v1/trust/blocks", blocker.token, blockInput),
      );
      assert.deepEqual(replay, block);
      return {
        mode: priorBlock
          ? "existing exact API command replay"
          : "new actual API block",
        caseId: block.caseId,
        replay: "identical persisted result",
        owner: await invoke(owner, blockedPair, restriction, {
          expected: "scope_revoked",
        }),
        fan: await invoke(blocker, blockedPair, restriction, {
          expected: "scope_revoked",
        }),
        unaffected: await invoke(owner, pair, restriction, {
          expected: "allowed",
        }),
      };
    },
  );
  evidence.completed = true;
} catch (error) {
  // Codes only: diagnostics must not serialize connection URLs, session tokens,
  // private source bodies or database error messages into the evidence receipt.
  const code = String(error?.code ?? error?.name ?? "unknown");
  evidence.failure = {
    step: currentStep,
    code: /^[a-zA-Z0-9_]{1,64}$/u.test(code) ? code : "unknown",
    observedAt: new Date().toISOString(),
  };
  throw error;
} finally {
  try {
    await host?.stop();
  } finally {
    await Promise.allSettled([
      core.end(),
      trustPool.end(),
      workerPool.end(),
      admin.end(),
    ]);
    await save();
  }
}
