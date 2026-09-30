import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import type { ThanksPermission } from "../growth/retention.js";

type CurrentThanksTarget = (input: {
  creatorId: string;
  fanAccountId: string;
  targetKind: string;
  targetId: string;
}) => Promise<boolean>;
/** Internal consent check for W7. No private text is exposed by permission lookup. */
export function contentThanksPermission(
  worker: Pool,
  eligible: CurrentThanksTarget,
): ThanksPermission {
  return {
    async current(input) {
      const id = z.uuid().parse(input.id),
        version = z.int().positive().parse(input.version);
      const row = (
        await worker.query(
          "SELECT t.*,f.account_id FROM creator.content_thanks t JOIN creator.fan_profile f ON f.id=t.fan_id JOIN creator.creator_profile c ON c.id=t.creator_id WHERE t.id=$1 AND c.verification='verified' AND NOT c.recovery_required",
          [id],
        )
      ).rows[0];
      const current =
        row &&
        (await eligible({
          creatorId: row.creator_id,
          fanAccountId: row.account_id,
          targetKind: row.target_kind,
          targetId: row.target_id,
        }));
      return {
        valid: Boolean(
          current &&
            row &&
            row.version === version &&
            row.share_digest &&
            !row.withdrawn_at &&
            createHash("sha256").update(row.text).digest("hex") ===
              input.textHash,
        ),
        identityAllowed: Boolean(
          current &&
            row?.share_digest &&
            row.show_identity &&
            !row.withdrawn_at,
        ),
      };
    },
  };
}

/** W7 closed-window collector, one row per eligible target, with separate identity consent. */
export async function contentThanksWindow(
  worker: Pool,
  creatorId: string,
  from: Date,
  until: Date,
  eligible: CurrentThanksTarget,
) {
  z.uuid().parse(creatorId);
  const rows = (
    await worker.query(
      "SELECT t.*,f.account_id,f.handle FROM creator.content_thanks t JOIN creator.fan_profile f ON f.id=t.fan_id JOIN creator.creator_profile c ON c.id=t.creator_id WHERE c.verification='verified' AND NOT c.recovery_required AND t.creator_id=$1 AND t.created_at >= $2 AND t.created_at < $3 AND t.withdrawn_at IS NULL ORDER BY t.created_at,t.id LIMIT 1001",
      [creatorId, from, until],
    )
  ).rows;
  if (rows.length > 1000) throw new Error("thanks_window_requires_pagination");
  const current = [];
  for (const row of rows)
    if (
      await eligible({
        creatorId,
        fanAccountId: row.account_id,
        targetKind: row.target_kind,
        targetId: row.target_id,
      })
    )
      current.push(row);
  return {
    thanksCount: current.length,
    thanks: current
      .filter((row) => row.share_digest && row.text.length <= 500)
      .slice(0, 20)
      .map((row) => ({
        id: row.id,
        version: row.version,
        fanAccountId: row.account_id,
        text: row.text,
        displayName: row.show_identity ? row.handle : null,
        textConsent: true as const,
        identityConsent: row.show_identity,
      })),
  };
}
