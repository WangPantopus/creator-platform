// Shared helpers for lane 4's money scenarios: plain Node, real HTTP against
// the running lane 4 stack (tests/scenarios/lane-4/stack.mjs), and SQL only to
// read the state behind a response or to move a deadline in this lane's own
// disposable database. Fakes, all at the outer edge: the card processor
// (fake-stripe.mjs), the development identity, and a software passkey enrolled
// as a row (a stand-in for lane 1's registration ceremony).
import { createRequire } from "node:module";
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
} from "node:crypto";
import { sweep } from "./sweep.mjs";

const require = createRequire(
  new URL("../../../apps/backend/package.json", import.meta.url),
);
const pg = require("pg");

export const API = process.env.LANE4_API ?? "http://127.0.0.1:56441";
export const STRIPE = process.env.LANE4_FAKE_STRIPE ?? "http://127.0.0.1:56444";
export const ADMIN_DB =
  process.env.LANE4_ADMIN_DB ??
  "postgresql://postgres:foundation-test-only@127.0.0.1:56440/creator_stack";
const runtimeUrl = new URL(ADMIN_DB);
runtimeUrl.username = "creator_runtime";
/** The backend's own non-owner login (the stack's documented loopback test password). */
export const RUNTIME_DB = runtimeUrl.toString();
export const ORIGIN = process.env.LANE4_WEB_ORIGIN ?? "http://localhost:56442";
const RP_ID = "localhost";
if (!/@127\.0\.0\.1:5644\d\//u.test(ADMIN_DB))
  throw new Error(
    "Lane 4 scenarios run only on lane 4's own database (ports 56440 to 56449).",
  );

/** The development identity's fixed synthetic accounts, and the seeded creators. */
const actor = (n) => `10000000-0000-4000-8000-00000000000${n}`;
export const ACCOUNT = {
  fanOne: actor(1),
  fanTwo: actor(2),
  maya: actor(3),
  team: actor(4),
  devon: actor(5),
  fanThree: actor(6),
  minor: actor(7),
};
export const CREATOR = {
  maya: "20000000-0000-4000-8000-000000000001",
  devon: "20000000-0000-4000-8000-000000000002",
};

let pool;
export const sql = async (text, values) =>
  (
    await (pool ??= new pg.Pool({ connectionString: ADMIN_DB, max: 4 })).query(
      text,
      values,
    )
  ).rows;
export const key = (label = "lane4") => `${label}-${randomUUID()}`;
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function http(method, path, token, body, headers = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  return { status: response.status, body: json, code: json?.error?.code };
}
/** The fake processor's scenario controls and its record of money truth. */
export const stripe = async (body) =>
  (
    await fetch(`${STRIPE}/__control`, {
      method: "POST",
      body: JSON.stringify(body),
    })
  ).json();
export const stripeState = async () =>
  (await fetch(`${STRIPE}/__state`)).json();

// ------------------------------------------------------------------ people

export async function signIn(accountId) {
  const begun = await http("POST", "/v1/identity/continue", undefined, {
    returnTo: "/home",
  });
  const done = await http("POST", "/v1/identity/complete", undefined, {
    continuationId: begun.body?.continuationId,
    code: accountId,
  });
  if (done.status !== 200)
    throw new Error(
      `sign-in refused for ${accountId}: ${done.status} ${JSON.stringify(done.body)}`,
    );
  return { token: done.body.token, accountId, session: done.body.session };
}

/** A fan with a profile and an open conversation with the creator (privacy and processor notices accepted). */
export async function asFan(accountId, creatorId = CREATOR.maya) {
  const person = await signIn(accountId);
  let fan = person.session?.fan;
  if (!fan) {
    const made = await http("POST", "/v1/identity/fan-profile", person.token, {
      handle: `lane4fan${accountId.slice(-1)}`,
      intro: "",
    });
    if (made.status !== 200)
      throw new Error(
        `fan profile refused: ${made.status} ${JSON.stringify(made.body)}`,
      );
    fan = made.body;
  }
  const caps = await http(
    "GET",
    "/v1/conversations/capabilities",
    person.token,
  );
  const begun = await http("POST", "/v1/conversations/begin", person.token, {
    creatorId,
    policyVersion: caps.body.providers.version,
    accessNoticeAccepted: true,
    idempotencyKey: key("begin"),
  });
  if (begun.status !== 200)
    throw new Error(
      `conversation refused: ${begun.status} ${JSON.stringify(begun.body)}`,
    );
  return { ...person, fanId: fan.id, creatorId };
}

/** A creator signed in with a fresh software passkey (the row stands in for lane 1's ceremony). */
export async function asCreator(accountId, creatorId) {
  const person = await signIn(accountId);
  const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = keys.publicKey.export({ format: "jwk" });
  const credentialId = randomBytes(16).toString("base64url");
  const cose = Buffer.concat([
    Buffer.from("a5010203262001215820", "hex"),
    Buffer.from(jwk.x, "base64url"),
    Buffer.from("225820", "hex"),
    Buffer.from(jwk.y, "base64url"),
  ]);
  await sql(
    "INSERT INTO creator.passkey_credential(id,account_id,public_key,counter) VALUES($1,$2,$3,0)",
    [credentialId, accountId, cose],
  );
  let counter = 0;
  const assertion = (challenge) => {
    const clientData = Buffer.from(
      JSON.stringify({ type: "webauthn.get", challenge, origin: ORIGIN }),
    );
    const count = Buffer.alloc(4);
    count.writeUInt32BE(++counter);
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
      clientExtensionResults: {},
      response: {
        clientDataJSON: clientData.toString("base64url"),
        authenticatorData: authenticatorData.toString("base64url"),
        signature: signature.toString("base64url"),
      },
    };
  };
  return { ...person, creatorId, assertion };
}

