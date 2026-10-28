// Continue e6-reply-review with real API denials, export and account deletion.
// Destructive only to the explicit synthetic fan on an owned loopback stack.
// No business-state SQL writes or invented review/erasure receipts are used.
// --stop-after-export retains the supplied Note/reaction and current account.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
const flag = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1];
};
const API = flag("--api"),
  DB = flag("--db"),
  runtimeDb = flag("--runtime-db"),
  OUT = flag("--out");
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
assert(!adminLocation.search && !runtimeLocation.search);
const stopAfterExport = process.argv.includes("--stop-after-export");
assert(
  OUT &&
    (stopAfterExport ||
      process.argv.includes("--allow-synthetic-account-delete")),
);
const noteId = flag("--note"),
  replyId = flag("--reply"),
  actor = Number(flag("--fan-actor", "6"));
assert(
  noteId && replyId && Number.isInteger(actor) && actor >= 1 && actor <= 6,
);
await mkdir(OUT, { recursive: true, mode: 0o700 });
assert.equal((await stat(OUT)).mode & 0o077, 0);
Object.assign(process.env, { LANE6_API: API, LANE6_DB: DB });
const L = await import("./e6-2-lib.mjs");
const { api, sql, MAYA } = L;
const { Client } = createRequire(
  new URL("../../../apps/backend/package.json", import.meta.url),
)("pg");
const evidence = {
  run: randomUUID(),
  noteId,
  replyId,
  actor,
  stopAfterExport,
  boundary:
    "explicit owned synthetic account; actual API decisions and privacy tasks; SQL reads and rollback-only denial probes",
  steps: [],
};
const save = () =>
  writeFile(
    resolve(OUT, `reply-lifecycle-${evidence.run}.json`),
    JSON.stringify(evidence, null, 2),
    { mode: 0o600 },
  );
