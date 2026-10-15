// Helpers for lane 1's sign-in scenarios (E1.1 to E1.4): the backend's C1
// endpoints, the fake Apple and Google provider (fake-provider.mjs), one-line
// steps and read-only database checks in the lane's own container.
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

export const LANE = process.env.QELVORA_LANE ?? "1";
export const API =
  process.env.QELVORA_API_URL ?? `http://127.0.0.1:564${LANE}1`;
export const FAKE =
  process.env.QELVORA_FAKE_PROVIDER ?? `http://127.0.0.1:564${LANE}4`;
export const CONTAINER = `qelvora-lane${LANE}-postgres`;
export const AUDIENCE = {
  google: {
    web: "fake-google-web.apps.googleusercontent.com",
    ios: "fake-google-ios.apps.googleusercontent.com",
    android: "fake-google-android.apps.googleusercontent.com",
  },
  apple: { web: "fake.qelvora.web", ios: "com.pantopus.qelvora" },
};
export const run = randomUUID().slice(0, 8);
/** A unique test person per run, so locks and accounts never collide. */
export const person = (label) => `${label}-${run}`;
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

/** Each call names its client (X-Forwarded-For, honored from loopback only)
 * so separate scenarios do not share one rate-limit window. */
export async function call(
  method,
  path,
  { body, token, client, base = API, headers = {} } = {},
) {
  const response = await fetch(new URL(path, base), {
    method,
    redirect: "manual",
    headers: {
      Accept: "application/json",
      "X-Forwarded-For": client ?? `client-${randomUUID()}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(65_000),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* keep the text */
  }
  return { status: response.status, json, text, headers: response.headers };
}
export const describe = (r) =>
  `${r.status} ${r.json?.error?.code ?? r.json?.status ?? ""}`.trim();
export const is = (r, status, code) =>
  r.status === status && (r.json?.error?.code ?? r.json?.status) === code;

export async function nativeStart(
  provider = "google",
  platform = "android",
  client,
) {
  const r = await call("POST", "/v1/identity/native/nonce", {
    body: { provider, platform },
    client,
  });
  return { ...r.json, provider, platform, response: r };
}
export async function mint(
  provider,
  aud,
  sub,
  nonce,
  claims = {},
  options = {},
) {
  return (
    await call("POST", "/__mint", {
      base: FAKE,
      body: { provider, aud, sub, nonce, claims, options },
    })
  ).json.idToken;
}
/** The native flow: a nonce, the system sheet's ID token, then completion. */
export async function nativeSignIn(
  sub,
  {
    provider = "google",
    platform = "android",
    claims,
    options,
    start,
    idToken,
    authorizationCode,
  } = {},
) {
  start ??= await nativeStart(provider, platform);
  const nonce =
    start.provider === "apple" && start.platform === "ios"
      ? sha256(start.nonce)
      : start.nonce;
  idToken ??= await mint(
    start.provider,
    AUDIENCE[start.provider][start.platform],
    sub,
    nonce,
    claims,
    options,
  );
  return call("POST", "/v1/identity/native/complete", {
    body: {
      continuationId: start.continuationId,
      provider: start.provider,
      idToken,
      ...(authorizationCode ? { authorizationCode } : {}),
    },
  });
}
/** The web flow at the API: start, the provider's page (as the test person),
 * then completion with the code and state the provider returned. */
export async function webAuthorize(
  provider,
  sub,
  { claims, returnTo = "/home", reauthenticate } = {},
) {
  const started = await call("POST", "/v1/identity/web/start", {
    body: { returnTo, provider, ...(reauthenticate ? { reauthenticate } : {}) },
  });
  const page = new URL(started.json.redirectUrl);
  page.searchParams.set("sub", sub);
  if (claims) page.searchParams.set("claims", JSON.stringify(claims));
  const response = await fetch(page, { redirect: "manual" });
  let code;
  let state;
  if (response.status === 303) {
    const back = new URL(response.headers.get("location"));
    code = back.searchParams.get("code");
    state = back.searchParams.get("state");
  } else {
    const html = await response.text();
    code = html.match(/name="code" value="([^"]+)"/u)?.[1];
    state = html.match(/name="state" value="([^"]+)"/u)?.[1];
  }
  return {
    started,
    page,
    continuationId: started.json.continuationId,
    code,
    state,
  };
}
export const webComplete = (flow, overrides = {}) =>
  call("POST", "/v1/identity/web/complete", {
    body: {
      continuationId: flow.continuationId,
      code: flow.code,
      state: flow.state,
      ...overrides,
    },
  });
export async function webSignIn(provider, sub, options) {
  return webComplete(await webAuthorize(provider, sub, options));
}
export const confirmAge = (result, birthDate, platformSignal) =>
  call("POST", "/v1/identity/age", {
    body: {
      ageContinuationId: result.json.ageConfirmation.ageContinuationId,
      birthDate,
      ...(platformSignal ? { platformSignal } : {}),
    },
  });
export function yearsAgo(years, days = 0) {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
/** A new adult signed in natively: { token, session, sub }. */
export async function adult(label, options = {}) {
  const sub = person(label);
  const first = await nativeSignIn(sub, options);
  const done =
    first.json?.status === "age_required"
      ? await confirmAge(first, yearsAgo(30))
      : first;
  if (done.json?.status !== "signed_in")
    throw new Error(`adult sign-in failed: ${done.text.slice(0, 200)}`);
  return {
    token: done.json.completion.token,
    session: done.json.completion.session,
    sub,
  };
}

export function sql(query) {
  return execFileSync(
    "docker",
    [
      "exec",
      CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      "creator_stack",
      "-At",
      "-F",
      "|",
      "-c",
      query,
    ],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("|"));
}
export const one = (query) => sql(query)[0]?.[0];

export function reporter() {
  let failures = 0;
  let skipped = 0;
  return {
    step(name, ok, detail = "") {
      if (!ok) failures += 1;
      console.log(
        `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`,
      );
      return ok;
    },
    skip(name, reason) {
      skipped += 1;
      console.log(`NOT RUN  ${name}  (${reason})`);
    },
    note: (text) => console.log(`      ${text}`),
    finish() {
      console.log(`${failures} failed, ${skipped} not run`);
      process.exit(failures || skipped ? 1 : 0);
    },
  };
}
