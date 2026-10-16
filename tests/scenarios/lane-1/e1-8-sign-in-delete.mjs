#!/usr/bin/env node
// E1.8 for accounts that sign in with Apple or Google (option D): export and
// deletion of the sign-in records, and revocation at the provider.
//   A  an Apple account used on the web and on an iPhone. Its export shows its
//      email, sign-ins and age checks but no token. Its deletion waits for the
//      other domains without revoking anything, then revokes both clients'
//      tokens, deletes the identity and closes the account. A later sign-in
//      starts a new, empty account (D2, working default). A bystander is
//      untouched;
//   B  a Google account whose token the person already revoked at Google, and
//      one with no token (Google's usual case);
//   C  Apple is down during erasure: the task retries, then finishes;
//   D  Apple refuses the revocation (a wrong client setup): the task blocks,
//      nothing is deleted, and a retry after the fix finishes;
//   R  a sign-in during erasure stores a new token: that attempt waits and
//      the next one revokes it.
// Deletion jobs cannot finish on main yet: lanes 2 to 5's domains block or
// retry (docs/lanes/status/lane-1-deletion.md). Identity erases last, so after
// checking that it waits, this script marks the other domains' tasks of its
// own jobs complete in the database: a stand-in that changes task state only
// and erases none of their data. Fakes: Apple and Google (fake-provider.mjs)
// and the development privacy proof.
// Needs the lane stack with sign-in on and the fake provider (README in
// docs/lanes/status/lane-1-deletion.md):
//   node tests/scenarios/lane-1/e1-8-sign-in-delete.mjs
// The unconfigured-host case (Apple turned off with an Apple token still
// held) runs in two steps around a backend restart with QELVORA_SIGN_IN=google:
//   node tests/scenarios/lane-1/e1-8-sign-in-delete.mjs --prepare FILE
//   (restart without Apple)
//   node tests/scenarios/lane-1/e1-8-sign-in-delete.mjs --unconfigured FILE
//   (restart with Apple again)
//   node tests/scenarios/lane-1/e1-8-sign-in-delete.mjs --recover FILE
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import {
  FAKE,
  call,
  confirmAge,
  describe,
  nativeSignIn,
  nativeStart,
  one,
  person,
  reporter,
  sleep,
  sql,
  webSignIn,
  yearsAgo,
} from "./sign-in-lib.mjs";

const { step, note, finish } = reporter();
const arg = (name) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : undefined;
};
const control = (body) => call("POST", "/__control", { base: FAKE, body });
const fake = async () => (await call("GET", "/__stats", { base: FAKE })).json;
const tokensOf = (stats, sub) =>
  stats.refreshTokens.filter((item) => item.sub === sub);
const quote = (value) => `'${String(value).replace(/'/gu, "''")}'`;

/** A web sign-in that answers the age step as an adult when it is asked. */
async function signInWeb(provider, sub, claims) {
  const first = await webSignIn(provider, sub, claims ? { claims } : {});
  const done =
    first.json?.status === "age_required"
      ? await confirmAge(first, yearsAgo(30))
      : first;
  const token = done.json?.completion?.token;
  const session = token
    ? await call("GET", "/v1/identity/session", { token })
    : undefined;
  return {
    first,
    done,
    token,
    accountId: session?.json?.accountId,
    ageAsked: first.json?.status === "age_required",
  };
}
async function signInIphone(sub, claims) {
  const start = await nativeStart("apple", "ios");
  const code = (
    await call("POST", "/__apple-native-code", { base: FAKE, body: { sub } })
  ).json.code;
  const result = await nativeSignIn(sub, {
    start,
    authorizationCode: code,
    claims,
  });
  const token = result.json?.completion?.token;
  const session = token
    ? await call("GET", "/v1/identity/session", { token })
    : undefined;
  return { result, token, accountId: session?.json?.accountId };
}
const job = (token, kind) =>
  call("POST", "/v1/trust/privacy/jobs", {
    token,
    body: {
      kind,
      scope: "account",
      proof: "LOCAL DEVELOPMENT",
      idempotencyKey: `${kind}-${randomUUID()}`,
    },
  });
