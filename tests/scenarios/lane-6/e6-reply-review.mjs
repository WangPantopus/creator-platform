// Actual local web/API reply review, including the Ops decision and passkey.
// Boundary: development identities, virtual passkeys, a local model fake, and
// explicitly opted-in membership rows standing in for a completed purchase.
// External creator proof is synthetic and is approved through the real Ops API;
// this is engineering qualification, not verification of a real external owner.
// Run only on an owned loopback stack, never against production.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

const flag = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at < 0 ? fallback : process.argv[at + 1];
};
const API = flag("--api", process.env.LANE6_API);
const WEB = flag("--web", process.env.LANE6_WEB);
const DB = flag("--db", process.env.LANE6_DB);
const OUT = flag("--out");
const RESUME = flag("--resume");
for (const [name, value] of Object.entries({ API, WEB, DB })) {
  assert(value, `${name} must be explicit`);
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname),
    `${name} must be loopback`,
  );
}
assert(OUT, "--out must be an explicit private evidence directory");
assert(
  RESUME || process.argv.includes("--allow-membership-fixture"),
  "explicit synthetic membership consent required",
);
await mkdir(OUT, { recursive: true, mode: 0o700 });
assert.equal((await stat(OUT)).mode & 0o077, 0);
const sourceBytes = RESUME ? await readFile(resolve(RESUME)) : undefined;
const source = sourceBytes
  ? JSON.parse(sourceBytes.toString("utf8"))
  : undefined;
function databaseAddress(value) {
  const url = new URL(value);
  assert(["postgres:", "postgresql:"].includes(url.protocol));
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert(!url.search && !url.hash, "Database URL overrides are not allowed");
  return {
    host: url.hostname,
    port: url.port || "5432",
    database: decodeURIComponent(url.pathname.slice(1)),
  };
}
const binding = {
  api: new URL(API).origin,
  web: new URL(WEB).origin,
  database: databaseAddress(DB),
};
assert.equal(new URL(API).pathname, "/");
assert.equal(new URL(WEB).pathname, "/");
Object.assign(process.env, { LANE6_API: API, LANE6_WEB: WEB, LANE6_DB: DB });
const L = await import("./e6-2-lib.mjs");
const { MAYA, api, sql } = L;
const run = randomUUID().slice(0, 8);
const evidence = {
  run,
  boundary: RESUME
    ? "Resume of an already accepted local signed Note/reply/reaction; fresh genuine creator/fan sessions; no new proof, passkey, membership or signature"
    : "local development identities, synthetic external proof, virtual passkey, synthetic membership; actual product APIs and Ops decisions",
  steps: [],
};
let browser;
const save = () =>
  writeFile(
    resolve(OUT, `reply-review-${run}.json`),
    JSON.stringify(evidence, null, 2),
    { mode: 0o600 },
  );
async function step(name, fn) {
  const detail = await fn();
  evidence.steps.push({ name, detail });
  await save();
  console.log(`PASS ${name}${detail ? ` :: ${JSON.stringify(detail)}` : ""}`);
}
function ok(result) {
  assert(
    result.status >= 200 && result.status < 300,
    `API refused: ${result.status}/${result.json?.error?.code ?? "unknown"}`,
  );
  return result.json;
}
async function until(read, test, ms = 30000) {
  const deadline = Date.now() + ms;
  let value;
  while (Date.now() < deadline) {
    value = await read();
    if (test(value)) return value;
    await L.sleep(500);
  }
  throw new Error(`condition timed out: ${JSON.stringify(value)}`);
}
async function login(page, n, path) {
  await page.goto(`${WEB}/auth/continue?returnTo=${encodeURIComponent(path)}`);
  await page.getByText("Continue with Pantopus").first().click();
  const capabilities = ok(await api("GET", "/v1/identity/capabilities"));
  const actor = capabilities.developmentActors.find(
    (a) => a.id === L.account(n),
  );
  assert(actor, "synthetic actor unavailable");
  await page.getByRole("button", { name: actor.label, exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), {
    timeout: 60000,
  });
  if (new URL(page.url()).pathname === "/onboarding/handle") {
    await page.locator("#handle").fill(`review${n}${run}`);
    await page.locator("button.handle-continue").click();
    await page.waitForURL((u) => u.pathname !== "/onboarding/handle");
  }
  if (new URL(page.url()).pathname !== path) await page.goto(WEB + path);
}

