import { createHmac } from "node:crypto";
import type { PoolClient } from "pg";
import type { GrowthEvent } from "./contracts.js";

/** Worker-only pseudonymous fences stop delayed owner events from recreating erased records. */
export class GrowthErasure {
  constructor(private readonly secret: Buffer) {}
  private key(kind: "account" | "creator", id: string) {
    return createHmac("sha256", this.secret)
      .update(`growth.erasure:${kind}:${id}`)
      .digest("hex");
  }
  private async lock(client: PoolClient, keys: readonly string[]) {
    for (const key of [...new Set(keys)].sort()) {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`growth.erasure:${key}`],
      );
    }
  }
  /** Acquire before BEGIN so a repeatable-read snapshot cannot predate an
   * erasure that held the same fence. The caller MUST destroy this dedicated
   * connection on completion/cancellation; never return session locks to a pool. */
  async lockExportSnapshot(
    client: PoolClient,
    accountId: string,
    creatorIds: readonly string[],
  ) {
    const keys = [
      this.key("account", accountId),
      ...creatorIds.map((id) => this.key("creator", id)),
    ];
    for (const key of [...new Set(keys)].sort())
      await client.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [
        `growth.erasure:${key}`,
      ]);
  }
  async mark(
    client: PoolClient,
    accountId: string,
    creatorIds: readonly string[],
  ) {
    const keys = [
      this.key("account", accountId),
      ...creatorIds.map((id) => this.key("creator", id)),
    ];
    await this.lock(client, keys);
    await client.query(
      "INSERT INTO growth.erasure_fence(subject_key) SELECT unnest($1::text[]) ON CONFLICT DO NOTHING",
      [keys],
    );
  }
  async creator(client: PoolClient, creatorId: string) {
    const key = this.key("creator", creatorId);
    await this.lock(client, [key]);
    return !(
      await client.query(
        "SELECT 1 FROM growth.erasure_fence WHERE subject_key=$1",
        [key],
      )
    ).rowCount;
  }
  async subjects(
    client: PoolClient,
    accountIds: readonly string[],
    creatorIds: readonly string[] = [],
  ) {
    const keys = [
      ...accountIds.map((id) => this.key("account", id)),
      ...creatorIds.map((id) => this.key("creator", id)),
    ];
    await this.lock(client, keys);
    return !(
      await client.query(
        "SELECT 1 FROM growth.erasure_fence WHERE subject_key=ANY($1::text[]) LIMIT 1",
        [keys],
      )
    ).rowCount;
  }
  /** Negative fences only. Device transfer may remove an erased account's
   * old registration, but must never recreate any of its data. */
  async lockSubjects(client: PoolClient, accountIds: readonly string[]) {
    await this.lock(
      client,
      accountIds.map((id) => this.key("account", id)),
    );
  }
  /** Routing collisions only acquire negative fences. An erased former
   * handle holder must not grant or deny a different creator's authority. */
  async lockCreatorSubjects(client: PoolClient, creatorIds: readonly string[]) {
    await this.lock(
      client,
      creatorIds.map((id) => this.key("creator", id)),
    );
  }
  async event(
    client: PoolClient,
    event: GrowthEvent,
  ): Promise<GrowthEvent | null> {
    const creator = this.key("creator", event.creatorId);
    const accounts = event.recipients.map((r) =>
      this.key("account", r.accountId),
    );
    await this.lock(client, [creator, ...accounts]);
    const erased = new Set(
      (
        await client.query(
          "SELECT subject_key FROM growth.erasure_fence WHERE subject_key=ANY($1::text[])",
          [[creator, ...accounts]],
        )
      ).rows.map((row) => row.subject_key),
    );
    if (erased.has(creator)) return null;
    const recipients = event.recipients.filter(
      (_, index) => !erased.has(accounts[index]),
    );
    return recipients.length ? { ...event, recipients } : null;
  }
  async lockEvents(client: PoolClient, events: readonly GrowthEvent[]) {
    await this.lock(
      client,
      events.flatMap((event) => [
        this.key("creator", event.creatorId),
        ...event.recipients.map((r) => this.key("account", r.accountId)),
      ]),
    );
  }
}
