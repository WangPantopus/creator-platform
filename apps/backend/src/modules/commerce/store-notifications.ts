import { Router, json } from "express";
import { z } from "zod";
import type { AppleStoreMembership } from "./apple-store.js";
import type { GoogleStoreMembership } from "./google-store.js";

export type VerifiedStoreSignal =
  | Awaited<ReturnType<AppleStoreMembership["notification"]>>
  | Awaited<ReturnType<GoogleStoreMembership["notification"]>>;

/** W8 supplies durable dedupe, least privilege, encrypted Play token retention,
 * live account/job authority and current-truth dispatch. A response acknowledges
 * delivery of the signal only, never payment or membership entitlement. */
export interface StoreNotificationInbox {
  accept(signal: VerifiedStoreSignal): Promise<void>;
}

export function createAppleStoreNotificationRouter(
  provider: AppleStoreMembership,
  inbox: StoreNotificationInbox,
) {
  const router = Router();
  router.post(
    "/",
    json({ type: "application/json", limit: "256kb" }),
    async (req, res) => {
      const body = z
        .strictObject({ signedPayload: z.string().min(1).max(250000) })
        .parse(req.body);
      await inbox.accept(await provider.notification(body.signedPayload));
      res.sendStatus(204);
    },
  );
  return router;
}

export function createGoogleStoreNotificationRouter(
  provider: GoogleStoreMembership,
  inbox: StoreNotificationInbox,
) {
  const router = Router();
  router.post(
    "/",
    json({ type: "application/json", limit: "256kb" }),
    async (req, res) => {
      await inbox.accept(
        await provider.notification(req.get("Authorization") ?? "", req.body),
      );
      res.sendStatus(204);
    },
  );
  return router;
}