try {
  const [cluster] = await sql(
    "SELECT system_identifier::text FROM pg_control_system()",
  );
  binding.database.systemIdentifier = cluster.system_identifier;
  evidence.binding = binding;
  let note, reply, reaction, noteText, replyText, creator, fan, member;
  let preserved;
  const custody = async () => {
    const [row] = await sql(
      `SELECT jsonb_build_object(
        'note',(SELECT to_jsonb(i) FROM creator.content_index i WHERE id=$1),
        'publication',(SELECT to_jsonb(p) FROM creator.content_publication p WHERE content_id=$1 AND version=$4),
        'noteSignature',(SELECT to_jsonb(a) FROM creator.signed_act a WHERE id=$5),
        'reply',(SELECT to_jsonb(r) FROM creator.content_reply r WHERE id=$2),
        'review',(SELECT to_jsonb(r) FROM creator.content_reply_review r WHERE reply_id=$2),
        'reaction',(SELECT to_jsonb(r) FROM creator.content_reaction r WHERE reply_id=$2),
        'reactionSignature',(SELECT to_jsonb(a) FROM creator.signed_act a WHERE id=$3),
        'command',(SELECT to_jsonb(k) FROM creator.idempotency_key k WHERE actor_account_id=$6 AND operation='content.reaction' AND key=$7)
      ) AS value`,
      [
        note.id,
        reply.id,
        reaction.signed_act_id,
        note.version,
        note.signed_act_id,
        L.account(3),
        JSON.parse(evidence.reactionRequest.body).idempotencyKey,
      ],
    );
    return row.value;
  };
  if (source) {
    await step(
      "resume binds the original accepted fixture to this owned stack",
      async () => {
        assert.equal(new URL(source.reactionRequest.url).origin, binding.web);
        assert.equal(source.reactionRequest.method, "POST");
        assert(
          Object.keys(source.reactionRequest.headers).every((name) =>
            [
              "content-type",
              "x-qelvora-expected-account",
              "x-expected-session-id",
            ].includes(name),
          ),
          "Resume evidence must not contain credentials",
        );
        if (source.binding) assert.deepEqual(source.binding, binding);
        else {
          const envPath = flag("--resume-stack-env");
          assert(
            envPath,
            "Legacy evidence requires the original --resume-stack-env",
          );
          const env = parseEnv(await readFile(resolve(envPath), "utf8"));
          assert.equal(env.NODE_ENV, "development");
          assert.equal(env.IDENTITY_ADAPTER, "development");
          assert.equal(new URL(env.WEB_ORIGIN).origin, binding.web);
          assert.equal(binding.api, `http://127.0.0.1:${env.PORT}`);
          assert.deepEqual(
            databaseAddress(env.DATABASE_URL),
            databaseAddress(DB),
          );
          evidence.legacyBinding =
            "original browser origin and owned stack configuration, confirmed by original session and accepted database tuple";
        }
        assert.equal(source.fixture.creatorId, MAYA);
        assert.equal(source.actors.creator.accountId, L.account(3));
        assert.equal(source.actors.member.accountId, L.account(6));
        assert.equal(
          source.reactionRequest.headers["x-qelvora-expected-account"],
          L.account(3),
        );
        const [originalSession] = await sql(
          "SELECT account_id FROM creator.identity_session WHERE id=$1",
          [source.reactionRequest.headers["x-expected-session-id"]],
        );
        assert.equal(originalSession?.account_id, L.account(3));
        const command = JSON.parse(source.reactionRequest.body);
        assert.deepEqual(Object.keys(command).sort(), [
          "idempotencyKey",
          "kind",
          "signedActId",
          "version",
        ]);
        assert.equal(command.kind, "heart");
        assert.equal(command.version, source.reply.version);
        assert.equal(
          new URL(source.reactionRequest.url).pathname,
          `/api/content/${MAYA}/replies/${source.reply.id}/reaction`,
        );
        [note] = await sql(
          "SELECT i.id,i.version,i.state,p.signed_act_id,r.document->>'text' AS text,a.account_id,a.creator_id,a.subject_id,a.act_type FROM creator.content_index i JOIN creator.content_revision r ON r.content_id=i.id AND r.version=i.version JOIN creator.content_publication p ON p.content_id=i.id AND p.version=i.version JOIN creator.signed_act a ON a.id=p.signed_act_id WHERE i.id=$1 AND i.creator_id=$2 AND i.withdrawn_at IS NULL",
          [source.note.id, MAYA],
        );
        assert(note);
        for (const key of ["id", "version", "state", "signed_act_id", "text"])
          assert.equal(note[key], source.note[key]);
        assert.equal(note.state, "published");
        assert.equal(note.account_id, L.account(3));
        assert.equal(note.creator_id, MAYA);
        assert.equal(note.subject_id, note.id);
        assert.equal(note.act_type, "broadcast");
        noteText = note.text;
        [reply] = await sql(
          "SELECT r.id,r.version,r.content_id,r.creator_id,r.fan_id,r.text,f.account_id,m.state AS safety_state,m.review_ref,m.text_hash,w.case_id,d.id AS decision_id,d.state AS decision_state,d.reviewer_account_id,p.share_text,p.show_handle FROM creator.content_reply r JOIN creator.fan_profile f ON f.id=r.fan_id JOIN creator.content_reply_review m ON m.reply_id=r.id AND m.reply_version=r.version JOIN creator_trust.reply_review w ON w.reply_id=r.id AND w.reply_version=r.version JOIN creator_trust.reply_review_decision d ON d.case_id=w.case_id JOIN creator.content_quote_permission p ON p.reply_id=r.id WHERE r.id=$1 AND r.withdrawn_at IS NULL AND m.withdrawn_at IS NULL",
          [source.reply.id],
        );
        assert(reply);
        for (const key of [
          "id",
          "version",
          "text",
          "case_id",
          "text_hash",
          "share_text",
          "show_handle",
        ])
          assert.equal(reply[key], source.reply[key]);
        assert.equal(reply.creator_id, MAYA);
        assert.equal(reply.content_id, note.id);
        assert.equal(reply.fan_id, source.fanIds.member);
        assert.equal(reply.account_id, L.account(6));
        assert.equal(reply.safety_state, "allowed");
        assert.equal(reply.decision_state, "allowed");
        assert.equal(reply.reviewer_account_id, L.account(4));
        assert.equal(reply.review_ref, `w8-reply-review:${reply.decision_id}`);
        replyText = reply.text;
        [reaction] = await sql(
          "SELECT r.reply_id,r.kind,r.signed_act_id,a.act_type,a.account_id,a.creator_id,a.subject_id,a.content_hash FROM creator.content_reaction r JOIN creator.signed_act a ON a.id=r.signed_act_id WHERE r.reply_id=$1",
          [reply.id],
        );
        assert.equal(reaction?.signed_act_id, command.signedActId);
        assert.equal(reaction.kind, command.kind);
        assert.equal(reaction.act_type, "reaction");
        assert.equal(reaction.account_id, L.account(3));
        assert.equal(reaction.creator_id, MAYA);
        assert.equal(reaction.subject_id, reply.id);
        const commandBody = { creatorId: MAYA, replyId: reply.id, ...command };
        const canonicalBody = Object.fromEntries(
          Object.keys(commandBody)
            .sort()
            .map((key) => [key, commandBody[key]]),
        );
        const [receipt] = await sql(
          "SELECT request_hash,response FROM creator.idempotency_key WHERE actor_account_id=$1 AND operation='content.reaction' AND key=$2",
          [L.account(3), command.idempotencyKey],
        );
        assert(receipt);
        assert.equal(
          receipt.request_hash,
          createHash("sha256")
            .update(JSON.stringify(canonicalBody))
            .digest("hex"),
        );
        assert.deepEqual(receipt.response, source.reactionRequest.result);
        assert.deepEqual(receipt.response, {
          replyId: reply.id,
          kind: reaction.kind,
          signedActId: reaction.signed_act_id,
        });
        Object.assign(evidence, {
          actors: source.actors,
          fanIds: source.fanIds,
          fixture: source.fixture,
          note,
          reply,
          reaction,
          reactionRequest: source.reactionRequest,
        });
        evidence.sourceEvidence = {
          path: resolve(RESUME),
          sha256: createHash("sha256").update(sourceBytes).digest("hex"),
          run: source.run,
          acceptedSteps: source.steps.map((item) => item.name),
        };
        preserved = await custody();
        return {
          noteId: note.id,
          replyId: reply.id,
          signedActId: reaction.signed_act_id,
          originalSessionAccount: originalSession.account_id,
        };
      },
    );
  }
  const creatorToken = await L.apiSession(3);
  const creatorSession = ok(
    await api("GET", "/v1/identity/session", creatorToken),
  );
  assert.equal(creatorSession.accountId, L.account(3));
  if (source) {
    const memberToken = await L.apiSession(6);
    const memberSession = ok(
      await api("GET", "/v1/identity/session", memberToken),
    );
    assert.equal(memberSession.accountId, L.account(6));
    const [existingFan] = await sql(
      "SELECT id FROM creator.fan_profile WHERE account_id=$1",
      [memberSession.accountId],
    );
    assert.equal(existingFan?.id, source.fanIds.member);
    member = { id: existingFan.id, token: memberToken };
    browser = await L.launch();
    creator = await L.phone(browser);
    fan = await L.phone(browser);
    await step(
      "fresh creator and author browsers read the preserved accepted fixture",
      async () => {
        await login(creator.page, 3, `/studio/${MAYA}/notes`);
        await creator.page
          .locator(".w5-reply")
          .filter({ hasText: replyText })
          .waitFor();
        await login(fan.page, 6, `/content/${MAYA}/${note.id}`);
        const link = fan.page.getByRole("link", {
          name: "Maya reacted to your reply. Open the verification page",
          exact: true,
        });
        await link.waitFor();
        assert.equal(
          await link.getAttribute("href"),
          `/verify/${reaction.signed_act_id}`,
        );
        await fan.page.screenshot({
          path: resolve(OUT, `reply-content-${run}.png`),
          fullPage: true,
        });
        return {
          mode: "fresh current creator and original reply-author sessions",
          noteId: note.id,
          replyId: reply.id,
          signedActId: reaction.signed_act_id,
        };
      },
    );
  } else {
    const opsToken = await L.apiSession(4);
    member = await L.fan(6);
    const outsider = await L.fan(5);
    evidence.actors = Object.fromEntries(
      Object.entries({ creator: 3, ops: 4, member: 6, outsider: 5 }).map(
        ([name, developmentActor]) => [
          name,
          { developmentActor, accountId: L.account(developmentActor) },
        ],
      ),
    );
    evidence.fanIds = { member: member.id, outsider: outsider.id };
    await step("explicit synthetic membership fixture", async () => {
      const fixture = await L.member(
        member.id,
        await L.tier("Reply review qualification"),
      );
      evidence.fixture = { ...fixture, fanId: member.id, creatorId: MAYA };
      return fixture;
    });
    await step(
      "synthetic external proof through actual submission and Ops decision",
      async () => {
        const existing = await sql(
          "SELECT id,state FROM creator.creator_proof WHERE creator_id=$1 AND state='approved' ORDER BY reviewed_at DESC LIMIT 1",
          [MAYA],
        );
        if (existing[0])
          return { reusedPreviouslyApprovedProof: existing[0].id };
        const proof = ok(
          await api("POST", `/v1/identity/${MAYA}/proof`, creatorToken, {
            platform: "instagram",
            accountUrl: "https://instagram.com/local_synthetic_qualification",
          }),
        );
        ok(
          await api(
            "POST",
            `/v1/identity/proof/${proof.id}/submit`,
            creatorToken,
            { postUrl: `https://instagram.com/p/${proof.code}` },
          ),
        );
        const report = ok(
          await api("POST", "/v1/trust/reports", creatorToken, {
            kind: "verification",
            creatorId: MAYA,
            reason: `Synthetic local engineering proof ${run}; no real external ownership claim.`,
            idempotencyKey: randomUUID(),
          }),
        );
        const cases = ok(
          await api("GET", "/v1/trust/cases?queue=verification", opsToken),
        ).items;
        const [stored] = await sql(
          "SELECT id FROM creator_trust.safety_case WHERE creator_id=$1 AND reason LIKE $2 AND kind='verification'",
          [MAYA, `%${run}%`],
        );
        assert(
          stored && cases.some((c) => c.id === stored.id),
          JSON.stringify(report),
        );
        ok(
          await api("POST", `/v1/trust/cases/${stored.id}/access`, opsToken, {
            purpose:
              "Evaluate explicitly synthetic local creator proof for engineering qualification.",
            minutes: 15,
          }),
        );
        const detail = ok(
          await api("GET", `/v1/trust/cases/${stored.id}`, opsToken),
        );
        ok(
          await api(
            "POST",
            `/v1/trust/cases/${stored.id}/decisions`,
            opsToken,
            {
              version: detail.version,
              resolution: "verify_creator",
              reason:
                "Local synthetic proof accepted for this isolated engineering scenario only.",
              idempotencyKey: randomUUID(),
            },
          ),
        );
        await until(
          () =>
            sql("SELECT state FROM creator.creator_proof WHERE id=$1", [
              proof.id,
            ]),
          (rows) => rows[0]?.state === "approved",
          90000,
        );
        return { proofId: proof.id, caseId: stored.id };
      },
    );
    browser = await L.launch();
    creator = await L.phone(browser);
    fan = await L.phone(browser);
    const ops = await L.phone(browser);
    await step(
      "creator registers real signing passkey with virtual device",
      async () => {
        await login(creator.page, 3, "/studio/setup");
        await L.registerPasskey(creator.page);
      },
    );
    noteText = `Private reply review qualification ${run}. Members can reply privately.`;
    await step(
      "creator publishes a signed members Note in browser",
      async () => {
        await creator.page.goto(`${WEB}/studio/${MAYA}/today`);
        await creator.page.getByRole("link", { name: "New Note" }).click();
        await creator.page.locator("#note-text").fill(noteText);
        await creator.page
          .getByRole("button", { name: "Review and sign" })
          .click();
        await creator.page
          .getByRole("button", { name: "Sign with your passkey" })
          .click();
        await creator.page.waitForURL((u) => u.pathname.endsWith("/today"));
        [note] = await sql(
          "SELECT i.id,i.version,i.state,p.signed_act_id FROM creator.content_index i JOIN creator.content_revision r ON r.content_id=i.id AND r.version=i.version JOIN creator.content_publication p ON p.content_id=i.id AND p.version=i.version WHERE i.creator_id=$1 AND r.document->>'text'=$2",
          [MAYA, noteText],
        );
        assert.equal(note?.state, "published");
        assert(note.signed_act_id);
        evidence.note = { ...note, text: noteText };
        return note;
      },
    );
    replyText = `Private local reply ${run}: thank you for sharing this Note.`;
    await step(
      "fan submits private reply; exact review pending and no sharing consent",
      async () => {
        await login(fan.page, 6, `/content/${MAYA}/${note.id}`);
        await fan.page
          .getByLabel("Reply privately", { exact: true })
          .fill(replyText);
        await fan.page
          .getByRole("button", { name: "Send private reply", exact: true })
          .click();
        await fan.page
          .getByText(
            "Waiting for safety review. It has not reached the creator’s feed.",
          )
          .waitFor();
        [reply] = await sql(
          "SELECT r.id,r.version,m.state AS safety_state,p.share_text,p.show_handle,w.case_id,w.text_hash FROM creator.content_reply r JOIN creator.content_reply_review m ON m.reply_id=r.id JOIN creator.content_quote_permission p ON p.reply_id=r.id JOIN creator_trust.reply_review w ON w.reply_id=r.id WHERE r.text=$1",
          [replyText],
        );
        assert.equal(reply?.safety_state, "pending");
        assert.equal(reply.share_text, false);
        assert.equal(reply.show_handle, false);
        evidence.reply = { ...reply, text: replyText };
        const feed = ok(
          await api("GET", `/v1/content/${MAYA}/studio/replies`, creatorToken),
        );
        assert(
          !JSON.stringify(feed).includes(replyText),
          "pending text reached creator feed",
        );
        const noLease = await api(
          "GET",
          `/v1/trust/cases/${reply.case_id}`,
          opsToken,
        );
        assert.equal(noLease.status, 403);
        assert(!JSON.stringify(noLease).includes(replyText));
        return {
          replyId: reply.id,
          caseId: reply.case_id,
          beforeLease: noLease.status,
        };
      },
    );
    await step(
      "Ops queue hides private body until actual purpose lease",
      async () => {
        await login(ops.page, 4, "/ops");
        const link = ops.page.locator(`a[href='/ops/cases/${reply.case_id}']`);
        await link.waitFor();
        assert(
          !(await ops.page.locator("body").innerText()).includes(replyText),
        );
        await link.click();
        await ops.page
          .getByLabel("Purpose of access")
          .fill(
            "Review the exact synthetic private reply in this local engineering case.",
          );
        await ops.page
          .getByRole("button", { name: "Open case for 15 minutes" })
          .click();
        await ops.page.getByText(replyText, { exact: true }).waitFor();
        const [copied] = await sql(
          "SELECT count(*)::int AS n FROM creator_trust.case_evidence WHERE case_id=$1",
          [reply.case_id],
        );
        assert.equal(copied.n, 0, "private source copied into case evidence");
      },
    );
    await step(
      "reviewer records actual allow decision through browser confirmation",
      async () => {
        await ops.page.getByLabel("Allow this reply", { exact: false }).check();
        await ops.page
          .locator("#decision-reason")
          .fill(
            "Reviewed this exact synthetic reply; it is suitable for private delivery.",
          );
        await ops.page
          .getByRole("button", { name: "Resolve and notify both" })
          .click();
        await ops.page
          .getByRole("button", { name: "Record and notify", exact: true })
          .click();
        const rows = await until(
          () =>
            sql(
              "SELECT state,reviewer_account_id FROM creator_trust.reply_review_decision WHERE case_id=$1",
              [reply.case_id],
            ),
          (rows) => rows[0]?.state === "allowed",
        );
        assert.equal(rows[0].reviewer_account_id, L.account(4));
        return rows[0];
      },
    );
    await step(
      "wrong author and stale version cannot consume approval",
      async () => {
        const wrong = await api(
          "POST",
          `/v1/content/${MAYA}/replies/${reply.id}/review`,
          outsider.token,
          { version: reply.version, idempotencyKey: randomUUID() },
        );
        assert([403, 404].includes(wrong.status), JSON.stringify(wrong));
        const stale = await api(
          "POST",
          `/v1/content/${MAYA}/replies/${reply.id}/review`,
          member.token,
          { version: reply.version + 1, idempotencyKey: randomUUID() },
        );
        assert.equal(stale.status, 403, JSON.stringify(stale));
        assert.equal(stale.json?.error?.code, "reply_changed");
        return { wrongAuthor: wrong.status, staleVersion: stale.status };
      },
    );
    await step(
      "author browser consumes exact approval and creator feed receives reply",
      async () => {
        await fan.page
          .getByRole("button", { name: "Retry safety review" })
          .click();
        await until(
          () =>
            sql(
              "SELECT state AS safety_state FROM creator.content_reply_review WHERE reply_id=$1",
              [reply.id],
            ),
          (rows) => rows[0]?.safety_state === "allowed",
        );
        await creator.page.goto(`${WEB}/studio/${MAYA}/notes`);
        await creator.page
          .locator(".w5-reply")
          .filter({ hasText: replyText })
          .waitFor();
        assert(
          await creator.page
            .getByRole("button", { name: "Sharing consent required" })
            .isDisabled(),
        );
      },
    );
    await step(
      "creator signs reaction; author sees the signed reaction",
      async () => {
        const reactionPath = `/api/content/${MAYA}/replies/${reply.id}/reaction`;
        const submitted = creator.page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === reactionPath &&
            response.request().method() === "POST",
          { timeout: 60000 },
        );
        await creator.page
          .locator(".w5-reply")
          .filter({ hasText: replyText })
          .getByRole("button", { name: "React", exact: true })
          .click();
        await creator.page
          .getByRole("button", { name: "Sign with your passkey" })
          .click();
        const response = await submitted;
        assert.equal(response.status(), 200, await response.text());
        const request = response.request();
        const requestBody = request.postData();
        assert(
          requestBody,
          "browser reaction POST did not include its command",
        );
        const command = JSON.parse(requestBody);
        assert.equal(command.version, reply.version);
        assert.equal(command.kind, "heart");
        assert(command.idempotencyKey);
        const result = await response.json();
        assert.equal(result.replyId, reply.id);
        assert.equal(result.signedActId, command.signedActId);
        // Retain the exact original command and identity fence, never cookies or
        // bearer credentials. The replay below uses the same live browser session.
        const headers = Object.fromEntries(
          Object.entries(request.headers()).filter(([name]) =>
            [
              "content-type",
              "x-qelvora-expected-account",
              "x-expected-session-id",
            ].includes(name),
          ),
        );
        assert.equal(headers["x-qelvora-expected-account"], L.account(3));
        assert(headers["x-expected-session-id"]);
        evidence.reactionRequest = {
          url: request.url(),
          method: request.method(),
          headers,
          body: requestBody,
          result,
        };
        await save();
        await fan.page.reload();
        await fan.page
          .getByRole("link", {
            name: "Maya reacted to your reply. Open the verification page",
            exact: true,
          })
          .waitFor();
        [reaction] = await sql(
          "SELECT r.reply_id,r.kind,r.signed_act_id,a.act_type,a.account_id,a.content_hash FROM creator.content_reaction r JOIN creator.signed_act a ON a.id=r.signed_act_id WHERE r.reply_id=$1",
          [reply.id],
        );
        assert.equal(reaction?.act_type, "reaction");
        assert.equal(reaction.account_id, L.account(3));
        assert.equal(reaction.signed_act_id, command.signedActId);
        evidence.reaction = reaction;
        await fan.page.screenshot({
          path: resolve(OUT, `reply-content-${run}.png`),
          fullPage: true,
        });
        return reaction;
      },
    );
  }
  await step(
    source
      ? "fresh author-session replay of original signed command creates no extra reaction or signature"
      : "exact browser reaction replay creates no extra reaction or signature",
    async () => {
      const records = async () => {
        const [row] = await sql(
          "SELECT (SELECT coalesce(jsonb_agg(signed_act_id ORDER BY signed_act_id),'[]'::jsonb) FROM creator.content_reaction WHERE reply_id=$1) AS reactions,(SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb) FROM creator.signed_act WHERE subject_id=$1 AND act_type='reaction') AS signatures",
          [reply.id],
        );
        return row;
      };
      const before = await records();
      assert.deepEqual(before.reactions, [reaction.signed_act_id]);
      assert.deepEqual(before.signatures, [reaction.signed_act_id]);
      const replay = source
        ? await api(
            "POST",
            `/v1/content/${MAYA}/replies/${reply.id}/reaction`,
            creatorToken,
            JSON.parse(evidence.reactionRequest.body),
          )
        : await creator.page.evaluate(async (original) => {
            const response = await fetch(original.url, {
              method: original.method,
              headers: original.headers,
              body: original.body,
              credentials: "same-origin",
            });
            return { status: response.status, json: await response.json() };
          }, evidence.reactionRequest);
      assert.equal(replay.status, 200, JSON.stringify(replay));
      assert.deepEqual(replay.json, evidence.reactionRequest.result);
      const after = await records();
      assert.deepEqual(after, before);
      return {
        mode: source
          ? "exact original command replayed with fresh current creator API session"
          : "same browser session replay",
        status: replay.status,
        before,
        after,
      };
    },
  );
  await step(
    "public signed act verifies the exact reaction command hash",
    async () => {
      // This fixed command is serialized in canonical key order, independently
      // of the stored hash and of the public verification response.
      const exactCommand = {
        actType: "reaction",
        content: {
          creatorId: MAYA,
          kind: "content_reaction",
          reaction: reaction.kind,
          replyVersion: reply.version,
        },
        subjectId: reply.id,
      };
      const expectedHash = createHash("sha256")
        .update(JSON.stringify(exactCommand))
        .digest("hex");
      assert.equal(reaction.content_hash, expectedHash);
      const signature = ok(
        await api("GET", `/v1/identity/signed-acts/${reaction.signed_act_id}`),
      );
      assert.equal(signature.signedActId, reaction.signed_act_id);
      assert.equal(signature.status, "valid");
      assert.equal(signature.actType, "reaction");
      assert.equal(signature.contentHash, expectedHash);
      assert(!JSON.stringify(signature).includes(replyText));
      evidence.publicSignature = signature;
      return signature;
    },
  );
  await step(
    "original author has a genuine conversation for thread verification",
    async () => {
      const [existing] = await sql(
        "SELECT id,deleted_at FROM creator.thread WHERE creator_id=$1 AND fan_id=$2",
        [MAYA, member.id],
      );
      if (existing) {
        assert.equal(
          existing.deleted_at,
          null,
          "Never recreate a deleted conversation",
        );
        return {
          threadId: existing.id,
          mode: "preserved existing conversation",
        };
      }
      const caps = ok(
        await api("GET", "/v1/conversations/capabilities", member.token),
      );
      assert.equal(typeof caps.providers?.version, "string");
      assert.equal(caps.generationAvailable, true);
      const before = await sql(
        "SELECT id FROM creator.access_grant WHERE creator_id=$1 AND fan_id=$2",
        [MAYA, member.id],
      );
      const begun = ok(
        await api("POST", "/v1/conversations/begin", member.token, {
          creatorId: MAYA,
          policyVersion: caps.providers.version,
          accessNoticeAccepted: true,
          idempotencyKey: `reply-thread-${run}`,
        }),
      );
      assert.equal(begun.creatorId, MAYA);
      assert.equal(begun.fanId, member.id);
      assert.equal(begun.consentCurrent, true);
      assert.equal(begun.canSend, true);
      const after = await sql(
        "SELECT id,source FROM creator.access_grant WHERE creator_id=$1 AND fan_id=$2",
        [MAYA, member.id],
      );
      const created = after.filter(
        (grant) => !before.some((old) => old.id === grant.id),
      );
      assert(created.every((grant) => grant.source === "trial"));
      return {
        threadId: begun.threadId,
        mode: "actual begin API with current provider policy and synthetic author consent",
        policyVersion: caps.providers.version,
        createdTrialGrantIds: created.map((grant) => grant.id),
      };
    },
  );
  await step(
    "fan web thread renders real Note and reaction with signature navigation",
    async () => {
      const presence = ok(
        await api("GET", `/v1/content/${MAYA}/presence?limit=50`, member.token),
      );
      const noteItem = presence.items.find((item) => item.id === note.id);
      const reactionItem = presence.items.find(
        (item) => item.replyId === reply.id,
      );
      assert.equal(noteItem?.authorKind, "human_broadcast");
      assert.equal(noteItem.text, noteText);
      assert.equal(noteItem.signedActId, note.signed_act_id);
      assert.equal(reactionItem?.authorKind, "human_reaction");
      assert.equal(reactionItem.signedActId, reaction.signed_act_id);
      assert.equal(
        reactionItem.authorLabel,
        `${reactionItem.creatorName} reacted to your reply`,
      );
      assert(!JSON.stringify(reactionItem).includes(replyText));
      const threadPath = `/threads/${MAYA}/${member.id}`;
      await fan.page.goto(WEB + threadPath);
      const threadNote = fan.page.locator(`[data-presence-id='${note.id}']`);
      await threadNote.getByText(noteText, { exact: true }).waitFor();
      const threadReaction = fan.page.locator(
        `[data-presence-id='${reply.id}']`,
      );
      const marker = threadReaction.locator(
        `a[href='/verify/${reaction.signed_act_id}']`,
      );
      await marker.waitFor();
      assert.equal(
        await marker.getAttribute("aria-label"),
        `${reactionItem.authorLabel}. Open the verification page`,
      );
      await fan.page.screenshot({
        path: resolve(OUT, `reply-thread-${run}.png`),
        fullPage: true,
      });
      await marker.click();
      await fan.page.waitForURL(
        (url) => url.pathname === `/verify/${reaction.signed_act_id}`,
      );
      await fan.page
        .getByRole("heading", {
          name: `Signed by ${reactionItem.creatorName}`,
          exact: true,
        })
        .waitFor();
      await fan.page.getByText("Valid when checked", { exact: true }).waitFor();
      await fan.page
        .locator(".verification-rows")
        .getByText("Reaction", { exact: true })
        .waitFor();
      assert(
        (await fan.page.locator(".verification-hash").innerText()).includes(
          reaction.content_hash,
        ),
      );
      await fan.page.screenshot({
        path: resolve(OUT, `reply-signature-${run}.png`),
        fullPage: true,
      });
      evidence.nativeFixture = {
        binding,
        ...(evidence.sourceEvidence
          ? { sourceEvidence: evidence.sourceEvidence }
          : {}),
        creatorId: MAYA,
        creatorName: reactionItem.creatorName,
        noteId: note.id,
        noteSignedActId: note.signed_act_id,
        noteText,
        replyId: reply.id,
        replyText,
        signedActId: reaction.signed_act_id,
        contentHash: reaction.content_hash,
        authorLabel: reactionItem.authorLabel,
        actors: evidence.actors,
        fanIds: evidence.fanIds,
        threadPath,
        contentPath: `/content/${MAYA}/${note.id}`,
      };
      await writeFile(
        resolve(OUT, `native-fixture-${run}.json`),
        JSON.stringify(evidence.nativeFixture, null, 2),
        { mode: 0o600 },
      );
      return {
        note: noteItem,
        reaction: reactionItem,
        verificationPath: new URL(fan.page.url()).pathname,
      };
    },
  );
  if (source)
    await step(
      "accepted fixture signatures commands and clocks remain unchanged",
      async () => {
        const after = await custody();
        assert.deepEqual(after, preserved);
        return {
          sha256: createHash("sha256")
            .update(JSON.stringify(after))
            .digest("hex"),
          tables: [
            "content_index",
            "content_publication",
            "signed_act",
            "content_reply",
            "content_reply_review",
            "content_reaction",
            "idempotency_key",
          ],
        };
      },
    );
  evidence.completed = true;
  await save();
} catch (error) {
  evidence.failure = error.stack;
  for (const [index, page] of (browser?.contexts() ?? [])
    .flatMap((context) => context.pages())
    .entries()) {
    await page
      .screenshot({
        path: resolve(OUT, `failure-${run}-${index}.png`),
        fullPage: true,
      })
      .catch(() => undefined);
  }
  await save();
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  // The imported helper owns its pool; process exit follows completed evidence.
  process.exit(process.exitCode ?? 0);
}
