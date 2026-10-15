#!/usr/bin/env node
// Contract C1 stub (lane 1): the pilot sign-in, served in front of a running
// one-command stack so lanes 5, 6 and 7 can build against C1 before WP 1.2.
// Fakes: the Apple and Google ID-token issuer (its own RSA key) and the age
// gate's memory. Sessions are real: an accepted sign-in becomes a session on
// the stack's development identity, and every other request is proxied there.
//   node tests/scenarios/lane-1/c1-stub.mjs   (C1_STUB_PORT, C1_BACKEND)
import http from "node:http";
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
  timingSafeEqual,
  verify,
} from "node:crypto";
import {
  AgeConfirmationInputSchema,
  IdentityProviderContinueSchema,
  IdentitySignInResultSchema,
  NativeSignInCompleteSchema,
  NativeSignInStartSchema,
} from "../../../packages/api/src/identity.ts";

const PORT = Number(process.env.C1_STUB_PORT ?? 56414);
const BACKEND = process.env.C1_BACKEND ?? "http://127.0.0.1:56411";
const ORIGIN = `http://127.0.0.1:${PORT}`;
const WINDOW = Number(process.env.C1_RATE_WINDOW_MS ?? 60_000);
const ISSUERS = {
  apple: ["https://appleid.apple.com"],
  google: ["https://accounts.google.com", "accounts.google.com"],
};
const AUDIENCES = {
  apple: { web: "stub.qelvora.web", ios: "com.pantopus.qelvora" },
  google: {
    web: "stub-web.apps.googleusercontent.com",
    ios: "stub-ios.apps.googleusercontent.com",
    android: "stub-android.apps.googleusercontent.com",
  },
};
// Test people are the stack's synthetic development accounts ("teen" is the
// one the development identity refuses as under 18).
const PEOPLE = Object.fromEntries(
  ["fan-1", "fan-2", "maya", "ops", "fan-5", "fan-6", "teen"].map((name, i) => [
    name,
    `10000000-0000-4000-8000-00000000000${i + 1}`,
  ]),
);
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const kid = randomBytes(8).toString("hex");
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const later = (ms) => new Date(Date.now() + ms).toISOString();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const continuations = new Map();
const ageContinuations = new Map();
const codes = new Map();
const confirmed = new Set();
const locked = new Set();
const hits = new Map();

function mint(claims = {}, { alg = "RS256", badSignature = false } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const provider = claims.provider ?? "google";
  const body = {
    iss: ISSUERS[provider][0],
    aud: AUDIENCES[provider].web,
    iat: now,
    exp: now + 600,
    email: `${claims.sub}@example.test`,
    email_verified: true,
    ...claims,
  };
  delete body.provider;
  const data = `${b64({ alg, kid, typ: "JWT" })}.${b64(body)}`;
  let signature =
    alg === "none"
      ? ""
      : sign("sha256", Buffer.from(data), privateKey).toString("base64url");
  if (badSignature)
    signature = `${signature.slice(0, -6)}${signature.endsWith("AAAAAA") ? "BBBBBB" : "AAAAAA"}`;
  return `${data}.${signature}`;
}
// The pack's section 5 rules. Any failure is the same answer, never a reason.
function checkToken(token, provider, audience, nonce, appleHashedNonce) {
  const [head, body, signature, extra] = token.split(".");
  if (!head || !body || signature === undefined || extra !== undefined)
    return null;
  try {
    const header = JSON.parse(Buffer.from(head, "base64url"));
    const claims = JSON.parse(Buffer.from(body, "base64url"));
    const now = Date.now() / 1000;
    const signed = verify(
      "sha256",
      Buffer.from(`${head}.${body}`),
      publicKey,
      Buffer.from(signature, "base64url"),
    );
    const authAt = claims.auth_time ?? claims.iat;
    const ok =
      header.alg === "RS256" &&
      header.kid === kid &&
      signed &&
      ISSUERS[provider].includes(claims.iss) &&
      claims.aud === audience &&
      claims.exp > now - 60 &&
      claims.iat <= now + 30 &&
      now - authAt <= 300 &&
      claims.nonce === (appleHashedNonce ? sha256(nonce) : nonce) &&
      typeof claims.sub === "string" &&
      claims.sub.length > 0 &&
      claims.sub.length <= 255 &&
      (claims.email === undefined ||
        claims.email_verified === true ||
        claims.email_verified === "true");
    return ok ? claims.sub : null;
  } catch {
    return null;
  }
}
function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(body));
}
const fail = (res, status, code, message, headers) =>
  send(
    res,
    status,
    { error: { code, message, requestId: randomUUID() } },
    headers,
  );
const under18 = (res) =>
  fail(
    res,
    403,
    "adult_eligibility_required",
    "This app is available to adults aged 18 and over.",
  );
const failed = (res) =>
  fail(
    res,
    401,
    "continuation_failed",
    "This sign-in could not be completed. Start again.",
  );