/** Sign the exact command through the real begin and verify endpoints (a reply
 * names its fan). Returns the act id, or the refusal. */
export async function signAct(
  creator,
  command,
  { creatorId = creator.creatorId, fanId } = {},
) {
  const begun = await http(
    "POST",
    `/v1/identity/${creatorId}/signed-acts/begin`,
    creator.token,
    { ...(fanId ? { fanId } : {}), command },
  );
  if (begun.status !== 200) return { refused: begun };
  const verified = await http(
    "POST",
    "/v1/identity/signed-acts/verify",
    creator.token,
    {
      challengeId: begun.body.challengeId,
      assertion: creator.assertion(begun.body.publicKey.challenge),
    },
  );
  return verified.status === 200
    ? { signedActId: verified.body.signedActId }
    : { refused: verified };
}

// ----------------------------------------------------------------- money

export const offer = (creator, overrides = {}) =>
  http(
    "POST",
    `/v1/commerce/creators/${creator.creatorId}/modes`,
    creator.token,
    {
      title: "Written reply",
      kind: "written_reply",
      amount: 5000,
      publicAmount: null,
      currency: "USD",
      decisionHours: 48,
      deliveryHours: 72,
      durationSeconds: null,
      weeklyLimit: 5,
      shareable: false,
      state: "offered",
      version: 0,
      idempotencyKey: key("mode"),
      ...overrides,
    },
  );
export const setLimit = (fan, amount) =>
  http("POST", "/v1/commerce/spend-limit", fan.token, {
    currency: "USD",
    amount,
    explicitNone: amount === null,
    remindersOn: false,
    idempotencyKey: key("limit"),
  });
export const submitBody = (fan, mode, overrides = {}) => ({
  creatorId: fan.creatorId,
  fanId: fan.fanId,
  modeId: mode.id,
  modeVersion: mode.version,
  visibility: "private",
  disclosure: {
    summary: "My glaze crawls on thick pieces",
    includeSummary: true,
    messageIds: [],
    attachmentIds: [],
    wholeThread: false,
    identity: "handle",
    accessNoticeVersion: "C06-1",
  },
  paymentMethodId: "pm_cardVisa",
  idempotencyKey: key("submit"),
  ...overrides,
});
export const submit = (fan, mode, overrides) =>
  http(
    "POST",
    "/v1/commerce/packets",
    fan.token,
    submitBody(fan, mode, overrides),
  );
