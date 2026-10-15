#!/usr/bin/env node
// A fake Apple and Google sign-in provider for lane 1's scenarios (the outer
// edge only). It serves the same paths the backend's QELVORA_SIGN_IN_FAKE_PROVIDER
// mode calls, signs ID tokens with its own RSA key and checks what the real
// providers check: Google's PKCE verifier, Apple's ES256 client secret, the
// redirect URI and single-use codes. Test-only knobs live under /__.
//   node tests/scenarios/lane-1/fake-provider.mjs --apple-key FILE [--port 56414]
// FILE holds the Apple signing key (base64 PEM); it is created if missing and
// is what the backend gets as QELVORA_APPLE_PRIVATE_KEY_B64.
import http from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  verify,
} from "node:crypto";

const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : fallback;
};
const PORT = Number(arg("--port", 56414));
const KEY_FILE = arg("--apple-key");
if (!KEY_FILE) throw new Error("--apple-key FILE is required");
if (!existsSync(KEY_FILE)) {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  writeFileSync(
    KEY_FILE,
    Buffer.from(privateKey.export({ type: "pkcs8", format: "pem" })).toString(
      "base64",
    ),
    { mode: 0o600 },
  );
}
const applePublic = createPublicKey(
  createPrivateKey(Buffer.from(readFileSync(KEY_FILE, "utf8"), "base64")),
);
const GOOGLE_SECRET =
  process.env.FAKE_GOOGLE_SECRET ?? "fake-google-web-secret";
