// Shared helpers for the lane 5 scenario scripts: plain Node, real HTTP against
// the running scenario host, and direct SQL only to seed fixtures or to read
// the state behind a screen. Fakes used: the development identity provider, a
// software passkey (the creator's signing device), and rows standing in for
// outcomes owned by other lanes (verification, membership purchase, safety
// review, block), each named where it is used.
import { createRequire } from "node:module";
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
} from "node:crypto";
import { actorId } from "./ids.mjs";

const require = createRequire(
  new URL("../../../apps/backend/package.json", import.meta.url),
);
const pg = require("pg");

export const BASE = process.env.LANE5_API ?? "http://127.0.0.1:56451";
const DB =
  process.env.LANE5_ADMIN_DB ??
  "postgresql://postgres:foundation-test-only@127.0.0.1:56450/creator_foundation_lane5";
export const RP_ID = "localhost";
export const ORIGIN = "http://localhost:3000";

let pool;
export const sql = (text, values) =>
  (pool ??= new pg.Pool({ connectionString: DB, max: 4 })).query(text, values);
export const closeDb = async () => {
  await pool?.end();
  pool = undefined;
};

export async function http(method, path, token, body) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  return { status: response.status, body: json };
}

/** Sign in as a synthetic account through the real begin/complete round trip. */
export async function signIn(index) {
  const started = await http("POST", "/v1/identity/continue", undefined, {
    returnTo: "/notifications",
  });
  if (started.status !== 200)
    throw new Error(`continue failed: ${JSON.stringify(started)}`);
  const done = await http("POST", "/v1/identity/complete", undefined, {
    continuationId: started.body.continuationId,
    code: actorId(index),
  });
  if (done.status !== 200)
    throw new Error(`complete failed: ${JSON.stringify(done)}`);
  return { token: done.body.token, accountId: actorId(index) };
}

// ------------------------------------------------------------- reporting

const results = [];
/** Run one named step; record pass or fail and keep going. */
export async function step(id, what, run) {
  try {
    const observed = await run();
    results.push({ id, what, pass: true, observed });
    console.log(`PASS ${id} ${what}${observed ? ` :: ${observed}` : ""}`);
  } catch (error) {
    results.push({ id, what, pass: false, observed: error.message });
    console.log(`FAIL ${id} ${what} :: ${error.message}`);
  }
}
/** A case that cannot run is reported as such, with the reason, never as a pass. */
export function skip(id, what, reason) {
  results.push({ id, what, pass: null, observed: reason });
  console.log(`SKIP ${id} ${what} :: not run: ${reason}`);
}
export function expect(condition, message) {
  if (!condition) throw new Error(message);
}
export function finish() {
  const failed = results.filter((r) => r.pass === false);
  const notRun = results.filter((r) => r.pass === null).length;
  console.log(
    `\n${results.filter((r) => r.pass).length}/${results.length - notRun} steps passed` +
      (notRun ? `, ${notRun} not run` : ""),
  );
  return failed.length ? 1 : 0;
}

// --------------------------------------------------------------- fixtures

/** A creator signs in, creates the profile through the API, then (stand-in for
 * the ops verification review, lane 1) is marked verified and enrols a
 * software passkey (stand-in for the registration ceremony). */
export async function seedCreator(index, handle, name) {
  const session = await signIn(index);
  const made = await http(
    "POST",
    "/v1/identity/creator-profile",
    session.token,
    {
      handle,
      displayName: name,
    },
  );
  if (made.status !== 200)
    throw new Error(`creator-profile failed: ${JSON.stringify(made)}`);
  await sql(
    "UPDATE creator.creator_profile SET verification='verified' WHERE id=$1",
    [made.body.id],
  );
  const passkey = newPasskey();
  await sql(
    "INSERT INTO creator.passkey_credential(id,account_id,public_key,counter) VALUES($1,$2,$3,0)",
    [passkey.credentialId, session.accountId, passkey.cose],
  );
  return { ...session, id: made.body.id, name, handle, passkey };
}