export const packet = (who, id) =>
  http("GET", `/v1/commerce/packets/${id}`, who?.token);
export const packetRow = async (id) =>
  (await sql("SELECT * FROM creator.commerce_packet WHERE id=$1", [id]))[0];
export const ledger = (id) =>
  sql(
    "SELECT kind,amount::bigint AS amount,currency,cause FROM creator.commerce_ledger WHERE packet_id=$1 ORDER BY created_at,id",
    [id],
  );
export const intentsFor = async (id) =>
  (await stripeState()).intents.filter((i) => i.metadata.packet_id === id);

/** The exact acceptance the creator reviews and signs: request, version, price snapshot and action. */
export const acceptCommand = (p, action = "reply_myself") => ({
  actType: "accept",
  subjectId: p.thread_id,
  content: {
    packetId: p.id,
    packetVersion: p.version,
    snapshot: p.snapshot,
    action,
  },
});
export async function accept(creator, packetId, action = "reply_myself") {
  const { body } = await packet(creator, packetId);
  if (!body?.packet) return { status: 0, body, code: "unreadable" };
  const signed = await signAct(creator, acceptCommand(body.packet, action));
  if (!signed.signedActId) return { ...signed.refused, signing: true };
  return decide(creator, packetId, {
    action,
    signedActId: signed.signedActId,
    version: body.packet.version,
  });
}
export async function decide(who, packetId, body) {
  const version = body.version ?? (await packetRow(packetId)).version;
  return http("POST", `/v1/commerce/packets/${packetId}/decide`, who?.token, {
    idempotencyKey: key("decide"),
    ...body,
    version,
  });
}
export async function withdraw(fan, packetId) {
  return http("POST", `/v1/commerce/packets/${packetId}/withdraw`, fan?.token, {
    version: (await packetRow(packetId)).version,
    idempotencyKey: key("withdraw"),
  });
}
/** Takes an offer off offer through the real mode command, as its creator would. */
export async function pauseOffer(creator, modeId) {
  const [m] = await sql("SELECT * FROM creator.commerce_mode WHERE id=$1", [
    modeId,
  ]);
  return http(
    "POST",
    `/v1/commerce/creators/${m.creator_id}/modes/${modeId}`,
    creator.token,
    {
      title: m.title,
      kind: m.kind,
      amount: m.amount === null ? null : Number(m.amount),
      publicAmount: m.public_amount === null ? null : Number(m.public_amount),
      currency: m.currency,
      decisionHours: m.decision_hours,
      deliveryHours: m.delivery_hours,
      durationSeconds: m.duration_seconds,
      weeklyLimit: m.weekly_limit,
      shareable: m.shareable,
      state: "paused",
      version: m.version,
      idempotencyKey: key("pause"),
    },
  );
}

// -------------------------------------------------------------- reporting

const results = [];
/** Run one named step; record pass or fail and keep going. */
export async function step(id, what, run) {
  try {
    const observed = await run();
    results.push({ id, pass: true });
    console.log(`PASS ${id} ${what}${observed ? ` :: ${observed}` : ""}`);
  } catch (error) {
    results.push({ id, pass: false });
    console.log(`FAIL ${id} ${what} :: ${error.message}`);
  }
}
export function expect(condition, message) {
  if (!condition) throw new Error(message);
}
/** Every scenario ends with the read-only invariant sweep; it passes only if both pass. */
export async function finish() {
  await step(
    "sweep",
    "invariant sweep over the whole money state",
    async () => {
      const report = await sweep();
      for (const line of report.lines) console.log(`  ${line}`);
      expect(report.failures === 0, `${report.failures} invariant(s) broken`);
      return `${report.checks} checks clean`;
    },
  );
  await pool?.end();
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} steps passed`);
  process.exit(failed ? 1 : 0);
}
