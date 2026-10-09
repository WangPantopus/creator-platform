import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakePaymentProvider } from "./support/fake-payment-provider.js";
import {
  CURRENCY,
  MoneyFixture,
  describeMoney,
} from "./support/commerce-harness.js";

/**
 * Money path, part 2: how much can be asked for.
 *
 * Capacity (INV-10, T-10, T-24), the spend limit (T-38), idempotency (INV-18,
 * T-18), the price snapshot and exact disclosure (INV-13, T-13).
 */
describeMoney("commerce money path: capacity, spend limit, idempotency", () => {
  let fixture: MoneyFixture;
  beforeAll(async () => {
    fixture = await MoneyFixture.create();
  });
  afterAll(async () => {
    await fixture?.destroy();
  });

  async function outcomes(attempts: Promise<unknown>[]) {
    const settled = await Promise.allSettled(attempts);
    return {
      ok: settled.filter((r) => r.status === "fulfilled").length,
      codes: settled.flatMap((r) =>
        r.status === "rejected" ? [(r.reason as { code?: string }).code] : [],
      ),
    };
  }

  describe("INV-10 / T-10 / T-24: capacity", () => {
    it("T-10: at capacity the submission fails before any hold, and every view shows the same number", async () => {
      const world = await fixture.newWorld({ fans: 3, weeklyLimit: 2 });
      await world.submitted(world.fans[0]);
      await world.submitted(world.fans[1]);
      const holdsBefore = world.provider.realCalls("authorize").length;

      await expect(world.submit(world.fans[2])).rejects.toMatchObject({
        code: "capacity_full",
      });
      // No hold, no packet, no payment call for the refused fan.
      expect(world.provider.realCalls("authorize")).toHaveLength(holdsBefore);
      expect(world.provider.openHolds()).toBe(2);
      const packets = await world.admin.query(
        "SELECT 1 FROM creator.commerce_packet WHERE fan_id=$1",
        [world.fans[2]!.id],
      );
      expect(packets.rowCount).toBe(0);
      expect(await world.capacity()).toMatchObject({
        capacity_limit: 2,
        used: 0,
        reserved: 2,
      });
      // The fan's packet screen and the creator's studio read the same row.
      for (const viewer of [world.fans[2]!, world.creator]) {
        const overview = await world.service.overview(
          viewer.actor,
          world.creator.id,
        );
        const mode = overview.modes.find((m) => m.id === world.mode.id)!;
        expect(
          Number(mode.weekly_limit) - Number(mode.used) - Number(mode.reserved),
        ).toBe(0);
        expect([Number(mode.used), Number(mode.reserved)]).toEqual([0, 2]);
      }
      await world.assertConserved();
    });

    it("T-24: parallel submissions race for the last slots and exactly capacity succeed", async () => {
      const world = await fixture.newWorld({ fans: 8, weeklyLimit: 3 });
      const result = await outcomes(world.fans.map((fan) => world.submit(fan)));
      expect(result.ok).toBe(3);
      expect(result.codes).toEqual(Array(5).fill("capacity_full"));
      // Only the winners ever reached the processor.
      expect(world.provider.realCalls("authorize")).toHaveLength(3);
      expect(world.provider.openHolds()).toBe(3);
      expect(await world.capacity()).toMatchObject({ used: 0, reserved: 3 });
      const rows = await world.admin.query(
        "SELECT state FROM creator.commerce_packet WHERE creator_id=$1",
        [world.creator.id],
      );
      expect(rows.rows.map((r) => r.state)).toEqual(Array(3).fill("submitted"));
      await world.assertConserved();
    });

    it("T-24: one fan racing against themselves with different keys still cannot exceed capacity or the limit", async () => {
      const world = await fixture.newWorld({ fans: 1, weeklyLimit: 2 });
      const result = await outcomes(
        Array.from({ length: 6 }, () => world.submit(world.fan)),
      );
      expect(result.ok).toBe(2);
      expect(new Set(result.codes)).toEqual(new Set(["capacity_full"]));
      expect(world.provider.realCalls("authorize")).toHaveLength(2);
      expect(await world.capacity()).toMatchObject({ reserved: 2, used: 0 });
      await world.assertConserved();
    });

    it("INV-10: release and expiry return a slot exactly once, and it is bookable again", async () => {
      const world = await fixture.newWorld({ fans: 3, weeklyLimit: 2 });
      const a = (await world.submitted(world.fans[0])).packet;
      const b = (await world.submitted(world.fans[1])).packet;
      await expect(world.submit(world.fans[2])).rejects.toMatchObject({
        code: "capacity_full",
      });

      await world.decline(a.id);
      expect(await world.capacity()).toMatchObject({ reserved: 1 });
      // Repeating the release cannot push the counter below the real count.
      await expect(world.decline(a.id)).rejects.toMatchObject({
        code: "decision_unavailable",
      });
      await world.service.reconcileDeadlines(world.creator.actor);
      await world.service.reconcile(world.fans[0]!.actor, a.id);
      expect(await world.capacity()).toMatchObject({ reserved: 1 });

      // The freed slot now goes to the fan who was refused.
      const c = (await world.submitted(world.fans[2])).packet;
      await expect(world.submit(world.fans[0])).rejects.toMatchObject({
        code: "capacity_full",
      });
      // Expiry frees the next one, once, even if reconciliation runs twice.
      await world.setDecisionAt(b.id, -60);
      await world.service.reconcileDeadlines(world.creator.actor);
      await world.service.reconcileDeadlines(world.creator.actor);
      expect(await world.packetRow(b.id)).toMatchObject({ state: "expired" });
      expect(await world.capacity()).toMatchObject({ reserved: 1 });
      expect(world.provider.realCalls("release")).toHaveLength(2);
      await world.assertConserved();
      expect((await world.packetRow(c.id)).state).toBe("submitted");
    });

    it("INV-10: an accepted request keeps its slot used; the weekly limit cannot drop below promises", async () => {
      const world = await fixture.newWorld({ fans: 3, weeklyLimit: 2 });
      const a = (await world.submitted(world.fans[0])).packet;
      await world.submitted(world.fans[1]);
      await world.accept(a.id);
      expect(await world.capacity()).toMatchObject({ used: 1, reserved: 1 });
      await expect(world.submit(world.fans[2])).rejects.toMatchObject({
        code: "capacity_full",
      });
      const edit = (weeklyLimit: number, version: number) =>
        world.service.saveMode(
          world.creator.actor,
          world.creator.id,
          world.mode.id,
          {
            title: "Written reply",
            kind: "written_reply",
            amount: world.price,
            publicAmount: null,
            currency: CURRENCY,
            decisionHours: 48,
            deliveryHours: 72,
            durationSeconds: null,
            weeklyLimit,
            shareable: false,
            state: "offered",
            version,
            idempotencyKey: world.key("mode"),
          },
        );
      // One promise and one pending request already fill a limit of one.
      await expect(edit(1, world.mode.version)).rejects.toMatchObject({
        code: "capacity_below_obligations",
      });
      const raised = (await edit(3, world.mode.version)) as { version: number };
      expect(await world.capacity()).toMatchObject({ capacity_limit: 3 });
      // The refused fan can book at once under the raised limit.
      await world.submitted(world.fans[2], { modeVersion: raised.version });
      expect(await world.capacity()).toMatchObject({ used: 1, reserved: 2 });
      await world.assertConserved();
    });
  });

  describe("T-38 / INV-18: the spend limit comes before capacity", () => {
    it("T-38: a fan over their limit is refused before any slot is reserved or hold placed", async () => {
      const world = await fixture.newWorld({ limit: 4000 }); // price is 5000
      await expect(world.submit()).rejects.toMatchObject({
        code: "spend_limit",
      });
      expect(world.provider.calls).toHaveLength(0);
      expect(await world.capacity()).toMatchObject({ used: 0, reserved: 0 });
      const packets = await world.admin.query(
        "SELECT 1 FROM creator.commerce_packet WHERE creator_id=$1",
        [world.creator.id],
      );
      expect(packets.rowCount).toBe(0);
    });

    it("T-38: when both the limit and the capacity fail, the limit is the answer", async () => {
      const world = await fixture.newWorld({
        fans: 3,
        weeklyLimit: 1,
        limit: 100000,
      });
      await world.submitted(world.fans[0]); // takes the only slot
      await world.setLimit(world.fans[1]!, 4000);
      // Capacity is full for everyone; only the fan within their limit reaches it.
      await expect(world.submit(world.fans[1])).rejects.toMatchObject({
        code: "spend_limit",
      });
      await expect(world.submit(world.fans[2])).rejects.toMatchObject({
        code: "capacity_full",
      });
      expect(await world.capacity()).toMatchObject({ reserved: 1 });
      expect(world.provider.realCalls("authorize")).toHaveLength(1);
      await world.assertConserved();
    });

    it("T-38: raising the limit takes effect after 24 hours; lowering is immediate", async () => {
      const world = await fixture.newWorld({ limit: 4000, weeklyLimit: 3 });
      await expect(world.submit()).rejects.toMatchObject({
        code: "spend_limit",
      });

      const raised = await world.setLimit(world.fan, 10000);
      expect(raised.delay).toBe("24 hours");
      // Resubmitting immediately is still refused; nothing was reserved or held.
      await expect(world.submit()).rejects.toMatchObject({
        code: "spend_limit",
      });
      expect(world.provider.calls).toHaveLength(0);
      expect(await world.capacity()).toMatchObject({ reserved: 0 });

      // Twenty-four hours later the new limit applies.
      await world.admin.query(
        "UPDATE creator.commerce_spend_limit SET effective_at=now()-interval '1 second' WHERE fan_id=$1",
        [world.fan.id],
      );
      const placed = await world.submitted();
      expect(placed.packet.payment_state).toBe("requires_capture");

      // Lowering applies at once, even below what is already held.
      const lowered = await world.setLimit(world.fan, 3000);
      expect(lowered.delay).toBeNull();
      await expect(world.submit()).rejects.toMatchObject({
        code: "spend_limit",
      });
      await world.assertConserved();
    });

    it("INV-18: holds and captures count against the limit; a release gives the room back", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 5, limit: 12000 });
      const first = (await world.submitted()).packet;
      const second = (await world.submitted()).packet;
      // 10000 held; a third 5000 would pass 12000.
      await expect(world.submit()).rejects.toMatchObject({
        code: "spend_limit",
      });
      await world.decline(second.id);
      const third = (await world.submitted()).packet;
      // A capture counts too.
      await world.accept(first.id);
      await expect(world.submit()).rejects.toMatchObject({
        code: "spend_limit",
      });
      await world.decline(third.id);
      const exposure = (await world.service.overview(world.fan.actor))
        .exposure!;
      expect(exposure).toMatchObject({ captured: 5000, held: 0, total: 5000 });
      await world.submitted();
      await world.assertConserved();
    });

    it("T-38: the same fan racing two requests past their limit gets exactly one hold", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 5, limit: 7500 });
      const result = await outcomes([
        world.submit(),
        world.submit(),
        world.submit(),
      ]);
      expect(result.ok).toBe(1);
      expect(result.codes).toEqual(["spend_limit", "spend_limit"]);
      expect(world.provider.realCalls("authorize")).toHaveLength(1);
      expect(await world.capacity()).toMatchObject({ reserved: 1 });
      await world.assertConserved();
    });

    it("INV-18: a fan with no chosen limit cannot place a hold; an explicit 'no limit' can", async () => {
      const world = await fixture.newWorld({ limit: "unset", weeklyLimit: 2 });
      await expect(world.submit()).rejects.toMatchObject({
        code: "spend_limit_required",
      });
      expect(world.provider.calls).toHaveLength(0);
      expect(await world.capacity()).toMatchObject({ reserved: 0 });
      await world.setLimit(world.fan, null);
      expect((await world.submitted()).packet.state).toBe("submitted");
    });
  });

  describe("INV-18 / T-18: every transition is idempotent", () => {
    it("the same key replays the same request and never places a second hold", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 3 });
      const body = world.submitBody(world.fan);
      const first = await world.service.submit(world.fan.actor, body);
      const replay = await world.service.submit(world.fan.actor, body);
      expect(replay.packet.id).toBe(first.packet.id);
      expect(replay.packet.state).toBe("submitted");
      expect(world.provider.realCalls("authorize")).toHaveLength(1);
      expect(world.provider.callsOf("authorize")).toHaveLength(1);
      expect(await world.ledgerKinds(first.packet.id)).toEqual(["hold"]);
      expect(await world.capacity()).toMatchObject({ reserved: 1 });
      const packets = await world.admin.query(
        "SELECT 1 FROM creator.commerce_packet WHERE creator_id=$1",
        [world.creator.id],
      );
      expect(packets.rowCount).toBe(1);
      await world.assertConserved();
    });

    it("five simultaneous retries of one key make one request and one hold", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 3 });
      const body = world.submitBody(world.fan);
      const views = await Promise.all(
        Array.from({ length: 5 }, () =>
          world.service.submit(world.fan.actor, body),
        ),
      );
      expect(new Set(views.map((v) => v.packet.id)).size).toBe(1);
      expect(world.provider.realCalls("authorize")).toHaveLength(1);
      expect(world.provider.callsOf("authorize")).toHaveLength(1);
      expect(await world.capacity()).toMatchObject({ reserved: 1 });
      expect(await world.ledgerKinds(views[0]!.packet.id)).toEqual(["hold"]);
      await world.assertConserved();
    });

    it("the same key with a different request is refused and places nothing", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 3 });
      const body = world.submitBody(world.fan);
      await world.service.submit(world.fan.actor, body);
      await expect(
        world.service.submit(world.fan.actor, {
          ...body,
          disclosure: { ...body.disclosure, summary: "A different question" },
        }),
      ).rejects.toMatchObject({ code: "idempotency_conflict" });
      await expect(
        world.service.submit(world.fan.actor, {
          ...body,
          paymentMethodId: "pm_cardOther",
        }),
      ).rejects.toMatchObject({ code: "idempotency_conflict" });
      expect(world.provider.realCalls("authorize")).toHaveLength(1);
      expect(await world.capacity()).toMatchObject({ reserved: 1 });
      await world.assertConserved();
    });

    it("a lost response is safe to retry: the retry finds the hold the provider already placed", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 3 });
      const body = world.submitBody(world.fan);
      // The processor places the hold but the reply is lost.
      world.provider.failAfterAction("authorize");
      const first = await world.service.submit(world.fan.actor, body);
      expect(first.packet).toMatchObject({
        state: "submitting",
        payment_state: "unknown",
      });
      expect(world.provider.openHolds()).toBe(1);
      expect(await world.ledger(first.packet.id)).toEqual([]);

      // The client retries at once: the stored command is returned and the
      // effect is still backing off, so nothing is asked of the processor.
      const early = await world.service.submit(world.fan.actor, body);
      expect(early.packet.id).toBe(first.packet.id);
      expect(world.provider.callsOf("authorize")).toHaveLength(1);

      // After the backoff the retry recovers the original hold.
      await world.makeEffectsDue(first.packet.id);
      const retried = await world.service.submit(world.fan.actor, body);
      expect(retried.packet).toMatchObject({
        id: first.packet.id,
        state: "submitted",
        payment_state: "requires_capture",
      });
      expect(world.provider.realCalls("authorize")).toHaveLength(1);
      expect(world.provider.openHolds()).toBe(1);
      expect(await world.ledgerKinds(first.packet.id)).toEqual(["hold"]);
      expect(await world.capacity()).toMatchObject({ reserved: 1 });
      await world.assertConserved();
    });

    it("a lost response is safe to retry even when the processor offers no lookup, because it honours the key", async () => {
      const provider = new FakePaymentProvider({ recovery: false });
      const world = await fixture.newWorld({ weeklyLimit: 3, provider });
      const body = world.submitBody(world.fan);
      provider.failAfterAction("authorize");
      const first = await world.service.submit(world.fan.actor, body);
      await world.makeEffectsDue(first.packet.id);
      const retried = await world.service.submit(world.fan.actor, body);
      expect(retried.packet.state).toBe("submitted");
      // The second request carried the same key and was answered from the first.
      expect(provider.callsOf("authorize")).toHaveLength(2);
      expect(provider.callsOf("authorize")[1]!.replayed).toBe(true);
      expect(provider.realCalls("authorize")).toHaveLength(1);
      expect(provider.openHolds()).toBe(1);
      await world.assertConserved();
    });

    it("a repeated accept with the same key captures once and returns the same result", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 3 });
      const { packet } = await world.submitted();
      const signedActId = await world.signAccept(packet.id);
      const body = {
        action: "reply_myself" as const,
        version: packet.version,
        idempotencyKey: world.key("decide"),
        signedActId,
      };
      const [one, two] = await Promise.all([
        world.service.decide(world.creator.actor, packet.id, body),
        world.service.decide(world.creator.actor, packet.id, body),
      ]);
      // A duplicate that arrives while the first capture is in flight sees the
      // in-flight state; it must never start a second capture.
      for (const view of [one, two])
        expect(["accepting", "accepted"]).toContain(view.packet.state);
      const three = await world.service.decide(
        world.creator.actor,
        packet.id,
        body,
      );
      expect(three.packet).toMatchObject({
        state: "accepted",
        payment_state: "captured",
      });
      expect(world.provider.realCalls("capture")).toHaveLength(1);
      expect(world.provider.callsOf("capture")).toHaveLength(1);
      expect(await world.ledgerKinds(packet.id)).toEqual(["hold", "capture"]);
      expect(await world.commitments(packet.id)).toHaveLength(1);
      expect(await world.capacity()).toMatchObject({ used: 1, reserved: 0 });
      await world.assertConserved();
    });

    it("a repeated withdraw or decline with the same key releases once", async () => {
      const world = await fixture.newWorld({ fans: 2, weeklyLimit: 3 });
      const withdrawn = (await world.submitted(world.fans[0])).packet;
      const declined = (await world.submitted(world.fans[1])).packet;
      const withdrawBody = {
        version: withdrawn.version,
        idempotencyKey: world.key("withdraw"),
      };
      await Promise.all([
        world.service.withdraw(
          world.fans[0]!.actor,
          withdrawn.id,
          withdrawBody,
        ),
        world.service.withdraw(
          world.fans[0]!.actor,
          withdrawn.id,
          withdrawBody,
        ),
      ]);
      await world.service.withdraw(
        world.fans[0]!.actor,
        withdrawn.id,
        withdrawBody,
      );
      const declineBody = {
        action: "decline" as const,
        version: declined.version,
        idempotencyKey: world.key("decide"),
      };
      await Promise.all([
        world.service.decide(world.creator.actor, declined.id, declineBody),
        world.service.decide(world.creator.actor, declined.id, declineBody),
      ]);
      expect(world.provider.realCalls("release")).toHaveLength(2);
      expect(await world.ledgerKinds(withdrawn.id)).toEqual([
        "hold",
        "release",
      ]);
      expect(await world.ledgerKinds(declined.id)).toEqual(["hold", "release"]);
      expect(await world.capacity()).toMatchObject({ reserved: 0, used: 0 });
      await world.assertConserved();
    });

    it("a different key on an already-decided request is refused, not applied twice", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 3 });
      const { packet } = await world.submitted();
      const first = await world.signAccept(packet.id);
      const second = await world.signAccept(packet.id);
      await world.decide(packet.id, {
        action: "reply_myself",
        signedActId: first,
        version: packet.version,
      });
      await expect(
        world.decide(packet.id, {
          action: "reply_myself",
          signedActId: second,
          version: packet.version,
        }),
      ).rejects.toMatchObject({ code: "stale_request" });
      expect(world.provider.realCalls("capture")).toHaveLength(1);
      expect(await world.consumed(second)).toBe(false);
      await world.assertConserved();
    });
  });

  describe("the price is the snapshot taken at submission", () => {
    it("changing the offer afterwards changes neither the hold nor the capture; a stale offer cannot be submitted", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 3 });
      const { packet } = await world.submitted();
      const edited = (await world.service.saveMode(
        world.creator.actor,
        world.creator.id,
        world.mode.id,
        {
          title: "Written reply",
          kind: "written_reply",
          amount: 9000,
          publicAmount: null,
          currency: CURRENCY,
          decisionHours: 48,
          deliveryHours: 72,
          durationSeconds: null,
          weeklyLimit: 3,
          shareable: false,
          state: "offered",
          version: world.mode.version,
          idempotencyKey: world.key("mode"),
        },
      )) as { version: number };
      expect(edited.version).toBe(world.mode.version + 1);
      await world.accept(packet.id);
      expect(world.provider.capturedTotal(packet.id)).toBe(5000);
      expect((await world.ledger(packet.id)).map((e) => e.amount)).toEqual([
        "5000",
        "5000",
      ]);
      // The old offer version the fan was looking at is no longer submittable.
      await expect(world.submit(world.fan, {})).rejects.toMatchObject({
        code: "mode_unavailable",
      });
      await world.assertConserved();
    });

    it("a public request is held at the public price; an unconfigured public price is refused", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 3 });
      await expect(
        world.submit(world.fan, { visibility: "public" }),
      ).rejects.toMatchObject({ code: "public_price_unconfigured" });
      const edited = (await world.service.saveMode(
        world.creator.actor,
        world.creator.id,
        world.mode.id,
        {
          title: "Written reply",
          kind: "written_reply",
          amount: 5000,
          publicAmount: 3000,
          currency: CURRENCY,
          decisionHours: 48,
          deliveryHours: 72,
          durationSeconds: null,
          weeklyLimit: 3,
          shareable: false,
          state: "offered",
          version: world.mode.version,
          idempotencyKey: world.key("mode"),
        },
      )) as { version: number };
      const view = await world.submit(world.fan, {
        visibility: "public",
        modeVersion: edited.version,
      });
      expect(view.packet.snapshot.amount).toBe(3000);
      expect(world.provider.intentFor(view.packet.id)[0]!.amount).toBe(3000);
      await world.accept(view.packet.id);
      expect(world.provider.capturedTotal()).toBe(3000);
      await world.assertConserved();
    });
  });

  describe("INV-13 / T-13: the creator sees exactly the disclosed items", () => {
    it("T-13: only the disclosed messages reach the queue; reading the thread is a separate, logged action", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 3 });
      const ids = await world.fanMessages(
        world.fan,
        [1, 2, 3, 4, 5, 6].map((n) => `line-${n} of a private conversation`),
      );
      const disclosed = [ids[0]!, ids[2]!, ids[4]!];
      const view = await world.submitted(world.fan, {
        disclosure: {
          summary: "Glaze crawling on thick pieces",
          includeSummary: true,
          messageIds: disclosed,
          attachmentIds: [],
          wholeThread: false,
          identity: "handle",
          accessNoticeVersion: "C06-1",
        },
      });

      const queue = await world.creatorView(view.packet.id);
      const disclosure = queue.packet.disclosure as {
        summary: string;
        messages: { id: string; text: string }[];
      };
      expect(disclosure.summary).toBe("Glaze crawling on thick pieces");
      expect(disclosure.messages.map((m) => m.id).sort()).toEqual(
        [...disclosed].sort(),
      );
      const everything = JSON.stringify(queue);
      for (const n of [1, 3, 5]) expect(everything).toContain(`line-${n} of`);
      for (const n of [2, 4, 6])
        expect(everything).not.toContain(`line-${n} of`);
      // Reading a request from the queue is not a thread audit read.
      const audits = () =>
        world.admin.query(
          "SELECT role FROM creator.thread_audit WHERE creator_id=$1 AND fan_id=$2",
          [world.creator.id, world.fan.id],
        );
      expect((await audits()).rowCount).toBe(0);
      // Opening the thread is a different, disclosed and logged capability.
      await world.fixture.access.openThread(
        world.creator.actor,
        world.creator.id,
        world.fan.id,
      );
      expect((await audits()).rows).toEqual([{ role: "creator" }]);
    });

    it("T-13: a request is invisible to the creator until its hold exists, and a missing message blocks the request", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 3 });
      const pending = await world.submit(world.fan, {
        paymentMethodId: "pm_cardAuthRequired",
      });
      await expect(world.creatorView(pending.packet.id)).rejects.toMatchObject({
        code: "request_unavailable",
      });
      // A message id that is not in this thread cannot be smuggled into a disclosure.
      const other = await fixture.newWorld({ weeklyLimit: 3 });
      const [foreign] = await other.fanMessages(other.fan, [
        "not yours to share",
      ]);
      await expect(
        world.submit(world.fan, {
          disclosure: {
            ...world.submitBody(world.fan).disclosure,
            messageIds: [foreign!],
          },
        }),
      ).rejects.toMatchObject({ code: "disclosure_unavailable" });
    });
  });
});