const task = (jobId, domain = "identity") =>
  sql(
    `SELECT state,coalesce(error_code,''),coalesce(receipt::text,'') FROM creator_trust.privacy_task WHERE job_id=${quote(jobId)} AND domain=${quote(domain)}`,
  )[0] ?? [];
async function until(jobId, done, seconds = 150) {
  for (let waited = 0; waited <= seconds; waited += 3) {
    const current = task(jobId);
    if (done(current)) return current;
    await sleep(3000);
  }
  return task(jobId);
}
/** The stand-in for lanes 2 to 5 (see the header): task state only. */
function standIn(jobId) {
  return sql(
    `UPDATE creator_trust.privacy_task SET state='complete',error_code=NULL,lease_until=NULL,lease_token=NULL,completed_at=now() WHERE job_id=${quote(jobId)} AND domain NOT IN ('identity','media') AND state<>'complete' RETURNING domain`,
  )
    .map(([domain]) => domain)
    .filter((domain) => !/^UPDATE \d+$/u.test(domain)); // psql's command tag
}
const identityRows = (accountId) =>
  one(
    `SELECT count(*) FROM creator.account_identity WHERE account_id=${quote(accountId)}`,
  );
const cipherOf = (accountId) =>
  one(
    `SELECT provider_refresh_cipher FROM creator.account_identity WHERE account_id=${quote(accountId)}`,
  );
const accountState = (accountId) =>
  one(`SELECT state FROM creator.account WHERE id=${quote(accountId)}`);

if (arg("--prepare")) {
  // Unconfigured host, step 1: an Apple account with a stored refresh token.
  const sub = person("unconfigured");
  const signedIn = await signInWeb("apple", sub, {
    email: `${sub}@privaterelay.example`,
  });
  step(
    "prepare: an Apple account with a stored token",
    Boolean(signedIn.token) &&
      one(
        `SELECT count(*) FROM creator.account_identity WHERE account_id=${quote(signedIn.accountId)} AND provider_refresh_cipher IS NOT NULL`,
      ) === "1",
  );
  writeFileSync(
    arg("--prepare"),
    JSON.stringify({
      sub,
      token: signedIn.token,
      accountId: signedIn.accountId,
    }),
    { mode: 0o600 },
  );
  finish();
}
if (arg("--unconfigured")) {
  // Step 2, after a restart with Apple off (Google still on): the export
  // still opens the email with the host's key, but erasure cannot revoke the
  // Apple token, so it blocks and nothing is deleted or revoked.
  const saved = JSON.parse(readFileSync(arg("--unconfigured"), "utf8"));
  const exported = await job(saved.token, "export");
  const exportTask = await until(exported.json?.id, ([s]) =>
    ["blocked", "complete"].includes(s),
  );
  const exportedData = JSON.parse(
    one(
      `SELECT data::text FROM creator_trust.privacy_task WHERE job_id=${quote(exported.json?.id)} AND domain='identity'`,
    ) ?? "{}",
  );
  step(
    "unconfigured: the export still completes with the email",
    exportTask[0] === "complete" &&
      exportedData.signInIdentities?.[0]?.email ===
        `${saved.sub}@privaterelay.example`,
    `${exportTask.slice(0, 2).join(":")} ${describe(exported)}`,
  );
  const deleted = await job(saved.token, "delete");
  const others = standIn(deleted.json?.id);
  const deleteTask = await until(
    deleted.json?.id,
    ([s, c]) =>
      s === "blocked" ||
      s === "complete" ||
      c === "identity_sign_in_unconfigured",
  );
  step(
    "unconfigured: erasure blocks before deleting anything",
    deleteTask[0] === "blocked" &&
      deleteTask[1] === "identity_sign_in_unconfigured" &&
      identityRows(saved.accountId) === "1" &&
      accountState(saved.accountId) === "active",
    `${deleteTask.slice(0, 2).join(":")}, stand-in for ${others.length} domains`,
  );
  step(
    "unconfigured: no token was revoked",
    tokensOf(await fake(), saved.sub).every((item) => !item.revoked),
  );
  writeFileSync(
    arg("--unconfigured"),
    JSON.stringify({ ...saved, deleteJob: deleted.json?.id }),
    { mode: 0o600 },
  );
  finish();
}
if (arg("--recover")) {
  // Step 3, after a restart with Apple back: the person retries, and the
  // blocked erasure revokes and finishes.
  const saved = JSON.parse(readFileSync(arg("--recover"), "utf8"));
  const before = task(saved.deleteJob);
  const retried = await call(
    "POST",
    `/v1/trust/privacy/jobs/${saved.deleteJob}/retry`,
    { token: saved.token, body: {} },
  );
  const after = await until(saved.deleteJob, ([s]) =>
    ["complete", "blocked", "dead_letter"].includes(s),
  );
  step(
    "recover: still blocked after the restart, then the person's retry finishes it",
    before[0] === "blocked" &&
      retried.status === 200 &&
      after[0] === "complete" &&
      tokensOf(await fake(), saved.sub).every((item) => item.revoked) &&
      identityRows(saved.accountId) === "0" &&
      accountState(saved.accountId) === "deleted",
    `${before.slice(0, 2).join(":")} then retry ${describe(retried)}, ${after.slice(0, 2).join(":")}`,
  );
  finish();
}

