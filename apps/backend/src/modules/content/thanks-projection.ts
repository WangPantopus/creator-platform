import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import type { ThanksPermission } from "../growth/retention.js";
import type { CurrentThanksTarget } from "./integration.js";
import { GrowthHeldClient } from "../growth/held-client.js";
type ThanksWindowRow = {
  id: string;
  version: number;
  target_kind: string;
  target_id: string;
  account_id: string;
  cursor_created_at: string;
  text: string | null;
  handle: string | null;
  show_identity: boolean;
};

async function currentTarget(
  eligible: CurrentThanksTarget,
  input: Parameters<CurrentThanksTarget>[0],
  signal?: AbortSignal,
) {
  if (!signal) return eligible(input);
  signal.throwIfAborted();
  let cancel: () => void = () => {};
  try {
    return await new Promise<boolean>((resolve, reject) => {
      cancel = () => reject(signal.reason);
      signal.addEventListener("abort", cancel, { once: true });
      signal.throwIfAborted();
      eligible(input).then(resolve, reject);
    });
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
/** Internal consent check for W7. No private text is exposed by permission lookup. */
export function contentThanksPermission(
  worker: Pool,
  eligible: CurrentThanksTarget,
): ThanksPermission {
  return {
    async current(input) {
      const id = z.uuid().parse(input.id),
        version = z.int().positive().parse(input.version);
      const read = async () =>
        (
          await worker.query(
            "SELECT t.*,f.account_id FROM creator.content_thanks t JOIN creator.fan_profile f ON f.id=t.fan_id JOIN creator.creator_profile c ON c.id=t.creator_id WHERE t.id=$1 AND c.verification='verified' AND NOT c.recovery_required",
            [id],
          )
        ).rows[0];
      const row = await read();
      const current =
        row &&
        (await eligible({
          creatorId: row.creator_id,
          fanAccountId: row.account_id,
          targetKind: row.target_kind,
          targetId: row.target_id,
        }));
      // The owner can await its current target authority. A consent withdrawal,
      // correction or removal during that read must not reuse the first row.
      const fresh = current === true ? await read() : null;
      const sameTarget = Boolean(
        row &&
          fresh &&
          fresh.creator_id === row.creator_id &&
          fresh.account_id === row.account_id &&
          fresh.fan_id === row.fan_id &&
          fresh.target_kind === row.target_kind &&
          fresh.target_id === row.target_id,
      );
      const valid = Boolean(
        sameTarget &&
          fresh.version === version &&
          fresh.share_digest === true &&
          !fresh.withdrawn_at &&
          typeof fresh.text === "string" &&
          createHash("sha256").update(fresh.text).digest("hex") ===
            input.textHash,
      );
      return {
        valid,
        identityAllowed: valid && fresh.show_identity === true,
      };
    },
  };
}

/** Closed-window snapshot, bounded pages and quotes, with current target eligibility. */
export async function contentThanksWindow(
  worker: Pool,
  creatorId: string,
  from: Date,
  until: Date,
  eligible: CurrentThanksTarget,
  signal?: AbortSignal,
) {
  z.uuid().parse(creatorId);
  if (
    !Number.isFinite(from.valueOf()) ||
    !Number.isFinite(until.valueOf()) ||
    from >= until ||
    until.valueOf() > Date.now()
  )
    throw new Error("thanks_window_not_closed");
  signal?.throwIfAborted();
  const client = await worker.connect();
  const held = new GrowthHeldClient(client, signal);
  let failure: unknown;
  let result: {
    thanksCount: number;
    thanks: Array<{
      id: string;
      version: number;
      fanAccountId: string;
      text: string;
      displayName: string | null;
      textConsent: true;
      identityConsent: boolean;
    }>;
  };
  try {
    await held.begin("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout = '30s'");
    let cursor: { createdAt: string; id: string } | null = null;
    let thanksCount = 0;
    const thanks: Array<{
      id: string;
      version: number;
      fanAccountId: string;
      text: string;
      displayName: string | null;
      textConsent: true;
      identityConsent: boolean;
    }> = [];
    for (;;) {
      signal?.throwIfAborted();
      const rows: ThanksWindowRow[] = (
        await client.query<ThanksWindowRow>(
          `SELECT t.id,t.version,t.target_kind,t.target_id,f.account_id,
            to_char(t.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at,
            CASE WHEN $6 AND t.share_digest AND length(t.text)<=500 THEN t.text ELSE NULL END AS text,
            CASE WHEN $6 AND t.share_digest AND t.show_identity THEN f.handle ELSE NULL END AS handle,
            t.show_identity
          FROM creator.content_thanks t
          JOIN creator.fan_profile f ON f.id=t.fan_id
          JOIN creator.creator_profile c ON c.id=t.creator_id
          WHERE c.verification='verified' AND NOT c.recovery_required
            AND t.creator_id=$1 AND t.created_at >= $2 AND t.created_at < $3
            AND t.withdrawn_at IS NULL
            AND ($4::timestamptz IS NULL OR (t.created_at,t.id)>($4::timestamptz,$5::uuid))
          ORDER BY t.created_at,t.id LIMIT 250`,
          [
            creatorId,
            from,
            until,
            cursor?.createdAt ?? null,
            cursor?.id ?? null,
            thanks.length < 20,
          ],
        )
      ).rows;
      for (const row of rows) {
        signal?.throwIfAborted();
        const current = await currentTarget(
          eligible,
          {
            creatorId,
            fanAccountId: row.account_id,
            targetKind: row.target_kind,
            targetId: row.target_id,
            signal,
          },
          signal,
        );
        signal?.throwIfAborted();
        if (!current) continue;
        if (thanksCount === Number.MAX_SAFE_INTEGER)
          throw new Error("thanks_count_overflow");
        thanksCount++;
        if (
          thanks.length < 20 &&
          typeof row.text === "string" &&
          row.text.length <= 500
        )
          thanks.push({
            id: row.id,
            version: row.version,
            fanAccountId: row.account_id,
            text: row.text,
            displayName: row.handle,
            textConsent: true,
            identityConsent: row.show_identity,
          });
      }
      if (rows.length < 250) break;
      const last = rows.at(-1)!;
      const next: { createdAt: string; id: string } = {
        createdAt: last.cursor_created_at,
        id: last.id,
      };
      if (
        cursor &&
        cursor.createdAt === next.createdAt &&
        cursor.id === next.id
      )
        throw new Error("thanks_cursor_not_advancing");
      cursor = next;
    }
    signal?.throwIfAborted();
    await held.commit();
    signal?.throwIfAborted();
    result = { thanksCount, thanks };
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    // Retain this original snapshot until physical shutdown settles, including
    // success. No completion can escape a failed COMMIT or transport cleanup.
    await held.close({ destroy: true, failure });
  }
  signal?.throwIfAborted();
  return result;
}
