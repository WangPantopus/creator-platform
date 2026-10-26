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
async function step(name, fn) {
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
const trustUrl = new URL(runtimeDb),
  workerUrl = new URL(runtimeDb);
trustUrl.username = "creator_trust_runtime";
workerUrl.username = "creator_trust_worker";
const trustPool = new Pool({
  ...configuration,
  connectionString: trustUrl.href,
});
const workerPool = new Pool({
  ...configuration,
  connectionString: workerUrl.href,
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
  await step(
    "installed function and matching ledger do not activate an unregistered callback",
    async () => {
      const registry = JSON.parse(
        await readFile(join(root, "infra/migrations.json"), "utf8"),
      );
      const executable = Object.create(null);
      for (const entry of registry.migrations) {
        if (entry.version === "0254_w8_creator_fan_denial") continue;
        const checksum = createHash("sha256")
          .update(await readFile(join(root, entry.path)))
          .digest("hex");
        executable[entry.version] = {
          path: entry.path,
          owner: entry.owner,
          checksum,
        };
      }
      assert.equal(Object.keys(executable).length, 121);
      const outfile = join(out, `unregistered-callback-${run}.mjs`);
      await build({
        stdin: {
          contents: `import {requestAuthority} from './apps/backend/src/modules/identity/request-authority.ts'; import {trustCreatorFanRestrictionInTransaction} from './apps/backend/src/modules/trust/scope-restriction.ts'; const restrict=trustCreatorFanRestrictionInTransaction(); export const check=(client,actor,pair,sessionId)=>requestAuthority.run({accountId:actor.accountId,sessionId},()=>restrict(client,actor,pair));`,
          resolveDir: root,
          sourcefile: "unregistered-callback.ts",
          loader: "ts",
        },
        outfile,
        bundle: true,
        platform: "node",
        target: "node22",
        format: "esm",
        define: {
          __QELVORA_REGISTERED_MIGRATION_SOURCES__: JSON.stringify(executable),
        },
        logLevel: "silent",
      });
      const candidate = await import(pathToFileURL(outfile).href);
      return invoke(
        owner,
        pair,
        (client, actor, tuple) =>
          candidate.check(client, actor, tuple, owner.sessionId),
        { expected: "scope_denial_unconfigured" },
      );
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
  await step(
    "actual separate fan block denies creator and fan without changing the unblocked pair",
    async () => {
      const blockedPair = { creatorId, fanId: blocker.fanId };
      await invoke(owner, blockedPair, restriction, { expected: "allowed" });
      const block = ok(
        await api("POST", "/v1/trust/blocks", blocker.token, {
          creatorId,
          reason:
            "Synthetic creator/fan denial qualification on this owned local stack.",
          idempotencyKey: randomUUID(),
        }),
      );
      assert.equal(block.blocked, true);
      return {
        caseId: block.caseId,
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
} finally {
  await host?.stop();
  await Promise.allSettled([
    core.end(),
    trustPool.end(),
    workerPool.end(),
    admin.end(),
  ]);
  await save();
}
