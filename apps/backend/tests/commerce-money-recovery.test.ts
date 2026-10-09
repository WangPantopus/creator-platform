import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CommerceRecoveryWorker,
  type CommerceWorkIndex,
} from "../src/modules/payments/inbox.js";
import { verifyStripeWebhook } from "../src/modules/payments/provider.js";
import { FakePaymentProvider } from "./support/fake-payment-provider.js";
import {
  MoneyFixture,
  describeMoney,
  type World,
} from "./support/commerce-harness.js";

/**
 * Money path, part 3: when things go wrong or time passes.
 *
 * Deadlines and automatic refunds (INV-16), delivery (INV-09, T-09), crashes
 * and retries around the processor call (T-29), claim leases, races between
 * decisions, withdrawals and expiry, provider notifications (T-28), and
 * re-authorization. Tests marked DEFECT are expected to fail until the cited
 * defect is fixed (`it.fails`); each states what it asserts and why.
 */
describeMoney("commerce money path: deadlines, crashes, races", () => {
  let fixture: MoneyFixture;
  beforeAll(async () => {
    fixture = await MoneyFixture.create();
  });
  afterAll(async () => {
    await fixture?.destroy();
  });

  async function packetIds(world: World) {
    return (
      await world.admin.query<{ id: string }>(
        "SELECT id FROM creator.commerce_packet WHERE creator_id=$1 ORDER BY created_at,id",
        [world.creator.id],
      )
    ).rows.map((row) => row.id);
  }

  /** A request accepted and captured, ready to be delivered or to lapse. */
  async function accepted(world: World, fan = world.fan) {
    const { packet } = await world.submitted(fan);
    await world.accept(packet.id);
    return packet.id;
  }

  describe("INV-16 / T-16: the system, not a person, ends every stalled request", () => {
    it("an unanswered request past decision_at is released as expired; other requests are untouched; running it twice changes nothing", async () => {
      const world = await fixture.newWorld({ fans: 3, weeklyLimit: 2 });
      const stale = (await world.submitted(world.fans[0])).packet;
      const live = (await world.submitted(world.fans[1])).packet;
      await expect(world.submit(world.fans[2])).rejects.toMatchObject({
        code: "capacity_full",
      });
      await world.setDecisionAt(stale.id, -60);

      // Another fan's sweep cannot touch someone else's request.
      expect(
        await world.service.reconcileDeadlines(world.fans[1]!.actor),
      ).toEqual({ processing: 0 });
      expect((await world.packetRow(stale.id)).state).toBe("submitted");

      expect(
        await world.service.reconcileDeadlines(world.creator.actor),
      ).toEqual({
        processing: 1,
      });
      expect(await world.packetRow(stale.id)).toMatchObject({
        state: "expired",
        payment_state: "released",
      });
      expect(await world.packetRow(live.id)).toMatchObject({
        state: "submitted",
        payment_state: "requires_capture",
      });
      expect(world.provider.realCalls("release")).toHaveLength(1);
      expect(world.provider.openHolds(live.id)).toBe(1);
      expect(await world.ledgerKinds(stale.id)).toEqual(["hold", "release"]);
      expect(await world.capacity()).toMatchObject({ reserved: 1, used: 0 });

      expect(
        await world.service.reconcileDeadlines(world.creator.actor),
      ).toEqual({
        processing: 0,
      });
      expect(world.provider.realCalls("release")).toHaveLength(1);
      // The slot the expiry returned is bookable by the fan who was refused.
      await world.submitted(world.fans[2]);
      await world.assertConserved();
    });

    it("an expired request cannot be accepted afterwards, and its signature is not spent", async () => {
      const world = await fixture.newWorld();
      const { packet } = await world.submitted();
      const signedActId = await world.signAccept(packet.id);
      await world.setDecisionAt(packet.id, -60);
      await world.service.reconcileDeadlines(world.fan.actor);
      await expect(
        world.decide(packet.id, { action: "reply_myself", signedActId }),
      ).rejects.toMatchObject({ code: "decision_unavailable" });
      expect(await world.consumed(signedActId)).toBe(false);
      expect(world.provider.realCalls("capture")).toHaveLength(0);
      await world.assertConserved();
    });

    it("an accepted commitment past its deadline and not delivered is refunded automatically, exactly once", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 2 });
      const id = await accepted(world);
      await world.setDueAt(id, -60);

      expect(
        await world.service.reconcileDeadlines(world.creator.actor),
      ).toEqual({
        processing: 1,
      });
      expect(await world.packetRow(id)).toMatchObject({
        state: "accepted",
        payment_state: "refunded",
      });
      expect(await world.commitments(id)).toMatchObject([
        { state: "refunded", outcome: "deadline_missed" },
      ]);
      expect(world.provider.refunds()).toHaveLength(1);
      expect(world.provider.refunds()[0]).toMatchObject({
        amount: world.price,
        state: "succeeded",
      });
      expect(world.provider.refundedTotal(id)).toBe(world.price);
      expect(await world.ledgerKinds(id)).toEqual([
        "hold",
        "capture",
        "refund",
      ]);
      expect(await world.events(id)).toEqual(
        expect.arrayContaining(["commitment_resolution", "refunded"]),
      );
      // The promised slot was spent; refunding does not hand it out again.
      expect(await world.capacity()).toMatchObject({ used: 1, reserved: 0 });

      // Running the clock again, or reconciling, refunds nothing more.
      expect(
        await world.service.reconcileDeadlines(world.creator.actor),
      ).toEqual({
        processing: 0,
      });
      await world.service.reconcile(world.fan.actor, id);
      expect(world.provider.realCalls("refund")).toHaveLength(1);
      await world.assertConserved();
    });

    it("two reconciliations racing over the same overdue commitment refund once", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 2 });
      const id = await accepted(world);
      await world.setDueAt(id, -60);
      await Promise.all([
        world.service.reconcileDeadlines(world.creator.actor),
        world.service.reconcileDeadlines(world.creator.actor),
        world.service.reconcileDeadlines(world.fan.actor),
      ]);
      expect(world.provider.realCalls("refund")).toHaveLength(1);
      expect(world.provider.refundedTotal()).toBe(world.price);
      expect(await world.ledgerKinds(id)).toEqual([
        "hold",
        "capture",
        "refund",
      ]);
      await world.assertConserved();
    });

    it("a refund the processor has not settled stays refund_pending until it does", async () => {
      const provider = new FakePaymentProvider({ refundState: "pending" });
      const world = await fixture.newWorld({ weeklyLimit: 2, provider });
      const id = await accepted(world);
      await world.setDueAt(id, -60);
      await world.service.reconcileDeadlines(world.creator.actor);

      expect(await world.packetRow(id)).toMatchObject({
        payment_state: "refund_pending",
      });
      expect(await world.ledgerKinds(id)).toEqual(["hold", "capture"]);
      expect((await world.effects(id)).at(-1)).toMatchObject({
        operation: "refund",
        state: "unknown",
        provider_ref: provider.refunds()[0]!.id,
      });
      // Not settled yet: no refund is booked, and asking again makes no new refund.
      await world.makeEffectsDue(id);
      await world.service.reconcile(world.fan.actor, id);
      expect(await world.ledgerKinds(id)).toEqual(["hold", "capture"]);
      expect(provider.realCalls("refund")).toHaveLength(1);

      provider.settleRefund(provider.refunds()[0]!.id, "succeeded");
      await world.makeEffectsDue(id);
      await world.service.reconcile(world.fan.actor, id);
      expect(await world.packetRow(id)).toMatchObject({
        payment_state: "refunded",
      });
      expect(await world.ledgerKinds(id)).toEqual([
        "hold",
        "capture",
        "refund",
      ]);
      expect(provider.realCalls("refund")).toHaveLength(1);
      await world.assertConserved();
    });

    it("a refund the processor fails is not booked, and an authorized refund request then completes it once", async () => {
      const provider = new FakePaymentProvider({ refundState: "pending" });
      const world = await fixture.newWorld({ weeklyLimit: 2, provider });
      const id = await accepted(world);
      await world.setDueAt(id, -60);
      await world.service.reconcileDeadlines(world.creator.actor);
      provider.settleRefund(provider.refunds()[0]!.id, "failed");
      await world.makeEffectsDue(id);
      await world.service.reconcile(world.fan.actor, id);

      // Nothing was refunded and nothing was booked as refunded.
      expect(provider.refundedTotal()).toBe(0);
      expect(await world.ledgerKinds(id)).toEqual(["hold", "capture"]);
      expect(await world.packetRow(id)).toMatchObject({
        payment_state: "refund_pending",
      });
      expect((await world.effects(id)).at(-1)).toMatchObject({
        state: "failed",
      });

      // The authorized path (a case adapter) can still refund, once and in full.
      provider.refundState = "succeeded";
      await world.service.requestRefund(
        world.creator.actor,
        id,
        world.price,
        "case-refund-after-failure",
        "ops_resolved",
      );
      expect(await world.packetRow(id)).toMatchObject({
        payment_state: "refunded",
      });
      expect(provider.refundedTotal()).toBe(world.price);
      expect(await world.ledgerKinds(id)).toEqual([
        "hold",
        "capture",
        "refund",
      ]);
      await world.assertConserved();
    });

    it("refunds never exceed what was captured, and an unaccepted request cannot be refunded", async () => {
      const world = await fixture.newWorld({ fans: 2, weeklyLimit: 2 });
      const id = await accepted(world, world.fans[0]);
      const open = (await world.submitted(world.fans[1])).packet;
      await expect(
        world.service.requestRefund(
          world.creator.actor,
          id,
          world.price + 1,
          "case-too-much",
          "x",
        ),
      ).rejects.toMatchObject({ code: "refund_exceeds_balance" });
      await expect(
        world.service.requestRefund(
          world.creator.actor,
          id,
          0,
          "case-zero-money",
          "x",
        ),
      ).rejects.toMatchObject({ code: "invalid_refund" });
      await expect(
        world.service.requestRefund(
          world.creator.actor,
          open.id,
          100,
          "case-no-capture",
          "x",
        ),
      ).rejects.toMatchObject({ code: "refund_unavailable" });
      // A partial refund and then an over-refund of the remainder.
      await world.service.requestRefund(
        world.creator.actor,
        id,
        2000,
        "case-partial-one",
        "partial",
      );
      await expect(
        world.service.requestRefund(
          world.creator.actor,
          id,
          3001,
          "case-partial-two",
          "partial",
        ),
      ).rejects.toMatchObject({ code: "refund_exceeds_balance" });
      expect(world.provider.refundedTotal()).toBe(2000);
      expect(world.provider.capturedTotal(open.id)).toBe(0);
      await world.assertConserved();
    });

    it("OBSERVATION (INV-16, D-21): a refunded payment still counts against the monthly limit (product question)", async () => {
      // The exposure total is captured plus held and ignores refunds, so an
      // automatic refund for the creator's missed deadline leaves the fan's
      // room for the month used up. Safe for the fan, but worth a decision.
      const world = await fixture.newWorld({ weeklyLimit: 3, limit: 7500 });
      const id = await accepted(world);
      await world.setDueAt(id, -60);
      await world.service.reconcileDeadlines(world.creator.actor);
      expect(await world.packetRow(id)).toMatchObject({
        payment_state: "refunded",
      });
      const overview = await world.service.overview(world.fan.actor);
      expect(overview.exposure).toMatchObject({
        captured: 5000,
        refunded: 5000,
        total: 5000,
      });
      await expect(world.submit()).rejects.toMatchObject({
        code: "spend_limit",
      });
    });
  });

  describe("INV-09 / T-09: only the creator's own signed reply completes a commitment", () => {
    it("an AI, team or fan message, or a reply written before the accept, cannot deliver; the commitment stays due", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 2 });
      const id = await accepted(world);
      const teamAccount = randomUUID();
      await world.admin.query(
        "INSERT INTO creator.team_membership(creator_id,account_id,roles) VALUES($1,$2,$3)",
        [world.creator.id, teamAccount, ["triage", "drafter"]],
      );
      const impostors = [
        await world.otherMessage(world.fan, "fan", "hello", world.fan.account),
        await world.otherMessage(world.fan, "ai", "An AI answer"),
        await world.otherMessage(
          world.fan,
          "team",
          "A team reply",
          teamAccount,
        ),
        await world.creatorReply(
          world.fan,
          "A real reply, but from before the accept.",
          new Date(Date.now() - 3600_000),
        ),
      ];
      for (const messageId of impostors)
        await expect(world.deliver(id, messageId)).rejects.toMatchObject({
          code: "signed_delivery_required",
        });
      // Neither the fan nor anyone else can mark it delivered.
      const real = await world.creatorReply(
        world.fan,
        "My answer on glaze crawling.",
      );
      await expect(
        world.deliver(id, real, world.fan.actor),
      ).rejects.toMatchObject({ code: "creator_required" });
      expect(await world.commitments(id)).toMatchObject([{ state: "due" }]);
      expect(world.provider.refunds()).toHaveLength(0);
    });

    it("the creator's signed reply after the accept delivers; a delivered commitment is never refunded for lateness", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 2 });
      const id = await accepted(world);
      const reply = await world.creatorReply(
        world.fan,
        "My answer on glaze crawling.",
      );
      await world.deliver(id, reply);
      expect(await world.commitments(id)).toMatchObject([
        { state: "delivered", outcome: null },
      ]);
      expect((await world.commitments(id))[0]!.delivered_at).not.toBeNull();
      // Even if the clock later passes the deadline, nothing is refunded.
      await world.setDueAt(id, -60);
      expect(
        await world.service.reconcileDeadlines(world.creator.actor),
      ).toEqual({
        processing: 0,
      });
      expect(world.provider.refunds()).toHaveLength(0);
      expect(await world.ledgerKinds(id)).toEqual(["hold", "capture"]);
      await world.assertConserved();
    });

    it("one reply cannot fulfil two paid commitments, and a late delivery is refused and refunded instead", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 3 });
      const first = await accepted(world);
      const second = await accepted(world);
      const reply = await world.creatorReply(
        world.fan,
        "One answer for the first request.",
      );
      await world.deliver(first, reply);
      await expect(world.deliver(second, reply)).rejects.toMatchObject({
        code: "delivery_already_used",
      });
      // The second request lapses: delivery is refused after the deadline, and the money returns.
      await world.setDueAt(second, -60);
      const another = await world.creatorReply(
        world.fan,
        "Too late for the second.",
      );
      await expect(world.deliver(second, another)).rejects.toMatchObject({
        code: "deadline_passed",
      });
      await world.service.reconcileDeadlines(world.creator.actor);
      expect(await world.packetRow(second)).toMatchObject({
        payment_state: "refunded",
      });
      expect(await world.packetRow(first)).toMatchObject({
        payment_state: "captured",
      });
      expect(world.provider.refundedTotal(first)).toBe(0);
      await world.assertConserved();
    });
  });

  describe("INV-18: delivery is idempotent", () => {
    it("T-18: repeating a delivery with the same key delivers once; a different key on a delivered commitment is refused", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 2 });
      const id = await accepted(world);
      const reply = await world.creatorReply(
        world.fan,
        "My answer on glaze crawling.",
      );
      const body = {
        version: (await world.commitments(id))[0]!.version,
        idempotencyKey: world.key("deliver"),
        messageId: reply,
      };
      const first = await world.service.deliver(world.creator.actor, id, body);
      const again = await world.service.deliver(world.creator.actor, id, body);
      expect(again).toEqual(first);
      const delivered = (await world.commitments(id))[0]!;
      expect(delivered).toMatchObject({ state: "delivered" });
      await expect(
        world.service.deliver(world.creator.actor, id, {
          ...body,
          idempotencyKey: world.key("deliver"),
        }),
      ).rejects.toMatchObject({ code: "commitment_unavailable" });
      expect((await world.commitments(id))[0]).toMatchObject({
        version: delivered.version,
        delivered_at: delivered.delivered_at,
      });
      expect(world.provider.refunds()).toHaveLength(0);
      await world.assertConserved();
    });
  });

  describe("INV-16 / T-25: fail closed when the creator is no longer verified", () => {
    // T-25 is written for call offers; this is the same fail-closed rule for a
    // paid request: a creator whose authorization lapsed can no longer capture.
    it("T-25: can neither read, accept nor decline; the fan's side still expires the request and refunds the overdue commitment", async () => {
      const world = await fixture.newWorld({ fans: 2, weeklyLimit: 3 });
      const waiting = (await world.submitted(world.fans[0])).packet;
      const promised = await accepted(world, world.fans[1]);
      const signedActId = await world.signAccept(waiting.id);
      await world.admin.query(
        "UPDATE creator.creator_profile SET verification='revoked' WHERE id=$1",
        [world.creator.id],
      );
      await expect(world.creatorView(waiting.id)).rejects.toMatchObject({
        code: "request_unavailable",
      });
      await expect(
        world.decide(waiting.id, { action: "reply_myself", signedActId }),
      ).rejects.toMatchObject({ code: "request_unavailable" });
      await expect(world.decline(waiting.id)).rejects.toMatchObject({
        code: "request_unavailable",
      });
      expect(await world.consumed(signedActId)).toBe(false);

      // Nobody on the creator's side acts, so the clock does the work, run by the fans.
      await world.setDecisionAt(waiting.id, -60);
      await world.setDueAt(promised, -60);
      await world.service.reconcileDeadlines(world.fans[0]!.actor);
      await world.service.reconcileDeadlines(world.fans[1]!.actor);
      expect(await world.packetRow(waiting.id)).toMatchObject({
        state: "expired",
        payment_state: "released",
      });
      expect(await world.packetRow(promised)).toMatchObject({
        payment_state: "refunded",
      });
      expect(world.provider.openHolds()).toBe(0);
      expect(world.provider.realCalls("capture")).toHaveLength(1);
      await world.assertConserved();
    });
  });

  describe("INV-16: a processor reply that disagrees with the agreed price is never booked", () => {
    it("INV-16: a capture of a different amount leaves no ledger capture, no commitment and no used slot", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 1 });
      const { packet } = await world.submitted();
      const intentId = (await world.packetRow(packet.id)).intent_ref!;
      world.provider.distort(intentId, { amount: world.price - 1000 });
      const signedActId = await world.signAccept(packet.id);
      const view = await world.decide(packet.id, {
        action: "reply_myself",
        signedActId,
      });

      expect(view.packet).toMatchObject({
        state: "accepting",
        payment_state: "unknown",
      });
      expect(await world.ledgerKinds(packet.id)).toEqual(["hold"]);
      expect(await world.commitments(packet.id)).toHaveLength(0);
      expect(await world.capacity()).toMatchObject({ used: 0, reserved: 1 });
      expect((await world.effects(packet.id)).at(-1)).toMatchObject({
        operation: "capture",
        state: "unknown",
        error_code: "provider_mismatch",
      });
      // Retrying does not make a wrong amount right; it stays unbooked for a person.
      await world.makeEffectsDue(packet.id);
      await world.service
        .reconcile(world.fan.actor, packet.id)
        .catch(() => undefined);
      expect(await world.ledgerKinds(packet.id)).toEqual(["hold"]);
      expect((await world.packetRow(packet.id)).state).toBe("accepting");
      await world.assertConserved({ settled: false });
    });
  });

  describe("T-29: a crash or timeout around the processor call", () => {
    it("capture succeeded at the processor but the reply was lost: recovery books it once and never captures twice", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 2 });
      const { packet } = await world.submitted();
      const signedActId = await world.signAccept(packet.id);
      world.provider.failAfterAction("capture");

      const view = await world.decide(packet.id, {
        action: "reply_myself",
        signedActId,
      });
      // Money moved at the processor; the local record is honestly "unknown".
      expect(world.provider.capturedTotal(packet.id)).toBe(world.price);
      expect(view.packet).toMatchObject({
        state: "accepting",
        payment_state: "unknown",
      });
      expect(await world.ledgerKinds(packet.id)).toEqual(["hold"]);
      expect(await world.commitments(packet.id)).toHaveLength(0);
      expect(await world.capacity()).toMatchObject({ used: 0, reserved: 1 });
      await world.assertConserved({ settled: false });
      // The fan cannot withdraw a request the creator already accepted.
      await expect(world.withdraw(world.fan, packet.id)).rejects.toMatchObject({
        code: "request_committed",
      });
      // Expiry does not touch an accepting request either.
      await world.setDecisionAt(packet.id, -3600);
      expect(await world.service.reconcileDeadlines(world.fan.actor)).toEqual({
        processing: 0,
      });

      // Too soon: the backoff has not elapsed, so nothing is asked of the processor.
      await world.service.reconcile(world.fan.actor, packet.id);
      expect(world.provider.callsOf("capture")).toHaveLength(1);

      await world.makeEffectsDue(packet.id);
      const healed = await world.service.reconcile(world.fan.actor, packet.id);
      expect(healed.packet).toMatchObject({
        state: "accepted",
        payment_state: "captured",
      });
      expect(world.provider.callsOf("capture")).toHaveLength(1);
      expect(world.provider.realCalls("capture")).toHaveLength(1);
      expect(await world.ledgerKinds(packet.id)).toEqual(["hold", "capture"]);
      expect(await world.commitments(packet.id)).toHaveLength(1);
      expect(await world.capacity()).toMatchObject({ used: 1, reserved: 0 });
      await world.assertConserved();
    });

    it("the capture request never reached the processor: recovery performs it exactly once", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 2 });
      const { packet } = await world.submitted();
      const signedActId = await world.signAccept(packet.id);
      world.provider.failBeforeAction("capture");
      await world.decide(packet.id, { action: "reply_myself", signedActId });
      expect(world.provider.capturedTotal()).toBe(0);
      expect((await world.packetRow(packet.id)).state).toBe("accepting");

      await world.makeEffectsDue(packet.id);
      await world.service.reconcile(world.fan.actor, packet.id);
      expect(await world.packetRow(packet.id)).toMatchObject({
        state: "accepted",
        payment_state: "captured",
      });
      expect(world.provider.callsOf("capture")).toHaveLength(2);
      expect(world.provider.realCalls("capture")).toHaveLength(1);
      await world.assertConserved();
    });

    it("a release that succeeded at the processor but was not seen is completed without a second cancel, and the slot returns once", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 1 });
      const { packet } = await world.submitted();
      world.provider.failAfterAction("release");
      await world.decline(packet.id);
      // The hold is gone at the processor, but the request is not yet closed locally.
      expect(world.provider.openHolds()).toBe(0);
      expect(await world.packetRow(packet.id)).toMatchObject({
        state: "releasing",
        payment_state: "unknown",
      });
      expect(await world.capacity()).toMatchObject({ reserved: 1 });

      await world.makeEffectsDue(packet.id);
      await world.service.reconcile(world.fan.actor, packet.id);
      expect(await world.packetRow(packet.id)).toMatchObject({
        state: "declined",
        payment_state: "released",
      });
      expect(world.provider.realCalls("release")).toHaveLength(1);
      expect(await world.capacity()).toMatchObject({ reserved: 0, used: 0 });
      expect(await world.ledgerKinds(packet.id)).toEqual(["hold", "release"]);
      // Settling again changes nothing.
      await world.service.reconcile(world.fan.actor, packet.id);
      expect(await world.capacity()).toMatchObject({ reserved: 0 });
      await world.assertConserved();
    });

    it.each([
      { recovery: true, label: "with a lookup of the original refund" },
      { recovery: false, label: "relying on the processor honouring the key" },
    ])(
      "T-29: a refund that succeeded at the processor but was not seen is not repeated ($label)",
      async ({ recovery }) => {
        const provider = new FakePaymentProvider({ recovery });
        const world = await fixture.newWorld({ weeklyLimit: 2, provider });
        const id = await accepted(world);
        await world.setDueAt(id, -60);
        provider.failAfterAction("refund");
        await world.service.reconcileDeadlines(world.creator.actor);
        expect(provider.refundedTotal()).toBe(world.price);
        expect(await world.packetRow(id)).toMatchObject({
          payment_state: "refund_pending",
        });
        expect(await world.ledgerKinds(id)).toEqual(["hold", "capture"]);

        await world.makeEffectsDue(id);
        await world.service.reconcile(world.fan.actor, id);
        expect(await world.packetRow(id)).toMatchObject({
          payment_state: "refunded",
        });
        expect(provider.realCalls("refund")).toHaveLength(1);
        expect(provider.refunds()).toHaveLength(1);
        expect(await world.ledgerKinds(id)).toEqual([
          "hold",
          "capture",
          "refund",
        ]);
        await world.assertConserved();
      },
    );

    it("an authorization that never reached the processor is placed once on retry", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 1 });
      world.provider.failBeforeAction("authorize");
      const first = await world.submit();
      expect(first.packet).toMatchObject({
        state: "submitting",
        payment_state: "unknown",
      });
      expect(world.provider.openHolds()).toBe(0);
      expect(await world.capacity()).toMatchObject({ reserved: 1 });

      await world.makeEffectsDue(first.packet.id);
      const healed = await world.service.reconcile(
        world.fan.actor,
        first.packet.id,
      );
      expect(healed.packet).toMatchObject({
        state: "submitted",
        payment_state: "requires_capture",
      });
      expect(world.provider.realCalls("authorize")).toHaveLength(1);
      expect(world.provider.openHolds()).toBe(1);
      await world.assertConserved();
    });
  });

  describe("T-29 / INV-18: claim leases, a dead worker is replaced and a live one respected", () => {
    it("T-29: a second attempt makes no processor call while a live worker holds the claim", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 1 });
      const gate = world.provider.pause("authorize", "before");
      const submitting = world.submit();
      await gate.arrived;
      const [id] = await packetIds(world);
      const [effect] = await world.effects(id!);
      expect(effect).toMatchObject({ state: "processing", attempt: 1 });

      await world.service.runEffect(world.fan.actor, effect!.id);
      expect(world.provider.callsOf("authorize")).toHaveLength(1);
      expect((await world.effects(id!))[0]).toMatchObject({ attempt: 1 });

      gate.open();
      const view = await submitting;
      expect(view.packet.state).toBe("submitted");
      expect(world.provider.realCalls("authorize")).toHaveLength(1);
      await world.assertConserved();
    });

    it("T-29: a worker that died after claiming is replaced once its lease lapses, and the hold is placed once", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 1 });
      const gate = world.provider.pause("authorize", "before");
      const submitting = world.submit();
      await gate.arrived;
      const [id] = await packetIds(world);
      const [effect] = await world.effects(id!);
      // The first worker is stuck before the processor; its lease runs out.
      await world.expireLease(effect!.id);
      await world.service.runEffect(world.fan.actor, effect!.id);
      expect(await world.packetRow(id!)).toMatchObject({
        state: "submitted",
        payment_state: "requires_capture",
      });
      expect((await world.effects(id!))[0]).toMatchObject({
        state: "done",
        attempt: 2,
      });

      // The stale worker finally continues: the key replays, the result is fenced.
      gate.open();
      await submitting;
      // Two calls reached the processor; the key made the late one a replay.
      expect(world.provider.callsOf("authorize")).toHaveLength(2);
      expect(
        world.provider.callsOf("authorize").filter((call) => call.replayed),
      ).toHaveLength(1);
      expect(world.provider.realCalls("authorize")).toHaveLength(1);
      expect(world.provider.openHolds()).toBe(1);
      expect(await world.ledgerKinds(id!)).toEqual(["hold"]);
      expect(await world.capacity()).toMatchObject({ reserved: 1 });
      await world.assertConserved();
    });

    it("T-29: a stale worker whose capture finished late cannot book it twice", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 2 });
      const { packet } = await world.submitted();
      const signedActId = await world.signAccept(packet.id);
      const gate = world.provider.pause("capture", "after");
      const deciding = world.decide(packet.id, {
        action: "reply_myself",
        signedActId,
      });
      await gate.arrived;
      const capture = (await world.effects(packet.id)).find(
        (e) => e.operation === "capture",
      )!;
      expect(capture).toMatchObject({ state: "processing", attempt: 1 });
      // The processor captured, but this worker's reply is delayed past its lease.
      await world.expireLease(capture.id);
      await world.service.runEffect(world.fan.actor, capture.id);
      expect(await world.packetRow(packet.id)).toMatchObject({
        state: "accepted",
        payment_state: "captured",
      });

      gate.open();
      const view = await deciding;
      expect(view.packet).toMatchObject({
        state: "accepted",
        payment_state: "captured",
      });
      expect(world.provider.realCalls("capture")).toHaveLength(1);
      expect(world.provider.callsOf("capture")).toHaveLength(1);
      expect(await world.ledgerKinds(packet.id)).toEqual(["hold", "capture"]);
      expect(await world.commitments(packet.id)).toHaveLength(1);
      expect(await world.capacity()).toMatchObject({ used: 1, reserved: 0 });
      expect(
        (await world.effects(packet.id)).find((e) => e.operation === "capture"),
      ).toMatchObject({
        state: "done",
        attempt: 2,
      });
      await world.assertConserved();
    });
  });

  describe("INV-16 / INV-18: races between decisions, withdrawals and expiry", () => {
    it("INV-16: two creator accepts racing for one request capture once; the loser's signature stays unspent", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 2 });
      const { packet } = await world.submitted();
      const [one, two] = [
        await world.signAccept(packet.id),
        await world.signAccept(packet.id),
      ];
      const settled = await Promise.allSettled(
        [one, two].map((signedActId) =>
          world.decide(packet.id, {
            action: "reply_myself",
            signedActId,
            version: packet.version,
          }),
        ),
      );
      expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const lost = settled.find(
        (r) => r.status === "rejected",
      ) as PromiseRejectedResult;
      expect(lost.reason).toMatchObject({ code: "stale_request" });
      expect(world.provider.realCalls("capture")).toHaveLength(1);
      expect(
        [await world.consumed(one), await world.consumed(two)].filter(Boolean),
      ).toHaveLength(1);
      expect(await world.commitments(packet.id)).toHaveLength(1);
      await world.assertConserved();
    });

    it.each([0, 1, 2, 3])(
      "INV-16: an accept racing a decline or a withdrawal ends in exactly one outcome (round %i)",
      async (round) => {
        const world = await fixture.newWorld({ fans: 1, weeklyLimit: 2 });
        const { packet } = await world.submitted();
        const signedActId = await world.signAccept(packet.id);
        const version = packet.version;
        const accept = () =>
          world.decide(packet.id, {
            action: "reply_myself",
            signedActId,
            version,
          });
        const other =
          round % 2 === 0
            ? () => world.decide(packet.id, { action: "decline", version })
            : () => world.withdraw(world.fan, packet.id, version);
        // Alternate which call is issued first.
        const calls = round < 2 ? [accept, other] : [other, accept];
        const settled = await Promise.allSettled(calls.map((call) => call()));
        expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const row = await world.packetRow(packet.id);
        if (row.state === "accepted") {
          expect(world.provider.realCalls("release")).toHaveLength(0);
          expect(world.provider.capturedTotal(packet.id)).toBe(world.price);
        } else {
          expect(["declined", "withdrawn"]).toContain(row.state);
          expect(world.provider.realCalls("capture")).toHaveLength(0);
          expect(world.provider.capturedTotal()).toBe(0);
          expect(await world.consumed(signedActId)).toBe(false);
        }
        await world.assertConserved();
      },
    );

    it("T-29: a withdrawal that lands while the hold is still being placed is released on reconciliation, not left live", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 1 });
      const gate = world.provider.pause("authorize", "after");
      const submitting = world.submit();
      await gate.arrived;
      const [id] = await packetIds(world);
      const mid = await world.packetRow(id!);
      expect(mid).toMatchObject({ state: "submitting" });
      await world.withdraw(world.fan, id!);
      gate.open();
      await submitting;

      // The processor's hold landed after the withdrawal. It is recorded, and
      // a release is queued against it; nothing has cancelled it yet.
      expect(world.provider.openHolds()).toBe(1);
      expect((await world.packetRow(id!)).state).toBe("releasing");
      expect((await world.packetRow(id!)).intent_ref).not.toBeNull();

      // The next reconciliation (a tap, or the recovery worker) closes it.
      const healed = await world.service.reconcile(world.fan.actor, id!);
      expect(healed.packet).toMatchObject({
        state: "withdrawn",
        payment_state: "released",
      });
      expect(world.provider.openHolds()).toBe(0);
      expect(world.provider.realCalls("release")).toHaveLength(1);
      expect(world.provider.realCalls("capture")).toHaveLength(0);
      expect(await world.capacity()).toMatchObject({ reserved: 0, used: 0 });
      expect(await world.ledgerKinds(id!)).toEqual(["hold", "release"]);
      await world.assertConserved();
    });

    it("INV-16: withdrawing while 3-D Secure is pending cancels the unconfirmed intent and frees the slot", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 1 });
      const view = await world.submit(world.fan, {
        paymentMethodId: "pm_cardAuthRequired",
      });
      await world.withdraw(world.fan, view.packet.id);
      expect(await world.packetRow(view.packet.id)).toMatchObject({
        state: "withdrawn",
        payment_state: "released",
      });
      expect(world.provider.intent(view.packet.intent_ref!).status).toBe(
        "canceled",
      );
      expect(world.provider.capturedTotal()).toBe(0);
      expect(await world.capacity()).toMatchObject({ reserved: 0 });
      // A late 3-D Secure success on a canceled intent is impossible; the slot is bookable.
      await world.submitted();
    });

    it("INV-10: offer edits racing submissions never overbook or deadlock", async () => {
      const world = await fixture.newWorld({ fans: 6, weeklyLimit: 3 });
      const failures: unknown[] = [];
      const attempt = (work: () => Promise<unknown>) =>
        work().catch((error: unknown) => failures.push(error));
      const edit = (weeklyLimit: number) =>
        world.service.saveMode(
          world.creator.actor,
          world.creator.id,
          world.mode.id,
          {
            title: "Written reply",
            kind: "written_reply",
            amount: world.price,
            publicAmount: null,
            currency: "USD",
            decisionHours: 48,
            deliveryHours: 72,
            durationSeconds: null,
            weeklyLimit,
            shareable: false,
            state: "offered",
            version: world.mode.version,
            idempotencyKey: world.key("mode"),
          },
        );
      await Promise.all([
        ...world.fans.map((fan) => attempt(() => world.submit(fan))),
        attempt(() => edit(4)),
        attempt(() => edit(2)),
        attempt(() => edit(5)),
      ]);
      // Whatever lost a race lost with a business answer, never a database fault.
      for (const failure of failures) {
        const error = failure as { code?: string; message?: string };
        expect(String(error.code)).not.toMatch(/^(40P01|40001|55P03|57014)$/u);
        expect(String(error.message)).not.toMatch(/deadlock|lock timeout/iu);
      }
      const capacity = await world.capacity();
      expect(capacity.used + capacity.reserved).toBeLessThanOrEqual(
        capacity.capacity_limit,
      );
      await world.assertConserved();
    });

    it("INV-16: a mixed storm of decisions, withdrawals, expiry and reconciliation never deadlocks and always conserves", async () => {
      const world = await fixture.newWorld({ fans: 6, weeklyLimit: 6 });
      const packets: string[] = [];
      for (const fan of world.fans)
        packets.push((await world.submitted(fan)).packet.id);
      const signed = await world.signAccept(packets[2]!);
      await world.setDecisionAt(packets[3]!, -60);
      const failures: unknown[] = [];
      const attempt = (work: () => Promise<unknown>) =>
        work().catch((error: unknown) => failures.push(error));
      await Promise.all([
        attempt(() => world.decline(packets[0]!)),
        attempt(() => world.withdraw(world.fans[1]!, packets[1]!)),
        attempt(() =>
          world.decide(packets[2]!, {
            action: "reply_myself",
            signedActId: signed,
          }),
        ),
        attempt(() => world.service.reconcileDeadlines(world.creator.actor)),
        attempt(() => world.service.reconcileDeadlines(world.fans[3]!.actor)),
        attempt(() =>
          world.service.reconcile(world.fans[4]!.actor, packets[4]!),
        ),
        attempt(() =>
          world.service.reconcile(world.fans[0]!.actor, packets[0]!),
        ),
        attempt(() => world.submit(world.fans[5]!)),
      ]);
      // Whatever lost a race lost with a business answer, never a database fault.
      for (const failure of failures) {
        const error = failure as { code?: string; message?: string };
        expect(String(error.code)).not.toMatch(/^(40P01|40001|55P03|57014)$/u);
        expect(String(error.message)).not.toMatch(
          /deadlock|lock timeout|timeout/iu,
        );
      }
      await world.service.reconcile(world.fans[0]!.actor, packets[0]!);
      await world.service.reconcile(world.fans[1]!.actor, packets[1]!);
      await world.assertConserved();
    });
  });

  describe("T-28: provider notifications are hints; the current provider state decides", () => {
    // Not a credential: a made-up signing value that exists only in this file.
    const secret = "whsec_synthetic_test_only";
    function signedEvent(overrides: Record<string, unknown> = {}, at?: number) {
      const payload = JSON.stringify({
        id: "evt_synthetic_1",
        object: "event",
        api_version: Stripe.API_VERSION,
        created: 1,
        type: "payment_intent.amount_capturable_updated",
        livemode: false,
        pending_webhooks: 1,
        request: { id: null, idempotency_key: null },
        data: { object: { id: "pi_synthetic_1", object: "payment_intent" } },
        ...overrides,
      });
      const header = Stripe.webhooks.generateTestHeaderString({
        payload,
        secret,
        ...(at ? { timestamp: at } : {}),
      });
      return { raw: Buffer.from(payload), header };
    }

    it("T-28: only a correctly signed, current, test-mode notification is accepted", () => {
      const good = signedEvent();
      expect(verifyStripeWebhook(good.raw, good.header, secret)).toEqual({
        id: "evt_synthetic_1",
        type: "payment_intent.amount_capturable_updated",
        reference: "pi_synthetic_1",
        account: "platform",
      });
      const bad = (call: () => unknown) =>
        expect(call).toThrow(
          expect.objectContaining({ code: "webhook_signature_invalid" }),
        );
      bad(() =>
        verifyStripeWebhook(
          Buffer.from(
            good.raw.toString().replace("pi_synthetic_1", "pi_other"),
          ),
          good.header,
          secret,
        ),
      );
      bad(() =>
        verifyStripeWebhook(good.raw, good.header, "whsec_another_synthetic"),
      );
      bad(() => verifyStripeWebhook(good.raw, "", secret));
      const old = signedEvent({}, Math.floor(Date.now() / 1000) - 3600);
      bad(() => verifyStripeWebhook(old.raw, old.header, secret));
      const live = signedEvent({ livemode: true });
      expect(() => verifyStripeWebhook(live.raw, live.header, secret)).toThrow(
        expect.objectContaining({ code: "webhook_invalid" }),
      );
      const bare = signedEvent({ data: { object: {} } });
      expect(() => verifyStripeWebhook(bare.raw, bare.header, secret)).toThrow(
        expect.objectContaining({ code: "webhook_invalid" }),
      );
    });

    /** What the HTTP route stores for a verified event: insert-only, duplicates ignored. */
    async function receive(
      world: World,
      id: string,
      type: string,
      reference: string,
      at?: Date,
    ) {
      return world.admin.query(
        "INSERT INTO creator.commerce_provider_inbox(provider,event_id,event_type,object_ref,received_at) VALUES('stripe',$1,$2,$3,coalesce($4::timestamptz,now())) ON CONFLICT DO NOTHING",
        [id, type, reference, at?.toISOString() ?? null],
      );
    }
    function workerFor(world: World, due: () => string[] = () => []) {
      const unknown: string[] = [];
      const index: CommerceWorkIndex = {
        async dueScopes() {
          return due().map((packetId) => ({
            actor: world.fan.actor,
            packetId,
          }));
        },
        async notificationScope(_type, reference) {
          const row = await world.admin.query<{ id: string }>(
            "SELECT id FROM creator.commerce_packet WHERE intent_ref=$1",
            [reference],
          );
          return row.rows[0]
            ? { actor: world.fan.actor, packetId: row.rows[0].id }
            : null;
        },
        async unknownCase(_scope, cause) {
          unknown.push(cause);
        },
      };
      return {
        worker: new CommerceRecoveryWorker(world.admin, world.service, index),
        unknown,
      };
    }
    const inboxRows = (world: World) =>
      world.admin.query<{
        event_id: string;
        state: string;
        error_code: string | null;
      }>(
        "SELECT event_id,state,error_code FROM creator.commerce_provider_inbox WHERE event_id LIKE $1 ORDER BY event_id",
        [`evt_${world.creator.handle}%`],
      );

    it("T-28: duplicate and reordered notifications apply the current state once", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 1 });
      const view = await world.submit(world.fan, {
        paymentMethodId: "pm_cardAuthRequired",
      });
      const intentId = view.packet.intent_ref!;
      expect(view.packet.payment_state).toBe("requires_action");
      // The cardholder finishes 3-D Secure at the processor.
      world.provider.completeAuthentication(intentId);
      const tag = `evt_${world.creator.handle}`;
      const now = Date.now();
      // The newer notification arrives first, the older after it, and one is repeated.
      await receive(
        world,
        `${tag}_2`,
        "payment_intent.amount_capturable_updated",
        intentId,
        new Date(now - 2000),
      );
      await receive(
        world,
        `${tag}_1`,
        "payment_intent.requires_action",
        intentId,
        new Date(now - 1000),
      );
      await receive(
        world,
        `${tag}_2`,
        "payment_intent.amount_capturable_updated",
        intentId,
        new Date(now),
      );
      expect((await inboxRows(world)).rowCount).toBe(2);

      const { worker } = workerFor(world);
      await worker.tick();
      expect(await world.packetRow(view.packet.id)).toMatchObject({
        state: "submitted",
        payment_state: "requires_capture",
      });
      expect((await inboxRows(world)).rows.map((r) => r.state)).toEqual([
        "done",
        "done",
      ]);
      expect(await world.ledgerKinds(view.packet.id)).toEqual(["hold"]);
      expect(
        (await world.events(view.packet.id)).filter(
          (t) => t === "packet_submitted",
        ),
      ).toHaveLength(1);
      expect(world.provider.realCalls("authorize")).toHaveLength(1);

      // A further pass finds nothing to do and changes nothing.
      await worker.tick();
      expect(await world.ledgerKinds(view.packet.id)).toEqual(["hold"]);
      expect(world.provider.mutations()).toEqual(["authorize"]);
      await world.assertConserved();
    });

    it("T-28: a stale notification arriving after the capture cannot undo or repeat it", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 2 });
      const { packet } = await world.submitted();
      await world.accept(packet.id);
      const intentId = (await world.packetRow(packet.id)).intent_ref!;
      const before = {
        ledger: await world.ledger(packet.id),
        events: await world.events(packet.id),
        mutations: world.provider.mutations(),
      };
      const tag = `evt_${world.creator.handle}`;
      await receive(
        world,
        `${tag}_cancel`,
        "payment_intent.canceled",
        intentId,
      );
      await receive(
        world,
        `${tag}_capturable`,
        "payment_intent.amount_capturable_updated",
        intentId,
      );
      await receive(
        world,
        `${tag}_failed`,
        "payment_intent.payment_failed",
        intentId,
      );
      const { worker } = workerFor(world);
      await worker.tick();

      expect((await inboxRows(world)).rows.map((r) => r.state)).toEqual([
        "done",
        "done",
        "done",
      ]);
      expect(await world.packetRow(packet.id)).toMatchObject({
        state: "accepted",
        payment_state: "captured",
      });
      expect(await world.ledger(packet.id)).toEqual(before.ledger);
      expect(await world.events(packet.id)).toEqual(before.events);
      expect(world.provider.mutations()).toEqual(before.mutations);
      await world.assertConserved();
    });

    it("T-28: a notification for an unknown payment waits for retry without blocking the others", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 1 });
      const view = await world.submit(world.fan, {
        paymentMethodId: "pm_cardAuthRequired",
      });
      world.provider.completeAuthentication(view.packet.intent_ref!);
      const tag = `evt_${world.creator.handle}`;
      const now = Date.now();
      await receive(
        world,
        `${tag}_a`,
        "payment_intent.succeeded",
        "pi_nobody_knows",
        new Date(now - 2000),
      );
      await receive(
        world,
        `${tag}_b`,
        "payment_intent.amount_capturable_updated",
        view.packet.intent_ref!,
        new Date(now - 1000),
      );
      const { worker } = workerFor(world);
      await worker.tick();
      const rows = (await inboxRows(world)).rows;
      expect(rows.find((r) => r.event_id.endsWith("_a"))).toMatchObject({
        state: "pending",
        error_code: "current_state_unavailable",
      });
      expect(rows.find((r) => r.event_id.endsWith("_b"))).toMatchObject({
        state: "done",
      });
      expect((await world.packetRow(view.packet.id)).state).toBe("submitted");
      // It is leased for a minute, not retried in a hot loop.
      await worker.tick();
      expect(
        (await inboxRows(world)).rows.find((r) => r.event_id.endsWith("_a"))!
          .state,
      ).toBe("pending");
      await world.assertConserved();
    });

    it("T-28: money moved at the processor outside the system is detected, not hidden", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 2 });
      const id = await accepted(world);
      const intentId = (await world.packetRow(id)).intent_ref!;
      // A refund made by hand from the processor's own dashboard.
      await world.provider.refund(intentId, 1000, "dashboard-refund-by-hand");
      await expect(
        world.service.reconcile(world.fan.actor, id),
      ).rejects.toMatchObject({ code: "ledger_reconciliation_required" });
      // Our books were not rewritten to match, and nothing else moved.
      expect(await world.ledgerKinds(id)).toEqual(["hold", "capture"]);
      expect(world.provider.refundedTotal(id)).toBe(1000);
      expect(world.provider.realCalls("capture")).toHaveLength(1);
      await expect(world.assertConserved()).rejects.toThrow(/ledger refunded/u);
    });

    it("T-28: a missing notification is covered by polling the current state", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 2 });
      const { packet } = await world.submitted();
      const signedActId = await world.signAccept(packet.id);
      world.provider.failAfterAction("capture");
      await world.decide(packet.id, { action: "reply_myself", signedActId });
      expect(await world.packetRow(packet.id)).toMatchObject({
        state: "accepting",
      });
      await world.makeEffectsDue(packet.id);
      // No webhook ever arrived. The scheduler's due scope drives reconciliation.
      const { worker, unknown } = workerFor(world, () => [packet.id]);
      await worker.tick();
      expect(await world.packetRow(packet.id)).toMatchObject({
        state: "accepted",
        payment_state: "captured",
      });
      expect(unknown).toEqual([]);
      expect(world.provider.realCalls("capture")).toHaveLength(1);
      await world.assertConserved();
    });
  });

  describe("INV-16 / INV-18: re-authorization keeps one live hold and one signed acceptance per capture", () => {
    it("INV-16: a declined card can be replaced by a good one, and the request then proceeds normally", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 1 });
      const declined = await world.submit(world.fan, {
        paymentMethodId: "pm_cardDeclined",
      });
      expect(declined.packet).toMatchObject({
        state: "draft",
        payment_state: "failed",
      });
      const retried = await world.service.reauthorize(
        world.fan.actor,
        declined.packet.id,
        {
          version: declined.packet.version,
          idempotencyKey: world.key("reauth"),
          paymentMethodId: "pm_cardVisa",
        },
      );
      expect(retried.packet).toMatchObject({
        state: "submitted",
        payment_state: "requires_capture",
        authorization_attempt: 2,
      });
      await world.accept(declined.packet.id);
      expect(world.provider.realCalls("capture")).toHaveLength(1);
      expect(await world.ledgerKinds(declined.packet.id)).toEqual([
        "hold",
        "capture",
      ]);
      expect(await world.capacity()).toMatchObject({ used: 1, reserved: 0 });
      await world.assertConserved();
    });

    it("INV-18: two re-authorizations of the same request place one new hold", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 1 });
      const declined = await world.submit(world.fan, {
        paymentMethodId: "pm_cardDeclined",
      });
      const version = declined.packet.version;
      const reauthorize = (label: string) =>
        world.service.reauthorize(world.fan.actor, declined.packet.id, {
          version,
          idempotencyKey: world.key(label),
          paymentMethodId: "pm_cardVisa",
        });
      const settled = await Promise.allSettled([
        reauthorize("reauth-a"),
        reauthorize("reauth-b"),
      ]);
      expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const lost = settled.find(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      expect(lost?.reason).toMatchObject({ code: "stale_request" });
      // One declined attempt and one good hold reached the processor, no more.
      expect(world.provider.realCalls("authorize")).toHaveLength(2);
      expect(world.provider.openHolds()).toBe(1);
      expect(await world.capacity()).toMatchObject({ reserved: 1, used: 0 });
      expect(await world.ledgerKinds(declined.packet.id)).toEqual(["hold"]);
      await world.assertConserved();
    });

    it("INV-16: after a dead card rejects the capture, a new hold and a new signature capture once; the old signature is spent", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 1 });
      const { packet } = await world.submitted();
      const first = (await world.packetRow(packet.id)).intent_ref!;
      world.provider.killHold(first);
      const oldSignature = await world.signAccept(packet.id);
      const failed = await world.decide(packet.id, {
        action: "reply_myself",
        signedActId: oldSignature,
      });
      expect(failed.packet).toMatchObject({
        state: "submitted",
        payment_state: "failed",
      });
      expect(world.provider.capturedTotal()).toBe(0);

      const reauthorized = await world.service.reauthorize(
        world.fan.actor,
        packet.id,
        {
          version: failed.packet.version,
          idempotencyKey: world.key("reauth"),
          paymentMethodId: "pm_cardVisa",
        },
      );
      expect(reauthorized.packet).toMatchObject({
        state: "submitted",
        payment_state: "requires_capture",
        authorization_attempt: 2,
      });
      // The new hold is a different intent; the dead one stays dead.
      expect(reauthorized.packet.intent_ref).not.toBe(first);
      expect(world.provider.intent(first).status).toBe("canceled");
      // The slot was handed over, not doubled.
      expect(await world.capacity()).toMatchObject({ used: 0, reserved: 1 });
      // The creator is told once about the request, not once per hold.
      expect(await world.events(packet.id)).toEqual(
        expect.arrayContaining(["packet_submitted_creator"]),
      );
      expect(
        (await world.events(packet.id)).filter(
          (t) => t === "packet_submitted_creator",
        ),
      ).toHaveLength(1);

      // The earlier signature cannot accept the new authorization.
      await expect(
        world.decide(packet.id, {
          action: "reply_myself",
          signedActId: oldSignature,
        }),
      ).rejects.toMatchObject({ code: "signed_act_required" });
      await world.accept(packet.id);
      expect(world.provider.realCalls("capture")).toHaveLength(1);
      expect(await world.ledgerKinds(packet.id)).toEqual([
        "hold",
        "hold",
        "capture",
      ]);
      expect(await world.capacity()).toMatchObject({ used: 1, reserved: 0 });
      await world.assertConserved();
    });
  });

  describe("INV-10 / INV-16: reviving an expired request", () => {
    it("INV-10: needs a free slot and the spend limit, then places one fresh hold", async () => {
      const world = await fixture.newWorld({ fans: 2, weeklyLimit: 1 });
      const lapsed = (await world.submitted(world.fans[0])).packet;
      await world.setDecisionAt(lapsed.id, -60);
      await world.service.reconcileDeadlines(world.fans[0]!.actor);
      expect((await world.packetRow(lapsed.id)).state).toBe("expired");
      const taker = (await world.submitted(world.fans[1])).packet;
      const reauthorize = async () =>
        world.service.reauthorize(world.fans[0]!.actor, lapsed.id, {
          version: (await world.packetRow(lapsed.id)).version,
          idempotencyKey: world.key("reauth"),
          paymentMethodId: "pm_cardVisa",
        });
      // The slot is gone: nothing is held for the revival.
      const holdsBefore = world.provider.realCalls("authorize").length;
      await expect(reauthorize()).rejects.toMatchObject({
        code: "capacity_full",
      });
      expect(world.provider.realCalls("authorize")).toHaveLength(holdsBefore);
      expect((await world.packetRow(lapsed.id)).state).toBe("expired");

      await world.decline(taker.id);
      const revived = await reauthorize();
      expect(revived.packet).toMatchObject({
        state: "submitted",
        payment_state: "requires_capture",
        authorization_attempt: 2,
      });
      expect(await world.capacity()).toMatchObject({ reserved: 1, used: 0 });
      // The creator was told about the request once, not again for the revival.
      expect(
        (await world.events(lapsed.id)).filter(
          (t) => t === "packet_submitted_creator",
        ),
      ).toHaveLength(1);
      await world.assertConserved();
    });
  });

  describe("defects found by this suite", () => {
    // Each test here pins a defect as an `it.fails`, which passes while the
    // defect exists. The FIX: commit for a defect turns its test into a normal
    // test in place. DEFECT-1b is database-level and has no FIX: commit.

    // DEFECT-1 (INV-16, defence in depth): a capture for a request nobody accepted.
    // Fixed in "FIX: refuse a capture for a request nobody accepted". runEffect used
    // to trust any `capture` effect row. The only guard against capturing a request
    // nobody accepted was that decide() is the only code that writes such a row;
    // neither the executor nor the database checked. A stray row (a bug, a bad
    // replay, a hand edit) captured real money while the request stayed
    // `submitted`, with no accepted act, no ledger entry and no refund path.
    it("INV-16: a capture effect for a request that was never accepted must not capture", async () => {
      const world = await fixture.newWorld();
      const { packet } = await world.submitted();
      const row = await world.packetRow(packet.id);
      const effect = await world.admin.query<{ id: string }>(
        `INSERT INTO creator.commerce_effect(creator_id,fan_id,packet_id,operation,provider_key,request)
         VALUES($1,$2,$3,'capture',$4,$5) RETURNING id`,
        [
          row.creator_id,
          row.fan_id,
          row.id,
          `${row.id}:capture:1`,
          JSON.stringify({
            intentId: row.intent_ref,
            amount: world.price,
            currency: "USD",
          }),
        ],
      );
      await world.service.runEffect(world.fan.actor, effect.rows[0]!.id);
      expect(world.provider.capturedTotal()).toBe(0);
      expect(world.provider.realCalls("capture")).toHaveLength(0);
      expect((await world.effects(packet.id)).at(-1)).toMatchObject({
        operation: "capture",
        state: "failed",
        error_code: "capture_without_acceptance",
      });
      // The request is untouched: still waiting for the creator, hold intact.
      expect(await world.packetRow(packet.id)).toMatchObject({
        state: "submitted",
        payment_state: "requires_capture",
      });
      expect(world.provider.openHolds()).toBe(1);
      await world.assertConserved();
    });

    // DEFECT-2 (INV-16 release on expiry): a hold with too short a capture window.
    // Fixed in "FIX: release a hold whose capture window is too short to use". A
    // hold with under six hours left (or no reported window) can never be accepted.
    // applyIntent refused it by throwing, which rolled back the intent reference, so
    // the live hold was forgotten and could not be released: the request stuck in
    // submitting/releasing, the slot stayed reserved and the cardholder's funds
    // stayed held until the hold lapsed.
    it("INV-16: a hold whose capture window is too short to use is canceled and the request can be retried", async () => {
      const provider = new FakePaymentProvider({
        captureWindowMs: 5 * 3600_000,
      });
      const world = await fixture.newWorld({ weeklyLimit: 1, provider });
      const view = await world.submit();
      expect(view.packet).toMatchObject({
        state: "draft",
        payment_state: "released",
      });
      expect(provider.openHolds()).toBe(0);
      expect(provider.mutations()).toEqual(["authorize", "release"]);
      expect(await world.capacity()).toMatchObject({ reserved: 0, used: 0 });
      // Nothing was held, so nothing is booked as held.
      expect(await world.ledgerKinds(view.packet.id)).toEqual([]);
      // Settling again repeats nothing, and a normal hold can follow.
      await world.service.reconcile(world.fan.actor, view.packet.id);
      expect(provider.realCalls("release")).toHaveLength(1);
      provider.captureWindowMs = 7 * 24 * 3600_000;
      const retried = await world.service.reauthorize(
        world.fan.actor,
        view.packet.id,
        {
          version: (await world.packetRow(view.packet.id)).version,
          idempotencyKey: world.key("reauth"),
          paymentMethodId: "pm_cardVisa",
        },
      );
      expect(retried.packet).toMatchObject({
        state: "submitted",
        payment_state: "requires_capture",
      });
      await world.assertConserved();
    });

    // DEFECT-3 (ledger accuracy): a release for a hold that never existed.
    // Fixed in "FIX: do not book a release for a hold that never existed".
    // Releasing a request that never had a hold (3-D Secure abandoned, or withdrawn
    // before authorizing) wrote a `release` ledger entry for the full price with no
    // matching `hold`.
    it.each([
      {
        how: "withdrawn",
        run: (w: World, id: string) => w.withdraw(w.fan, id),
      },
      {
        how: "expired",
        run: async (w: World, id: string) => {
          await w.setAuthPendingUntil(id, -60);
          await w.service.reconcileDeadlines(w.fan.actor);
        },
      },
    ])(
      "INV-16: a 3-D Secure request that is $how books no release, because it never held",
      async ({ run }) => {
        const world = await fixture.newWorld({ weeklyLimit: 1 });
        const view = await world.submit(world.fan, {
          paymentMethodId: "pm_cardAuthRequired",
        });
        await run(world, view.packet.id);
        expect(world.provider.intent(view.packet.intent_ref!).status).toBe(
          "canceled",
        );
        expect(await world.ledger(view.packet.id)).toEqual([]);
        expect(await world.capacity()).toMatchObject({ reserved: 0 });
        await world.assertConserved();
      },
    );

    it("INV-16: a request that did hold books exactly one hold and one release", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 1 });
      const { packet } = await world.submitted();
      await world.withdraw(world.fan, packet.id);
      expect(await world.ledgerKinds(packet.id)).toEqual(["hold", "release"]);
    });

    // DEFECT-4 (aggregate version): polling a request that waits for 3-D Secure.
    // Fixed in "FIX: do not advance a request's version when polling finds nothing
    // new". reconcile() rewrote it with version+1 every time although nothing
    // changed, so a client's version went stale on every poll and its next withdraw
    // was refused as stale_request.
    it("INV-18: polling a request that is waiting for 3-D Secure does not change its version", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 1 });
      const view = await world.submit(world.fan, {
        paymentMethodId: "pm_cardAuthRequired",
      });
      const before = view.packet.version;
      for (let poll = 0; poll < 3; poll++)
        await world.service.reconcile(world.fan.actor, view.packet.id);
      expect((await world.packetRow(view.packet.id)).version).toBe(before);
      // The version the client read before polling still works.
      const withdrawn = await world.service.withdraw(
        world.fan.actor,
        view.packet.id,
        { version: before, idempotencyKey: world.key("withdraw") },
      );
      expect(withdrawn.packet.state).toBe("withdrawn");
      await world.assertConserved();
    });

    // DEFECT-5 (INV-10 capacity, INV-16 release): an authorization rejected outright.
    // Fixed in "FIX: settle an authorization the processor rejects outright". When
    // the processor refused an authorization (HTTP 4xx: a payment method id that is
    // invalid, detached or already used), nothing was held, yet the request stayed
    // submitting/unknown, its release had no intent to cancel, and every retry was
    // refused again. The slot stayed reserved: the creator was "fully booked" for
    // the week with no request, and a fan with no spending limit could do that to
    // any creator's whole weekly capacity with made-up payment method ids.
    const rejectOutright = (world: World, paymentMethodId: string) =>
      world.provider.inject("authorize", {
        phase: "before",
        throws: "rejected",
        times: 1000,
        match: (call) => call.paymentMethodId === paymentMethodId,
      });

    it("INV-10: a rejected authorization settles like a declined card, and the slot is bookable at once", async () => {
      const world = await fixture.newWorld({ fans: 2, weeklyLimit: 1 });
      rejectOutright(world, "pm_cardRejectedOutright");
      const rejected = await world.submit(world.fans[0], {
        paymentMethodId: "pm_cardRejectedOutright",
      });
      expect(rejected.packet).toMatchObject({
        state: "draft",
        payment_state: "failed",
      });
      expect(await world.capacity()).toMatchObject({ reserved: 0, used: 0 });
      expect(world.provider.openHolds()).toBe(0);
      expect(await world.ledger(rejected.packet.id)).toEqual([]);
      expect((await world.effects(rejected.packet.id))[0]).toMatchObject({
        operation: "authorize",
        state: "failed",
        error_code: "authorization_rejected",
      });
      // Another fan can book the creator's only slot, and once it is free the
      // first fan starts a new request with a working card. (The dead draft has
      // no authorization to re-authorize, so it is simply left behind.)
      const taken = (await world.submitted(world.fans[1])).packet;
      await expect(world.submit(world.fans[0])).rejects.toMatchObject({
        code: "capacity_full",
      });
      await world.decline(taken.id);
      const fresh = await world.submitted(world.fans[0]);
      expect(fresh.packet.id).not.toBe(rejected.packet.id);
      // Reconciling later changes nothing.
      for (let round = 0; round < 3; round++) {
        await world.makeEffectsDue(rejected.packet.id);
        await world.service.reconcile(world.fans[0]!.actor, rejected.packet.id);
      }
      await world.assertConserved();
    });

    it("INV-10: a creator's whole capacity cannot be taken with payment method ids that never work", async () => {
      const world = await fixture.newWorld({
        fans: 2,
        weeklyLimit: 3,
        limit: null,
      });
      rejectOutright(world, "pm_cardMadeUp");
      for (let attempt = 0; attempt < 6; attempt++)
        await world.submit(world.fans[0], { paymentMethodId: "pm_cardMadeUp" });
      expect(await world.capacity()).toMatchObject({ reserved: 0, used: 0 });
      await world.submitted(world.fans[1]);
      await world.assertConserved();
    });

    it("INV-16: a withdrawal that races a rejected authorization closes the request as withdrawn", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 1 });
      const gate = world.provider.pause("authorize", "before");
      rejectOutright(world, "pm_cardRejectedOutright");
      const submitting = world.submit(world.fan, {
        paymentMethodId: "pm_cardRejectedOutright",
      });
      await gate.arrived;
      const [id] = await packetIds(world);
      await world.withdraw(world.fan, id!);
      gate.open();
      await submitting;
      expect(await world.packetRow(id!)).toMatchObject({
        state: "withdrawn",
        payment_state: "failed",
      });
      expect(await world.capacity()).toMatchObject({ reserved: 0 });
      // Its release had no hold to cancel and does not stay pending.
      expect(
        (await world.effects(id!)).filter((e) => e.state !== "done"),
      ).toMatchObject([{ operation: "authorize", state: "failed" }]);
      await world.assertConserved();
    });

    it("INV-16: a hold the processor did place is never forgotten because its reply was a 4xx", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 1 });
      // The processor created the hold but the answer reached us as a rejection.
      world.provider.inject("authorize", {
        phase: "after",
        throws: "rejected",
      });
      const view = await world.submit();
      expect(view.packet).toMatchObject({
        state: "submitted",
        payment_state: "requires_capture",
      });
      expect(world.provider.realCalls("authorize")).toHaveLength(1);
      expect(world.provider.openHolds()).toBe(1);
      expect(await world.ledgerKinds(view.packet.id)).toEqual(["hold"]);
      expect(await world.capacity()).toMatchObject({ reserved: 1 });
      await world.assertConserved();
    });

    it("INV-16: without a way to confirm that nothing was held, a rejection is not assumed final", async () => {
      const provider = new FakePaymentProvider({ recovery: false });
      const world = await fixture.newWorld({ weeklyLimit: 1, provider });
      rejectOutright(world, "pm_cardRejectedOutright");
      const view = await world.submit(world.fan, {
        paymentMethodId: "pm_cardRejectedOutright",
      });
      // The cautious path: unknown, slot kept, for a person or a later retry.
      expect(view.packet).toMatchObject({
        state: "submitting",
        payment_state: "unknown",
      });
      expect(await world.capacity()).toMatchObject({ reserved: 1 });
      await world.assertConserved({ settled: false });
    });

    // GAP (database level), the other half of DEFECT-1. The accepted_act_id check
    // (commerce_packet_check1) protects the `accepted` state only: neither the
    // `accepting` state nor a `capture` effect row requires an act, so the SQL
    // guard does not stand between a stray row and the processor. Closing it needs
    // a new migration (a CHECK or trigger on commerce_effect), which changes the
    // pinned catalogue checksums, so it is left for the founder's engineer and has
    // no FIX: commit.
    it.fails(
      "DEFECT-1b: the database should refuse a capture effect for a request with no accepted act",
      async () => {
        const world = await fixture.newWorld();
        const { packet } = await world.submitted();
        const row = await world.packetRow(packet.id);
        await expect(
          world.admin.query(
            `INSERT INTO creator.commerce_effect(creator_id,fan_id,packet_id,operation,provider_key,request)
           VALUES($1,$2,$3,'capture',$4,$5)`,
            [
              row.creator_id,
              row.fan_id,
              row.id,
              `${row.id}:capture:1`,
              JSON.stringify({
                intentId: row.intent_ref,
                amount: world.price,
                currency: "USD",
              }),
            ],
          ),
        ).rejects.toThrow();
      },
    );
  });
});