const expired = (res) =>
  fail(
    res,
    403,
    "continuation_expired",
    "This sign-in request expired. Start again.",
  );
async function backend(path, body) {
  return fetch(new URL(path, BACKEND), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function issue(res, subject, returnTo) {
  const begin = await backend("/v1/identity/continue", { returnTo });
  if (!begin.ok) return send(res, begin.status, await begin.json());
  const { continuationId } = await begin.json();
  const done = await backend("/v1/identity/complete", {
    continuationId,
    code: PEOPLE[subject],
  });
  if (!done.ok) return send(res, done.status, await done.json());
  const result = {
    status: "signed_in",
    completion: await done.json(),
    ageConfirmation: null,
  };
  send(res, 200, IdentitySignInResultSchema.parse(result));
}
async function signIn(res, provider, subject, returnTo) {
  const key = `${provider}:${subject}`;
  if (locked.has(key)) return under18(res);
  if (!PEOPLE[subject])
    return fail(
      res,
      403,
      "stub_subject_unknown",
      `The stub knows only: ${Object.keys(PEOPLE).join(", ")}.`,
    );
  if (confirmed.has(key)) return issue(res, subject, returnTo);
  const ageContinuationId = randomUUID();
  const expiresAt = later(600_000);
  ageContinuations.set(ageContinuationId, {
    key,
    subject,
    returnTo,
    expiresAt,
    used: false,
  });
  const result = {
    status: "age_required",
    completion: null,
    ageConfirmation: { ageContinuationId, expiresAt },
  };
  send(res, 200, IdentitySignInResultSchema.parse(result));
}
function take(map, id) {
  const entry = map.get(id);
  if (!entry || entry.used || Date.parse(entry.expiresAt) <= Date.now())
    return null;
  entry.used = true; // single use, whatever the outcome
  return entry;
}
function yearsOld(date) {
  const [y, m, d] = date.split("-").map(Number);
  const now = new Date();
  const born = new Date(Date.UTC(y, m - 1, d));
  if (born.getUTCMonth() !== m - 1 || born.getUTCDate() !== d || born > now)
    return null;
  const before =
    now.getUTCMonth() + 1 < m ||
    (now.getUTCMonth() + 1 === m && now.getUTCDate() < d);
  return now.getUTCFullYear() - y - (before ? 1 : 0);
}
const routes = {
  "POST /v1/identity/native/nonce": (res, body) => {
    const input = NativeSignInStartSchema.parse(body);
    const continuationId = randomUUID();
    const nonce = randomBytes(32).toString("base64url");
    const expiresAt = later(300_000);
    continuations.set(continuationId, {
      ...input,
      kind: "native",
      nonce,
      returnTo: input.returnTo ?? "/home",
      expiresAt,
      used: false,
    });
    send(res, 200, { continuationId, nonce, expiresAt });
  },
  "POST /v1/identity/native/complete": async (res, body) => {
    const input = NativeSignInCompleteSchema.parse(body);
    const entry = take(continuations, input.continuationId);
    if (!entry || entry.kind !== "native" || entry.provider !== input.provider)
      return expired(res);
    const audience = AUDIENCES[entry.provider][entry.platform];
    const subject = checkToken(
      input.idToken,
      entry.provider,
      audience,
      entry.nonce,
      entry.provider === "apple" && entry.platform === "ios",
    );
    return subject
      ? signIn(res, entry.provider, subject, entry.returnTo)
      : failed(res);
  },
  "POST /v1/identity/age": async (res, body) => {
    const input = AgeConfirmationInputSchema.parse(body);
    const years = yearsOld(input.birthDate);
    if (years === null)
      return fail(
        res,
        400,
        "invalid_request",
        "The request does not match the API contract.",
      );
    const entry = take(ageContinuations, input.ageContinuationId);
    if (!entry)
      return fail(
        res,
        403,
        "age_confirmation_expired",
        "This step expired. Sign in again.",
      );
    if (years < 18 || input.platformSignal?.under18) {
      locked.add(entry.key);
      return under18(res);
    }
    confirmed.add(entry.key);
    return issue(res, entry.subject, entry.returnTo);
  },
  "GET /__fake/jwks": (res) =>
    send(res, 200, {
      keys: [
        {
          ...publicKey.export({ format: "jwk" }),
          kid,
          alg: "RS256",
          use: "sig",
        },
      ],
    }),
  "GET /__fake/info": (res) =>
    send(res, 200, {
      issuers: ISSUERS,
      audiences: AUDIENCES,
      people: Object.keys(PEOPLE),
      jwks: `${ORIGIN}/__fake/jwks`,
    }),
  "POST /__fake/id-token": (res, body) =>
    send(res, 200, { idToken: mint(body.claims, body.options) }),
  "POST /__fake/reset": (res) => {
    for (const set of [confirmed, locked]) set.clear();
    send(res, 200, { done: true });
  },
};
async function webFlow(req, res, url, body) {
  if (
    req.method === "POST" &&
    url.pathname === "/v1/identity/continue" &&
    body?.provider
  ) {
    const input = IdentityProviderContinueSchema.parse(body);
    const continuationId = randomUUID();
    const state = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    continuations.set(continuationId, {
      ...input,
      kind: "web",
      state,
      nonce,
      expiresAt: later(300_000),
      used: false,
    });
    const redirect = new URL("/__fake/authorize", ORIGIN);
    for (const [k, v] of Object.entries({
      provider: input.provider,
      continuationId,
      state,
      nonce,
    }))
      redirect.searchParams.set(k, v);
    return (
      send(res, 200, { redirectUrl: redirect.href, continuationId }),
      true
    );
  }
  if (req.method === "GET" && url.pathname === "/__fake/authorize") {
    const q = Object.fromEntries(url.searchParams);
    const entry = continuations.get(q.continuationId);
    if (!q.sub || !entry)
      return (send(res, 200, { choose: Object.keys(PEOPLE) }), true);
    const code = randomBytes(24).toString("base64url");
    const token = mint({
      provider: entry.provider,
      sub: q.sub,
      aud: AUDIENCES[entry.provider].web,
      nonce: entry.nonce,
    });
    codes.set(code, {
      continuationId: q.continuationId,
      token,
      expiresAt: later(60_000),
      used: false,
    });
    const back = new URL(
      process.env.C1_WEB_CALLBACK ?? `${ORIGIN}/__fake/callback`,
    );
    for (const [k, v] of Object.entries({
      code,
      state: q.state,
      continuationId: q.continuationId,
    }))
      back.searchParams.set(k, v);
    res.writeHead(303, { Location: back.href }).end();
    return true;
  }
  if (
    req.method === "POST" &&
    url.pathname === "/v1/identity/complete" &&
    continuations.get(body?.continuationId)?.kind === "web"
  ) {
    const entry = take(continuations, body.continuationId);
    if (!entry) return (expired(res), true);
    const state = Buffer.from(String(body.state ?? ""));
    if (
      state.length !== entry.state.length ||
      !timingSafeEqual(state, Buffer.from(entry.state))
    )
      return (
        fail(
          res,
          403,
          "identity_state_invalid",
          "This sign-in callback does not belong to your request.",
        ),
        true
      );
    const code = take(codes, body.code);
    const subject =
      code?.continuationId === body.continuationId &&
      checkToken(
        code.token,
        entry.provider,
        AUDIENCES[entry.provider].web,
        entry.nonce,
        false,
      );
    return (
      subject
        ? await signIn(res, entry.provider, subject, entry.returnTo)
        : failed(res),
      true
    );
  }
  return false;
}
async function proxy(req, res, url, raw) {
  const headers = { ...req.headers };
  delete headers.host;
  delete headers["content-length"];
  const upstream = await fetch(new URL(url.pathname + url.search, BACKEND), {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : raw,
    redirect: "manual",
  });
  const keep = ["content-type", "retry-after", "x-request-id", "location"];
  res.writeHead(
    upstream.status,
    Object.fromEntries(
      keep
        .filter((h) => upstream.headers.has(h))
        .map((h) => [h, upstream.headers.get(h)]),
    ),
  );
  res.end(Buffer.from(await upstream.arrayBuffer()));
}
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, ORIGIN);
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    try {
      const route = routes[`${req.method} ${url.pathname}`];
      const c1 =
        route ||
        /^\/v1\/identity\/(continue|complete|native\/|age)/u.test(url.pathname);
      if (c1 && !url.pathname.startsWith("/__fake")) {
        const ip = req.socket.remoteAddress;
        const recent = (hits.get(ip) ?? []).filter(
          (t) => t > Date.now() - WINDOW,
        );
        hits.set(ip, [...recent, Date.now()]);
        if (recent.length >= Number(process.env.C1_RATE_LIMIT ?? 20))
          return fail(
            res,
            429,
            "rate_limited",
            "Too many sign-in attempts. Wait a minute and try again.",
            { "Retry-After": String(Math.ceil(WINDOW / 1000)) },
          );
      }
      if (raw.length > 16_384)
        return fail(
          res,
          413,
          "invalid_request",
          "The request does not match the API contract.",
        );
      const body =
        raw.length && /json/u.test(req.headers["content-type"] ?? "")
          ? JSON.parse(raw)
          : undefined;
      if (route) return await route(res, body ?? {});
      if (await webFlow(req, res, url, body)) return;
      await proxy(req, res, url, raw);
    } catch (error) {
      const contract =
        error?.name === "ZodError" || error instanceof SyntaxError;
      if (!contract)
        process.stderr.write(`c1-stub: ${error?.stack ?? error}\n`);
      fail(
        res,
        contract ? 400 : 503,
        contract ? "invalid_request" : "service_unavailable",
        contract
          ? "The request does not match the API contract."
          : "The service is unavailable. Please try again.",
      );
    }
  })
  .listen(PORT, "127.0.0.1", () =>
    process.stdout.write(`C1 stub on ${ORIGIN}, backend ${BACKEND}\n`),
  );