let currentStep = "owned source and deletion preflight";
async function step(name, fn) {
  currentStep = name;
  const detail = await fn();
  evidence.steps.push({ name, detail });
  await save();
  console.log(`PASS ${name} :: ${JSON.stringify(detail)}`);
}
const ok = (r) => {
  assert(r.status >= 200 && r.status < 300, JSON.stringify(r));
  return r.json;
};
async function until(read, predicate, ms = 60000) {
  const end = Date.now() + ms;
  let value;
  do {
    value = await read();
    if (predicate(value)) return value;
    await L.sleep(1000);
  } while (Date.now() < end);
  throw new Error(`Timed out: ${JSON.stringify(value)}`);
}
let token, ops, creator;
const path = (suffix) => `/v1/content/${MAYA}/${suffix}`;
async function makeReply(label) {
  const text = `Local lifecycle ${label} ${evidence.run}`;
  ok(
    await api("POST", path(`${noteId}/replies`), token, {
      text,
      idempotencyKey: randomUUID(),
    }),
  );
  const [row] = await sql(
    "SELECT r.id,r.version,w.case_id FROM creator.content_reply r JOIN creator_trust.reply_review w ON w.reply_id=r.id WHERE r.text=$1",
    [text],
  );
  assert(row);
  return { ...row, text };
}
async function lease(row, minutes = 15) {
  return ok(
    await api("POST", `/v1/trust/cases/${row.case_id}/access`, ops, {
      purpose:
        "Inspect the exact synthetic reply for this local lifecycle qualification.",
      minutes,
    }),
  );
}
async function decide(row, resolution) {
  const detail = ok(await api("GET", `/v1/trust/cases/${row.case_id}`, ops));
  return api("POST", `/v1/trust/cases/${row.case_id}/decisions`, ops, {
    version: detail.version,
    resolution,
    reason: "Local synthetic lifecycle decision for this exact reply only.",
    idempotencyKey: randomUUID(),
  });
}
// Retry in the same private output directory (or pass --existing-export).
// The immutable request is persisted before POST, so an unknown response reuses
// its idempotency key. A separate immutable receipt retains the actual job ID
// and original creation time; no retry edits an existing job or its clock.
async function privacyCheckpoint(kind, suffix, binding, detail) {
  const key = createHash("sha256")
    .update(JSON.stringify(binding))
    .digest("hex");
  const file = resolve(OUT, `reply-${kind}-${key}-${suffix}.json`);
  if (detail) {
    try {
      await writeFile(file, JSON.stringify({ binding, ...detail }, null, 2), {
        mode: 0o600,
        flag: "wx",
      });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  try {
    const saved = JSON.parse(await readFile(file, "utf8"));
    assert.deepEqual(saved.binding, binding);
    return saved;
  } catch (error) {
    if (error.code === "ENOENT" && !detail) return undefined;
    throw error;
  }
}
const database = new URL(DB);
const binding = {
  api: new URL(API).origin,
  database: `${database.host}${database.pathname}`,
  account: L.account(actor),
  noteId,
  replyId,
};
const exportCheckpoint = (suffix, binding, detail) =>
  privacyCheckpoint("export", suffix, binding, detail);
const deletionClocks = async (id) => {
  const [row] = await sql(
    "SELECT j.id,j.account_id,j.kind,j.scope,j.created_at::text AS created_at,j.verified_at::text AS verified_at,t.id AS tombstone_id,t.created_at::text AS tombstone_created_at FROM creator_trust.privacy_job j LEFT JOIN creator_trust.tombstone t ON t.job_id=j.id WHERE j.id=$1 AND j.account_id=$2 AND j.kind='delete' AND j.scope='account'",
    [id, L.account(actor)],
  );
  assert(row, "Deletion must belong to the exact synthetic account");
  assert(
    row.tombstone_id,
    "Account deletion must retain its original tombstone",
  );
  return row;
};
const acceptedTuple = async () => {
  const [row] = await sql(
    `SELECT jsonb_build_object(
      'note',(SELECT to_jsonb(i) FROM creator.content_index i WHERE id=$1),
      'publication',(SELECT jsonb_agg(to_jsonb(p) ORDER BY version) FROM creator.content_publication p WHERE content_id=$1),
      'reply',(SELECT to_jsonb(r) FROM creator.content_reply r WHERE id=$2),
      'reaction',(SELECT to_jsonb(r) FROM creator.content_reaction r WHERE reply_id=$2),
      'signatures',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM creator.signed_act a WHERE id IN (SELECT signed_act_id FROM creator.content_publication WHERE content_id=$1 UNION SELECT signed_act_id FROM creator.content_reaction WHERE reply_id=$2))
    ) AS value`,
    [noteId, replyId],
  );
  return row.value;
};
try {
  const existingDeletes = await sql(
    "SELECT id,state,created_at::text AS created_at FROM creator_trust.privacy_job WHERE account_id=$1 AND kind='delete' AND scope='account' ORDER BY created_at,id",
    [L.account(actor)],
  );
  if (existingDeletes.length) {
    evidence.existingAccountDeletions = existingDeletes;
    evidence.refusal =
      "Account deletion already requested; no fresh session or lifecycle mutation attempted. Observe the original job read-only.";
    await save();
    assert.fail(evidence.refusal);
  }
  token = await L.apiSession(actor);
  ops = await L.apiSession(4);
  creator = await L.apiSession(3);
  const [source] = await sql(
    "SELECT r.*,w.case_id,w.text_hash FROM creator.content_reply r JOIN creator_trust.reply_review w ON w.reply_id=r.id JOIN creator.fan_profile f ON f.id=r.fan_id WHERE r.id=$1 AND r.content_id=$2 AND f.account_id=$3",
    [replyId, noteId, L.account(actor)],
  );
  assert(
    source,
    "Explicit reply must belong to the supplied synthetic fan and Note",
  );
  const retainedTuple = stopAfterExport ? await acceptedTuple() : undefined;
  await step(
    "real runtime role refuses wrong exact source hash and version",
    async () => {
      const [session] = await sql(
        "SELECT id FROM creator.identity_session WHERE token_hash=$1 AND revoked_at IS NULL",
        [createHash("sha256").update(token).digest("hex")],
      );
      assert(session);
      const client = new Client({
        connectionString: runtimeDb,
        query_timeout: 5000,
      });
      await client.connect();
      const errors = [];
      try {
        for (const [version, hash] of [
          [source.version, "0".repeat(64)],
          [source.version + 1, source.text_hash],
        ]) {
          await client.query("BEGIN");
          try {
            await client.query(
              "SELECT set_config('app.account_id',$1,true),set_config('app.identity_session_id',$2,true),set_config('trust.reply_session_id',$2,true)",
              [L.account(actor), session.id],
            );
            await client.query(
              "SELECT creator_trust.review_note_reply($1,$2,$3,$4,$5)",
              [replyId, MAYA, source.fan_id, version, hash],
            );
            assert.fail("wrong exact tuple accepted");
          } catch (error) {
            assert.equal(error.code, "PT409", error.message);
            errors.push(error.code);
          } finally {
            await client.query("ROLLBACK");
          }
        }
      } finally {
        await client.end();
      }
      return errors;
    },
  );
  await step("revoked author session cannot retry", async () => {
    const revoked = await L.apiSession(actor);
    ok(await api("POST", "/v1/identity/logout", revoked));
    const result = await api(
      "POST",
      path(`replies/${replyId}/review`),
      revoked,
      { version: source.version, idempotencyKey: randomUUID() },
    );
    assert.equal(result.status, 401);
    return { status: result.status };
  });
  const expiring = await makeReply("expiring lease");
  const started = Date.now();
  await lease(expiring, 1);
  await step(
    "actual flag decision is recorded and source remains flagged",
    async () => {
      const flagged = await makeReply("withheld");
      await lease(flagged);
      ok(await decide(flagged, "flag_reply"));
      ok(
        await api("POST", path(`replies/${flagged.id}/review`), token, {
          version: flagged.version,
          idempotencyKey: randomUUID(),
        }),
      );
      const [stored] = await sql(
        "SELECT state FROM creator.content_reply_review WHERE reply_id=$1",
        [flagged.id],
      );
      assert.equal(stored.state, "flagged");
      const feed = await api("GET", path("studio/replies"), creator);
      assert.equal(feed.status, 200, JSON.stringify(feed));
      assert(!JSON.stringify(feed).includes(flagged.text));
      return {
        replyId: flagged.id,
        state: stored.state,
        creatorFeedStatus: feed.status,
      };
    },
  );
  await step(
    "withdrawn reply loses evidence and cannot be approved",
    async () => {
      const withdrawn = await makeReply("withdrawn");
      await lease(withdrawn);
      ok(
        await api("POST", path(`replies/${withdrawn.id}/withdraw`), token, {
          version: withdrawn.version,
          idempotencyKey: randomUUID(),
        }),
      );
      const detail = await api(
        "GET",
        `/v1/trust/cases/${withdrawn.case_id}`,
        ops,
      );
      assert(!JSON.stringify(detail).includes(withdrawn.text));
      const [review] = await sql(
        "SELECT version FROM creator_trust.safety_case WHERE id=$1",
        [withdrawn.case_id],
      );
      const decision = await api(
        "POST",
        `/v1/trust/cases/${withdrawn.case_id}/decisions`,
        ops,
        {
          version: review.version,
          resolution: "allow_reply",
          reason: "Attempting stale withdrawn reply must be refused.",
          idempotencyKey: randomUUID(),
        },
      );
      assert.equal(decision.status, 410, JSON.stringify(decision));
      return { evidenceStatus: detail.status, decisionStatus: decision.status };
    },
  );
  let exported;
  await step("all eight actual export owners complete", async () => {
    token = await L.apiSession(actor);
    const previous = await exportCheckpoint("job", binding);
    const requested = flag("--existing-export");
    if (previous && requested) assert.equal(previous.jobId, requested);
    if (previous) exported = { id: previous.jobId };
    else {
      const request = await exportCheckpoint("request", binding, {
        existingExport: requested ?? null,
        idempotencyKey: randomUUID(),
      });
      if (requested) assert.equal(request.existingExport, requested);
      exported = request.existingExport
        ? { id: request.existingExport }
        : ok(
            await api("POST", "/v1/trust/privacy/jobs", token, {
              kind: "export",
              scope: "account",
              proof: "LOCAL DEVELOPMENT",
              idempotencyKey: request.idempotencyKey,
            }),
          );
    }
    assert(exported.id);
    evidence.exportId = exported.id;
    await save();
    const initial = ok(
      await api("GET", `/v1/trust/privacy/jobs/${exported.id}`, token),
    );
    const receipt = await exportCheckpoint("job", binding, {
      jobId: exported.id,
      createdAt: initial.created_at,
    });
    assert.equal(receipt.jobId, exported.id);
    assert.equal(initial.created_at, receipt.createdAt);
    assert(initial.created_at);
    evidence.exportOriginalCreatedAt = receipt.createdAt;
    const job = await until(
      async () => {
        const current = ok(
          await api("GET", `/v1/trust/privacy/jobs/${exported.id}`, token),
        );
        assert.equal(current.created_at, receipt.createdAt);
        evidence.exportTasks = current.tasks?.map((t) => ({
          domain: t.domain,
          state: t.state,
          error: t.error_code,
        }));
        await save();
        return current;
      },
      (j) =>
        j.state === "complete" &&
        j.tasks?.length === 8 &&
        j.tasks.every((t) => t.state === "complete"),
      90000,
    );
    evidence.exportComplete = true;
    return {
      jobId: exported.id,
      state: job.state,
      originalCreatedAt: receipt.createdAt,
      tasks: evidence.exportTasks,
    };
  });
  await step(
    "owner outputs separate Trust metadata from Content body; download respects completion",
    async () => {
      const parts = await sql(
        "SELECT domain,data FROM creator_trust.privacy_task WHERE job_id=$1 AND domain IN('content','trust') AND state='complete'",
        [exported.id],
      );
      const trust = parts.find((p) => p.domain === "trust"),
        content = parts.find((p) => p.domain === "content");
      assert(trust && content);
      assert(JSON.stringify(trust).includes(replyId));
      assert(!JSON.stringify(trust).includes(source.text));
      assert(!JSON.stringify(trust).includes("reviewer_account_id"));
      assert(JSON.stringify(content).includes(source.text));
      const own = await api(
        "GET",
        `/v1/trust/privacy/jobs/${exported.id}/download`,
        token,
      );
      assert.equal(own.status, 200, JSON.stringify(own));
      const other = await L.apiSession(actor === 5 ? 2 : 5);
      const cross = await api(
        "GET",
        `/v1/trust/privacy/jobs/${exported.id}/download`,
        other,
      );
      assert.equal(cross.status, 404, JSON.stringify(cross));
      return {
        actualOwnerOutputsVerified: true,
        ownDownload: own.status,
        crossAccount: cross.status,
      };
    },
  );
  await step(
    "whole export streams match their original byte counts and SHA-256",
    async () => {
      const out = resolve(OUT, `reply-export-recheck-${evidence.run}.json`);
      await promisify(execFile)(
        process.execPath,
        [
          fileURLToPath(
            new URL("./e6-reply-review-export-recheck.mjs", import.meta.url),
          ),
          "--api",
          API,
          "--actor",
          String(actor),
          "--job",
          exported.id,
          "--out",
          out,
        ],
        { timeout: 180000 },
      );
      const checked = JSON.parse(await readFile(out, "utf8"));
      assert.equal(checked.jobId, exported.id);
      assert.equal(checked.account, L.account(actor));
      assert.equal(checked.originalCreatedAt, evidence.exportOriginalCreatedAt);
      evidence.wholeExportAcceptance = true;
      return checked;
    },
  );
  await step("real one-minute Ops purpose lease expires", async () => {
    const remaining = started + 62000 - Date.now();
    if (remaining > 0) await L.sleep(remaining);
    const result = await api("GET", `/v1/trust/cases/${expiring.case_id}`, ops);
    assert.equal(result.status, 403, JSON.stringify(result));
    return { status: result.status, elapsedMs: Date.now() - started };
  });
  if (stopAfterExport) {
    await step(
      "stop-after-export preserves the supplied accepted tuple and current account",
      async () => {
        const after = await acceptedTuple();
        assert.deepEqual(after, retainedTuple);
        const deletes = await sql(
          "SELECT id FROM creator_trust.privacy_job WHERE account_id=$1 AND kind='delete' AND scope='account'",
          [L.account(actor)],
        );
        assert.equal(deletes.length, 0);
        const session = ok(await api("GET", "/v1/identity/session", token));
        assert.equal(session.accountId, L.account(actor));
        evidence.stoppedAfterExport = true;
        return {
          acceptedTupleSha256: createHash("sha256")
            .update(JSON.stringify(after))
            .digest("hex"),
          accountDeleteJobs: 0,
        };
      },
    );
    console.log(
      "STOP after verified export; supplied Note/reply/reaction and account retained",
    );
  } else {
    await step(
      "unpublished Note cannot authorize pending reply delivery",
      async () => {
        await lease(expiring);
        const [note] = await sql(
          "SELECT version FROM creator.content_index WHERE id=$1",
          [noteId],
        );
        ok(
          await api("POST", path(`${noteId}/unpublish`), creator, {
            version: note.version,
            idempotencyKey: randomUUID(),
          }),
        );
        const denied = await decide(expiring, "allow_reply");
        assert.equal(denied.status, 403, JSON.stringify(denied));
        return { status: denied.status };
      },
    );
    await step(
      "actual account deletion preserves original clocks and requires completed Trust review purge",
      async () => {
        token = await L.apiSession(actor);
        const request = await privacyCheckpoint("delete", "request", binding, {
          idempotencyKey: randomUUID(),
        });
        evidence.deleteRequest = {
          idempotencyKey: request.idempotencyKey,
          binding,
        };
        await save();
        let deletion;
        try {
          deletion = ok(
            await api("POST", "/v1/trust/privacy/jobs", token, {
              kind: "delete",
              scope: "account",
              proof: "LOCAL DEVELOPMENT",
              idempotencyKey: request.idempotencyKey,
            }),
          );
        } catch (error) {
          // An interrupted response must never justify a second deletion. Recover
          // only the committed command acknowledgment; do not issue another POST.
          const [committed] = await sql(
            "SELECT response FROM creator_trust.command WHERE account_id=$1 AND operation='privacy' AND key=$2",
            [L.account(actor), request.idempotencyKey],
          );
          if (committed?.response?.id) {
            evidence.deleteId = committed.response.id;
            evidence.deleteResponseRecovery =
              "Read-only original command lookup after failed POST response; acceptance not inferred";
            const clocks = await deletionClocks(committed.response.id);
            await privacyCheckpoint("delete", "job", binding, {
              jobId: committed.response.id,
              clocks,
              provenance: evidence.deleteResponseRecovery,
            });
            evidence.deleteOriginalClocks = clocks;
            await save();
          }
          throw error;
        }
        evidence.deleteId = deletion.id;
        evidence.deleteAcknowledgment = deletion;
        await save();
        const before = await deletionClocks(deletion.id);
        const receipt = await privacyCheckpoint("delete", "job", binding, {
          jobId: deletion.id,
          clocks: before,
          provenance:
            "Actual API acknowledgment followed by original job/tombstone read",
        });
        assert.equal(receipt.jobId, deletion.id);
        assert.deepEqual(receipt.clocks, before);
        evidence.deleteOriginalClocks = receipt.clocks;
        await save();
        const observe = async () => {
          const clocks = await deletionClocks(deletion.id);
          assert.deepEqual(clocks, receipt.clocks);
          evidence.deleteOriginalClockPreserved = true;
          const current = ok(
            await api("GET", `/v1/trust/privacy/jobs/${deletion.id}`, token),
          );
          evidence.deleteState = current.state;
          evidence.deleteTasks = current.tasks?.map((task) => ({
            domain: task.domain,
            state: task.state,
            attempts: task.attempts,
            error: task.error_code,
          }));
          evidence.wholeErasureComplete =
            current.state === "complete" &&
            current.tasks?.length === 8 &&
            current.tasks.every((task) => task.state === "complete");
          evidence.deleteObservedAt = new Date().toISOString();
          await save();
          return current;
        };
        let job;
        try {
          job = await until(
            observe,
            (current) =>
              current.tasks?.some(
                (task) => task.domain === "trust" && task.state === "complete",
              ),
            90000,
          );
        } finally {
          const clocks = await deletionClocks(deletion.id);
          assert.deepEqual(clocks, receipt.clocks);
          evidence.deleteOriginalClockPreserved = true;
          const [remaining] = await sql(
            "SELECT (SELECT count(*) FROM creator_trust.reply_review WHERE account_id=$1)::int AS reviews,(SELECT count(*) FROM creator_trust.reply_review_decision WHERE case_id=$2)::int AS decisions",
            [L.account(actor), source.case_id],
          );
          evidence.deleteRemainingReviewMetadata = remaining;
          await save();
        }
        assert.equal(evidence.deleteRemainingReviewMetadata.reviews, 0);
        assert.equal(evidence.deleteRemainingReviewMetadata.decisions, 0);
        return {
          jobId: deletion.id,
          state: job.state,
          tasks: evidence.deleteTasks,
          reviewMetadataRemoved: true,
          originalClockPreserved: true,
          wholeErasureComplete: evidence.wholeErasureComplete,
        };
      },
    );
  }
} catch (error) {
  evidence.failedStep = currentStep;
  evidence.failure = error.stack;
  await save();
  console.error(error);
  process.exitCode = 1;
} finally {
  await save();
  process.exit(process.exitCode ?? 0);
}