export async function seedFan(index, handle) {
  const session = await signIn(index);
  const made = await http("POST", "/v1/identity/fan-profile", session.token, {
    handle,
    intro: "",
  });
  if (made.status !== 200)
    throw new Error(`fan-profile failed: ${JSON.stringify(made)}`);
  return { ...session, id: made.body.id, handle };
}

export async function seedTier(creatorId, name) {
  const { rows } = await sql(
    "INSERT INTO creator.commerce_tier(creator_id,name,capabilities,ai_allowance,state) VALUES($1,$2,ARRAY['ai_message'],100,'active') RETURNING id",
    [creatorId, name],
  );
  return rows[0].id;
}

/** Stand-in for a completed membership purchase (lane 4): a current grant and
 * membership row exactly as the audience check reads them. */
export async function seedMembership(creatorId, fanId, tierId, options = {}) {
  const days = options.days ?? 30;
  const grant = (
    await sql(
      `INSERT INTO creator.access_grant(creator_id,fan_id,capabilities,source,state,valid_from,valid_until,allowance)
       VALUES($1,$2,ARRAY['ai_message'],'membership','active',now()-interval '1 day',now()+($3||' days')::interval,100) RETURNING id`,
      [creatorId, fanId, String(days)],
    )
  ).rows[0].id;
  const membership = (
    await sql(
      `INSERT INTO creator.commerce_membership(creator_id,fan_id,tier_id,provider,provider_ref,state,period_start,period_end,purchased_at,grant_id)
       VALUES($1,$2,$3,'stripe',$4,'active',now()-interval '1 day',now()+($5||' days')::interval,now()-interval '1 day',$6) RETURNING id`,
      [creatorId, fanId, tierId, `lane5-${randomUUID()}`, String(days), grant],
    )
  ).rows[0].id;
  return { grant, membership };
}
/** The membership ends now: the fan leaves the audience. */
export async function endMembership(membershipId, grantId) {
  await sql(
    "UPDATE creator.commerce_membership SET state='cancelled',period_end=now()-interval '1 second',period_start=now()-interval '2 days' WHERE id=$1",
    [membershipId],
  );
  await sql(
    "UPDATE creator.access_grant SET state='expired',valid_until=now()-interval '1 second',valid_from=now()-interval '2 days' WHERE id=$1",
    [grantId],
  );
}

// ------------------------------------------------- trust outcomes (lane 1)
// Stand-ins: rows the trust service writes when a creator blocks a fan, ops
// restricts an account, or an account is deleted. The denial functions that
// read them are the real ones; only the writing of the rows is faked.

async function safetyCase(subjectAccountId, creatorId) {
  return (
    await sql(
      `INSERT INTO creator_trust.safety_case(reporter_account_id,creator_id,subject_account_id,kind,queue,reason)
       VALUES($1,$2,$1,'abuse','safety','Scenario denial for lane 5 checks') RETURNING id`,
      [subjectAccountId, creatorId],
    )
  ).rows[0].id;
}
export async function blockFan(fan, creatorId) {
  await sql(
    "INSERT INTO creator_trust.block(account_id,creator_id,case_id) VALUES($1,$2,$3)",
    [fan.accountId, creatorId, await safetyCase(fan.accountId, creatorId)],
  );
}
export async function restrictFan(fan, creatorId) {
  await sql(
    "INSERT INTO creator_trust.restriction(case_id,account_id,reason_code) VALUES($1,$2,'scenario')",
    [await safetyCase(fan.accountId, creatorId), fan.accountId],
  );
}
export async function deleteFan(fan) {
  const job = (
    await sql(
      `INSERT INTO creator_trust.privacy_job(account_id,kind,scope,state,verified_at,verification_ref)
       VALUES($1,'delete','account','complete',now(),'scenario') RETURNING id`,
      [fan.accountId],
    )
  ).rows[0].id;
  await sql(
    "INSERT INTO creator_trust.tombstone(account_id,scope,job_id) VALUES($1,'account',$2)",
    [fan.accountId, job],
  );
}

