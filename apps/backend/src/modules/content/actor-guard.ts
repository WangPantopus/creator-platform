import type { RequestHandler } from "express";
import { z } from "zod";
import type { Actor } from "../identity/adapter.js";
import { DomainError, invariant } from "../../core/errors.js";
import { requestAuthority } from "../identity/request-authority.js";

/** A client snapshot can deny a stale-account command; it never grants authority. */
export function contentActorGuard(
  actorFor: (request: Parameters<RequestHandler>[0]) => Promise<Actor>,
): RequestHandler {
  return async (req, _res, next) => {
    const account = req.header("x-qelvora-expected-account");
    const session = req.header("X-Expected-Session-Id");
    if (account || session) {
      const actor = await actorFor(req);
      if (account)
        invariant(
          actor.accountId === z.uuid().parse(account),
          "content_account_changed",
          "The signed-in account changed. Refresh before continuing; this request was not applied.",
        );
      if (session) {
        const expected = z.uuid().parse(session);
        const current = requestAuthority.getStore();
        // Only the actual middleware-issued Actor/session can satisfy this
        // denial precondition. A header or equal account grants no authority.
        if (current?.actor !== actor || current.accountId !== actor.accountId)
          throw new DomainError(
            "content_session_unconfigured",
            "Current account status is unavailable. Reopen this content before continuing.",
            503,
          );
        if (current.sessionId !== expected)
          throw new DomainError(
            "session_view_changed",
            "Your original content session changed. Reopen it before continuing; this request was not applied.",
            409,
          );
      }
    }
    next();
  };
}