await control({ mode: "ok", googleRefresh: false });

// A: an Apple account on the web and an iPhone, and a bystander.
const bystanderSub = person("bystander");
const bystander = await signInWeb("apple", bystanderSub);
const subA = person("apple-a");
const emailA = `${subA}@privaterelay.example`;
const webA = await signInWeb("apple", subA, { email: emailA });
const phoneA = await signInIphone(subA, { email: emailA });
const fanA = await call("POST", "/v1/identity/fan-profile", {
  token: webA.token,
  body: { handle: `e18a${Date.now() % 1e6}`, intro: "Glaze tests on Sundays" },
});
const accountA = webA.accountId;
step(
  "A: the web and the iPhone reach one account with a fan profile",
  Boolean(accountA) &&
    phoneA.accountId === accountA &&
    fanA.status === 200 &&
    Boolean(bystander.token),
  `${describe(webA.done)}, iPhone ${describe(phoneA.result)}, fan ${describe(fanA)}`,
);
const issuedA = tokensOf(await fake(), subA);
step(
  "A: Apple issued one refresh token to each client",
  issuedA.length === 2 &&
    new Set(issuedA.map((item) => item.clientId)).size === 2,
  issuedA.map((item) => item.clientId).join(", "),
);

const exportA = await job(webA.token, "export");
step("A: export accepted", exportA.status === 202, describe(exportA));
const exportTaskA = await until(exportA.json?.id, ([s]) => s === "complete");
const exportedA = JSON.parse(
  one(
    `SELECT data::text FROM creator_trust.privacy_task WHERE job_id=${quote(exportA.json?.id)} AND domain='identity'`,
  ) ?? "{}",
);
const identityA = exportedA.signInIdentities?.[0];
step(
  "A export: the account, its Apple identity and email, sign-ins and age check",
  exportTaskA[0] === "complete" &&
    exportedA.signInAccount?.[0]?.id === accountA &&
    exportedA.signInAccount?.[0]?.state === "active" &&
    exportedA.signInIdentities?.length === 1 &&
    identityA?.provider === "apple" &&
    identityA?.email === emailA &&
    identityA?.provider_authorization_held === true &&
    exportedA.signInGrants?.length >= 2 &&
    exportedA.ageChecks?.length === 1 &&
    exportedA.ageChecks[0].result === "adult",
  `identities ${exportedA.signInIdentities?.length}, grants ${exportedA.signInGrants?.length}, age checks ${exportedA.ageChecks?.length}`,
);
const exportText = JSON.stringify(exportedA);
step(
  "A export: no token, cipher, subject or date of birth",
  !issuedA.some((item) => exportText.includes(item.token)) &&
    !/cipher|subject_hmac|token_hash/u.test(exportText) &&
    !exportText.includes(yearsAgo(30)),
);

