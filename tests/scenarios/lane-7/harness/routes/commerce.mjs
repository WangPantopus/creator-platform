// Commerce as the fan app reads it: the overview and one thread's access.
// Paid replies stay on the web during the pilot (Q04), so payments are
// unavailable here and the Requests tab shows its empty state. Request and
// packet fixtures arrive with work package 7.4, which needs them.
import { Failure } from "../http.mjs";
import { authenticate } from "./identity.mjs";

const CURRENCY = "USD";
// WP 7.4 P9: what a fan can ask for, so the packet shows its terms block.
// Amounts are minor units, as the API sends them.
const MODES = {
  maya: {
    n: 1,
    title: "Written reply",
    kind: "written",
    amount: "2500",
    decision: 48,
    delivery: 96,
  },
  kilnclub: {
    n: 2,
    title: "Voice note",
    kind: "voice",
    amount: "1500",
    decision: 72,
    delivery: 120,
  },
};

export function register(router) {
  router.add("GET", "/v1/commerce/overview", (ctx) => {
    const { world } = ctx;
    const { account } = authenticate(ctx);
    return {
      serverTime: new Date(world.now()).toISOString(),
      fan: account.fan
        ? { id: account.fan.id, handle: account.fan.handle }
        : null,
      creators: [...world.creators.values()].map((c) => ({
        id: c.id,
        handle: c.handle,
        display_name: c.name,
      })),
      owned: [],
      payoutAccounts: [],
      packets: [],
      modes: [...world.creators.values()]
        .filter((c) => MODES[c.handle])
        .map((c) => {
          const mode = MODES[c.handle];
          return {
            id: `30de0000-0000-4000-8000-00000000000${mode.n}`,
            creator_id: c.id,
            title: mode.title,
            kind: mode.kind,
            amount: mode.amount,
            public_amount: mode.amount,
            currency: CURRENCY,
            weekly_limit: 3,
            used: 0,
            reserved: 0,
            decision_hours: mode.decision,
            delivery_hours: mode.delivery,
            shareable: false,
            state: "offered",
            version: 1,
          };
        }),
      memberships: [],
      limits: [],
      exposure: {
        captured: 0,
        held: 0,
        total: 0,
        currency: CURRENCY,
        month: new Date(world.now()).toISOString().slice(0, 7),
      },
      spendingNotices: [],
      ledger: [],
      pass: [],
      slots: [],
      policy: {
        currency: CURRENCY,
        limitOptions: [1000, 2500, 5000],
        passEnabled: false,
      },
      tiers: [],
      tierCatalog: [],
      passChoices: { creators: [], replaceableSlotIds: [] },
      creatorEarnings: null,
      poolEarnings: [],
      capabilities: {
        paymentsAvailable: false,
        membershipAvailable: false,
        nativeReplyPurchase: false,
        storePurchasesAvailable: false,
      },
    };
  });

  router.add(
    "GET",
    "/v1/commerce/creators/:creatorId/fans/:fanId/access",
    (ctx) => {
      const { account } = authenticate(ctx);
      const thread = ctx.world.threads.get(
        `${ctx.params.creatorId}/${ctx.params.fanId}`,
      );
      if (!thread || thread.fanAccountId !== account.id)
        throw new Failure(
          403,
          "thread_unavailable",
          "This conversation is unavailable.",
        );
      return {
        version: "access-1",
        creatorId: thread.creatorId,
        fanId: thread.fanId,
        validUntil: null,
        capabilities: thread.access ? ["ai_message"] : [],
        allowance: { available: thread.access ? 5 : 0, unit: "message" },
        sources: thread.access
          ? [
              {
                id: thread.id,
                source: "free_first_conversation",
                validUntil: new Date(
                  ctx.world.now() + 86_400_000,
                ).toISOString(),
              },
            ]
          : [],
      };
    },
  );
}
