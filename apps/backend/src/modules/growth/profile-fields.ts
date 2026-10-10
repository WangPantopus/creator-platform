import { growthContracts } from "@qelvora/api";
import { copy } from "@qelvora/copy";
import type { Pool, PoolClient } from "pg";
import type { Actor } from "../identity/adapter.js";
import type { GrowthService } from "./service.js";
import { DomainError } from "../../core/errors.js";

export async function readCreatorProfileFields(
  db: Pick<Pool | PoolClient, "query">,
  creatorId: string,
) {
  const row = (
    await db.query(
      'SELECT version,biography,category,photo_caption AS "photoCaption" FROM growth.creator_profile_fields WHERE creator_id=$1',
      [creatorId],
    )
  ).rows[0];
  return growthContracts.CreatorProfileFieldsSchema.parse(
    row ?? {
      version: 0,
      biography: "",
      category: "",
      photoCaption: "",
    },
  );
}

/** The actor supplies words/version only; the real owner supplies creator ID.
 * Version zero creates, an identical immediate retry is safe, and competing
 * edits cannot silently overwrite one another. */
export class CreatorProfileFields {
  constructor(private readonly service: GrowthService) {}
  async read(actor: Actor) {
    const id = await this.service.requireCreator(actor);
    return this.service.db.actor(actor, id, (client) =>
      readCreatorProfileFields(client, id),
    );
  }
  async save(actor: Actor, input: unknown) {
    const value = growthContracts.CreatorProfileFieldsInputSchema.parse(input);
    const id = await this.service.requireCreator(actor);
    const result = await this.service.db.actor(actor, id, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`growth.profile:${id}`],
      );
      const old = await readCreatorProfileFields(client, id);
      if (
        old.version === value.version + 1 &&
        old.biography === value.biography &&
        old.category === value.category &&
        old.photoCaption === value.photoCaption
      )
        return old;
      if (old.version !== value.version)
        throw new DomainError(
          "profile_version_conflict",
          copy.w5ContentDuplicateChanged,
          409,
        );
      const saved = await client.query(
        `INSERT INTO growth.creator_profile_fields(creator_id,account_id,version,biography,category,photo_caption)
         VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(creator_id) DO UPDATE SET
         version=excluded.version,biography=excluded.biography,category=excluded.category,
         photo_caption=excluded.photo_caption,updated_at=now()
         RETURNING version,biography,category,photo_caption AS "photoCaption"`,
        [
          id,
          actor.accountId,
          value.version + 1,
          value.biography,
          value.category,
          value.photoCaption,
        ],
      );
      return growthContracts.CreatorProfileFieldsSchema.parse(saved.rows[0]);
    });
    // A committed edit remains repeat-safe if projection refresh is interrupted.
    await this.service.refreshCreator(id);
    return result;
  }
}