const deleteA = await job(webA.token, "delete");
step(
  "A: deletion accepted with immediate denial",
  deleteA.status === 202 && deleteA.json?.immediateDeny === true,
  describe(deleteA),
);
const refusedA = await Promise.all(
  [webA.token, phoneA.token].map((token) =>
    call("GET", "/v1/identity/session", { token }),
  ),
);
step(
  "A: the web and iPhone sessions are refused at once",
  refusedA.every((r) => r.status >= 400),
  refusedA.map(describe).join(", "),
);
const duringA = await signInWeb("apple", subA);
const duringSession = duringA.token
  ? await call("GET", "/v1/identity/session", { token: duringA.token })
  : undefined;
step(
  "A: signing in during the deletion gives no usable session",
  !duringSession || duringSession.status >= 400,
  `${describe(duringA.done)}${duringSession ? `, session ${describe(duringSession)}` : ""}`,
);
// Its first attempt, before the stand-in below.
const waitingA = await until(
  deleteA.json?.id,
  ([s]) => !["pending", "running"].includes(s),
  60,
);
step(
  "A: identity waits for the other domains and revokes nothing yet",
  waitingA[0] === "retry" &&
    waitingA[1] === "identity_erasure_waiting" &&
    tokensOf(await fake(), subA).every((item) => !item.revoked) &&
    identityRows(accountA) === "1" &&
    accountState(accountA) === "active",
  waitingA.slice(0, 2).join(":"),
);
note(`A stand-in: ${standIn(deleteA.json?.id).join(", ")} marked complete`);
const erasedA = await until(deleteA.json?.id, ([s]) =>
  ["complete", "blocked", "dead_letter"].includes(s),
);
const receiptA = JSON.parse(erasedA[2] || "{}");
const afterA = tokensOf(await fake(), subA);
step(
  "A: identity erases; every token Apple issued is revoked",
  erasedA[0] === "complete" &&
    afterA.length === 3 &&
    afterA.every((item) => item.revoked) &&
    receiptA.revokedProviderTokens === 2,
  `${erasedA.slice(0, 2).join(":")}, ${afterA.filter((item) => item.revoked).length} of ${afterA.length} revoked, receipt ${receiptA.revokedProviderTokens}`,
);
const [stateA] = sql(
  `SELECT a.state,a.deleted_at IS NOT NULL,
   (SELECT count(*) FROM creator.account_identity WHERE account_id=a.id),
   (SELECT count(*) FROM creator.identity_grant WHERE account_id=a.id AND revoked_at IS NULL),
   (SELECT count(*) FROM creator.identity_session WHERE account_id=a.id AND (revoked_at IS NULL OR upstream_cipher<>'')),
   (SELECT count(*) FROM creator.age_signal WHERE account_id=a.id),
   (SELECT handle LIKE 'deleted-%' AND intro='' FROM creator.fan_profile WHERE account_id=a.id)
   FROM creator.account a WHERE a.id=${quote(accountA)}`,
);
step(
  "A: account closed, identity gone, every grant and session ended, profile redacted",
  stateA?.[0] === "deleted" &&
    stateA[1] === "t" &&
    stateA[2] === "0" &&
    stateA[3] === "0" &&
    stateA[4] === "0" &&
    stateA[6] === "t",
  stateA?.join(","),
);
step("A: the age check stays (no date of birth is held)", stateA?.[5] === "1");
const retainedA = sql(
  `SELECT category FROM creator_trust.retained_record WHERE job_id=${quote(deleteA.json?.id)} AND domain='identity' ORDER BY 1`,
).map(([category]) => category);
step(
  "A: retained records name the closed account and the fan record",
  retainedA.join(",") === "closed_sign_in_account,pseudonymous_fan_record",
  retainedA.join(", "),
);
const oldTokens = await Promise.all(
  [webA.token, phoneA.token, duringA.token]
    .filter(Boolean)
    .map((token) => call("GET", "/v1/identity/session", { token })),
);
step(
  "A: every old session stays refused",
  oldTokens.every((r) => r.status === 401 || r.status === 403),
  oldTokens.map(describe).join(", "),
);
const againA = await signInWeb("apple", subA);
const fanAgain = againA.token
  ? await call("GET", "/v1/identity/session", { token: againA.token })
  : undefined;
