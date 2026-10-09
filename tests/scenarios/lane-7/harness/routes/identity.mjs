// Sign-in as the real development adapter does it: capabilities, continue,
// complete with a listed actor, a 15 minute session that refreshes by
// one-use rotation for 7 days. Wrong, expired and revoked sessions fail the
// way the real API fails.
import { randomBytes, randomUUID } from "node:crypto";
import { Failure } from "../http.mjs";
import { PERSONAS, uid } from "../world.mjs";

const MINUTE = 60_000;
const iso = (ms) => new Date(ms).toISOString();

const bearer = (req) => {
  const token = /^Bearer (\S+)$/u.exec(req.headers.authorization ?? "")?.[1];
  if (!token)
    throw new Failure(
      401,
      "session_required",
      "Continue with Pantopus to use this app.",
    );
  return token;
};

/** The signed-in session for this request. `refreshing` accepts a session that
 * has expired but may still be refreshed. */
export function authenticate(ctx, { refreshing = false } = {}) {
  const { world, req } = ctx;
  const token = bearer(req);
  const session = world.sessions.get(token);
  const limit = refreshing ? session?.refreshUntil : session?.expiresAt;
  if (!session || session.revoked || world.now() >= limit)
    throw new Failure(
      401,
      "session_expired",
      "Your session ended. Continue with Pantopus again.",
    );
  const account = world.accounts.get(session.accountId);
  const expected =
    req.headers["x-expected-account-id"] ??
    req.headers["x-qelvora-expected-account"];
  if (expected && expected !== account.id)
    throw new Failure(
      409,
      "session_account_changed",
      "Your account changed. Reopen this page to continue.",
    );
  ctx.entry.account = account.key;
  return { session, account, token };
}

const view = (session, account) => ({
  accountId: account.id,
  adultEligible: true,
  sessionId: session.id,
  expiresAt: iso(session.expiresAt),
  mode: "development",
  fan: account.fan
    ? {
        id: account.fan.id,
        handle: account.fan.handle,
        intro: account.fan.intro,
        version: account.fan.version,
      }
    : null,
  creator: account.creator ?? null,
  teams: [],
});

export function register(router) {
  router.add("GET", "/v1/identity/capabilities", ({ world }) => ({
    signInAvailable: true,
    localAccountsAllowed: false,
    mode: "development",
    developmentActors: [...world.accounts.values()].map((a) => ({
      id: a.id,
      label: a.label,
    })),
  }));

  router.add("POST", "/v1/identity/continue", ({ world, body }) => {
    const returnTo = body?.returnTo;
    if (typeof returnTo !== "string" || !returnTo.startsWith("/"))
      throw new Failure(
        400,
        "invalid_request",
        "The request does not match the API contract.",
      );
    const id = randomUUID();
    world.continuations.set(id, {
      returnTo,
      expiresAt: world.now() + 5 * MINUTE,
      used: false,
    });
    return {
      redirectUrl: `http://127.0.0.1:56473/auth/development?continuationId=${id}`,
      continuationId: id,
    };
  });

  router.add("POST", "/v1/identity/complete", ({ world, body }) => {
    const continuation = world.continuations.get(body?.continuationId);
    if (
      !continuation ||
      continuation.used ||
      world.now() >= continuation.expiresAt
    )
      throw new Failure(
        403,
        "continuation_expired",
        "This sign-in request expired. Start again.",
      );
    const account = world.accounts.get(body?.code);
    if (!account)
      throw new Failure(
        403,
        "development_actor_invalid",
        "Choose a listed development actor.",
      );
    if (!account.adult)
      throw new Failure(
        403,
        "adult_eligibility_required",
        "This app is available to adults aged 18 and over.",
      );
    continuation.used = true;
    const token = `harness.${randomBytes(24).toString("base64url")}`;
    const session = {
      id: uid("5e000000", ++world.sessionSeq),
      accountId: account.id,
      expiresAt: world.now() + 15 * MINUTE,
      refreshUntil: world.now() + 7 * 24 * 60 * MINUTE,
      revoked: false,
    };
    world.sessions.set(token, session);
    return {
      token,
      returnTo: continuation.returnTo,
      session: view(session, account),
    };
  });

  router.add("GET", "/v1/identity/session", (ctx) => {
    const { session, account } = authenticate(ctx);
    return view(session, account);
  });

  router.add("POST", "/v1/identity/refresh", (ctx) => {
    const { session, token } = authenticate(ctx, { refreshing: true });
    const next = `harness.${randomBytes(24).toString("base64url")}`;
    ctx.world.sessions.delete(token);
    session.expiresAt = Math.min(
      ctx.world.now() + 15 * MINUTE,
      session.refreshUntil,
    );
    ctx.world.sessions.set(next, session);
    return { token: next, expiresAt: iso(session.expiresAt) };
  });

  router.add("POST", "/v1/identity/logout", ({ world, req }) => {
    const session = world.sessions.get(bearer(req));
    if (session) session.revoked = true;
    return { done: true };
  });

  router.add("POST", "/v1/identity/revoke-sessions", (ctx) => {
    const { account } = authenticate(ctx, { refreshing: true });
    for (const session of ctx.world.sessions.values())
      if (session.accountId === account.id) session.revoked = true;
    return { done: true };
  });

  router.add("POST", "/v1/identity/fan-profile", (ctx) => {
    const { account } = authenticate(ctx);
    const handle = String(ctx.body?.handle ?? "")
      .trim()
      .replace(/^@/u, "")
      .toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/u.test(handle))
      throw new Failure(
        400,
        "invalid_request",
        "The request does not match the API contract.",
      );
    for (const other of ctx.world.accounts.values())
      if (other.id !== account.id && other.fan?.handle === handle)
        throw new Failure(
          409,
          "handle_taken",
          "That handle is already in use. Choose another.",
        );
    const intro = String(ctx.body?.intro ?? "")
      .trim()
      .slice(0, 240);
    const index = PERSONAS.find((p) => p.key === account.key).n;
    account.fan = {
      id: account.fan?.id ?? uid("f1000000", index),
      handle,
      intro,
      version: (account.fan?.version ?? 0) + 1,
    };
    return account.fan;
  });

  router.add("POST", "/v1/identity/fan-profile/intro", (ctx) => {
    const { account } = authenticate(ctx);
    const intro = String(ctx.body?.intro ?? "").trim();
    if (!account.fan || intro.length > 240)
      throw new Failure(
        400,
        "invalid_request",
        "The request does not match the API contract.",
      );
    if (ctx.body?.expectedVersion !== account.fan.version) {
      if (account.fan.intro === intro) return account.fan;
      throw new Failure(
        409,
        "fan_profile_changed",
        "Your profile changed. Reopen your intro to review it. Your input is kept.",
      );
    }
    account.fan = { ...account.fan, intro, version: account.fan.version + 1 };
    return account.fan;
  });
}
