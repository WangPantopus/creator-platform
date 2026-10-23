// Continue e6-reply-review with real API denials, export and account deletion.
// Destructive only to the explicit synthetic fan on an owned loopback stack.
// No business-state SQL writes or invented review/erasure receipts are used.
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
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
assert(OUT && process.argv.includes("--allow-synthetic-account-delete"));
const noteId = flag("--note"),
  replyId = flag("--reply"),
  actor = Number(flag("--fan-actor", "6"));
assert(noteId && replyId && Number.isInteger(actor));
await mkdir(OUT, { recursive: true, mode: 0o700 });
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
async function step(name, fn) {
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
try {
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
      assert(!JSON.stringify(feed).includes(flagged.text));
      evidence.creatorFeedLimitation = {
        status: feed.status,
        code: feed.json?.error?.code,
      };
      return { replyId: flagged.id, state: stored.state };
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
  await step("actual Content and Trust export owners complete", async () => {
    token = await L.apiSession(actor);
    exported = flag("--existing-export")
      ? { id: flag("--existing-export") }
      : ok(
          await api("POST", "/v1/trust/privacy/jobs", token, {
            kind: "export",
            scope: "account",
            proof: "LOCAL DEVELOPMENT",
            idempotencyKey: randomUUID(),
          }),
        );
    evidence.exportId = exported.id;
    const job = await until(
      async () =>
        ok(await api("GET", `/v1/trust/privacy/jobs/${exported.id}`, token)),
      (j) =>
        ["content", "trust"].every((domain) =>
          j.tasks?.some((t) => t.domain === domain && t.state === "complete"),
        ),
      90000,
    );
    evidence.exportComplete = job.state === "complete";
    evidence.exportTasks = job.tasks.map((t) => ({
      domain: t.domain,
      state: t.state,
      error: t.error_code,
    }));
    if (!evidence.exportComplete)
      console.log(
        "LIMIT whole export incomplete: " +
          JSON.stringify(evidence.exportTasks),
      );
    return {
      jobId: exported.id,
      wholeExportComplete: evidence.exportComplete,
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
      assert.equal(
        own.status,
        evidence.exportComplete ? 200 : 409,
        JSON.stringify(own),
      );
      const other = await L.apiSession(5);
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
        wholeExportAcceptance: evidence.exportComplete,
      };
    },
  );
  await step("real one-minute Ops purpose lease expires", async () => {
    const remaining = started + 62000 - Date.now();
    if (remaining > 0) await L.sleep(remaining);
    const result = await api("GET", `/v1/trust/cases/${expiring.case_id}`, ops);
    assert.equal(result.status, 403, JSON.stringify(result));
    return { status: result.status, elapsedMs: Date.now() - started };
  });
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
    "real deletion removes Trust review metadata; Content remains visibly unfinished",
    async () => {
      token = await L.apiSession(actor);
      const deletion = ok(
        await api("POST", "/v1/trust/privacy/jobs", token, {
          kind: "delete",
          scope: "account",
          proof: "LOCAL DEVELOPMENT",
          idempotencyKey: randomUUID(),
        }),
      );
      evidence.deleteId = deletion.id;
      const before = await sql(
        "SELECT created_at FROM creator_trust.privacy_job WHERE id=$1",
        [deletion.id],
      );
      const job = await until(
        async () =>
          ok(await api("GET", `/v1/trust/privacy/jobs/${deletion.id}`, token)),
        (j) =>
          j.tasks?.some(
            (t) => t.domain === "trust" && t.state === "complete",
          ) && j.tasks.some((t) => t.domain === "content" && t.error_code),
        90000,
      );
      assert.notEqual(job.state, "complete");
      const [count] = await sql(
        "SELECT (SELECT count(*) FROM creator_trust.reply_review WHERE account_id=$1)::int AS reviews,(SELECT count(*) FROM creator_trust.reply_review_decision WHERE case_id=$2)::int AS decisions",
        [L.account(actor), source.case_id],
      );
      assert.equal(count.reviews, 0);
      assert.equal(count.decisions, 0);
      const after = await sql(
        "SELECT created_at FROM creator_trust.privacy_job WHERE id=$1",
        [deletion.id],
      );
      assert.deepEqual(after, before);
      return {
        jobId: deletion.id,
        state: job.state,
        tasks: job.tasks.map((t) => ({
          domain: t.domain,
          state: t.state,
          error: t.error_code,
        })),
        reviewMetadataRemoved: true,
        originalClockPreserved: true,
      };
    },
  );
} catch (error) {
  evidence.failure = error.stack;
  await save();
  console.error(error);
  process.exitCode = 1;
} finally {
  await save();
  process.exit(process.exitCode ?? 0);
}