// ---------------------------------------------------------- creator signing

function newPasskey() {
  const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = keys.publicKey.export({ format: "jwk" });
  const cose = Buffer.concat([
    Buffer.from("a5010203262001215820", "hex"),
    Buffer.from(jwk.x, "base64url"),
    Buffer.from("225820", "hex"),
    Buffer.from(jwk.y, "base64url"),
  ]);
  const credentialId = randomBytes(16).toString("base64url");
  let counter = 0;
  return {
    credentialId,
    cose,
    assertion(challenge) {
      counter += 1;
      const clientData = Buffer.from(
        JSON.stringify({ type: "webauthn.get", challenge, origin: ORIGIN }),
      );
      const count = Buffer.alloc(4);
      count.writeUInt32BE(counter);
      const authenticatorData = Buffer.concat([
        createHash("sha256").update(RP_ID).digest(),
        Buffer.from([5]),
        count,
      ]);
      const signature = sign(
        "sha256",
        Buffer.concat([
          authenticatorData,
          createHash("sha256").update(clientData).digest(),
        ]),
        keys.privateKey,
      );
      return {
        id: credentialId,
        rawId: credentialId,
        type: "public-key",
        response: {
          clientDataJSON: clientData.toString("base64url"),
          authenticatorData: authenticatorData.toString("base64url"),
          signature: signature.toString("base64url"),
        },
        clientExtensionResults: {},
      };
    },
  };
}

/** Sign a command as the creator through the real begin/verify endpoints. */
export async function signAct(creator, command) {
  const begun = await http(
    "POST",
    `/v1/identity/${creator.id}/signed-acts/begin`,
    creator.token,
    { command },
  );
  if (begun.status !== 200)
    throw new Error(`signing begin failed: ${JSON.stringify(begun)}`);
  const verified = await http(
    "POST",
    "/v1/identity/signed-acts/verify",
    creator.token,
    {
      challengeId: begun.body.challengeId,
      assertion: creator.passkey.assertion(begun.body.publicKey.challenge),
    },
  );
  if (verified.status !== 200)
    throw new Error(`signing verify failed: ${JSON.stringify(verified)}`);
  return verified.body.signedActId;
}

// ---------------------------------------------------------- Notes (content)

export const key = (label) => `${label}-${randomBytes(6).toString("hex")}`;

export function noteDocument(text, audience, extra = {}) {
  return {
    kind: "note",
    title: "",
    text,
    audience,
    media: [],
    nameToken: false,
    showAudienceCount: false,
    aiUseIntent: false,
    scheduledAt: null,
    quote: null,
    packetId: null,
    ...extra,
  };
}

/** Draft, sign and publish a Note through the real content endpoints. */
export async function publishNote(creator, text, audience, extra = {}) {
  const id = randomUUID();
  const draft = await saveDraft(creator, id, 0, text, audience, extra);
  return {
    id,
    ...(await signAndPublish(creator, id, draft.version, draft.document)),
  };
}

/** Save a Note draft (a new Note at expectedVersion 0, an edit above that). */
export async function saveDraft(
  creator,
  id,
  expectedVersion,
  text,
  audience,
  extra = {},
) {
  const document = noteDocument(text, audience, extra);
  const saved = await http(
    "POST",
    `/v1/content/${creator.id}/drafts`,
    creator.token,
    {
      id,
      expectedVersion,
      document,
      idempotencyKey: key("draft"),
    },
  );
  if (saved.status !== 200)
    throw new Error(`draft failed: ${JSON.stringify(saved)}`);
  return { version: saved.body.version, document };
}

