#!/usr/bin/env node
// Walks contract C1 against the stub (c1-stub.mjs) in front of the lane's stack,
// refusals first, and checks every success against the published schemas.
//   node tests/scenarios/lane-1/c1-check.mjs [stub-url]          main and edge cases
//   node tests/scenarios/lane-1/c1-check.mjs --rate <stub-url>    burst and recovery
import { createHash } from "node:crypto";
import {
  IdentitySignInResultSchema,
  NativeSignInNonceSchema,
  SessionSchema,
} from "../../../packages/api/src/identity.ts";

const rate = process.argv[2] === "--rate";
const STUB =
  (rate ? process.argv[3] : process.argv[2]) ?? "http://127.0.0.1:56414";
let failures = 0;
const step = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`,
  );
};
async function call(path, body, token, method = "POST") {
  const response = await fetch(new URL(path, STUB), {
    method,
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: text ? JSON.parse(text) : null,
  };
}
const code = (r) =>
  `${r.status} ${r.body?.error?.code ?? r.body?.status ?? ""}`.trim();
const mint = async (claims, options) =>
  (await call("/__fake/id-token", { claims, options })).body.idToken;
const info = (await call("/__fake/info", undefined, undefined, "GET")).body;
const aud = (provider, platform) => info.audiences[provider][platform];
async function start(provider = "google", platform = "android") {
  const r = await call("/v1/identity/native/nonce", { provider, platform });
  return { ...NativeSignInNonceSchema.parse(r.body), provider, platform };
}
async function nativeSignIn(sub, claims = {}, flow) {
  flow ??= await start();
  const nonce =
    flow.provider === "apple" && flow.platform === "ios"
      ? createHash("sha256").update(flow.nonce).digest("hex")
      : flow.nonce;
  const idToken = await mint({
    provider: flow.provider,
    sub,
    aud: aud(flow.provider, flow.platform),
    nonce,
    ...claims,
  });
  return call("/v1/identity/native/complete", {
    continuationId: flow.continuationId,
    provider: flow.provider,
    idToken,
  });
}
const age = (result, birthDate, platformSignal) =>
  call("/v1/identity/age", {
    ageContinuationId: result.body.ageConfirmation.ageContinuationId,
    birthDate,
    ...(platformSignal ? { platformSignal } : {}),
  });
const isoYearsAgo = (years, days = 0) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

if (rate) {
  const statuses = [];
  for (let i = 0; i < 8; i += 1)
    statuses.push(
      (
        await call("/v1/identity/native/nonce", {
          provider: "google",
          platform: "ios",
        })
      ).status,
    );
  const limited = await call("/v1/identity/native/nonce", {
    provider: "google",
    platform: "ios",
  });
  step(
    "R1 a burst meets the rate limit",
    statuses.includes(429) &&
      limited.status === 429 &&
      limited.headers.get("retry-after") !== null,
    statuses.join(","),
  );
  await new Promise((resolve) =>
    setTimeout(
      resolve,
      (Number(limited.headers.get("retry-after")) + 1) * 1000,
    ),
  );
  step(
    "R2 it recovers after Retry-After",
    (
      await call("/v1/identity/native/nonce", {
        provider: "google",
        platform: "ios",
      })
    ).status === 200,
  );
  process.exit(failures ? 1 : 0);
}

await call("/__fake/reset", {});
const now = Math.floor(Date.now() / 1000);
const refusals = {
  "wrong audience": [{ aud: "someone-else.apps.googleusercontent.com" }],
  "wrong issuer": [{ iss: "https://evil.example" }],
  "bad signature": [{}, { badSignature: true }],
  "alg none": [{}, { alg: "none" }],
  expired: [{ iat: now - 900, exp: now - 300 }],
  "issued in the future": [{ iat: now + 120, exp: now + 900 }],
  "stale authentication": [{ auth_time: now - 600 }],
  "wrong nonce": [{ nonce: "not-the-continuation-nonce-000000000000" }],
  "unverified email": [{ email_verified: false }],
};
const answers = new Set();
for (const [name, [claims, options]] of Object.entries(refusals)) {
  const flow = await start();
  const idToken = await mint(
    {
      provider: "google",
      sub: "fan-1",
      aud: aud("google", "android"),
      nonce: flow.nonce,
      ...claims,
    },
    options,
  );
  const r = await call("/v1/identity/native/complete", {
    continuationId: flow.continuationId,
    provider: "google",
    idToken,
  });
  answers.add(
    JSON.stringify([r.status, r.body?.error?.code, r.body?.error?.message]),
  );
  step(
    `N1 refused: ${name}`,
    r.status === 401 && r.body?.error?.code === "continuation_failed",
    code(r),
  );
}
step("N1 every token refusal gives the same answer", answers.size === 1);
const used = await start();
await nativeSignIn("fan-1", { aud: "wrong" }, used);
step(
  "N2 a used continuation is refused",
  code(await nativeSignIn("fan-1", {}, used)) === "403 continuation_expired",
);
const google = await start();
const crossed = await call("/v1/identity/native/complete", {
  continuationId: google.continuationId,
  provider: "apple",
  idToken: await mint({ sub: "fan-1" }),
});
step(
  "N2 a continuation for another provider is refused",
  code(crossed) === "403 continuation_expired",
);
step(
  "N2 a malformed body is refused",
  code(
    await call("/v1/identity/native/complete", {
      continuationId: google.continuationId,
    }),
  ) === "400 invalid_request",
);

const first = await nativeSignIn("fan-1");
step(
  "N3 a new person is asked for their age, with no session",
  first.status === 200 &&
    first.body.status === "age_required" &&
    first.body.completion === null &&
    IdentitySignInResultSchema.safeParse(first.body).success,
  code(first),
);
step(
  "N3 an impossible date is refused without using the step",
  code(await age(first, "2001-02-30")) === "400 invalid_request",
);
const adult = await age(first, isoYearsAgo(30));
step(
  "N3 an adult is signed in",
  adult.status === 200 &&
    IdentitySignInResultSchema.safeParse(adult.body).success &&
    adult.body.status === "signed_in",
  code(adult),
);
step(
  "N3 the age step cannot be replayed",
  code(await age(first, isoYearsAgo(30))) === "403 age_confirmation_expired",
);
const token = adult.body.completion?.token;
const session = await call("/v1/identity/session", undefined, token, "GET");
step(
  "N4 the session works on the real backend",
  session.status === 200 && SessionSchema.safeParse(session.body).success,
  `mode ${session.body?.mode}`,
);
const again = await nativeSignIn("fan-1");
step(
  "N4 a returning adult goes straight in",
  again.body?.status === "signed_in",
  code(again),
);

const teenager = await nativeSignIn("fan-2");
step(
  "N5 under 18 is refused",
  code(await age(teenager, isoYearsAgo(16))) ===
    "403 adult_eligibility_required",
);
step(
  "N5 and cannot try again",
  code(await nativeSignIn("fan-2")) === "403 adult_eligibility_required",
);
step(
  "N6 the 18th birthday is adult",
  (await age(await nativeSignIn("fan-5"), isoYearsAgo(18))).body?.status ===
    "signed_in",
);
step(
  "N6 the day before it is not",
  code(await age(await nativeSignIn("fan-6"), isoYearsAgo(18, 1))) ===
    "403 adult_eligibility_required",
);
const signal = await nativeSignIn("fan-1", {}, await start("apple", "ios"));
step(
  "N7 a platform under-18 signal wins over an adult date",
  code(
    await age(signal, isoYearsAgo(40), {
      source: "apple_declared_age_range",
      under18: true,
    }),
  ) === "403 adult_eligibility_required",
);
step(
  "N7 an account the identity refuses stays refused",
  code(await age(await nativeSignIn("teen"), isoYearsAgo(25))) ===
    "403 adult_eligibility_required",
);
const unhashed = await start("apple", "ios");
const raw = await call("/v1/identity/native/complete", {
  continuationId: unhashed.continuationId,
  provider: "apple",
  idToken: await mint({
    provider: "apple",
    sub: "maya",
    aud: aud("apple", "ios"),
    nonce: unhashed.nonce,
  }),
});
step(
  "N8 iOS Apple needs the hashed nonce",
  code(raw) === "401 continuation_failed",
);
step(
  "N8 and signs in with it",
  (await nativeSignIn("maya", {}, await start("apple", "ios"))).body?.status ===
    "age_required",
);

const web = await call("/v1/identity/web/start", {
  returnTo: "/home",
  provider: "google",
});
const back = await fetch(`${web.body.redirectUrl}&sub=fan-1`, {
  redirect: "manual",
});
const callback = new URL(back.headers.get("location"));
const params = Object.fromEntries(callback.searchParams);
step(
  "W1 web start redirects to the provider and back with a code",
  web.status === 200 &&
    back.status === 303 &&
    params.continuationId === web.body.continuationId,
);
step(
  "W1 a callback with another state is refused",
  code(
    await call("/v1/identity/web/complete", {
      ...params,
      state: `${params.state.slice(0, -2)}xx`,
    }),
  ) === "403 identity_state_invalid",
);
const web2 = await call("/v1/identity/web/start", {
  returnTo: "/home",
  provider: "google",
});
const params2 = Object.fromEntries(
  new URL(
    (
      await fetch(`${web2.body.redirectUrl}&sub=fan-1`, { redirect: "manual" })
    ).headers.get("location"),
  ).searchParams,
);
const done = await call("/v1/identity/web/complete", params2);
step(
  "W2 web completion signs a known adult in",
  done.body?.status === "signed_in" &&
    IdentitySignInResultSchema.safeParse(done.body).success,
  code(done),
);
step(
  "W2 a replayed callback is refused",
  code(await call("/v1/identity/web/complete", params2)) ===
    "403 continuation_expired",
);

step(
  "S1 sign out ends the session",
  (await call("/v1/identity/logout", undefined, token)).status === 200 &&
    (await call("/v1/identity/session", undefined, token, "GET")).status ===
      401,
);
console.log(failures ? `${failures} step(s) failed` : "all steps passed");
process.exit(failures ? 1 : 0);
