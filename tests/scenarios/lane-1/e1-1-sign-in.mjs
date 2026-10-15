#!/usr/bin/env node
// E1.1: a new adult fan signs in with Apple or Google, confirms 18+, and has a
// working session. Refusals first. Needs the stack with QELVORA_SIGN_IN on the
// fake provider (see the pull request for the command).
//   node tests/scenarios/lane-1/e1-1-sign-in.mjs
import {
  AUDIENCE,
  FAKE,
  call,
  confirmAge,
  describe,
  is,
  mint,
  nativeSignIn,
  nativeStart,
  one,
  person,
  reporter,
  sha256,
  sql,
  webAuthorize,
  webComplete,
  webSignIn,
  yearsAgo,
} from "./sign-in-lib.mjs";

const { step, finish } = reporter();
const now = Math.floor(Date.now() / 1000);

// Refusals: every bad token gets the same answer, and nothing is created.
const refusals = {
  "wrong audience": [{ aud: "someone-else.apps.googleusercontent.com" }],
  "wrong issuer": [{ iss: "https://evil.example" }],
  "bad signature": [{}, { badSignature: true }],
  "alg none": [{}, { alg: "none" }],
  "unknown key": [{}, { kid: "not-a-published-key" }],
  expired: [{ iat: now - 900, exp: now - 300, auth_time: now - 900 }],
  "issued in the future": [
    { iat: now + 120, exp: now + 900, auth_time: now + 120 },
  ],
  "stale authentication": [{ auth_time: now - 600 }],
  "wrong nonce": [{ nonce: "not-the-continuation-nonce-00000000000000" }],
  "unverified email": [{ email_verified: false }],
  "no subject": [{ sub: "" }],
};
const answers = new Set();
const refusedSub = person("refused");
const accountsBefore = one("SELECT count(*) FROM creator.account");
for (const [name, [claims, options]] of Object.entries(refusals)) {
  const start = await nativeStart();
  const { aud, ...rest } = claims;
  const idToken = await mint(
    "google",
    aud ?? AUDIENCE.google.android,
    refusedSub,
    rest.nonce ?? start.nonce,
    rest,
    options,
  );
  const r = await nativeSignIn(refusedSub, { start, idToken });
  answers.add(
    JSON.stringify([r.status, r.json?.error?.code, r.json?.error?.message]),
  );
  step(`refused: ${name}`, is(r, 401, "continuation_failed"), describe(r));
}
step("every token refusal gives the identical answer", answers.size === 1);
step(
  "no account was created by any refusal",
  one("SELECT count(*) FROM creator.account") === accountsBefore,
  `${accountsBefore} accounts before and after`,
);
const used = await nativeStart();
await nativeSignIn(person("used"), { start: used, claims: { aud: "wrong" } });
step(
  "a used continuation is refused",
  is(
    await nativeSignIn(person("used"), { start: used }),
    403,
    "continuation_expired",
  ),
);
const crossed = await nativeStart("google", "android");
step(
  "a continuation completed as another provider is refused",
  is(
    await call("POST", "/v1/identity/native/complete", {
      body: {
        continuationId: crossed.continuationId,
        provider: "apple",
        idToken: "a.b.c",
      },
    }),
    403,
    "continuation_expired",
  ),
);
const late = await nativeStart();
sql(
  `UPDATE creator.sign_in_continuation SET expires_at=now()-interval '1 second' WHERE id='${late.continuationId}'`,
);
step(
  "an expired continuation is refused (deadline moved in the lane's own database)",
  is(
    await nativeSignIn(person("late"), { start: late }),
    403,
    "continuation_expired",
  ),
);
step(
  "a malformed body is refused",
  is(
    await call("POST", "/v1/identity/native/complete", {
      body: { continuationId: late.continuationId },
    }),
    400,
    "invalid_request",
  ),
);
step(
  "Apple is not offered on Android",
  is(
    await call("POST", "/v1/identity/native/nonce", {
      body: { provider: "apple", platform: "android" },
    }),
    400,
    "sign_in_provider_unavailable",
  ),
);
step(
  "a return path off the app is refused at the start",
  is(
    await call("POST", "/v1/identity/web/start", {
      body: { returnTo: "https://evil.example/", provider: "google" },
    }),
    400,
    "invalid_request",
  ),
);
const flowA = await webAuthorize("google", person("swap-a"));
const flowB = await webAuthorize("google", person("swap-b"));
step(
  "a callback with another state is refused",
  is(
    await webComplete(flowA, { state: flowB.state }),
    403,
    "identity_state_invalid",
  ),
);
step(
  "and that request cannot be finished afterwards",
  is(await webComplete(flowA), 403, "continuation_expired"),
);
step(
  "another request's code is refused (PKCE and nonce do not match)",
  is(
    await webComplete(flowB, {
      code: (await webAuthorize("google", person("swap-c"))).code,
    }),
    401,
    "continuation_failed",
  ),
);
const ios = await nativeStart("apple", "ios");
step(
  "iOS Apple with the raw nonce is refused",
  is(
    await nativeSignIn(person("raw"), {
      start: ios,
      idToken: await mint(
        "apple",
        AUDIENCE.apple.ios,
        person("raw"),
        ios.nonce,
      ),
    }),
    401,
    "continuation_failed",
  ),
);