/** Sign the exact draft and publish it. Returns the publish response too. */
export async function signAndPublish(
  creator,
  id,
  version,
  document,
  publishKey = key("publish"),
) {
  const signedActId = await signAct(creator, {
    actType: "broadcast",
    subjectId: id,
    content: {
      kind: "content_publication",
      creatorId: creator.id,
      version,
      document,
    },
  });
  const response = await http(
    "POST",
    `/v1/content/${creator.id}/${id}/publish`,
    creator.token,
    { version, signedActId, idempotencyKey: publishKey },
  );
  return { version, signedActId, response };
}

// ------------------------------------------------- replies and reactions

/** A fan's private reply to a Note, through the real endpoint. It starts
 * pending: only a recorded safety decision lets the creator react. */
export async function replyToNote(fan, creatorId, noteId, text) {
  const made = await http(
    "POST",
    `/v1/content/${creatorId}/${noteId}/replies`,
    fan.token,
    { text, idempotencyKey: key("reply") },
  );
  if (made.status !== 200)
    throw new Error(`reply failed: ${JSON.stringify(made)}`);
  return { replyId: made.body.id, version: made.body.version };
}
/** Stand-in for the safety reviewer's recorded human decision (lane 1 owns
 * auto-allowing clean replies): the review row is marked allowed. */
export async function allowReply(replyId) {
  await sql(
    "UPDATE creator.content_reply_review SET state='allowed',review_ref='scenario-reviewer' WHERE reply_id=$1",
    [replyId],
  );
}
/** The creator signs one reaction and sends it. */
export async function react(
  creator,
  replyId,
  version,
  kind = "heart",
  signedActId,
) {
  const signed =
    signedActId ??
    (await signAct(creator, {
      actType: "reaction",
      subjectId: replyId,
      content: {
        kind: "content_reaction",
        creatorId: creator.id,
        replyVersion: version,
        reaction: kind,
      },
    }));
  const body = {
    version,
    kind,
    signedActId: signed,
    idempotencyKey: key("react"),
  };
  const response = await http(
    "POST",
    `/v1/content/${creator.id}/replies/${replyId}/reaction`,
    creator.token,
    body,
  );
  return {
    signedActId: signed,
    response,
    body,
    send: () =>
      http(
        "POST",
        `/v1/content/${creator.id}/replies/${replyId}/reaction`,
        creator.token,
        body,
      ),
  };
}

// ------------------------------------------------ notifications and push

const GATEWAY = process.env.LANE5_GATEWAY ?? "http://127.0.0.1:56453";
/** A fan's notification list, as the app shows it. */
export async function inbox(fan) {
  const r = await http("GET", "/v1/growth/notifications", fan.token);
  if (r.status !== 200)
    throw new Error(`inbox ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.notifications;
}
/** The full preference document; push is off unless a fan turns it on. */
export async function setPreferences(fan, overrides = {}) {
  const r = await http("PUT", "/v1/growth/preferences", fan.token, {
    push: true,
    email: false,
    hideSensitive: true,
    quietStart: null,
    quietEnd: null,
    timeZone: "UTC",
    mutedCreators: [],
    disabledPushTypes: [],
    disabledEmailTypes: [],
    ...overrides,
  });
  if (r.status !== 200)
    throw new Error(`preferences ${r.status} ${JSON.stringify(r.body)}`);
}
/** What the fake push gateway (standing in for APNs and FCM) received. */
export async function pushes() {
  return (await fetch(`${GATEWAY}/sent`)).json();
}
export const clearPushes = () => fetch(`${GATEWAY}/sent`, { method: "DELETE" });
export const gateway = (state) =>
  fetch(`${GATEWAY}/${state}`, { method: "PUT" });
/** The creator's pending downstream work, run on demand (the Studio's button). */
export const runEffects = (creator) =>
  http(
    "POST",
    `/v1/content/${creator.id}/studio/effects/run`,
    creator.token,
    {},
  );
/** Poll until the check returns something truthy, or fail with the reason. */
export async function waitFor(label, check, timeoutMs = 20000) {
  const until = Date.now() + timeoutMs;
  let last;
  while (Date.now() < until) {
    last = await check();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timed out waiting for ${label}`);
}
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
