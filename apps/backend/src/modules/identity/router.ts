import { Router, type Request, type Response } from "express";
import {
  AgeConfirmationInputSchema,
  CompleteIdentitySchema,
  IdSchema,
  IdentityProviderContinueSchema,
  IdentityRedirectSchema,
  IdentitySignInResultSchema,
  NativeSignInCompleteSchema,
  NativeSignInNonceSchema,
  NativeSignInStartSchema,
  SessionSchema,
  PasskeyRecoverySchema,
  PasskeyRevocationSchema,
} from "@qelvora/api";
import type { SignInStep } from "./qelvora-sign-in.js";
import { DomainError } from "../../core/errors.js";
import type { Actor } from "./adapter.js";
import type { SessionService } from "./sessions.js";
import type { IdentityProfiles } from "./profiles.js";
import type { PasskeyService } from "./passkeys.js";
import type { SignedActService } from "./signed-acts.js";

export interface IdentityRuntime {
  sessions: SessionService;
  profiles: IdentityProfiles;
  passkeys: PasskeyService;
  signing: SignedActService;
}
export function bearer(req: Request) {
  const token = req.headers.authorization?.match(/^Bearer ([^\s]+)$/u)?.[1];
  if (!token)
    throw new DomainError(
      "session_required",
      "Continue with Pantopus to use this app.",
      401,
    );
  return token;
}
/** Sign-in starts per client per minute; completions are single use, so this
 * bounds every attempt. A loopback caller (the web app's server on this host)
 * may name the client with X-Forwarded-For. One process, in memory. */