step(
  "A: the same Apple ID later starts a new, empty account after the age step",
  againA.ageAsked &&
    Boolean(againA.accountId) &&
    againA.accountId !== accountA &&
    !fanAgain?.json?.fan,
  `${againA.accountId === accountA ? "same" : "new"} account, age asked ${againA.ageAsked}`,
);
step(
  "A: the deleted account never gets a session again",
  one(
    `SELECT count(*) FROM creator.identity_grant g JOIN creator.account a ON a.id=g.account_id WHERE g.account_id=${quote(accountA)} AND g.created_at>a.deleted_at`,
  ) === "0",
);
const bystanderNow = await call("GET", "/v1/identity/session", {
  token: bystander.token,
});
step(
  "A: a bystander's account, identity and token are untouched",
  bystanderNow.status === 200 &&
    identityRows(bystander.accountId) === "1" &&
    accountState(bystander.accountId) === "active" &&
    tokensOf(await fake(), bystanderSub).every((item) => !item.revoked),
  describe(bystanderNow),
);

// B: Google, with a token the person already revoked, and with none.
await control({ mode: "ok", googleRefresh: true });
const subB1 = person("google-revoked");
const b1 = await signInWeb("google", subB1);
await control({ mode: "ok", googleRefresh: false });
const [heldB1] = tokensOf(await fake(), subB1);
const atGoogle = await call("POST", "/google/revoke", {
  base: FAKE,
  body: { token: heldB1?.token },
});
const subB2 = person("google-plain");
const b2 = await signInWeb("google", subB2);
step(
  "B: one Google account whose token the person revoked at Google, one with none",
  Boolean(b1.token && b2.token) &&
    atGoogle.status === 200 &&
    tokensOf(await fake(), subB2).length === 0,
  describe(atGoogle),
);
const deleteB = await Promise.all([b1, b2].map((b) => job(b.token, "delete")));
for (const d of deleteB) standIn(d.json?.id);
const erasedB = await Promise.all(
  deleteB.map((d) =>
    until(d.json?.id, ([s]) =>
      ["complete", "blocked", "dead_letter"].includes(s),
    ),
  ),
);
step(
  "B: both erase; Google's answer for a revoked token counts as done",
  erasedB.every(([s]) => s === "complete") &&
    JSON.parse(erasedB[0][2] || "{}").revokedProviderTokens === 1 &&
    JSON.parse(erasedB[1][2] || "{}").revokedProviderTokens === 0 &&
    [b1, b2].every(
      (b) =>
        identityRows(b.accountId) === "0" &&
        accountState(b.accountId) === "deleted",
    ),
  erasedB.map((t) => t.slice(0, 2).join(":")).join(", "),
);

// C: Apple is down during erasure, then back.
const subC = person("apple-down");
const c = await signInWeb("apple", subC);
const deleteC = await job(c.token, "delete");
await control({ mode: "down" });
standIn(deleteC.json?.id);
const downC = await until(
  deleteC.json?.id,
  ([s, code]) => code === "identity_provider_unavailable" || s === "complete",
);
step(
  "C: Apple down: the task retries and nothing is deleted",
  downC[0] === "retry" &&
    downC[1] === "identity_provider_unavailable" &&
    identityRows(c.accountId) === "1" &&
    accountState(c.accountId) === "active",
  downC.slice(0, 2).join(":"),
);
await control({ mode: "ok" });
const backC = await until(deleteC.json?.id, ([s]) =>
  ["complete", "blocked", "dead_letter"].includes(s),
);
step(
  "C: Apple back: the next attempt revokes and erases",
  backC[0] === "complete" &&
    tokensOf(await fake(), subC).every((item) => item.revoked) &&
    identityRows(c.accountId) === "0",
  backC.slice(0, 2).join(":"),
);

