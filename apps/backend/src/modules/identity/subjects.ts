import type { PoolClient } from "pg";
import { z } from "zod";
import type { SignedActCommand } from "@qelvora/api";
import type { Actor } from "./adapter.js";
import { contentHash } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import { assertCurrentSession, requestAuthority } from "./request-authority.js";
import { assertThreadScope, type ThreadScope } from "../access/scope.js";

export type SignedSubjectFinalization = Readonly<{
  phase: "challenge";
  challengeId: string;
}>;
export interface SignedSubjectPolicy {
  /** A namespaced domain registration, e.g. content or commerce. */
  name: string;
  prepare(
    client: PoolClient,
    actor: Actor,
    creatorId: string,
    requested: SignedActCommand,
    /** Process-issued on this held client; never accepted from request JSON. */
    threadScope?: ThreadScope,
  ): Promise<SignedActCommand | null>;
  /** Opt in when the owner requires a final source fence. Missing finalizers
   * are unavailable, rather than silently authorizing the new owner path. */
  requiresFinalization?: boolean;
  finalizeBeforeCommit?(
    client: PoolClient,
    actor: Actor,
    creatorId: string,
    canonical: SignedActCommand,
    finalization: SignedSubjectFinalization,
    threadScope?: ThreadScope,
  ): Promise<void>;
}
export async function prepareSignedSubject(
  client: PoolClient,
  actor: Actor,
  creatorId: string,
  requested: SignedActCommand,
  policies: readonly SignedSubjectPolicy[],
  threadScope?: ThreadScope,
) {
  if (threadScope) {
    assertThreadScope(threadScope);
    invariant(
      threadScope.actorAccountId === actor.accountId &&
        threadScope.creatorId === creatorId &&
        threadScope.authority === "creator",
      "creator_required",
      "Only the current creator can prepare this conversation act.",
    );
  }
  let canonical: SignedActCommand | null = null;
  let selected: SignedSubjectPolicy | undefined;
  for (const policy of policies) {
    const candidate = await policy.prepare(
      client,
      actor,
      creatorId,
      requested,
      threadScope,
    );
    if (candidate) {
      invariant(
        canonical === null,
        "signing_subject_ambiguous",
        "This signing subject has conflicting domain registrations.",
      );
      canonical = candidate;
      selected = policy;
    }
  }
  if (!canonical)
    throw new DomainError(
      "signing_subject_unavailable",
      "The feature has not registered authority for this signing subject.",
      503,
    );
  invariant(
    contentHash(canonical) === contentHash(requested),
    "signed_content_changed",
    "The content or consequences changed. Review the current exact act before signing.",
  );
  const command = canonical;
  const policy = selected!;
  const finalize = policy.finalizeBeforeCommit?.bind(policy);
  if (policy.requiresFinalization && !finalize)
    throw new DomainError(
      "signing_source_finalization_unconfigured",
      "Current signing source authority is unavailable.",
      503,
    );
  const exactHash = contentHash(command);
  const request = requestAuthority.getStore();
  const binding = finalize
    ? (
        await client.query<{ transaction: string; pid: number }>(
          "SELECT pg_current_xact_id()::text AS transaction,pg_backend_pid() AS pid",
        )
      ).rows[0]
    : undefined;
  let completed = false;
  return {
    command,
    /** The matching policy and actual client are closure-bound. The service
     * calls this after every challenge write; only COMMIT may follow. */
    finalizeBeforeCommit: async (finalization: SignedSubjectFinalization) => {
      invariant(
        !completed,
        "signing_source_finalized",
        "This signing source has already been finalized.",
      );
      completed = true;
      invariant(
        contentHash(command) === exactHash,
        "signed_content_changed",
        "The exact signing content changed.",
      );
      if (!finalize) return;
      const current = requestAuthority.getStore();
      invariant(
        request && request.accountId === actor.accountId && current === request,
        "signing_session_changed",
        "The original signing session ended or changed.",
      );
      const held = (
        await client.query<{
          transaction: string | null;
          pid: number;
          account: string;
          session: string;
          live: boolean;
          challenge: boolean;
        }>(
          `SELECT pg_current_xact_id_if_assigned()::text AS transaction,pg_backend_pid() AS pid,
           current_setting('app.account_id',true) AS account,current_setting('app.identity_session_id',true) AS session,
           EXISTS(SELECT FROM creator.identity_session WHERE id=$1 AND account_id=$2
            AND revoked_at IS NULL AND expires_at>clock_timestamp()) AS live,
           EXISTS(SELECT FROM creator.signed_challenge WHERE id=$3 AND account_id=$2 AND creator_id=$4
            AND act_type=$5 AND subject_id=$6 AND content_hash=$7 AND command=$8::jsonb
            AND used_at IS NULL AND expires_at>clock_timestamp()) AS challenge`,
          [
            request.sessionId,
            actor.accountId,
            z.uuid().parse(finalization.challengeId),
            creatorId,
            command.actType,
            command.subjectId,
            exactHash,
            JSON.stringify(command),
          ],
        )
      ).rows[0];
      invariant(
        held?.transaction === binding?.transaction &&
          held?.pid === binding?.pid &&
          held?.account === actor.accountId &&
          held?.session === request.sessionId &&
          held?.live === true &&
          held?.challenge === true &&
          finalization.phase === "challenge",
        "signing_source_transaction_changed",
        "The signing source transaction ended or changed.",
      );
      await finalize(
        client,
        actor,
        creatorId,
        command,
        finalization,
        threadScope,
      );
    },
  };
}
/** Domain consumers call in the same transaction as publication; no fake fan/thread is needed. */
export async function consumeCreatorSignedAct(
  client: PoolClient,
  actor: Actor,
  creatorId: string,
  signedActId: string,
  command: SignedActCommand,
) {
  await assertCurrentSession(client, actor.accountId);
  const hash = contentHash(command);
  const result = await client.query(
    `SELECT sa.id FROM creator.signed_act sa JOIN creator.passkey_credential pc ON pc.id=sa.credential_id AND pc.account_id=sa.account_id JOIN creator.creator_profile cp ON cp.id=sa.creator_id AND cp.account_id=sa.account_id WHERE sa.id=$1 AND sa.account_id=$2 AND sa.creator_id=$3 AND sa.act_type=$4 AND sa.subject_id=$5 AND sa.content_hash=$6 AND sa.verified_at>now()-interval '5 minutes' AND pc.revoked_at IS NULL AND cp.verification='verified' AND NOT cp.recovery_required FOR SHARE OF pc,cp`,
    [
      signedActId,
      actor.accountId,
      creatorId,
      command.actType,
      command.subjectId,
      hash,
    ],
  );
  invariant(
    actor.adultEligible && result.rowCount === 1,
    "signed_act_required",
    "Only the verified creator can publish this exact signed act.",
  );
  const consumed = await client.query(
    "INSERT INTO creator.signed_act_consumption(signed_act_id,account_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING signed_act_id",
    [signedActId, actor.accountId],
  );
  invariant(
    consumed.rowCount === 1,
    "signed_act_consumed",
    "This signature has already been used.",
  );
  await client.query(
    "INSERT INTO creator.signed_publication(signed_act_id,account_id,command) VALUES($1,$2,$3)",
    [signedActId, actor.accountId, JSON.stringify(command)],
  );
  await client.query(
    "INSERT INTO creator.signed_verification(id,account_id,creator_id,creator_name,act_type,content_hash,verified_at) SELECT sa.id,sa.account_id,sa.creator_id,cp.display_name,sa.act_type,sa.content_hash,sa.verified_at FROM creator.signed_act sa JOIN creator.creator_profile cp ON cp.id=sa.creator_id WHERE sa.id=$1",
    [signedActId],
  );
  return hash;
}
/** Public content is disclosed only by its owner after current audience/share-consent checks. */
export async function setSignatureVisibility(
  client: PoolClient,
  actor: Actor,
  id: string,
  publicContent: boolean,
  withdrawn = false,
) {
  const result = await client.query(
    "UPDATE creator.signed_publication SET public_content=$1,withdrawn_at=CASE WHEN $2 THEN now() ELSE NULL END WHERE signed_act_id=$3 AND account_id=$4 RETURNING command",
    [publicContent && !withdrawn, withdrawn, id, actor.accountId],
  );
  invariant(
    result.rows[0],
    "signed_act_unavailable",
    "This signed publication is unavailable.",
  );
  await client.query(
    "UPDATE creator.signed_verification SET public_command=$1,withdrawn=$2 WHERE id=$3 AND account_id=$4",
    [
      publicContent && !withdrawn ? result.rows[0].command : null,
      withdrawn,
      id,
      actor.accountId,
    ],
  );
}
