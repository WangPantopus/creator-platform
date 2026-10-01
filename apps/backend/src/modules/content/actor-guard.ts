import type { RequestHandler } from "express";
import { z } from "zod";
import type { Actor } from "../identity/adapter.js";
import { invariant } from "../../core/errors.js";

/** A client snapshot can deny a stale-account command; it never grants authority. */
export function contentActorGuard(
  actorFor: (request: Parameters<RequestHandler>[0]) => Promise<Actor>,
): RequestHandler {
  return async (req, _res, next) => {
    if (req.header("x-qelvora-expected-account")) {
      const expected = z.uuid().parse(req.header("x-qelvora-expected-account"));
      const actor = await actorFor(req);
      invariant(
        actor.accountId === expected,
        "content_account_changed",
        "The signed-in account changed. Refresh before continuing; this request was not applied.",
      );
    }
    next();
  };
}
