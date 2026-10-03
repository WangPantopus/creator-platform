import type { PoolClient } from "pg";
import { z } from "zod";
import { contentHash } from "../../core/canonical.js";
import { DomainError } from "../../core/errors.js";
import {
  isConfiguredBackendRuntime,
  type BackendRuntime,
} from "../../integration.js";
import {
  holdCurrentRequestSession,
  assertHeldCurrentRequestSession,
  requestAuthority,
} from "../identity/request-authority.js";
import { assertReplyReviewCatalog } from "./reply-review-catalog.js";

/** Transport ceiling, not paid-tenure permission. W5 retains its current4000
 * limit until its actual policy/schema and mounted reviewer support expansion. */
export const TRUST_REPLY_REVIEW_MAX_TEXT_LENGTH = 12_000;

const Reply = z.strictObject({
  replyId: z.uuid(),
  creatorId: z.uuid(),
  fanId: z.uuid(),
  version: z.number().int().positive(),
  text: z.string().min(1).max(TRUST_REPLY_REVIEW_MAX_TEXT_LENGTH),
  textHash: z.string().regex(/^[0-9a-f]{64}$/u),
});
const Review = z.strictObject({
  state: z.enum(["pending", "allowed", "flagged"]),
  reference: z.string().min(1).max(200),
  textHash: z.string().regex(/^[0-9a-f]{64}$/u),
});

/** Exact current author on W5's held transaction, after the source INSERT.
 * SQL creates an atomic idempotent queue item; only a recorded human decision
 * can produce allowed/flagged. No extra pool, snapshot copy or ThreadScope. */
/** Call after the genuine host graph is configured. Readiness grants no fan or
 * case permission; every actual callback still validates its original request. */
export async function prepareTrustReplyReviewer(runtime: BackendRuntime) {
  if (!isConfiguredBackendRuntime(runtime))
    throw new DomainError(
      "reply_review_unavailable",
      "Reply review is unavailable.",
      503,
    );
  if (
    !runtime.assertRestoredInTransaction ||
    !runtime.assertContentAllowedInTransaction
  )
    return undefined;
  const ports = Object.freeze({
    restored: runtime.assertRestoredInTransaction,
    denied: runtime.assertContentAllowedInTransaction,
  });
  const client = await runtime.pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await ports.restored(client);
    await assertReplyReviewCatalog(client);
    const database = (
      await client.query<{ database: string }>(
        "SELECT current_database() AS database",
      )
    ).rows[0]!.database;
    return reviewer(runtime, database, ports);
  } catch (error) {
    if (error instanceof DomainError && error.status === 503) return undefined;
    throw error;
  } finally {
    let discard = false;
    try {
      await client.query("ROLLBACK");
    } catch {
      discard = true;
    } finally {
      client.release(discard);
    }
  }
}

/** The old name retains the same prepared, asynchronous contract. */
export const createTrustReplyReviewer = prepareTrustReplyReviewer;

function reviewer(
  runtime: BackendRuntime,
  database: string,
  ports: Readonly<{
    restored: NonNullable<BackendRuntime["assertRestoredInTransaction"]>;
    denied: NonNullable<BackendRuntime["assertContentAllowedInTransaction"]>;
  }>,
) {
  const reviewReply = async (
    client: PoolClient,
    raw: z.infer<typeof Reply>,
  ) => {
    const input = Reply.parse(raw);
    const { textHash, ...tuple } = input;
    if (contentHash(tuple) !== textHash)
      throw new DomainError(
        "reply_review_changed",
        "The exact reply version and text are required.",
        409,
      );
    const authority = requestAuthority.getStore();
    if (!authority)
      throw new DomainError(
        "reply_session_required",
        "Sign in again before sending this reply.",
        401,
      );
    const current = (
      await client.query<{ account_id: string | null }>(
        "SELECT nullif(current_setting('app.account_id',true),'')::uuid AS account_id",
      )
    ).rows[0]?.account_id;
    if (current !== authority.accountId)
      throw new DomainError(
        "reply_author_changed",
        "The signed-in reply author changed.",
        403,
      );
    if (!isConfiguredBackendRuntime(runtime))
      throw new DomainError(
        "reply_review_unavailable",
        "Reply review is unavailable.",
        503,
      );
    const currentDatabase = (
      await client.query<{ database: string }>(
        "SELECT current_database() AS database",
      )
    ).rows[0]?.database;
    if (currentDatabase !== database)
      throw new DomainError(
        "reply_review_unavailable",
        "Use this reply's configured data service.",
        503,
      );
    await ports.restored(client);
    const held = await holdCurrentRequestSession(client, authority.accountId);
    await ports.denied(client, held.actor, input.creatorId);
    await assertReplyReviewCatalog(client);
    await client.query("SELECT set_config('trust.reply_session_id',$1,true)", [
      authority.sessionId,
    ]);
    try {
      const result = (
        await client.query<{ review: unknown }>(
          "SELECT creator_trust.review_note_reply($1,$2,$3,$4,$5) AS review",
          [
            input.replyId,
            input.creatorId,
            input.fanId,
            input.version,
            textHash,
          ],
        )
      ).rows[0]?.review;
      const review = Review.parse(result);
      if (review.textHash !== textHash)
        throw new DomainError(
          "reply_review_changed",
          "This review belongs to a different reply version.",
          409,
        );
      await assertHeldCurrentRequestSession(held, client);
      if (!isConfiguredBackendRuntime(runtime))
        throw new DomainError(
          "reply_review_unavailable",
          "Reply review is unavailable.",
          503,
        );
      await ports.restored(client);
      await ports.denied(client, held.actor, input.creatorId);
      await assertReplyReviewCatalog(client);
      await client.query("SELECT set_config('trust.reply_session_id','',true)");
      return review;
    } catch (error) {
      throw trustReplyError(error);
    }
  };
  return Object.freeze(
    Object.assign(reviewReply, {
      maxTextLength: TRUST_REPLY_REVIEW_MAX_TEXT_LENGTH,
    }),
  );
}

/** Preserve actual negative authority across W5's unavailable-review fallback. */
export function trustReplyError(error: unknown) {
  if (error instanceof DomainError) return error;
  const code = (error as { code?: string } | null)?.code;
  const status = { PT401: 401, PT403: 403, PT409: 409, PT410: 410 }[
    code as "PT401" | "PT403" | "PT409" | "PT410"
  ];
  return new DomainError(
    status === 410 ? "reply_withdrawn" : "reply_review_unavailable",
    status === 401
      ? "Sign in again before reviewing this reply."
      : status === 403
        ? "This account cannot access or deliver this reply."
        : status === 410
          ? "This reply was withdrawn."
          : status === 409
            ? "This reply changed. Refresh before reviewing it."
            : "The reply review connection is unavailable. The reply stays pending.",
    status ?? 503,
  );
}
