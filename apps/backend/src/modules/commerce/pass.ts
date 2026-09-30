import { invariant } from "../../core/errors.js";
import type { Actor } from "../identity/adapter.js";
import type { CommerceService } from "./service.js";
import type { PoolClient } from "pg";
import { z } from "zod";
import { VersionCommand } from "../../../../../packages/api/src/commerce/contracts.js";

export interface VerifiedPassPeriod {
  reference: string;
  accountId: string;
  state: "active" | "cancelled" | "past_due" | "refunded";
  startsAt: Date;
  endsAt: Date;
  slotCapacity: number;
  allowance: number;
  cancelAtEnd: boolean;
  /** Provider-verified terminal old purchase when linking a new purchase. */
  replacesReference?: string;
}
export interface PassPeriodVerifier {
  current(actor: Actor, reference: string): Promise<VerifiedPassPeriod>;
}
export type PassRoster = Readonly<{ creatorIds: readonly string[] }>;
type SlotChoice = { id: string; creator_id: string; position: number };
/** Roster gate controls release, while provider truth controls each paid cycle. */
export class PassCommerce {
  get configured() {
    return Boolean(
      this.service.policy.passEnabled &&
        this.service.policy.costAllowanceIntegrated &&
        this.roster &&
        this.billing,
    );
  }
  constructor(
    private readonly service: CommerceService,
    private readonly roster?: PassRoster,
    private readonly billing?: PassPeriodVerifier,
  ) {}
  async choices(actor: Actor) {
    if (!this.configured) return { creators: [], replaceableSlotIds: [] };
    return this.service.account(actor, async (client) => {
      const pass = (
        await client.query(
          "SELECT * FROM creator.commerce_pass WHERE state IN('active','cancelled') AND cycle_end>now()",
        )
      ).rows[0];
      if (!pass) return { creators: [], replaceableSlotIds: [] };
      const candidates = (
        await client.query<{ id: string; display_name: string }>(
          "SELECT id,display_name FROM creator.creator_profile WHERE id=ANY($1::uuid[]) AND verification='verified' AND NOT recovery_required ORDER BY display_name,id",
          [this.roster!.creatorIds],
        )
      ).rows;
      const creators = [];
      for (const creator of candidates)
        if (await this.available(client, creator.id, pass.fan_id))
          creators.push(creator);
      const slots = (
        await client.query<{ id: string; creator_id: string }>(
          "SELECT id,creator_id FROM creator.commerce_pass_slot WHERE pass_id=$1 AND state='active'",
          [pass.id],
        )
      ).rows;
      const replaceableSlotIds = [];
      for (const slot of slots)
        if (!(await this.available(client, slot.creator_id, pass.fan_id)))
          replaceableSlotIds.push(slot.id);
      return { creators, replaceableSlotIds };
    });
  }
  async reconcile(actor: Actor, reference: string) {
    invariant(
      this.billing,
      "pass_unavailable",
      "The pass is not available yet.",
    );
    const before = await this.service.account(
      actor,
      async (client) =>
        (await client.query("SELECT id,version FROM creator.commerce_pass"))
          .rows[0] ?? null,
    );
    const paid = await this.billing.current(actor, reference);
    invariant(
      paid.accountId === actor.accountId &&
        paid.reference === reference &&
        paid.endsAt > paid.startsAt &&
        paid.endsAt.getUTCDate() === 1 &&
        paid.endsAt.getUTCHours() === 0 &&
        paid.endsAt.getUTCMinutes() === 0 &&
        paid.endsAt.getUTCSeconds() === 0 &&
        paid.endsAt.getUTCMilliseconds() === 0 &&
        paid.endsAt.getTime() ===
          Date.UTC(
            paid.startsAt.getUTCFullYear(),
            paid.startsAt.getUTCMonth() + 1,
            1,
          ) &&
        paid.startsAt <= new Date() &&
        Number.isSafeInteger(paid.allowance) &&
        paid.allowance >= 0 &&
        Number.isSafeInteger(paid.slotCapacity) &&
        paid.slotCapacity > 0,
      "pass_period_invalid",
      "The current paid pass period could not be verified.",
    );
    return this.service.account(actor, async (client) => {
      const fan = (
        await client.query<{ id: string }>(
          "SELECT id FROM creator.fan_profile WHERE account_id=$1",
          [actor.accountId],
        )
      ).rows[0];
      invariant(fan, "fan_profile_required", "Set up your fan profile first.");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`pass:${fan.id}`],
      );
      const previous = (
        await client.query(
          "SELECT *,cycle_start::text AS cycle_key,cycle_end::text AS cycle_end_key FROM creator.commerce_pass WHERE fan_id=$1 FOR UPDATE",
          [fan.id],
        )
      ).rows[0];
      invariant(
        previous
          ? previous.id === before?.id && previous.version === before?.version
          : !before,
        "pass_truth_stale",
        "The pass changed while checking the purchase. Fetch its current period again.",
      );
      const cycle = paid.startsAt.toISOString().slice(0, 7) + "-01";
      const cycleEnd = paid.endsAt.toISOString().slice(0, 10);
      const previousEnd = previous
        ? new Date(`${previous.cycle_end_key}T00:00:00.000Z`)
        : undefined;
      invariant(
        !previousEnd || paid.endsAt >= previousEnd,
        "pass_truth_stale",
        "An older pass period cannot replace the current one. Fetch its current period again.",
      );
      invariant(
        !previous ||
          cycleEnd !== previous.cycle_end_key ||
          (cycle === previous.cycle_key &&
            paid.allowance === previous.allowance &&
            paid.slotCapacity === previous.slot_capacity),
        "pass_period_conflict",
        "The purchased pass terms changed within the same period. Reconcile the original purchase before changing access.",
      );
      invariant(
        !previous?.provider_ref ||
          previous.provider_ref === reference ||
          (paid.replacesReference === previous.provider_ref &&
            (previous.state === "refunded" || previousEnd! <= new Date()) &&
            paid.startsAt >= previousEnd!),
        "pass_link_conflict",
        "The pass is linked to another purchase.",
      );
      invariant(
        !previous ||
          previous.state !== "refunded" ||
          previous.provider_ref !== reference ||
          paid.state === "refunded" ||
          paid.startsAt >= previousEnd!,
        "refunded_period_conflict",
        "A refunded pass period cannot restore access.",
      );
      if (previous?.provider_ref) {
        const recorded = await client.query(
          "INSERT INTO creator.commerce_pass_purchase_history(reference,fan_id,pass_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
          [previous.provider_ref, fan.id, previous.id],
        );
        if (!recorded.rowCount) {
          const existing = (
            await client.query(
              "SELECT fan_id,pass_id FROM creator.commerce_pass_purchase_history WHERE reference=$1",
              [previous.provider_ref],
            )
          ).rows[0];
          invariant(
            existing?.fan_id === fan.id && existing.pass_id === previous.id,
            "pass_link_conflict",
            "The previous pass purchase belongs to another account.",
          );
        }
      }
      const active =
        ["active", "cancelled"].includes(paid.state) &&
        paid.startsAt <= new Date() &&
        paid.endsAt > new Date();
      const pass = (
        await client.query(
          "INSERT INTO creator.commerce_pass(fan_id,state,slot_capacity,cycle_start,cycle_end,allowance,provider_ref,cancel_at_end) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(fan_id) DO UPDATE SET state=excluded.state,provider_ref=excluded.provider_ref,cancel_at_end=excluded.cancel_at_end,version=creator.commerce_pass.version+1 RETURNING *",
          [
            fan.id,
            active
              ? paid.cancelAtEnd
                ? "cancelled"
                : "active"
              : paid.state === "refunded"
                ? "refunded"
                : "pending",
            paid.slotCapacity,
            cycle,
            cycleEnd,
            paid.allowance,
            reference,
            paid.cancelAtEnd,
          ],
        )
      ).rows[0]!;
      const binding = (
        await client.query(
          "SELECT fan_id,pass_id FROM creator.commerce_pass_purchase_history WHERE reference=$1",
          [reference],
        )
      ).rows[0];
      invariant(
        !binding || (binding.fan_id === fan.id && binding.pass_id === pass.id),
        "pass_link_conflict",
        "This pass purchase belongs to another account.",
      );
      const linked = await client.query(
        "INSERT INTO creator.commerce_pass_purchase_history(reference,fan_id,pass_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [reference, fan.id, pass.id],
      );
      invariant(
        binding || linked.rowCount === 1,
        "pass_link_conflict",
        "This pass purchase belongs to another account.",
      );
      const newPeriod = !previous || cycleEnd !== previous.cycle_end_key;
      let selected: SlotChoice[];
      let carryForward: boolean | undefined;
      if (newPeriod) {
        const current = (
          await client.query<SlotChoice>(
            "SELECT DISTINCT ON(position) id,creator_id,position FROM creator.commerce_pass_slot WHERE pass_id=$1 AND cycle_start=$2 AND state IN('active','ended_readable','replaced') AND starts_at<=now() AND position<$3 ORDER BY position,starts_at DESC,id DESC",
            [pass.id, previous?.cycle_key ?? cycle, paid.slotCapacity],
          )
        ).rows;
        const draft = (
          await client.query<SlotChoice>(
            "SELECT id,creator_id,position FROM creator.commerce_pass_slot WHERE pass_id=$1 AND state='draft_next' AND cycle_start=$2 ORDER BY position FOR UPDATE",
            [pass.id, cycle],
          )
        ).rows;
        carryForward = draft.length !== paid.slotCapacity;
        selected = carryForward ? current : draft;
        await this.endSlots(client, pass.id, fan.id, true);
        // Persist even failed/refunded renewal periods. Otherwise a later
        // stale active result could revive that refund as a new paid cycle.
        await client.query(
          "UPDATE creator.commerce_pass SET cycle_start=$2,cycle_end=$3,allowance=$4,slot_capacity=$5,used=0,reserved=0 WHERE id=$1",
          [pass.id, cycle, cycleEnd, paid.allowance, paid.slotCapacity],
        );
      } else {
        selected = (
          await client.query<SlotChoice>(
            "SELECT DISTINCT ON(position) id,creator_id,position FROM creator.commerce_pass_slot WHERE pass_id=$1 AND cycle_start=$2 AND state IN('draft_next','ended_readable','replaced') AND starts_at<=now() AND position<$3 ORDER BY position,CASE WHEN state='draft_next' THEN 0 ELSE 1 END,starts_at DESC,id DESC",
            [pass.id, cycle, paid.slotCapacity],
          )
        ).rows;
      }
      const accessAvailable = active && this.configured;
      if (!accessAvailable) {
        await this.endSlots(client, pass.id, fan.id);
        if (newPeriod)
          // Keep the chosen roster without issuing a grant or counting
          // unfunded time. A same-period recovery consumes these choices.
          for (const slot of selected)
            await client.query(
              "INSERT INTO creator.commerce_pass_slot(pass_id,fan_id,creator_id,cycle_start,position,state,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,'draft_next',$6,$7)",
              [
                pass.id,
                fan.id,
                slot.creator_id,
                cycle,
                slot.position,
                paid.startsAt,
                paid.endsAt,
              ],
            );
        return {
          state: pass.state,
          cycleEnd: paid.endsAt,
          accessAvailable: false,
        };
      }
      await client.query(
        "UPDATE creator.commerce_pass_slot SET state='ended_readable',ends_at=starts_at+interval '1 microsecond' WHERE pass_id=$1 AND cycle_start=$2 AND state='draft_next'",
        [pass.id, cycle],
      );
      const startsAt = newPeriod ? paid.startsAt : new Date();
      for (const slot of selected) {
        const duplicate = await client.query(
          "SELECT id FROM creator.commerce_pass_slot WHERE pass_id=$1 AND cycle_start=$2 AND position=$3 AND state='active'",
          [pass.id, cycle, slot.position],
        );
        if (duplicate.rowCount) continue;
        if (!(await this.available(client, slot.creator_id, fan.id))) {
          await client.query(
            "INSERT INTO creator.commerce_pass_slot(pass_id,fan_id,creator_id,cycle_start,position,state,starts_at,ends_at,replacement_of) VALUES($1,$2,$3,$4,$5,'active',$6,$7,$8)",
            [
              pass.id,
              fan.id,
              slot.creator_id,
              cycle,
              slot.position,
              startsAt,
              paid.endsAt,
              slot.id,
            ],
          );
          continue;
        }
        await this.activate(
          client,
          pass.id,
          fan.id,
          slot.creator_id,
          slot.position,
          cycle,
          startsAt,
          paid.endsAt,
          paid.allowance,
          slot.id,
        );
      }
      return {
        state: pass.state,
        cycleEnd: paid.endsAt,
        ...(carryForward === undefined ? {} : { carryForward }),
      };
    });
  }
  async selectInitial(actor: Actor, input: unknown) {
    const body = VersionCommand.extend({
      creatorIds: z.array(z.uuid()).min(1).max(100),
    }).parse(input);
    invariant(
      this.service.policy.passEnabled &&
        this.service.policy.costAllowanceIntegrated &&
        this.roster,
      "pass_unavailable",
      "The pass is not available yet.",
    );
    return this.service.account(actor, (client) =>
      this.service.command(
        client,
        actor,
        "pass.initial",
        body.idempotencyKey,
        body,
        async () => {
          const pass = (
            await client.query(
              "SELECT *,cycle_start::text AS cycle_start,cycle_end::text AS cycle_end FROM creator.commerce_pass WHERE state IN('active','cancelled') AND cycle_end>now() FOR UPDATE",
            )
          ).rows[0];
          invariant(
            pass && pass.version === body.version,
            "pass_required",
            "Refresh your current paid pass first.",
          );
          const existing = (
            await client.query(
              "SELECT position,creator_id FROM creator.commerce_pass_slot WHERE pass_id=$1 AND cycle_start=$2 AND state IN('active','draft_next','replaced','ended_readable')",
              [pass.id, pass.cycle_start],
            )
          ).rows;
          const occupied = new Set(existing.map((s) => s.position));
          invariant(
            new Set(body.creatorIds).size === body.creatorIds.length &&
              occupied.size + body.creatorIds.length <= pass.slot_capacity,
            "slot_limit",
            "Choose each creator once within your available slots.",
          );
          for (const creatorId of body.creatorIds) {
            invariant(
              !existing.some((s) => s.creator_id === creatorId) &&
                (await this.available(client, creatorId, pass.fan_id)),
              "creator_unavailable",
              "Choose an available creator whose AI is not already included.",
            );
            let position = 0;
            while (occupied.has(position)) position++;
            occupied.add(position);
            await this.activate(
              client,
              pass.id,
              pass.fan_id,
              creatorId,
              position,
              pass.cycle_start,
              new Date(),
              new Date(pass.cycle_end),
              pass.allowance,
            );
          }
          await client.query(
            "UPDATE creator.commerce_pass SET version=version+1 WHERE id=$1",
            [pass.id],
          );
          return { selected: body.creatorIds.length };
        },
      ),
    );
  }
  async draft(actor: Actor, input: unknown) {
    const body = VersionCommand.extend({
      creatorIds: z.array(z.uuid()).max(100),
    }).parse(input);
    invariant(
      this.service.policy.passEnabled &&
        this.service.policy.costAllowanceIntegrated &&
        this.roster,
      "pass_unavailable",
      "The pass is not available yet.",
    );
    return this.service.account(actor, (client) =>
      this.service.command(
        client,
        actor,
        "pass.draft",
        body.idempotencyKey,
        body,
        async () => {
          const pass = (
            await client.query(
              "SELECT *,cycle_start::text AS cycle_start,cycle_end::text AS cycle_end FROM creator.commerce_pass WHERE state IN('active','cancelled') AND cycle_end>now() FOR UPDATE",
            )
          ).rows[0];
          invariant(
            pass && pass.version === body.version,
            "pass_changed",
            "Refresh your current pass before changing next month’s choices.",
          );
          invariant(
            new Set(body.creatorIds).size === body.creatorIds.length &&
              body.creatorIds.length <= pass.slot_capacity,
            "slot_limit",
            "Choose each creator once within your available slots.",
          );
          for (const id of body.creatorIds)
            invariant(
              await this.available(client, id, pass.fan_id),
              "creator_unavailable",
              "Choose an available creator whose AI is not already included.",
            );
          await client.query(
            "UPDATE creator.commerce_pass_slot SET state='ended_readable',ends_at=starts_at+interval '1 microsecond' WHERE pass_id=$1 AND state='draft_next'",
            [pass.id],
          );
          const start = new Date(pass.cycle_end);
          const end = new Date(
            Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
          );
          for (const [position, id] of body.creatorIds.entries())
            await client.query(
              "INSERT INTO creator.commerce_pass_slot(pass_id,fan_id,creator_id,cycle_start,position,state,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,'draft_next',$4,$6)",
              [pass.id, pass.fan_id, id, start, position, end],
            );
          await client.query(
            "UPDATE creator.commerce_pass SET version=version+1 WHERE id=$1",
            [pass.id],
          );
          return {
            draftCount: body.creatorIds.length,
            capacity: pass.slot_capacity,
            effectiveAt: start,
            carryForward: body.creatorIds.length < pass.slot_capacity,
          };
        },
      ),
    );
  }
  private async endSlots(
    client: PoolClient,
    passId: string,
    fanId: string,
    includeDraft = false,
  ) {
    const slots = (
      await client.query(
        "SELECT creator_id,grant_id FROM creator.commerce_pass_slot WHERE pass_id=$1 AND state='active' FOR UPDATE",
        [passId],
      )
    ).rows;
    for (const slot of slots) {
      await pair(client, slot.creator_id, fanId);
      if (slot.grant_id)
        await client.query(
          "UPDATE creator.access_grant SET state='expired',valid_until=least(valid_until,now()) WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
          [slot.grant_id, slot.creator_id, fanId],
        );
    }
    await client.query(
      "UPDATE creator.commerce_pass_slot SET ends_at=CASE WHEN state='draft_next' THEN starts_at+interval '1 microsecond' ELSE greatest(starts_at+interval '1 microsecond',least(ends_at,now())) END,state='ended_readable' WHERE pass_id=$1 AND (state='active' OR ($2 AND state='draft_next'))",
      [passId, includeDraft],
    );
  }
  private async available(
    client: PoolClient,
    creatorId: string,
    fanId: string,
  ) {
    if (!this.roster?.creatorIds.includes(creatorId)) return false;
    await pair(client, creatorId, fanId);
    const creator = await client.query(
      "SELECT id FROM creator.creator_profile WHERE id=$1 AND verification='verified' AND NOT recovery_required",
      [creatorId],
    );
    const included = await client.query(
      "SELECT id FROM creator.access_grant WHERE creator_id=$1 AND fan_id=$2 AND source='membership' AND state='active' AND valid_from<=now() AND valid_until>now() AND 'ai_message'=ANY(capabilities)",
      [creatorId, fanId],
    );
    return creator.rowCount === 1 && included.rowCount === 0;
  }
  private async activate(
    client: PoolClient,
    passId: string,
    fanId: string,
    creatorId: string,
    position: number,
    cycle: string,
    start: Date,
    end: Date,
    allowance: number,
    replacement: string | null = null,
  ) {
    await pair(client, creatorId, fanId);
    const grant = (
      await client.query<{ id: string }>(
        "INSERT INTO creator.access_grant(creator_id,fan_id,capabilities,source,state,valid_from,valid_until,allowance) VALUES($1,$2,ARRAY['ai_message'],'pass_slot','active',$3,$4,$5) RETURNING id",
        [creatorId, fanId, start, end, allowance],
      )
    ).rows[0]!;
    return (
      await client.query(
        "INSERT INTO creator.commerce_pass_slot(pass_id,fan_id,creator_id,cycle_start,position,state,starts_at,ends_at,grant_id,replacement_of) VALUES($1,$2,$3,$4,$5,'active',$6,$7,$8,$9) RETURNING id",
        [
          passId,
          fanId,
          creatorId,
          cycle,
          position,
          start,
          end,
          grant.id,
          replacement,
        ],
      )
    ).rows[0]!;
  }
  async replace(actor: Actor, slotId: string, input: unknown) {
    const body = VersionCommand.extend({ creatorId: z.uuid() }).parse(input);
    invariant(
      this.service.policy.passEnabled &&
        this.service.policy.costAllowanceIntegrated &&
        this.roster,
      "pass_unavailable",
      "The pass is not available yet.",
    );
    return this.service.account(actor, (client) =>
      this.service.command(
        client,
        actor,
        "pass.replace",
        body.idempotencyKey,
        { slotId, ...body },
        async () => {
          // Reconciliation always locks the pass before its slots. Match that
          // order here, then re-read the slot under the owning pass lock.
          const owner = (
            await client.query(
              "SELECT p.id FROM creator.commerce_pass p WHERE p.id=(SELECT pass_id FROM creator.commerce_pass_slot WHERE id=$1) FOR UPDATE",
              [slotId],
            )
          ).rows[0];
          invariant(
            owner,
            "slot_unavailable",
            "Refresh your current pass first.",
          );
          const slot = (
            await client.query(
              "SELECT s.*,s.cycle_start::text AS cycle_start,p.allowance,p.version AS pass_version,p.cycle_end::text AS cycle_end,p.state AS pass_state FROM creator.commerce_pass_slot s JOIN creator.commerce_pass p ON p.id=s.pass_id WHERE s.id=$1 AND s.pass_id=$2 AND s.state='active' FOR UPDATE OF s",
              [slotId, owner.id],
            )
          ).rows[0];
          invariant(
            slot &&
              slot.pass_version === body.version &&
              ["active", "cancelled"].includes(slot.pass_state) &&
              new Date(slot.cycle_end) > new Date(),
            "slot_unavailable",
            "Refresh your current pass first.",
          );
          invariant(
            !(await this.available(client, slot.creator_id, slot.fan_id)),
            "replacement_unavailable",
            "Free replacement is available when the selected creator becomes unavailable or membership includes that AI.",
          );
          invariant(
            body.creatorId !== slot.creator_id &&
              (await this.available(client, body.creatorId, slot.fan_id)),
            "creator_unavailable",
            "Choose an available creator whose AI is not already included.",
          );
          const duplicate = await client.query(
            "SELECT id FROM creator.commerce_pass_slot WHERE pass_id=$1 AND creator_id=$2 AND state='active'",
            [slot.pass_id, body.creatorId],
          );
          invariant(
            !duplicate.rowCount,
            "duplicate_creator",
            "That creator already has a slot.",
          );
          await pair(client, slot.creator_id, slot.fan_id);
          if (slot.grant_id)
            await client.query(
              "UPDATE creator.access_grant SET state='expired',valid_until=now() WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
              [slot.grant_id, slot.creator_id, slot.fan_id],
            );
          await client.query(
            "UPDATE creator.commerce_pass_slot SET state='replaced',ends_at=greatest(starts_at+interval '1 microsecond',now()) WHERE id=$1",
            [slot.id],
          );
          // The shared pass counters stay unchanged. A new slot cannot replenish the allowance.
          const next = await this.activate(
            client,
            slot.pass_id,
            slot.fan_id,
            body.creatorId,
            slot.position,
            slot.cycle_start,
            new Date(),
            slot.ends_at,
            slot.allowance,
            slot.id,
          );
          await client.query(
            "UPDATE creator.commerce_pass SET version=version+1 WHERE id=$1",
            [slot.pass_id],
          );
          return { slotId: next.id, freeReplacement: true };
        },
      ),
    );
  }
}
async function pair(client: PoolClient, c: string, f: string) {
  await client.query(
    "SELECT set_config('app.creator_id',$1,true),set_config('app.fan_id',$2,true)",
    [c, f],
  );
}

/** Configured first-cycle price; receipt remains the provider's actual paid amount. */
export function calendarProration(fullMinor: bigint, start: Date, end: Date) {
  const monthStart = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
    monthEnd = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1);
  invariant(
    fullMinor >= 0n &&
      start.getTime() >= monthStart &&
      end.getTime() === monthEnd,
    "pass_period_invalid",
    "The pass cycle must end at the UTC calendar boundary.",
  );
  return (
    (fullMinor * BigInt(end.getTime() - start.getTime())) /
    BigInt(monthEnd - monthStart)
  );
}