// The main path, natively: age step first, no session until it passes.
const sub = person("fan");
const first = await nativeSignIn(sub);
step(
  "a new person is asked for their age, with no session",
  is(first, 200, "age_required") && first.json.completion === null,
);
const accountId = one(
  `SELECT account_id FROM creator.sign_in_continuation WHERE id='${first.json.ageConfirmation.ageContinuationId}'`,
);
step(
  "no session exists before the age step",
  one(
    `SELECT count(*) FROM creator.identity_session WHERE account_id='${accountId}'`,
  ) === "0",
);
const adult = await confirmAge(first, yearsAgo(30));
const token = adult.json?.completion?.token;
step("an adult is signed in", is(adult, 200, "signed_in"), describe(adult));
const session = await call("GET", "/v1/identity/session", { token });
step(
  "the session works, as a Qelvora session of that account",
  session.status === 200 &&
    session.json.mode === "qelvora" &&
    session.json.accountId === accountId,
  `${session.json?.mode}`,
);
step(
  "the account id is random, not derived from the provider subject",
  !accountId.includes(sub) && accountId !== sha256(sub).slice(0, 36),
);
step(
  "the subject is stored only as an HMAC",
  one(
    `SELECT count(*) FROM creator.account_identity WHERE account_id='${accountId}' AND subject_hmac ~ '^[a-f0-9]{64}$' AND subject_hmac<>'${sha256(sub)}'`,
  ) === "1" &&
    one(
      `SELECT count(*) FROM creator.account_identity WHERE subject_hmac LIKE '%${sub}%' OR email_cipher LIKE '%${sub}%'`,
    ) === "0",
);
step(
  "the date of birth is not stored, only the result",
  one(
    `SELECT string_agg(source||':'||result,',') FROM creator.age_signal WHERE account_id='${accountId}'`,
  ) === "attestation:adult",
);
const again = await nativeSignIn(sub);
step(
  "a returning adult goes straight in, to the same account",
  is(again, 200, "signed_in") &&
    again.json.completion.session.accountId === accountId,
);

// Repeat and race: the network drops, two tabs complete at once.
const dropped = await nativeStart();
await nativeSignIn(sub, { start: dropped });
step(
  "a retried completion after a lost answer is refused, and starting again works",
  is(
    await nativeSignIn(sub, { start: dropped }),
    403,
    "continuation_expired",
  ) && is(await nativeSignIn(sub), 200, "signed_in"),
);
const racer = person("race");
const both = await Promise.all([nativeSignIn(racer), nativeSignIn(racer)]);
step(
  "two tabs completing at once make one account",
  both.every((r) => is(r, 200, "age_required")) &&
    one(
      `SELECT count(DISTINCT account_id) FROM creator.sign_in_continuation WHERE id IN ('${both.map((r) => r.json.ageConfirmation.ageContinuationId).join("','")}')`,
    ) === "1",
);

// The web flow, for Google (redirect) and Apple (form post).
for (const provider of ["google", "apple"]) {
  const webSub = person(`web-${provider}`);
  const web = await webSignIn(provider, webSub);
  const done =
    web.json?.status === "age_required"
      ? await confirmAge(web, yearsAgo(25))
      : web;
  step(
    `web ${provider}: signed in after the age step`,
    is(web, 200, "age_required") && is(done, 200, "signed_in"),
    describe(done),
  );
  const flow = await webAuthorize(provider, webSub);
  const replay = await webComplete(flow);
  step(
    `web ${provider}: returning adult straight in; the callback cannot be replayed`,
    is(replay, 200, "signed_in") && (await webComplete(flow)).status >= 400,
  );
}
const appleIos = await nativeSignIn(person("same-person"), {
  provider: "apple",
  platform: "ios",
  start: await nativeStart("apple", "ios"),
});
const googleWeb = await webSignIn("google", person("same-person-google"));
step(
  "Apple then Google for the same person make two accounts (never merged)",
  appleIos.json?.ageConfirmation &&
    googleWeb.json?.ageConfirmation &&
    one(
      `SELECT count(DISTINCT account_id) FROM creator.sign_in_continuation WHERE id IN ('${appleIos.json.ageConfirmation.ageContinuationId}','${googleWeb.json.ageConfirmation.ageContinuationId}')`,
    ) === "2",
);
const codeStart = await nativeStart("apple", "ios");
const code = (
  await call("POST", "/__apple-native-code", {
    base: FAKE,
    body: { sub: person("apple-code") },
  })
).json.code;
const withCode = await nativeSignIn(person("apple-code"), {
  start: codeStart,
  authorizationCode: code,
});
step(
  "Apple's refresh token is kept, encrypted, for revocation at deletion",
  is(withCode, 200, "age_required") &&
    one(
      `SELECT count(*) FROM creator.account_identity i JOIN creator.sign_in_continuation c ON c.identity_id=i.id WHERE c.id='${withCode.json.ageConfirmation.ageContinuationId}' AND i.provider_refresh_cipher IS NOT NULL AND i.provider_refresh_cipher NOT LIKE 'r.%'`,
    ) === "1",
);

// The provider fails: down, then back.
await call("POST", "/__control", { base: FAKE, body: { mode: "down" } });
const down = await webSignIn("google", person("down"));
await call("POST", "/__control", { base: FAKE, body: { mode: "ok" } });
step(
  "provider down: 503, and it works again once the provider is back",
  is(down, 503, "identity_provider_unavailable") &&
    (await webSignIn("google", person("down"))).status === 200,
  describe(down),
);
finish();
