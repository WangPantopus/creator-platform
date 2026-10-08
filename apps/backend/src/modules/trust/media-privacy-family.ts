import type { PoolClient } from "pg";
import { z } from "zod";
import { invariant } from "../../core/errors.js";
import type { ConversationPrivacyFamily } from "../conversation/privacy.js";
import {
  restoredPrivacyTaskAuthorityInTransaction,
  type PrivacyTaskInput,
} from "./privacy-authority.js";

/** Media export consumes its own original0087 task. The0214 family function is
 * reserved for Conversation and must never be called with a Media lease or a
 * relabelled idempotency key. This read-only adapter issues no interactive scope
 * and is deliberately unavailable for deletion or provider work. */
export async function assertMediaPrivacyExportFamily(
  client: PoolClient,
  job: PrivacyTaskInput,
  family: ConversationPrivacyFamily,
  assertRestoredInTransaction?: (client: PoolClient) => Promise<void>,
): Promise<void> {
  invariant(
    job.kind === "export" &&
      job.idempotencyKey === `${job.jobId}:media` &&
      (!job.creatorId || job.creatorId === family.creatorId) &&
      (!job.threadId || job.threadId === family.threadId),
    "media_privacy_family_unavailable",
    "Use the original Media export task and its requested relationship.",
  );
  z.strictObject({
    threadId: z.uuid(),
    creatorId: z.uuid(),
    fanId: z.uuid(),
  }).parse(family);
  const owned = await restoredPrivacyTaskAuthorityInTransaction(
    client,
    job,
    assertRestoredInTransaction,
  );
  await client.query(
    "SELECT set_config('app.account_id',$1,true),set_config('app.creator_id','',true),set_config('app.fan_id','',true)",
    [job.accountId],
  );
  // Lock only the identity actually owned by this request. A creator's job
  // cannot assume a fan's account to obtain a row lock. Its immutable original
  // owned-creator set and the current matching creator profile authorize that
  // branch; the fan branch requires the requester's own actual fan profile.
  const identity = owned.includes(family.creatorId)
    ? await client.query(
        "SELECT id FROM creator.creator_profile WHERE id=$1 AND account_id=$2 FOR SHARE NOWAIT",
        [family.creatorId, job.accountId],
      )
    : await client.query(
        "SELECT id FROM creator.fan_profile WHERE id=$1 AND account_id=$2 FOR SHARE NOWAIT",
        [family.fanId, job.accountId],
      );
  invariant(
    identity.rowCount === 1,
    "media_privacy_family_unavailable",
    "This relationship does not belong to the original verified Media export.",
  );
  await client.query(
    "SELECT set_config('app.creator_id',$1,true),set_config('app.fan_id',$2,true)",
    [family.creatorId, family.fanId],
  );
  const thread = await client.query(
    "SELECT id FROM creator.thread WHERE id=$1 AND creator_id=$2 AND fan_id=$3 FOR SHARE NOWAIT",
    [family.threadId, family.creatorId, family.fanId],
  );
  invariant(
    thread.rowCount === 1,
    "media_privacy_family_unavailable",
    "The original Media export relationship is unavailable.",
  );
  // Keep the verified identity/thread locks and original deferred task fence
  // through Media's actual COMMIT. No caller-supplied account or actor is used.
  await restoredPrivacyTaskAuthorityInTransaction(
    client,
    job,
    assertRestoredInTransaction,
  );
}
