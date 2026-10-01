import { Router, type Request } from "express";
import { z } from "zod";
import type { Actor } from "../identity/adapter.js";
import { DomainError } from "../../core/errors.js";
import type { CommerceService } from "./service.js";
import { CreatorEarningsReader } from "./creator-earnings.js";

export function createCommerceRouter(input: {
  service?: CommerceService;
  actorFor: (request: Request) => Promise<Actor>;
  extended?: import("./extended.js").ExtendedCommerce;
}) {
  const router = Router();
  const earnings = input.service
    ? new CreatorEarningsReader(input.service)
    : undefined;
  const service = () => {
    if (!input.service)
      throw new DomainError(
        "commerce_unconfigured",
        "Commerce is not connected yet. Nothing is charged.",
        503,
      );
    return input.service;
  };
  const id = (value: unknown) => z.uuid().parse(value);
  const actorFor = async (request: Request) => {
    const actor = await input.actorFor(request);
    const expected = request.header("x-commerce-account-id");
    if (expected !== undefined && id(expected) !== actor.accountId)
      throw new DomainError(
        "session_changed",
        "Your account changed. Continue with Pantopus before using this form.",
        409,
      );
    return actor;
  };
  router.get("/capabilities", (_req, res) =>
    res.json({
      configured: Boolean(input.service),
      paymentsAvailable: Boolean(input.service?.provider),
      nativeReplyPurchase: false,
      membershipAvailable: input.extended?.billing?.configured ?? false,
      passEnabled: input.extended?.pass?.configured ?? false,
      passPurchaseAvailable: input.extended?.passPurchases?.configured ?? false,
      payoutsAvailable: input.extended?.settlement?.configured ?? false,
      payoutOnboardingAvailable:
        input.extended?.settlement?.onboardingConfigured ?? false,
      creatorEarningsAvailable:
        input.service?.creatorFinancialReadAvailable ?? false,
      poolEarningsAvailable: Boolean(
        input.extended?.poolJournal &&
          input.service?.creatorFinancialReadAvailable,
      ),
    }),
  );
  router.get("/overview", async (req, res) => {
    const actor = await actorFor(req);
    const value = await service().overview(
      actor,
      req.query.creatorId ? id(req.query.creatorId) : undefined,
      {
        creatorFinance:
          req.query.creatorEarnings === "1" || req.query.poolEarnings === "1",
      },
    );
    const poolCreator = req.query.creatorId
      ? id(req.query.creatorId)
      : value.owned.find((c) => c.verification === "verified")?.id;
    res.json({
      ...value,
      creatorEarnings:
        req.query.creatorEarnings === "1" && poolCreator
          ? await earnings!.read(actor, poolCreator)
          : null,
      poolEarnings:
        req.query.poolEarnings === "1" && poolCreator
          ? ((await input.extended?.poolJournal?.earnings(
              actor,
              poolCreator,
            )) ?? [])
          : [],
      tierCatalog:
        (await input.extended?.tiers?.choices(await actorFor(req))) ?? [],
      policy: {
        ...value.policy,
        passEnabled: input.extended?.pass?.configured ?? false,
      },
      passChoices: (await input.extended?.pass?.choices(
        await actorFor(req),
      )) ?? { creators: [], replaceableSlotIds: [] },
      capabilities: {
        ...value.capabilities,
        storePurchasesAvailable: input.extended?.storeConfigured ?? false,
        membershipAvailable: input.extended?.billing?.configured ?? false,
        passPurchaseAvailable:
          input.extended?.passPurchases?.configured ?? false,
        creatorEarningsAvailable:
          input.service?.creatorFinancialReadAvailable ?? false,
        poolEarningsAvailable: Boolean(
          input.extended?.poolJournal &&
            input.service?.creatorFinancialReadAvailable,
        ),
        payoutOnboardingAvailable:
          input.extended?.settlement?.onboardingConfigured ?? false,
      },
    });
  });
  router.get("/creators/:creatorId/earnings", async (req, res) => {
    service();
    res.json(
      await earnings!.ledger(
        await actorFor(req),
        id(req.params.creatorId),
        z
          .string()
          .regex(/^[A-Z]{3}$/u)
          .parse(req.query.currency),
        req.query.cursor === undefined
          ? undefined
          : z.string().min(1).max(512).parse(req.query.cursor),
      ),
    );
  });
  router.post("/creators/:creatorId/payout-onboarding", async (req, res) => {
    const actor = await actorFor(req);
    service();
    if (!input.extended?.settlement)
      throw new DomainError(
        "payout_onboarding_unavailable",
        "Payout verification is not connected yet.",
        503,
      );
    res.json(
      await input.extended.settlement.onboarding.start(
        actor,
        id(req.params.creatorId),
        req.body,
      ),
    );
  });
  router.post("/packets/:packetId/reconcile-money", async (req, res) => {
    if (!input.extended?.money)
      throw new DomainError(
        "money_reconciliation_unavailable",
        "Current provider statements are not connected yet.",
        503,
      );
    res.json(
      await input.extended.money.reconcile(
        await actorFor(req),
        id(req.params.packetId),
      ),
    );
  });
  router.post("/commitments/:commitmentId/release", async (req, res) => {
    if (!input.extended?.settlement?.configured)
      throw new DomainError(
        "payout_unavailable",
        "Payout transfers are not connected yet.",
        503,
      );
    res.json(
      await input.extended.settlement.release(
        await actorFor(req),
        id(req.params.commitmentId),
      ),
    );
  });
  router.post("/memberships/start", async (req, res) => {
    if (!input.extended?.billing)
      throw new DomainError(
        "membership_unavailable",
        "Membership billing is not connected yet.",
        503,
      );
    res.json(await input.extended.billing.start(await actorFor(req), req.body));
  });
  router.post("/memberships/reconcile", async (req, res) => {
    if (!input.extended?.billing)
      throw new DomainError(
        "membership_unavailable",
        "Membership billing is not connected yet.",
        503,
      );
    res.json(await input.extended.billing.reconcile(await actorFor(req)));
  });
  router.post("/memberships/:membershipId/cancel", async (req, res) => {
    if (!input.extended?.billing)
      throw new DomainError(
        "membership_unavailable",
        "Membership billing is not connected yet.",
        503,
      );
    res.json(
      await input.extended.billing.cancel(
        await actorFor(req),
        id(req.params.membershipId),
        req.body,
      ),
    );
  });
  const passPurchases = () => {
    if (!input.extended?.passPurchases)
      throw new DomainError(
        "pass_billing_unconfigured",
        "Pass billing is not available yet.",
        503,
      );
    return input.extended.passPurchases;
  };
  router.get("/pass/billing", async (req, res) =>
    res.json(await passPurchases().status(await actorFor(req))),
  );
  router.post("/pass/quote", async (req, res) =>
    res.json(await passPurchases().quote(await actorFor(req))),
  );
  router.post("/pass/purchase", async (req, res) =>
    res.json(await passPurchases().start(await actorFor(req), req.body)),
  );
  router.post("/pass/purchase-status", async (req, res) =>
    res.json(
      await passPurchases().purchaseStatus(await actorFor(req), req.body),
    ),
  );
  router.post("/pass/cancel", async (req, res) =>
    res.json(await passPurchases().cancel(await actorFor(req), req.body)),
  );
  router.post("/pass/effects/:effectId/reconcile", async (req, res) =>
    res.json(
      await passPurchases().run(await actorFor(req), id(req.params.effectId)),
    ),
  );
  router.post("/pass/draft", async (req, res) => {
    if (!input.extended)
      throw new DomainError(
        "pass_unavailable",
        "The pass is not available yet.",
        503,
      );
    res.json(await input.extended.draftPass(await actorFor(req), req.body));
  });
  router.post("/pass/initial", async (req, res) => {
    if (!input.extended?.pass)
      throw new DomainError(
        "pass_unavailable",
        "The pass is not available yet.",
        503,
      );
    res.json(
      await input.extended.pass.selectInitial(await actorFor(req), req.body),
    );
  });
  router.post("/pass/slots/:slotId/replace", async (req, res) => {
    if (!input.extended?.pass)
      throw new DomainError(
        "pass_unavailable",
        "The pass is not available yet.",
        503,
      );
    res.json(
      await input.extended.pass.replace(
        await actorFor(req),
        id(req.params.slotId),
        req.body,
      ),
    );
  });
  router.post("/spend-limit", async (req, res) =>
    res.json(await service().setLimit(await actorFor(req), req.body)),
  );
  const saveTier = async (req: Request, tierId?: string) => {
    if (!input.extended?.tiers)
      throw new DomainError(
        "tiers_unconfigured",
        "Membership editing is unavailable.",
        503,
      );
    return input.extended.tiers.save(
      await actorFor(req),
      id(req.params.creatorId),
      tierId,
      req.body,
    );
  };
  router.post("/creators/:creatorId/tiers", async (req, res) =>
    res.json(await saveTier(req)),
  );
  router.post("/creators/:creatorId/tiers/:tierId", async (req, res) =>
    res.json(await saveTier(req, id(req.params.tierId))),
  );
  router.post("/creators/:creatorId/modes", async (req, res) =>
    res.json(
      await service().saveMode(
        await actorFor(req),
        id(req.params.creatorId),
        null,
        req.body,
      ),
    ),
  );
  router.post("/creators/:creatorId/modes/:modeId", async (req, res) =>
    res.json(
      await service().saveMode(
        await actorFor(req),
        id(req.params.creatorId),
        id(req.params.modeId),
        req.body,
      ),
    ),
  );
  router.get("/creators/:creatorId/fans/:fanId/access", async (req, res) =>
    res.json(
      await service().accessFor(
        await actorFor(req),
        id(req.params.creatorId),
        id(req.params.fanId),
      ),
    ),
  );
  router.get("/creators/:creatorId/fans/:fanId/disclosure", async (req, res) =>
    res.json(
      await service().packetDisclosure(
        await actorFor(req),
        id(req.params.creatorId),
        id(req.params.fanId),
      ),
    ),
  );
  router.post("/creators/:creatorId/fans/:fanId/trial", async (req, res) =>
    res.json(
      await service().openTrial(
        await actorFor(req),
        id(req.params.creatorId),
        id(req.params.fanId),
      ),
    ),
  );
  router.post("/packets", async (req, res) =>
    res.json(await service().submit(await actorFor(req), req.body)),
  );
  router.get("/packets/:packetId", async (req, res) =>
    res.json(
      await service().packet(await actorFor(req), id(req.params.packetId)),
    ),
  );
  router.post("/packets/:packetId/withdraw", async (req, res) =>
    res.json(
      await service().withdraw(
        await actorFor(req),
        id(req.params.packetId),
        req.body,
      ),
    ),
  );
  router.post("/packets/:packetId/decide", async (req, res) =>
    res.json(
      await service().decide(
        await actorFor(req),
        id(req.params.packetId),
        req.body,
      ),
    ),
  );
  router.post("/packets/:packetId/info", async (req, res) =>
    res.json(
      await service().moreInfo(
        await actorFor(req),
        id(req.params.packetId),
        req.body,
      ),
    ),
  );
  router.post("/packets/:packetId/offer-choice", async (req, res) =>
    res.json(
      await service().offerChoice(
        await actorFor(req),
        id(req.params.packetId),
        req.body,
      ),
    ),
  );
  router.post("/packets/:packetId/reauthorize", async (req, res) =>
    res.json(
      await service().reauthorize(
        await actorFor(req),
        id(req.params.packetId),
        req.body,
      ),
    ),
  );
  router.post("/stores/verify", async (req, res) => {
    if (!input.extended)
      throw new DomainError(
        "store_verification_unconfigured",
        "Store verification is unavailable. No access was granted.",
        503,
      );
    const body = z
      .strictObject({
        platform: z.enum(["apple", "google"]),
        transaction: z.string().min(1).max(160000),
      })
      .parse(req.body);
    res.json(await input.extended.storePurchase(await actorFor(req), body));
  });
  router.post("/packets/:packetId/deliver", async (req, res) =>
    res.json(
      await service().deliver(
        await actorFor(req),
        id(req.params.packetId),
        req.body,
      ),
    ),
  );
  router.post("/packets/:packetId/share", async (req, res) =>
    res.json(
      await service().share(
        await actorFor(req),
        id(req.params.packetId),
        req.body,
      ),
    ),
  );
  router.post("/packets/:packetId/reconcile", async (req, res) =>
    res.json(
      await service().reconcile(await actorFor(req), id(req.params.packetId)),
    ),
  );
  router.post("/packets/:packetId/authentication", async (req, res) =>
    res.json(
      await service().paymentAuthentication(
        await actorFor(req),
        id(req.params.packetId),
      ),
    ),
  );
  // The scheduler calls the service with an issued actor scope; no public global job command.
  return router;
}
