import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import type { PrivacyHook } from "../trust/contracts.js";
import { invariant } from "../../core/errors.js";
type Retained = NonNullable<
  Awaited<ReturnType<PrivacyHook["run"]>>["retained"]
>;

/** Worker-only hook. The connection must be purpose-scoped by W8; never mount as HTTP. */
export function contentPrivacyHook(
  worker: Pool,
  retention?: (input: Parameters<PrivacyHook["run"]>[0]) => Promise<Retained>,
  revokeSources?: (
    client: PoolClient,
    creatorContentIds: string[],
  ) => Promise<void>,
): PrivacyHook {
  return {
    domain: "content",
    async run(input) {
      const client = await worker.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [`content.privacy:${input.jobId}`],
        );
        const job = (
          await client.query(
            "SELECT * FROM creator_trust.privacy_job WHERE id=$1 AND account_id=$2 AND kind=$3 AND scope=$4 AND creator_id IS NOT DISTINCT FROM $5::uuid AND thread_id IS NOT DISTINCT FROM $6::uuid AND verification_ref<>'' FOR SHARE",
            [
              input.jobId,
              input.accountId,
              input.kind,
              input.scope,
              input.creatorId,
              input.threadId,
            ],
          )
        ).rows[0];
        invariant(
          job && job.verified_at && job.state !== "dead_letter",
          "privacy_job_unverified",
          "A current verified privacy job with the exact scope is required.",
        );
        const owned =
          input.scope === "account"
            ? z.array(z.uuid()).max(100).parse(job.owned_creator_ids)
            : [];
        invariant(
          input.scope !== "account" || job.ownership_ref,
          "privacy_ownership_missing",
          "The immutable owned-creator snapshot is required; absence does not mean no ownership.",
        );
        const scope = [
          input.accountId,
          input.creatorId,
          owned,
          input.scope === "thread" ? input.threadId : null,
        ];
        const replies = (
          await client.query(
            "SELECT r.id,r.content_id,r.creator_id,r.text,r.created_at,p.share_text,p.show_handle,p.version AS permission_version FROM creator.content_reply r JOIN creator.fan_profile f ON f.id=r.fan_id LEFT JOIN creator.content_quote_permission p ON p.reply_id=r.id WHERE f.account_id=$1 AND ($2::uuid IS NULL OR r.creator_id=$2) AND $3::uuid IS NULL ORDER BY r.id LIMIT 1001",
            [scope[0], scope[1], scope[3]],
          )
        ).rows;
        const thanks = (
          await client.query(
            "SELECT t.* FROM creator.content_thanks t JOIN creator.fan_profile f ON f.id=t.fan_id WHERE f.account_id=$1 AND ($2::uuid IS NULL OR t.creator_id=$2) AND ($3::uuid IS NULL OR t.thread_id=$3) ORDER BY t.id LIMIT 1001",
            [scope[0], scope[1], scope[3]],
          )
        ).rows;
        const revisions = (
          await client.query(
            "SELECT r.content_id,r.creator_id,r.version,r.document,r.created_at,i.state,i.version AS current_version,NOT EXISTS(SELECT 1 FROM creator.content_revision other WHERE other.content_id=r.content_id AND other.author_account_id<>$1) AS solely_authored FROM creator.content_revision r JOIN creator.content_index i ON i.id=r.content_id WHERE $4::uuid IS NULL AND ($2::uuid IS NULL OR r.creator_id=$2) AND (r.author_account_id=$1 OR r.creator_id=ANY($3::uuid[])) ORDER BY r.content_id,r.version LIMIT 1001",
            scope,
          )
        ).rows;
        const drafts = (
          await client.query(
            "SELECT d.* FROM creator.studio_reply_draft d JOIN creator.fan_profile f ON f.id=d.fan_id WHERE (d.account_id=$1 OR f.account_id=$1 OR d.creator_id=ANY($3::uuid[])) AND ($2::uuid IS NULL OR d.creator_id=$2) AND ($4::uuid IS NULL OR d.thread_id=$4) ORDER BY d.creator_id,d.fan_id,d.account_id LIMIT 1001",
            scope,
          )
        ).rows;
        const consents = (
          await client.query(
            "SELECT h.* FROM creator.content_consent_history h WHERE h.account_id=$1 AND ($2::uuid IS NULL OR h.creator_id=$2) AND ($3::uuid IS NULL OR h.subject_id IN(SELECT id FROM creator.content_thanks WHERE thread_id=$3)) ORDER BY h.id LIMIT 1001",
            [scope[0], scope[1], scope[3]],
          )
        ).rows;
        const preferences = (
          await client.query(
            "SELECT creator_id,muted FROM creator.content_preference WHERE account_id=$1 AND ($2::uuid IS NULL OR creator_id=$2) AND $3::uuid IS NULL ORDER BY creator_id LIMIT 1001",
            [scope[0], scope[1], scope[3]],
          )
        ).rows;
        const replyReads = (
          await client.query(
            "SELECT * FROM creator.content_reply_read WHERE account_id=$1 AND ($2::uuid IS NULL OR creator_id=$2) AND $3::uuid IS NULL ORDER BY reply_id LIMIT 1001",
            [scope[0], scope[1], scope[3]],
          )
        ).rows;
        const replyReviews = (
          await client.query(
            "SELECT m.* FROM creator.content_reply_review m JOIN creator.fan_profile f ON f.id=m.fan_id WHERE f.account_id=$1 AND ($2::uuid IS NULL OR m.creator_id=$2) AND $3::uuid IS NULL ORDER BY m.reply_id LIMIT 1001",
            [scope[0], scope[1], scope[3]],
          )
        ).rows;
        invariant(
          replyReads.length <= 1000 &&
            replyReviews.length <= 1000 &&
            replies.length <= 1000 &&
            thanks.length <= 1000 &&
            revisions.length <= 1000 &&
            drafts.length <= 1000 &&
            consents.length <= 1000 &&
            preferences.length <= 1000,
          "privacy_scope_large",
          "This job exceeds the bounded content operation. Split the scope; no truncated acknowledgement was issued.",
        );
        if (input.kind === "export") {
          await client.query("COMMIT");
          return {
            receipt: {
              domain: "content",
              jobId: input.jobId,
              replies: replies.length,
              thanks: thanks.length,
              revisions: revisions.length,
              complete: true,
            },
            data: {
              replies,
              thanks,
              revisions,
              drafts,
              consents,
              preferences,
              replyReads,
              replyReviews,
            },
          };
        }
        const prior = (
          await client.query(
            "SELECT receipt FROM creator.content_privacy_receipt WHERE job_id=$1 AND idempotency_key=$2",
            [input.jobId, input.idempotencyKey],
          )
        ).rows[0];
        if (prior) {
          await client.query("COMMIT");
          return prior.receipt;
        }
        const retained =
          revisions.length || replies.length || consents.length || drafts.length
            ? await retention?.(input)
            : [];
        invariant(
          retained,
          "content_retention_unconfigured",
          "W8 must supply the retention decision for signature proof and relationship metadata before deletion.",
        );
        if (input.scope === "account")
          await client.query(
            "INSERT INTO creator.content_tombstone(account_id,job_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
            [input.accountId, input.jobId],
          );
        invariant(
          !consents.length ||
            retained.some((item) => item.category === "consent_audit_metadata"),
          "consent_retention_unconfigured",
          "The scoped retention decision must cover immutable consent audit metadata.",
        );
        invariant(
          (!replies.length && !revisions.length) ||
            retained.some((item) => item.category === "signature_proof"),
          "signature_retention_unconfigured",
          "The scoped retention decision must cover immutable signature proof retained by identity.",
        );
        const quoted = (
          await client.query<{ id: string }>(
            "SELECT id FROM creator.content_index WHERE quote_reply_id=ANY($1::uuid[]) ORDER BY id",
            [replies.map((row) => row.id)],
          )
        ).rows;
        for (const id of [
          ...new Set([
            ...revisions.map((row) => row.content_id as string),
            ...quoted.map((row) => row.id),
          ]),
        ].sort())
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            [`content:${id}`],
          );
        for (const id of replies.map((row) => row.id as string).sort())
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            [`content.quote:${id}`],
          );
        for (const draft of drafts)
          await client.query(
            "DELETE FROM creator.studio_reply_draft WHERE creator_id=$1 AND fan_id=$2 AND account_id=$3",
            [draft.creator_id, draft.fan_id, draft.account_id],
          );
        await client.query(
          "DELETE FROM creator.content_reply_read WHERE account_id=$1 AND ($2::uuid IS NULL OR creator_id=$2) AND $3::uuid IS NULL",
          [scope[0], scope[1], scope[3]],
        );
        const replyIds = replies.map((row) => row.id);
        await client.query(
          "DELETE FROM creator.content_fan_effect WHERE subject_id=ANY($1::uuid[]) OR creator_id=ANY($2::uuid[]) OR (account_id=$3 AND $4::uuid IS NULL AND ($5::uuid IS NULL OR creator_id=$5))",
          [
            [...replyIds, ...thanks.map((row) => row.id)],
            owned,
            input.accountId,
            scope[3],
            input.creatorId,
          ],
        );
        await client.query(
          "UPDATE creator.content_publication SET quoted_text=NULL,quoted_handle=NULL WHERE content_id IN(SELECT id FROM creator.content_index WHERE quote_reply_id=ANY($1::uuid[]))",
          [replyIds],
        );
        await client.query(
          "DELETE FROM creator.content_reaction WHERE reply_id=ANY($1::uuid[])",
          [replyIds],
        );
        await client.query(
          "DELETE FROM creator.content_quote_permission WHERE reply_id=ANY($1::uuid[])",
          [replyIds],
        );
        await client.query(
          "DELETE FROM creator.content_reply WHERE id=ANY($1::uuid[])",
          [replyIds],
        );
        await client.query(
          "DELETE FROM creator.content_thanks WHERE id=ANY($1::uuid[])",
          [thanks.map((row) => row.id)],
        );
        await client.query(
          "DELETE FROM creator.content_preference WHERE account_id=$1 AND ($2::uuid IS NULL OR creator_id=$2) AND $3::uuid IS NULL",
          [scope[0], scope[1], scope[3]],
        );
        const contentIds = [
          ...new Set(
            revisions
              .filter(
                (row) =>
                  owned.includes(row.creator_id) ||
                  (row.solely_authored &&
                    row.state === "draft" &&
                    row.version === row.current_version),
              )
              .map((row) => row.content_id),
          ),
        ];
        invariant(
          !revisions.some((row) => !contentIds.includes(row.content_id)) ||
            retained.some(
              (item) => item.category === "creator_owned_publications",
            ),
          "publication_retention_unconfigured",
          "The scoped decision must explicitly cover team-authored publications owned by another creator.",
        );
        invariant(
          !contentIds.length || revokeSources,
          "privacy_source_revocation_unconfigured",
          "The current source owner must revoke affected revisions before content deletion can acknowledge completion.",
        );
        if (contentIds.length) await revokeSources!(client, contentIds);
        await client.query(
          "UPDATE creator.content_publication SET quoted_text=NULL,quoted_handle=NULL WHERE content_id IN(SELECT id FROM creator.content_index WHERE quote_reply_id IN(SELECT id FROM creator.content_reply WHERE content_id=ANY($1::uuid[])))",
          [contentIds],
        );
        await client.query(
          "DELETE FROM creator.content_reaction WHERE reply_id IN(SELECT id FROM creator.content_reply WHERE content_id=ANY($1::uuid[]))",
          [contentIds],
        );
        await client.query(
          "DELETE FROM creator.content_quote_permission WHERE reply_id IN(SELECT id FROM creator.content_reply WHERE content_id=ANY($1::uuid[]))",
          [contentIds],
        );
        await client.query(
          "DELETE FROM creator.content_reply WHERE content_id=ANY($1::uuid[])",
          [contentIds],
        );
        await client.query(
          "DELETE FROM creator.content_thanks WHERE target_kind='content' AND target_id=ANY($1::uuid[])",
          [contentIds],
        );
        await client.query(
          "UPDATE creator.content_index SET state='archived',withdrawn_at=now(),scheduled_at=NULL WHERE id=ANY($1::uuid[])",
          [contentIds],
        );
        await client.query(
          "DELETE FROM creator.content_publication WHERE content_id=ANY($1::uuid[])",
          [contentIds],
        );
        await client.query(
          "DELETE FROM creator.content_revision WHERE content_id=ANY($1::uuid[])",
          [contentIds],
        );
        await client.query(
          "UPDATE creator.content_effect SET state='blocked',last_error='privacy_deleted',lease_until=NULL,next_at='infinity' WHERE content_id=ANY($1::uuid[])",
          [contentIds],
        );
        const result = {
          receipt: {
            domain: "content",
            jobId: input.jobId,
            deletedReplies: replies.length,
            deletedThanks: thanks.length,
            purgedContent: contentIds.length,
            deletedDrafts: drafts.length,
            complete: true,
          },
          retained,
        };
        await client.query(
          "INSERT INTO creator.content_privacy_receipt(job_id,idempotency_key,receipt) VALUES($1,$2,$3)",
          [input.jobId, input.idempotencyKey, result],
        );
        await client.query("COMMIT");
        return result;
      } catch (failure) {
        await client.query("ROLLBACK");
        throw failure;
      } finally {
        client.release();
      }
    },
  };
}