const APPLE = {
  team: "FAKETEAM01",
  key: "FAKEKEY001",
  bundle: "com.pantopus.qelvora",
};
const ISS = {
  apple: "https://appleid.apple.com",
  google: "https://accounts.google.com",
};
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const kid = randomBytes(8).toString("hex");
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const codes = new Map();
const escape = (value) =>
  String(value).replace(
    /[&<>"']/gu,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const revoked = [];
const stats = { authorize: 0, token: 0, keys: 0, refused: 0 };
let mode = "ok";

function idToken(provider, aud, sub, nonce, extra = {}, options = {}) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: ISS[provider],
    aud,
    sub,
    iat: now,
    exp: now + 600,
    auth_time: now,
    nonce,
    email: `${sub}@${provider === "apple" ? "privaterelay.appleid.com" : "example.test"}`,
    email_verified: true,
    ...extra,
  };
  for (const [name, value] of Object.entries(claims))
    if (value === null) delete claims[name];
  const data = `${b64({ alg: options.alg ?? "RS256", kid: options.kid ?? kid, typ: "JWT" })}.${b64(claims)}`;
  let signature =
    options.alg === "none"
      ? ""
      : sign("sha256", Buffer.from(data), privateKey).toString("base64url");
  if (options.badSignature)
    signature = `${signature.slice(0, -6)}${signature.endsWith("AAAAAA") ? "BBBBBB" : "AAAAAA"}`;
  return `${data}.${signature}`;
}
function appleSecretValid(secret, clientId) {
  const [head, body, signature] = String(secret ?? "").split(".");
  try {
    const header = JSON.parse(Buffer.from(head, "base64url"));
    const claims = JSON.parse(Buffer.from(body, "base64url"));
    const now = Date.now() / 1000;
    return (
      header.alg === "ES256" &&
      header.kid === APPLE.key &&
      claims.iss === APPLE.team &&
      claims.sub === clientId &&
      claims.aud === "https://appleid.apple.com" &&
      claims.exp > now &&
      claims.iat <= now + 30 &&
      verify(
        "sha256",
        Buffer.from(`${head}.${body}`),
        { key: applePublic, dsaEncoding: "ieee-p1363" },
        Buffer.from(signature, "base64url"),
      )
    );
  } catch {
    return false;
  }
}
const send = (res, status, body, headers = {}) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(body));
};
const refuse = (res, error = "invalid_grant") => {
  stats.refused += 1;
  send(res, 400, { error });
};
function newCode(entry) {
  const code = randomBytes(24).toString("base64url");
  codes.set(code, { ...entry, expiresAt: Date.now() + 60_000, used: false });
  return code;
}
function authorize(provider, res, q) {
  stats.authorize += 1;
  if (
    !q.client_id ||
    !q.redirect_uri ||
    q.response_type !== "code" ||
    !q.state ||
    !q.nonce
  )
    return refuse(res, "invalid_request");
  if (
    provider === "google" &&
    (q.code_challenge_method !== "S256" || !q.code_challenge)
  )
    return refuse(res, "invalid_request");
  if (!q.sub) {
    // A browser chooses its test person here, as a person would at Apple or Google.
    const hidden = Object.entries(q)
      .map(
        ([name, value]) =>
          `<input type="hidden" name="${escape(name)}" value="${escape(value)}">`,
      )
      .join("");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      `<!doctype html><title>Fake ${provider}</title><h1>Fake ${provider} sign-in</h1><form method="get">${hidden}<label>Test person <input name="sub" required></label> <button>Sign in</button></form>`,
    );
    return;
  }
  const code = newCode({
    provider,
    clientId: q.client_id,
    redirectUri: q.redirect_uri,
    nonce: q.nonce,
    challenge: q.code_challenge,
    sub: q.sub,
    claims: q.claims ? JSON.parse(q.claims) : {},
    options: q.options ? JSON.parse(q.options) : {},
  });
  if (provider === "google") {
    const back = new URL(q.redirect_uri);
    back.searchParams.set("code", code);
    back.searchParams.set("state", q.state);
    res.writeHead(303, { Location: back.href }).end();
    return;
  }
  // Apple returns with a cross-site form post when the email scope is asked.
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(
    `<!doctype html><title>Fake apple</title><form method="post" action="${escape(q.redirect_uri)}"><input name="code" value="${code}"><input name="state" value="${escape(q.state)}"><button>Continue</button></form><script>document.forms[0].submit()</script>`,
  );
}
function token(provider, res, form) {
  stats.token += 1;
  if (mode === "down")
    return send(res, 503, { error: "temporarily_unavailable" });
  const entry = codes.get(form.code);
  if (
    !entry ||
    entry.used ||
    entry.expiresAt < Date.now() ||
    entry.provider !== provider ||
    form.grant_type !== "authorization_code" ||
    entry.clientId !== form.client_id
  )
    return refuse(res);
  entry.used = true;
  if ((entry.redirectUri ?? undefined) !== (form.redirect_uri ?? undefined))
    return refuse(res);
  if (provider === "google") {
    const challenge = createHash("sha256")
      .update(String(form.code_verifier ?? ""))
      .digest("base64url");
    if (form.client_secret !== GOOGLE_SECRET || challenge !== entry.challenge)
      return refuse(res);
  } else if (!appleSecretValid(form.client_secret, form.client_id))
    return refuse(res, "invalid_client");
  const refresh =
    provider === "apple" ? `r.${randomBytes(16).toString("hex")}` : undefined;
  send(res, 200, {
    access_token: randomBytes(16).toString("hex"),
    token_type: "Bearer",
    expires_in: 3600,
    id_token: idToken(
      provider,
      entry.clientId,
      entry.sub,
      entry.nonce,
      entry.claims,
      entry.options,
    ),
    ...(refresh ? { refresh_token: refresh } : {}),
  });
}
const routes = {
  "GET /apple/auth/authorize": (res, q) => authorize("apple", res, q),
  "GET /google/o/oauth2/v2/auth": (res, q) => authorize("google", res, q),
  "POST /apple/auth/token": (res, _q, form) => token("apple", res, form),
  "POST /google/token": (res, _q, form) => token("google", res, form),
  "POST /apple/auth/revoke": (res, _q, form) => {
    if (!appleSecretValid(form.client_secret, form.client_id))
      return refuse(res, "invalid_client");
    revoked.push(form.token);
    send(res, 200, {});
  },
  "GET /__stats": (res) => send(res, 200, { ...stats, mode, revoked }),
  "POST /__control": (res, _q, body) =>
    send(res, 200, { mode: (mode = body.mode ?? "ok") }),
  // A native sheet's ID token, minted for a test person and any claims.
  "POST /__mint": (res, _q, body) =>
    send(res, 200, {
      idToken: idToken(
        body.provider ?? "google",
        body.aud,
        body.sub,
        body.nonce,
        body.claims,
        body.options,
      ),
    }),
  "POST /__apple-native-code": (res, _q, body) =>
    send(res, 200, {
      code: newCode({
        provider: "apple",
        clientId: APPLE.bundle,
        nonce: body.nonce,
        sub: body.sub,
        claims: {},
        options: {},
      }),
    }),
};
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    const body = /json/u.test(req.headers["content-type"] ?? "")
      ? JSON.parse(raw || "{}")
      : Object.fromEntries(new URLSearchParams(raw));
    if (/\/(keys|certs)$/u.test(url.pathname) && req.method === "GET") {
      stats.keys += 1;
      if (mode === "down") return send(res, 503, { error: "unavailable" });
      return send(res, 200, {
        keys: [
          {
            ...publicKey.export({ format: "jwk" }),
            kid,
            alg: "RS256",
            use: "sig",
          },
        ],
      });
    }
    if (mode === "slow" && !url.pathname.startsWith("/__"))
      await new Promise((resolve) => setTimeout(resolve, 15_000));
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) return send(res, 404, { error: "not_found" });
    route(res, Object.fromEntries(url.searchParams), body);
  })
  .listen(PORT, "127.0.0.1", () =>
    process.stdout.write(`fake Apple and Google on http://127.0.0.1:${PORT}\n`),
  );