// D: Apple refuses the revocation, then the setup is fixed and retried.
const subD = person("apple-refused");
const d = await signInWeb("apple", subD);
const deleteD = await job(d.token, "delete");
await control({ mode: "refuse-revoke" });
standIn(deleteD.json?.id);
const refusedD = await until(deleteD.json?.id, ([s]) =>
  ["blocked", "complete", "dead_letter"].includes(s),
);
step(
  "D: a refused revocation blocks the task and deletes nothing",
  refusedD[0] === "blocked" &&
    refusedD[1] === "identity_provider_revocation_refused" &&
    identityRows(d.accountId) === "1" &&
    accountState(d.accountId) === "active" &&
    tokensOf(await fake(), subD).every((item) => !item.revoked),
  refusedD.slice(0, 2).join(":"),
);
await control({ mode: "ok" });
const retryD = await call(
  "POST",
  `/v1/trust/privacy/jobs/${deleteD.json?.id}/retry`,
  { token: d.token, body: {} },
);
note(`D retry by the person: ${describe(retryD)}`);
if (retryD.status >= 400)
  // The person's sessions are already refused; an operator re-queues it the
  // same way the retry endpoint does.
  sql(
    `UPDATE creator_trust.privacy_task SET state='pending',available_at=now(),lease_until=NULL,lease_token=NULL,error_code=NULL WHERE job_id=${quote(deleteD.json?.id)} AND state IN ('blocked','retry','dead_letter') RETURNING domain`,
  );
const fixedD = await until(deleteD.json?.id, ([s]) =>
  ["complete", "dead_letter"].includes(s),
);
step(
  "D: after the fix and a retry it revokes and erases",
  fixedD[0] === "complete" &&
    tokensOf(await fake(), subD).every((item) => item.revoked) &&
    identityRows(d.accountId) === "0",
  `${fixedD.slice(0, 2).join(":")}, retried by ${retryD.status < 400 ? "the person" : "an operator"}`,
);

// R: a sign-in while erasure is revoking stores a new token.
const subR = person("apple-race");
const r = await signInWeb("apple", subR);
const deleteR = await job(r.token, "delete");
const revoking = (await fake()).revoking;
await control({ mode: "slow-revoke" });
standIn(deleteR.json?.id);
let started = false;
for (let waited = 0; waited < 150 && !started; waited += 1) {
  started = (await fake()).revoking > revoking;
  if (!started) await sleep(1000);
}
// The sign-in commits its account update, then the deletion refuses its
// session (scope_revoked), so a new refresh token is stored all the same.
const before = cipherOf(r.accountId);
const duringR = await signInWeb("apple", subR);
const issuedR = tokensOf(await fake(), subR);
step(
  "R: a sign-in while erasure revokes at Apple is refused but stores a new token",
  started &&
    issuedR.length === 2 &&
    duringR.done.status === 403 &&
    cipherOf(r.accountId) !== before,
  `revoking ${started}, ${issuedR.length} tokens, sign-in ${describe(duringR.done)}`,
);
await sleep(7000);
const waitedR = task(deleteR.json?.id);
step(
  "R: that attempt waits instead of deleting the new token",
  waitedR[0] === "retry" &&
    waitedR[1] === "identity_erasure_waiting" &&
    identityRows(r.accountId) === "1",
  waitedR.slice(0, 2).join(":"),
);
const finishedR = await until(deleteR.json?.id, ([s]) =>
  ["complete", "blocked", "dead_letter"].includes(s),
);
await control({ mode: "ok" });
step(
  "R: the next attempt revokes the new token too, then erases",
  finishedR[0] === "complete" &&
    tokensOf(await fake(), subR).every((item) => item.revoked) &&
    identityRows(r.accountId) === "0",
  finishedR.slice(0, 2).join(":"),
);
finish();
