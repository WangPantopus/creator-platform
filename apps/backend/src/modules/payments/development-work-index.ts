import type { Pool } from "pg";
import { invariant } from "../../core/errors.js";
import {
  resolveActor,
  type Actor,
  type PantopusIdentityAdapter,
} from "../identity/adapter.js";
import type { CommerceWorkIndex, CommerceWorkScope } from "./inbox.js";

// What the system, not a person, must finish: an ended decision window, a hold
// still being placed or re-authorized past its window, money in an unknown
// state, an overdue commitment, a commitment whose reminder is due, or a money
// call whose retry time has come.
// Read as the fan who owns the request, under that fan's row security.
const DUE = `SELECT p.id FROM creator.commerce_packet p
 JOIN creator.fan_profile f ON f.id=p.fan_id AND f.account_id=$1
 WHERE (p.state IN ('submitted','more_info','offer_pending') AND p.payment_state<>'failed' AND p.decision_at<=now())
  OR (p.state='submitted' AND p.payment_state='failed' AND p.auth_pending_until<=now())
  OR (p.state='submitting' AND p.auth_pending_until<=now())
  OR p.payment_state='unknown'
  OR EXISTS(SELECT 1 FROM creator.commerce_commitment c WHERE c.packet_id=p.id AND c.creator_id=p.creator_id
   AND c.fan_id=p.fan_id AND c.state IN ('due','in_progress') AND c.due_at<=now())
  OR EXISTS(SELECT 1 FROM creator.commerce_commitment c WHERE c.packet_id=p.id AND c.creator_id=p.creator_id
   AND c.fan_id=p.fan_id AND c.state IN ('due','in_progress') AND c.due_at>now() AND p.accepted_at IS NOT NULL
   AND c.due_at-least(interval '24 hours',(c.due_at-p.accepted_at)/4)<=now()
   AND NOT EXISTS(SELECT 1 FROM creator.commerce_event e WHERE e.aggregate_id=p.id AND e.type='commitment_due'))
  OR EXISTS(SELECT 1 FROM creator.commerce_effect e WHERE e.packet_id=p.id AND e.state IN ('pending','unknown','processing')
   AND e.next_at<=now() AND (e.lease_until IS NULL OR e.lease_until<now()))
 ORDER BY p.updated_at,p.id LIMIT $2`;
// Conversations with request events not yet handed to growth, read as the fan
// of each pair, so each pair is found once.
const NOTICES = `SELECT DISTINCT e.creator_id,e.fan_id FROM creator.commerce_event e
 JOIN creator.fan_profile f ON f.id=e.fan_id AND f.account_id=$1
 WHERE e.published_at IS NULL AND e.type=ANY($2::text[])
 ORDER BY e.creator_id,e.fan_id LIMIT $3`;
// A provider notification names a payment (its hold) or a refund.
const NOTIFIED = `SELECT p.id FROM creator.commerce_packet p
 JOIN creator.fan_profile f ON f.id=p.fan_id AND f.account_id=$1
 WHERE p.intent_ref=$2 OR EXISTS(SELECT 1 FROM creator.commerce_effect e
  WHERE e.packet_id=p.id AND e.operation='refund' AND e.provider_ref=$2)
 LIMIT 1`;

/**
 * The development host's commerce work index. There, the development identity
 * adapter is the whole account directory (a handful of synthetic accounts), so
 * the index issues each eligible account's own actor, from the adapter itself,
 * and finds that account's requests that need the system. A production host
 * issues scopes from its own identity adapter instead (lane 1).
 */
export class DevelopmentCommerceWorkIndex implements CommerceWorkIndex {
  private constructor(
    private readonly pool: Pool,
    private readonly actors: readonly Actor[],
    private readonly report: (line: string) => void,
  ) {}

  static async create(
    pool: Pool,
    identity: PantopusIdentityAdapter,
    report: (line: string) => void = (line) =>
      process.stderr.write(`${line}\n`),
  ) {
    invariant(
      identity.mode === "development" && identity.developmentActors?.length,
      "development_identity_required",
      "The development work index needs the development identity adapter.",
    );
    const actors: Actor[] = [];
    for (const { id } of identity.developmentActors)
      try {
        actors.push(await resolveActor(identity, `development:${id}`));
      } catch {
        // An account that is not adult-eligible can hold no money.
      }
    return new DevelopmentCommerceWorkIndex(pool, actors, report);
  }

  private async read<Row = { id: string }>(
    actor: Actor,
    text: string,
    values: unknown[],
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      await client.query("SELECT set_config('app.account_id',$1,true)", [
        actor.accountId,
      ]);
      const rows = (await client.query(text, values)).rows as Row[];
      await client.query("COMMIT");
      return rows;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async dueScopes(limit: number) {
    const scopes: CommerceWorkScope[] = [];
    for (const actor of this.actors) {
      if (scopes.length >= limit) break;
      for (const row of await this.read(actor, DUE, [
        actor.accountId,
        limit - scopes.length,
      ]))
        scopes.push({ actor, kind: "packet", packetId: row.id });
    }
    return scopes;
  }

  /** Conversations whose request events wait to be told, each with its fan's
   * own actor, who opens the conversation's scope. */
  async noticePairs(types: readonly string[], limit: number) {
    const pairs: { actor: Actor; creatorId: string; fanId: string }[] = [];
    for (const actor of this.actors) {
      if (pairs.length >= limit) break;
      for (const row of await this.read<{ creator_id: string; fan_id: string }>(
        actor,
        NOTICES,
        [actor.accountId, types, limit - pairs.length],
      ))
        pairs.push({ actor, creatorId: row.creator_id, fanId: row.fan_id });
    }
    return pairs;
  }

  /** The adult-eligible development account with this id, if there is one. */
  actorFor(accountId: string) {
    return this.actors.find((actor) => actor.accountId === accountId) ?? null;
  }

  /** Payments, their charges and refunds; nothing else happens on this host. */
  handles(type: string) {
    return /^(payment_intent|charge|refund)\./u.test(type);
  }

  async notificationScope(_type: string, reference: string) {
    for (const actor of this.actors) {
      const [row] = await this.read(actor, NOTIFIED, [
        actor.accountId,
        reference,
      ]);
      if (row) return { actor, kind: "packet" as const, packetId: row.id };
    }
    return null;
  }

  async unknownCase(scope: CommerceWorkScope, cause: string) {
    // No operations case producer exists on the development host yet; the
    // case is reported where an operator of the host sees it.
    this.report(
      JSON.stringify({
        event: "commerce_unknown_case",
        cause,
        kind: scope.kind ?? "packet",
        ...("packetId" in scope ? { packetId: scope.packetId } : {}),
      }),
    );
  }
}
