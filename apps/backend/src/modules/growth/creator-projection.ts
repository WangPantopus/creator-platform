import type { Pool } from "pg";
import { z } from "zod";
import type { PublicCreator } from "./contracts.js";

export type CurrentCreatorProjection = Omit<
  PublicCreator,
  "version" | "updatedAt"
>;
/** W2 supplies only current, licensed public metadata through its canonical
 * purpose-authorized reader. Directory IDs never issue private owner scopes. */
export interface PublicCreatorAIProjection {
  current(id: string): Promise<{
    state: PublicCreator["state"];
    mode: PublicCreator["mode"];
    topics: string[];
    sourceSummary: string;
  } | null>;
}
export interface CreatorProjectionSource {
  publicAIConfigured?: boolean;
  page(after: string | null, limit: number): Promise<string[]>;
  resolve(handle: string): Promise<string | null>;
  current(id: string): Promise<CurrentCreatorProjection | null>;
}
const PublicAI = z.strictObject({
  state: z.enum(["published", "paused", "unpublished", "revoked"]),
  mode: z.enum(["expert", "companion", "expert_and_companion"]),
  topics: z.array(z.string().max(80)).max(30),
  sourceSummary: z.string().max(200),
});

/** Public W1 identity plus W2's authoritative public state. No direct private
 * AI-table read, fabricated actor, draft, interview or license inference. */
export function canonicalCreatorProjections(
  pool: Pool,
  publicAI?: PublicCreatorAIProjection,
): CreatorProjectionSource {
  return {
    publicAIConfigured: Boolean(publicAI),
    async page(after, limit) {
      const rows = await pool.query<{ id: string }>(
        "SELECT id FROM creator.creator_profile WHERE ($1::uuid IS NULL OR id>$1) ORDER BY id LIMIT $2",
        [
          after === null ? null : z.uuid().parse(after),
          z.int().min(1).max(100).parse(limit),
        ],
      );
      return rows.rows.map((row) => row.id);
    },
    async resolve(handle) {
      const row = (
        await pool.query<{ id: string }>(
          "SELECT id FROM creator.creator_profile WHERE handle=$1",
          [
            z
              .string()
              .regex(/^[a-z0-9_]{3,30}$/u)
              .parse(handle),
          ],
        )
      ).rows[0];
      return row?.id ?? null;
    },
    async current(id) {
      z.uuid().parse(id);
      const identity = () =>
        pool.query<{
          handle: string;
          name: string;
          verification: string;
          recovery_required: boolean;
        }>(
          "SELECT handle,display_name AS name,verification,recovery_required FROM creator.creator_profile WHERE id=$1",
          [id],
        );
      let creator = (await identity()).rows[0];
      if (!creator) return null;
      const verified =
        creator.verification === "verified" && !creator.recovery_required;
      const canonical =
        verified && publicAI ? await publicAI.current(id) : null;
      // The licensed reader may await its owner's policy. Re-read public
      // identity afterward so a completed revocation/recovery or handle edit
      // is not replaced by the earlier directory snapshot.
      if (verified && publicAI) creator = (await identity()).rows[0];
      if (!creator) return null;
      const currentVerified =
        creator.verification === "verified" && !creator.recovery_required;
      const ai =
        canonical && currentVerified ? PublicAI.parse(canonical) : null;
      return {
        id,
        handle: creator.handle,
        name: creator.name,
        verified: currentVerified,
        state:
          creator.verification === "revoked"
            ? "revoked"
            : !currentVerified || !ai
              ? "unpublished"
              : ai.state,
        mode: ai?.mode ?? "expert",
        topics:
          ai && ["published", "paused"].includes(ai.state) ? ai.topics : [],
        sourceSummary:
          ai && ["published", "paused"].includes(ai.state)
            ? ai.sourceSummary
            : "",
        biography: "",
        category: "",
        reliability: "",
        capacity: "",
        presence: "",
        photoCaption: "",
        membershipLabel: null,
        accessLines: [],
      };
    },
  };
}
