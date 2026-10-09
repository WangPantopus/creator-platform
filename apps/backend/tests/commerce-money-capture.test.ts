import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MoneyFixture,
  describeMoney,
  type World,
} from "./support/commerce-harness.js";

/**
 * Money path, part 1: when money may move.
 *
 * INV-16 (charge only on acceptance), T-16 (every non-accept path releases or
 * refunds by itself), the decision window rules of decide(), and the SQL guard
 * on `accepted_act_id`. Provider calls go to a deterministic fake that models
 * manual-capture PaymentIntents; nothing here touches a real processor.
 */
describeMoney("commerce money path: capture only after an accept", () => {
  let fixture: MoneyFixture;
  beforeAll(async () => {
    fixture = await MoneyFixture.create();
  });
  afterAll(async () => {
    await fixture?.destroy();
  });

  /** No dollar moved and nothing was promised to the fan. */
  async function expectNothingCaptured(world: World, packetId: string) {
    expect(world.provider.realCalls("capture")).toHaveLength(0);
    expect(world.provider.capturedTotal()).toBe(0);
    expect(await world.ledgerKinds(packetId)).not.toContain("capture");
    expect((await world.packetRow(packetId)).accepted_act_id).toBeNull();
    expect(await world.commitments(packetId)).toHaveLength(0);
  }

  describe("INV-16 / T-16: charge only on acceptance", () => {
    it("INV-16: a hold is captured only by an accept that consumed a signed act, and exactly once", async () => {
      const world = await fixture.newWorld();
      const { packet } = await world.submitted();
      // The hold is placed at submission and nothing else has happened.
      expect(world.provider.mutations()).toEqual(["authorize"]);
      expect(await world.ledgerKinds(packet.id)).toEqual(["hold"]);
      expect(world.provider.openHolds(packet.id)).toBe(1);
      await expectNothingCaptured(world, packet.id);
      expect(await world.capacity()).toMatchObject({ used: 0, reserved: 1 });

      // Without a signature the creator cannot accept, and nothing moves.
      await expect(
        world.decide(packet.id, { action: "reply_myself" }),
      ).rejects.toMatchObject({ code: "signed_act_required" });
      await expectNothingCaptured(world, packet.id);

      const signedActId = await world.signAccept(packet.id);
      expect(await world.consumed(signedActId)).toBe(false);
      const accepted = await world.decide(packet.id, {
        action: "reply_myself",
        signedActId,
      });

      expect(accepted.packet).toMatchObject({
        state: "accepted",
        payment_state: "captured",
        accepted_act_id: signedActId,
        accepted_action: "reply_myself",
      });
      expect(await world.consumed(signedActId)).toBe(true);
      // Provider saw one authorization then one capture, in that order.
      expect(world.provider.mutations()).toEqual(["authorize", "capture"]);
      expect(world.provider.capturedTotal(packet.id)).toBe(world.price);
      expect(await world.ledgerKinds(packet.id)).toEqual(["hold", "capture"]);
      expect((await world.ledger(packet.id))[1]).toMatchObject({
        amount: String(world.price),
        currency: "USD",
      });
      // The accepted commitment exists once and the slot moved reserved -> used.
      expect(await world.commitments(packet.id)).toHaveLength(1);
      expect(await world.capacity()).toMatchObject({ used: 1, reserved: 0 });
      // The capture happened after the signature existed.
      const order = await world.admin.query<{ ok: boolean }>(
        `SELECT s.verified_at <= l.created_at AS ok FROM creator.signed_act s, creator.commerce_ledger l
         WHERE s.id=$1 AND l.packet_id=$2 AND l.kind='capture'`,
        [signedActId, packet.id],
      );
      expect(order.rows[0]?.ok).toBe(true);
    });

    it("INV-16: only the creator's own account can accept; a fan or a team member is refused and nothing moves", async () => {
      const world = await fixture.newWorld();
      const { packet } = await world.submitted();
      const signedActId = await world.signAccept(packet.id);
      const teamAccount = randomUUID();
      await world.admin.query(
        "INSERT INTO creator.team_membership(creator_id,account_id,roles) VALUES($1,$2,$3)",
        [world.creator.id, teamAccount, ["triage", "drafter"]],
      );
      const body = {
        action: "reply_myself" as const,
        version: packet.version,
        idempotencyKey: world.key("decide"),
        signedActId,
      };
      // The fan owns the request but may not decide it.
      await expect(
        world.service.decide(world.fan.actor, packet.id, body),
      ).rejects.toMatchObject({ code: "creator_required" });
      // A team member cannot even read a request; row security hides it.
      await expect(
        world.service.decide(
          { accountId: teamAccount, adultEligible: true },
          packet.id,
          body,
        ),
      ).rejects.toMatchObject({ code: "request_unavailable" });
      await expectNothingCaptured(world, packet.id);
      expect(await world.consumed(signedActId)).toBe(false);
    });

    it("INV-16: an accept signed for another request, or for an older version, is refused and captures nothing", async () => {
      const world = await fixture.newWorld({ fans: 2 });
      const first = (await world.submitted(world.fans[0])).packet;
      const second = (await world.submitted(world.fans[1])).packet;
      const signedForFirst = await world.signAccept(first.id);
      // A signature binds the exact request: it cannot accept a different one.
      await expect(
        world.decide(second.id, {
          action: "reply_myself",
          signedActId: signedForFirst,
        }),
      ).rejects.toMatchObject({ code: "signed_act_required" });
      await expectNothingCaptured(world, second.id);

      // Asking a question bumps the version; the old signature no longer matches.
      await world.decide(first.id, {
        action: "more_info",
        text: "Which clay body?",
      });
      await expect(
        world.decide(first.id, {
          action: "reply_myself",
          signedActId: signedForFirst,
        }),
      ).rejects.toMatchObject({ code: "signed_act_required" });
      await world.service.moreInfo(world.fans[0]!.actor, first.id, {
        version: (await world.packetRow(first.id)).version,
        idempotencyKey: world.key("info"),
        text: "Stoneware, cone 6.",
      });
      await expect(
        world.decide(first.id, {
          action: "reply_myself",
          signedActId: signedForFirst,
        }),
      ).rejects.toMatchObject({ code: "signed_act_required" });
      await expectNothingCaptured(world, first.id);
      expect(await world.consumed(signedForFirst)).toBe(false);
      // The current signature works.
      const accepted = await world.accept(first.id);
      expect(accepted.packet.payment_state).toBe("captured");
      expect(world.provider.realCalls("capture")).toHaveLength(1);
    });

    describe.each([
      {
        path: "decline",
        terminal: "declined",
        reason: "decline",
        run: (w: World, id: string) => w.decline(id),
      },
      {
        path: "ai_answer (Let AI answer)",
        terminal: "declined",
        reason: "ai_answer",
        run: (w: World, id: string) => w.decline(id, "ai_answer"),
      },
      {
        path: "withdrawal",
        terminal: "withdrawn",
        reason: null,
        run: (w: World, id: string) => w.withdraw(w.fan, id),
      },
      {
        path: "expiry",
        terminal: "expired",
        reason: null,
        run: async (w: World, id: string) => {
          await w.setDecisionAt(id, -60);
          return w.service.reconcileDeadlines(w.creator.actor);
        },
      },
    ])("$path", ({ terminal, reason, run }) => {
      it("T-16: releases the hold, returns the slot, writes a ledger entry with a cause and never captures", async () => {
        const world = await fixture.newWorld({ weeklyLimit: 1 });
        const { packet } = await world.submitted();
        expect(await world.capacity()).toMatchObject({ used: 0, reserved: 1 });
        await run(world, packet.id);

        const row = await world.packetRow(packet.id);
        expect(row).toMatchObject({
          state: terminal,
          payment_state: "released",
        });
        if (reason) expect(row.reason).toBe(reason);
        await expectNothingCaptured(world, packet.id);
        // Exactly one release reached the provider; no hold is left open.
        expect(world.provider.mutations()).toEqual(["authorize", "release"]);
        expect(world.provider.openHolds()).toBe(0);
        expect(world.provider.intent(row.intent_ref!).status).toBe("canceled");
        // The slot came back exactly once, and the ledger says why.
        expect(await world.capacity()).toMatchObject({ used: 0, reserved: 0 });
        const ledger = await world.ledger(packet.id);
        expect(ledger.map((entry) => entry.kind)).toEqual(["hold", "release"]);
        expect(ledger[1]).toMatchObject({
          amount: String(world.price),
          cause: `${packet.id}:release:1`,
        });
        expect(await world.events(packet.id)).toContain("hold_released");
        // The slot is genuinely bookable again.
        const again = await world.submitted();
        expect(again.packet.id).not.toBe(packet.id);
      });
    });

    it("T-16: a card the issuer declines never holds, never captures and returns the slot", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 1 });
      const view = await world.submit(world.fan, {
        paymentMethodId: "pm_cardDeclined",
      });
      expect(view.packet).toMatchObject({
        state: "draft",
        payment_state: "failed",
      });
      await expectNothingCaptured(world, view.packet.id);
      expect(await world.ledger(view.packet.id)).toEqual([]);
      expect(await world.capacity()).toMatchObject({ used: 0, reserved: 0 });
      expect(world.provider.mutations()).toEqual(["authorize"]);
      expect(world.provider.openHolds()).toBe(0);
      // A request that never held is not in the creator's queue and cannot be decided.
      await expect(world.creatorView(view.packet.id)).rejects.toMatchObject({
        code: "request_unavailable",
      });
    });

    it("T-16: a request waiting on 3-D Secure is not decidable, does not capture, and its slot returns when it times out", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 1 });
      const view = await world.submit(world.fan, {
        paymentMethodId: "pm_cardAuthRequired",
      });
      expect(view.packet).toMatchObject({
        state: "submitting",
        payment_state: "requires_action",
      });
      expect(await world.capacity()).toMatchObject({ reserved: 1 });
      await expectNothingCaptured(world, view.packet.id);
      // Not visible to the creator until a hold exists.
      await expect(world.creatorView(view.packet.id)).rejects.toMatchObject({
        code: "request_unavailable",
      });
      await world.setAuthPendingUntil(view.packet.id, -60);
      await world.service.reconcileDeadlines(world.fan.actor);
      expect(await world.packetRow(view.packet.id)).toMatchObject({
        state: "expired",
        payment_state: "released",
      });
      await expectNothingCaptured(world, view.packet.id);
      expect(world.provider.openHolds()).toBe(0);
      expect(await world.capacity()).toMatchObject({ used: 0, reserved: 0 });
    });

    it("T-16: a capture the provider rejects (dead card) leaves no capture, no commitment and no consumed slot", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 1 });
      const { packet } = await world.submitted();
      // The issuer voids the hold behind our back.
      world.provider.killHold((await world.packetRow(packet.id)).intent_ref!);
      const signedActId = await world.signAccept(packet.id);
      const view = await world.decide(packet.id, {
        action: "reply_myself",
        signedActId,
      });

      // The fan must re-authorize; nothing was captured or promised.
      expect(view.packet).toMatchObject({
        state: "submitted",
        payment_state: "failed",
        accepted_act_id: null,
      });
      expect(world.provider.realCalls("capture")).toHaveLength(0);
      expect(world.provider.capturedTotal()).toBe(0);
      expect(await world.ledgerKinds(packet.id)).toEqual(["hold"]);
      expect(await world.commitments(packet.id)).toHaveLength(0);
      // The slot stays reserved (not used) while the fan re-authorizes.
      expect(await world.capacity()).toMatchObject({ used: 0, reserved: 1 });
      const [authorize, capture] = await world.effects(packet.id);
      expect(authorize).toMatchObject({
        operation: "authorize",
        state: "done",
      });
      expect(capture).toMatchObject({ operation: "capture", state: "failed" });
      // The acceptance is spent: a replay of the same signature cannot capture later.
      await expect(
        world.decide(packet.id, { action: "reply_myself", signedActId }),
      ).rejects.toMatchObject({ code: "authorization_expiring" });
    });
  });

  describe("INV-16 / T-16: decision window and authorization margin", () => {
    it("INV-16: accept and more_info are refused after decision_at; nothing is captured and the signature stays unused", async () => {
      const world = await fixture.newWorld();
      const { packet } = await world.submitted();
      const signedActId = await world.signAccept(packet.id);
      const before = await world.packetRow(packet.id);
      await world.setDecisionAt(packet.id, -60);

      await expect(
        world.decide(packet.id, { action: "reply_myself", signedActId }),
      ).rejects.toMatchObject({ code: "decision_expired" });
      await expect(
        world.decide(packet.id, {
          action: "more_info",
          text: "One more thing?",
        }),
      ).rejects.toMatchObject({ code: "decision_expired" });

      expect(await world.consumed(signedActId)).toBe(false);
      await expectNothingCaptured(world, packet.id);
      const after = await world.packetRow(packet.id);
      expect(after).toMatchObject({
        state: "submitted",
        version: before.version,
      });
      expect(world.provider.mutations()).toEqual(["authorize"]);
    });

    it("INV-16: the signing policy itself refuses to prepare an accept once the window is closed", async () => {
      const world = await fixture.newWorld();
      const { packet } = await world.submitted();
      await world.setDecisionAt(packet.id, -60);
      await expect(world.signAccept(packet.id)).rejects.toMatchObject({
        code: "acceptance_unavailable",
      });
    });

    it("INV-16: accept and more_info are refused when the authorization has under six hours left", async () => {
      const world = await fixture.newWorld();
      const { packet } = await world.submitted();
      const signedActId = await world.signAccept(packet.id);
      // The decision window is still open but the card hold is about to lapse.
      await world.setDecisionAt(packet.id, 3600);
      await world.setHoldExpiry(packet.id, 3 * 3600);

      await expect(
        world.decide(packet.id, { action: "reply_myself", signedActId }),
      ).rejects.toMatchObject({ code: "authorization_expiring" });
      await expect(
        world.decide(packet.id, {
          action: "more_info",
          text: "Quick question?",
        }),
      ).rejects.toMatchObject({ code: "authorization_expiring" });
      expect(await world.consumed(signedActId)).toBe(false);
      await expectNothingCaptured(world, packet.id);
      expect(world.provider.mutations()).toEqual(["authorize"]);
      // Just outside the margin the same accept goes through.
      await world.setHoldExpiry(packet.id, 7 * 3600);
      const accepted = await world.decide(packet.id, {
        action: "reply_myself",
        signedActId,
      });
      expect(accepted.packet.payment_state).toBe("captured");
    });

    it.each([
      { action: "decline" as const, reason: "decline" },
      { action: "ai_answer" as const, reason: "ai_answer" },
    ])(
      "INV-16: a late $action succeeds after decision_at: the hold is released and the slot returns",
      async ({ action, reason }) => {
        const world = await fixture.newWorld({ weeklyLimit: 1 });
        const { packet } = await world.submitted();
        await world.setDecisionAt(packet.id, -3600);
        // Late for everything except releasing.
        await expect(
          world.decide(packet.id, { action: "more_info", text: "Hello?" }),
        ).rejects.toMatchObject({ code: "decision_expired" });

        await world.decide(packet.id, { action });
        expect(await world.packetRow(packet.id)).toMatchObject({
          state: "declined",
          payment_state: "released",
          reason,
        });
        await expectNothingCaptured(world, packet.id);
        expect(world.provider.mutations()).toEqual(["authorize", "release"]);
        expect(world.provider.openHolds()).toBe(0);
        expect(await world.capacity()).toMatchObject({ used: 0, reserved: 0 });
      },
    );

    it.each(["decline" as const, "ai_answer" as const])(
      "INV-16: a %s inside the six-hour margin succeeds even though accept would be refused",
      async (action) => {
        const world = await fixture.newWorld({ weeklyLimit: 1 });
        const { packet } = await world.submitted();
        await world.setHoldExpiry(packet.id, 2 * 3600);
        await world.decide(packet.id, { action });
        expect(await world.packetRow(packet.id)).toMatchObject({
          state: "declined",
          payment_state: "released",
        });
        expect(world.provider.openHolds()).toBe(0);
        expect(await world.capacity()).toMatchObject({ reserved: 0 });
        await expectNothingCaptured(world, packet.id);
      },
    );

    it("INV-16: a late decline after the provider already lapsed the hold still completes without a second cancel", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 1 });
      const { packet } = await world.submitted();
      const intentId = (await world.packetRow(packet.id)).intent_ref!;
      // Seven days pass: the provider cancels the uncaptured hold on its own.
      world.provider.advanceClock(8 * 24 * 3600 * 1000);
      await world.setDecisionAt(packet.id, -3600);
      await world.setHoldExpiry(packet.id, -3600);

      await world.decide(packet.id, { action: "decline" });
      expect(await world.packetRow(packet.id)).toMatchObject({
        state: "declined",
        payment_state: "released",
      });
      expect(world.provider.intent(intentId).status).toBe("canceled");
      // The service read the truth and did not send a cancel the provider would refuse.
      expect(world.provider.mutations()).toEqual(["authorize"]);
      expect(await world.capacity()).toMatchObject({ used: 0, reserved: 0 });
      expect(await world.ledgerKinds(packet.id)).toEqual(["hold", "release"]);
      await expectNothingCaptured(world, packet.id);
    });

    it("INV-16: a decision on a request that is already decided is refused and releases nothing twice", async () => {
      const world = await fixture.newWorld({ weeklyLimit: 1 });
      const { packet } = await world.submitted();
      await world.decline(packet.id);
      await expect(
        world.decide(packet.id, { action: "decline" }),
      ).rejects.toMatchObject({ code: "decision_unavailable" });
      await expect(
        world.decide(packet.id, { action: "ai_answer" }),
      ).rejects.toMatchObject({ code: "decision_unavailable" });
      expect(world.provider.realCalls("release")).toHaveLength(1);
      expect(await world.capacity()).toMatchObject({ used: 0, reserved: 0 });
    });
  });

  describe("INV-16: the database refuses a captured state without an accepted act", () => {
    it("INV-16: a packet cannot be marked accepted without accepted_act_id (admin and runtime role)", async () => {
      const world = await fixture.newWorld();
      const { packet } = await world.submitted();

      // Superuser path: a bug or a hand edit.
      await expect(
        world.admin.query(
          "UPDATE creator.commerce_packet SET state='accepted',payment_state='captured',accepted_at=now() WHERE id=$1",
          [packet.id],
        ),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "commerce_packet_check1",
      });
      // The same attempt from the application's own non-owner role.
      const client = await world.fixture.runtime.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.account_id',$1,true)", [
          world.fan.account,
        ]);
        await expect(
          client.query(
            "UPDATE creator.commerce_packet SET state='accepted',payment_state='captured',accepted_at=now() WHERE id=$1",
            [packet.id],
          ),
        ).rejects.toMatchObject({
          code: "23514",
          constraint: "commerce_packet_check1",
        });
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
      // An act that does not exist is refused by the foreign key.
      await expect(
        world.admin.query(
          "UPDATE creator.commerce_packet SET accepted_act_id=$2 WHERE id=$1",
          [packet.id, randomUUID()],
        ),
      ).rejects.toMatchObject({ code: "23503" });
      // Nothing changed.
      expect(await world.packetRow(packet.id)).toMatchObject({
        state: "submitted",
        payment_state: "requires_capture",
        accepted_act_id: null,
      });
      await expectNothingCaptured(world, packet.id);
    });

    it("INV-16: a new packet cannot be inserted in the accepted state without an act", async () => {
      const world = await fixture.newWorld();
      const { packet } = await world.submitted();
      const row = await world.packetRow(packet.id);
      await expect(
        world.admin.query(
          `INSERT INTO creator.commerce_packet(thread_id,creator_id,fan_id,mode_id,snapshot,disclosure,visibility,state,payment_state,capacity_window,intent_ref)
           VALUES($1,$2,$3,$4,$5,'{}','private','accepted','captured',(SELECT window_start FROM creator.commerce_capacity WHERE mode_id=$4),'pi_never_authorized')`,
          [
            row.thread_id,
            row.creator_id,
            row.fan_id,
            row.mode_id,
            JSON.stringify(row.snapshot),
          ],
        ),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "commerce_packet_check1",
      });
    });

    it("INV-16: a request cannot reach submitted, accepting or accepted without a payment reference", async () => {
      const world = await fixture.newWorld();
      const view = await world.submit(world.fan, {
        paymentMethodId: "pm_cardDeclined",
      });
      await expect(
        world.admin.query(
          "UPDATE creator.commerce_packet SET state='submitted',intent_ref=NULL WHERE id=$1",
          [view.packet.id],
        ),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "commerce_packet_check",
      });
    });
  });
});
