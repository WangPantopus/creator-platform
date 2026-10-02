import { randomBytes } from "node:crypto";
import {
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import type { Pool, PoolClient } from "pg";
import { HumanReplySchema, type SignedActCommand } from "@qelvora/api";
import { contentHash } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import type { Actor } from "./adapter.js";
import type { AccessService, ThreadScope } from "../access/scope.js";
import { identityTransaction } from "./transaction.js";
import {
  prepareSignedSubject,
  consumeCreatorSignedAct,
  type SignedSubjectPolicy,
} from "./subjects.js";

export interface AssertionVerifier {
  verify(input: {
    response: AuthenticationResponseJSON;
    expectedChallenge: string;
    expectedOrigin: string | string[];
    expectedRPID: string;
    credential: {
      id: string;
      publicKey: Uint8Array<ArrayBuffer>;
      counter: number;
    };
    requireUserVerification: true;
  }): Promise<{
    verified: boolean;
    authenticationInfo: { newCounter: number };
  }>;
}
// The production verifier checks signature, RP ID, origin, challenge and the UV flag.
const webAuthnVerifier: AssertionVerifier = {
  verify: (input) => verifyAuthenticationResponse(input),
};

export class SignedActService {
  constructor(
    private readonly pool: Pool,
    private readonly rpId: string,
    private readonly origin: string | string[],
    private readonly verifier: AssertionVerifier = webAuthnVerifier,
    private readonly subjectPolicies: readonly SignedSubjectPolicy[] = [],
  ) {}
  async beginSubject(
    actor: Actor,
    creatorId: string,
    requested: SignedActCommand,
  ) {
    return this.accountTransaction(actor.accountId, async (client) => {
      const prepared = await prepareSignedSubject(
        client,
        actor,
        creatorId,
        requested,
        this.subjectPolicies,
      );
      const result = await this.beginOnClient(
        client,
        actor,
        creatorId,
        prepared.command,
      );
      await prepared.finalizeBeforeCommit({
        phase: "challenge",
        challengeId: result.challengeId,
      });
      return result;
    });
  }
  /** The selected fan is a lookup input. Only the canonical issuer supplies
   * authority, on the same transaction as preparation and challenge creation. */
  async beginThreadSubject(
    actor: Actor,
    creatorId: string,
    fanId: string,
    requested: SignedActCommand,
    access: AccessService,
  ) {
    return this.accountTransaction(actor.accountId, async (client) => {
      const scope = await access.openThreadInTransaction(
        client,
        actor,
        creatorId,
        fanId,
        true,
        "write",
      );
      invariant(
        scope.authority === "creator" &&
          requested.actType === "reply" &&
          requested.subjectId === scope.threadId,
        "signed_subject_unavailable",
        "The creator cannot sign this conversation subject.",
      );
      // The retained core text reply has one exact content shape. Richer
      // subjects, including recordings, require their registered domain policy.
      const text = HumanReplySchema.pick({ text: true }).safeParse(
        requested.content,
      );
      let canonical: SignedActCommand;
      let prepared:
        | Awaited<ReturnType<typeof prepareSignedSubject>>
        | undefined;
      if (text.success) {
        const active = await client.query(
          "SELECT 1 FROM creator.thread WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND deleted_at IS NULL AND control='human_active'",
          [scope.threadId, scope.creatorId, scope.fanId],
        );
        invariant(
          active.rowCount === 1,
          "takeover_required",
          "Take over this conversation before signing a personal reply.",
        );
        canonical = {
          actType: "reply",
          subjectId: scope.threadId,
          content: text.data,
        };
      } else {
        prepared = await prepareSignedSubject(
          client,
          actor,
          creatorId,
          requested,
          this.subjectPolicies,
          scope,
        );
        canonical = prepared.command;
      }
      invariant(
        contentHash(canonical) === contentHash(requested),
        "signed_content_changed",
        "Review the current exact reply before signing.",
      );
      const result = await this.beginOnClient(
        client,
        actor,
        creatorId,
        canonical,
      );
      await prepared?.finalizeBeforeCommit({
        phase: "challenge",
        challengeId: result.challengeId,
      });
      return result;
    });
  }
  private async accountTransaction<T>(
    accountId: string,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return identityTransaction(this.pool, accountId, work);
  }
  async begin(actor: Actor, creatorId: string, command: SignedActCommand) {
    return this.accountTransaction(actor.accountId, (client) =>
      this.beginOnClient(client, actor, creatorId, command),
    );
  }
  private async beginOnClient(
    client: PoolClient,
    actor: Actor,
    creatorId: string,
    command: SignedActCommand,
  ) {
    const creator = await client.query(
      "SELECT id FROM creator.creator_profile WHERE id=$1 AND account_id=$2 AND verification=$3 AND NOT recovery_required FOR SHARE",
      [creatorId, actor.accountId, "verified"],
    );
    invariant(
      actor.adultEligible && creator.rowCount === 1,
      "creator_required",
      "Only the verified creator can sign this act.",
    );
    const credentials = await client.query<{ id: string }>(
      "SELECT id FROM creator.passkey_credential WHERE account_id=$1 AND revoked_at IS NULL ORDER BY created_at,id LIMIT 100",
      [actor.accountId],
    );
    invariant(
      credentials.rowCount,
      "passkey_required",
      "A registered creator passkey is required.",
    );
    const hash = contentHash(command);
    const challenge = Buffer.concat([
      randomBytes(32),
      Buffer.from(hash, "hex"),
    ]).toString("base64url");
    const saved = await client.query<{ id: string }>(
      `INSERT INTO creator.signed_challenge(account_id,creator_id,act_type,subject_id,content_hash,challenge,expires_at,command) VALUES($1,$2,$3,$4,$5,$6,now()+interval '5 minutes',$7) RETURNING id`,
      [
        actor.accountId,
        creatorId,
        command.actType,
        command.subjectId,
        hash,
        challenge,
        JSON.stringify(command),
      ],
    );
    return {
      challengeId: saved.rows[0]!.id,
      publicKey: {
        challenge,
        rpId: this.rpId,
        timeout: 300000,
        userVerification: "required" as const,
        allowCredentials: credentials.rows.map((row) => ({
          id: row.id,
          type: "public-key" as const,
        })),
      },
    };
  }
  async verify(
    actor: Actor,
    challengeId: string,
    response: AuthenticationResponseJSON,
  ): Promise<{ signedActId: string }> {
    invariant(
      actor.adultEligible,
      "adult_eligibility_required",
      "Adult eligibility is required.",
    );
    return this.accountTransaction(actor.accountId, async (client) => {
      const found = await client.query<{
        id: string;
        account_id: string;
        creator_id: string;
        act_type: string;
        subject_id: string;
        content_hash: string;
        challenge: string;
      }>(
        "SELECT * FROM creator.signed_challenge WHERE id=$1 AND account_id=$2 AND expires_at > now() AND used_at IS NULL FOR UPDATE",
        [challengeId, actor.accountId],
      );
      const challenge = found.rows[0];
      invariant(
        challenge,
        "assertion_expired",
        "This signing request is unavailable.",
      );
      const owner = await client.query(
        "SELECT id FROM creator.creator_profile WHERE id=$1 AND account_id=$2 AND verification=$3 AND NOT recovery_required",
        [challenge.creator_id, actor.accountId, "verified"],
      );
      invariant(
        owner.rowCount === 1,
        "creator_required",
        "Creator authority changed before signing.",
      );
      const credentials = await client.query<{
        id: string;
        public_key: Buffer;
        counter: string;
      }>(
        "SELECT id,public_key,counter FROM creator.passkey_credential WHERE id=$1 AND account_id=$2 AND revoked_at IS NULL FOR UPDATE",
        [response.id, actor.accountId],
      );
      const credential = credentials.rows[0];
      invariant(
        credential,
        "creator_passkey_required",
        "This passkey does not belong to the creator.",
      );
      const checked = await this.verifier.verify({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpId,
        credential: {
          id: credential.id,
          publicKey: new Uint8Array(credential.public_key),
          counter: Number(credential.counter),
        },
        requireUserVerification: true,
      });
      invariant(
        checked.verified,
        "assertion_invalid",
        "The creator signature could not be verified.",
      );
      await client.query(
        "UPDATE creator.passkey_credential SET counter=$1 WHERE id=$2 AND account_id=$3",
        [checked.authenticationInfo.newCounter, credential.id, actor.accountId],
      );
      const signed = await client.query<{ id: string }>(
        "INSERT INTO creator.signed_act(account_id,credential_id,creator_id,act_type,subject_id,content_hash,challenge,assertion) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
        [
          actor.accountId,
          credential.id,
          challenge.creator_id,
          challenge.act_type,
          challenge.subject_id,
          challenge.content_hash,
          challenge.challenge,
          JSON.stringify(response),
        ],
      );
      await client.query(
        "UPDATE creator.signed_challenge SET used_at=now() WHERE id=$1",
        [challengeId],
      );
      return { signedActId: signed.rows[0]!.id };
    });
  }
  async cancel(actor: Actor, challengeId: string) {
    return this.accountTransaction(actor.accountId, async (client) => {
      await client.query(
        "UPDATE creator.signed_challenge SET used_at=coalesce(used_at,now()) WHERE id=$1 AND account_id=$2",
        [challengeId, actor.accountId],
      );
      return { done: true as const };
    });
  }
  async publicVerification(id: string) {
    const result = await this.pool.query(
      "SELECT id,creator_name,act_type,content_hash,verified_at,key_revoked,creator_revoked,withdrawn,public_command FROM creator.signed_verification WHERE id=$1",
      [id],
    );
    const row = result.rows[0];
    if (!row)
      throw new DomainError(
        "signature_not_found",
        "This signed act is unavailable.",
        404,
      );
    return {
      signedActId: row.id,
      creatorName: row.creator_name,
      actType: row.act_type,
      contentHash: row.content_hash,
      verifiedAt: row.verified_at.toISOString(),
      status: row.withdrawn
        ? "withdrawn"
        : row.key_revoked
          ? "key_revoked"
          : row.creator_revoked
            ? "creator_revoked"
            : "valid",
      content: row.withdrawn ? null : row.public_command,
      contentAvailable: !row.withdrawn && row.public_command !== null,
      explanation:
        "A signature proves an authorized key approved this exact act. It does not prove that every factual statement is true.",
    };
  }
}

/** Single-use binding checked in the same transaction that publishes the human act. */
export async function consumeSignedAct(
  client: PoolClient,
  scope: ThreadScope,
  signedActId: string,
  command: SignedActCommand,
): Promise<string> {
  invariant(
    scope.authority === "creator" &&
      scope.actorAccountId === scope.creatorAccountId,
    "creator_required",
    "Only the creator can perform this act.",
  );
  return consumeCreatorSignedAct(
    client,
    { accountId: scope.actorAccountId, adultEligible: true },
    scope.creatorId,
    signedActId,
    command,
  );
}