function signInLimiter(
  limit = Number(process.env.QELVORA_SIGN_IN_STARTS_PER_MINUTE ?? 20),
) {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response) => {
    const remote = req.socket.remoteAddress ?? "unknown";
    const forwarded = req.get("X-Forwarded-For")?.split(",")[0]?.trim();
    const client =
      ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote) && forwarded
        ? forwarded
        : remote;
    const now = Date.now();
    const recent = (hits.get(client) ?? []).filter((at) => at > now - 60_000);
    if (recent.length >= limit) {
      res.setHeader(
        "Retry-After",
        String(Math.max(1, Math.ceil((recent[0]! + 60_000 - now) / 1000))),
      );
      throw new DomainError(
        "rate_limited",
        "Too many sign-in attempts. Wait a minute and try again.",
        429,
      );
    }
    hits.set(client, [...recent, now]);
    if (hits.size > 10_000)
      for (const [key, times] of hits)
        if (!times.some((at) => at > now - 60_000)) hits.delete(key);
  };
}
export function createIdentityRouter(
  runtime: IdentityRuntime,
  assertAllowed?: (actor: Actor) => Promise<void>,
  currentActor?: (request: Request) => Promise<Actor>,
) {
  const router = Router();
  const session = async (token: string) => {
    const resolved = await runtime.sessions.resolve(token);
    await assertAllowed?.(resolved.actor);
    return SessionSchema.parse({
      ...(await runtime.profiles.view(resolved.actor)),
      accountId: resolved.actor.accountId,
      adultEligible: true,
      sessionId: resolved.sessionId,
      expiresAt: resolved.expiresAt,
      mode: resolved.mode,
    });
  };
  const limit = signInLimiter();
  /** C1's flat result. A session that cannot be shown is ended at once. */
  const signInResult = async (step: SignInStep) => {
    if (step.status === "age_required")
      return IdentitySignInResultSchema.parse({
        status: step.status,
        completion: null,
        ageConfirmation: {
          ageContinuationId: step.ageContinuationId,
          expiresAt: step.expiresAt,
        },
      });
    try {
      return IdentitySignInResultSchema.parse({
        status: step.status,
        completion: {
          token: step.token,
          returnTo: step.returnTo,
          session: await session(step.token),
        },
        ageConfirmation: null,
      });
    } catch (error) {
      await runtime.sessions.logout(step.token);
      throw error;
    }
  };
  router.post("/web/start", async (req, res) => {
    limit(req, res);
    res.json(
      IdentityRedirectSchema.parse(
        await runtime.sessions.startWeb(
          IdentityProviderContinueSchema.parse(req.body),
        ),
      ),
    );
  });
  router.post("/web/complete", async (req, res) =>
    res.json(
      await signInResult(
        await runtime.sessions.completeWeb(
          CompleteIdentitySchema.parse(req.body),
        ),
      ),
    ),
  );
  router.post("/native/nonce", async (req, res) => {
    limit(req, res);
    res.json(
      NativeSignInNonceSchema.parse(
        await runtime.sessions.startNative(
          NativeSignInStartSchema.parse(req.body),
        ),
      ),
    );
  });
  router.post("/native/complete", async (req, res) =>
    res.json(
      await signInResult(
        await runtime.sessions.completeNative(
          NativeSignInCompleteSchema.parse(req.body),
        ),
      ),
    ),
  );
  router.post("/age", async (req, res) =>
    res.json(
      await signInResult(
        await runtime.sessions.confirmAge(
          AgeConfirmationInputSchema.parse(req.body),
        ),
      ),
    ),
  );
  const actor = async (req: Request): Promise<Actor> =>
    currentActor
      ? currentActor(req)
      : runtime.sessions.resolveSession(bearer(req));
  router.post("/complete", async (req, res) => {
    const result = await runtime.sessions.complete(req.body);
    try {
      res.json({
        token: result.token,
        returnTo: result.returnTo,
        session: await session(result.token),
      });
    } catch (error) {
      await runtime.sessions.logout(result.token);
      throw error;
    }
  });
  router.get("/session", async (req, res) =>
    res.json(await session(bearer(req))),
  );
  router.post("/refresh", async (req, res) =>
    res.json(await runtime.sessions.refresh(bearer(req))),
  );
  router.post("/logout", async (req, res) =>
    res.json(await runtime.sessions.logout(bearer(req))),
  );
  router.post("/revoke-sessions", async (req, res) =>
    res.json(await runtime.sessions.logout(bearer(req), true)),
  );
  router.post("/fan-profile", async (req, res) =>
    res.json(await runtime.profiles.saveFan(await actor(req), req.body)),
  );
  router.post("/fan-profile/intro", async (req, res) =>
    res.json(await runtime.profiles.saveFanIntro(await actor(req), req.body)),
  );
  router.post("/creator-profile", async (req, res) =>
    res.json(await runtime.profiles.saveCreator(await actor(req), req.body)),
  );
  router.post("/:creatorId/proof", async (req, res) =>
    res.json(
      await runtime.profiles.beginProof(
        await actor(req),
        IdSchema.parse(req.params.creatorId),
        req.body,
      ),
    ),
  );
  router.get("/:creatorId/proof", async (req, res) =>
    res.json(
      await runtime.profiles.proof(
        await actor(req),
        IdSchema.parse(req.params.creatorId),
      ),
    ),
  );
  router.post("/proof/:proofId/submit", async (req, res) =>
    res.json(
      await runtime.profiles.submitProof(
        await actor(req),
        IdSchema.parse(req.params.proofId),
        req.body,
      ),
    ),
  );
  router.get("/passkeys", async (req, res) =>
    res.json(await runtime.passkeys.list(await actor(req))),
  );
  router.post("/passkeys/begin", async (req, res) => {
    const current = await runtime.sessions.resolve(bearer(req));
    res.json(
      await runtime.passkeys.begin(current.actor, current.authenticatedAt),
    );
  });
  router.post("/passkeys/register", async (req, res) => {
    const current = await runtime.sessions.resolve(bearer(req));
    res.json(
      await runtime.passkeys.register(
        current.actor,
        current.authenticatedAt,
        req.body,
      ),
    );
  });
  router.post("/passkeys/:challengeId/cancel", async (req, res) =>
    res.json(
      await runtime.passkeys.cancel(
        await actor(req),
        IdSchema.parse(req.params.challengeId),
      ),
    ),
  );
  router.post("/passkeys/revoke", async (req, res) => {
    const body = PasskeyRevocationSchema.parse(req.body);
    res.json(
      await runtime.passkeys.revoke(
        await actor(req),
        body.credentialId,
        body.loss,
      ),
    );
  });
  router.post("/passkeys/recovery", async (req, res) =>
    res.json(
      await runtime.passkeys.recover(
        await actor(req),
        PasskeyRecoverySchema.parse(req.body ?? {}).loss,
      ),
    ),
  );
  router.post("/:creatorId/team/invite", async (req, res) =>
    res.json(
      await runtime.profiles.invite(
        await actor(req),
        IdSchema.parse(req.params.creatorId),
        req.body,
      ),
    ),
  );
  router.post("/team/:invitationId/accept", async (req, res) =>
    res.json(
      await runtime.profiles.acceptInvite(
        await actor(req),
        IdSchema.parse(req.params.invitationId),
      ),
    ),
  );
  router.post("/:creatorId/team/:accountId/remove", async (req, res) =>
    res.json(
      await runtime.profiles.removeMember(
        await actor(req),
        IdSchema.parse(req.params.creatorId),
        IdSchema.parse(req.params.accountId),
      ),
    ),
  );
  router.post("/:creatorId/team/:accountId/roles", async (req, res) => {
    const current = await actor(req);
    if (IdSchema.parse(req.get("X-Expected-Account-Id")) !== current.accountId)
      throw new DomainError(
        "session_account_changed",
        "Your account changed. Reopen this team before saving roles.",
        409,
      );
    res.json(
      await runtime.profiles.updateMemberRoles(
        current,
        IdSchema.parse(req.params.creatorId),
        IdSchema.parse(req.params.accountId),
        req.body,
      ),
    );
  });
  router.post("/signed-acts/:challengeId/cancel", async (req, res) =>
    res.json(
      await runtime.signing.cancel(
        await actor(req),
        IdSchema.parse(req.params.challengeId),
      ),
    ),
  );
  router.get("/signed-acts/:signedActId", async (req, res) =>
    res.json(
      await runtime.signing.publicVerification(
        IdSchema.parse(req.params.signedActId),
      ),
    ),
  );
  return router;
}
