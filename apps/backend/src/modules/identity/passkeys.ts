import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
  type AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import type { Pool, PoolClient } from "pg";
import { PasskeyRegistrationSchema } from "@qelvora/api";
import { DomainError, invariant } from "../../core/errors.js";
import type { Actor } from "./adapter.js";
import { identityTransaction } from "./transaction.js";

export class PasskeyService {
  constructor(
    private readonly pool: Pool,
    private readonly rpId: string,
    private readonly origins: string[],
    private readonly rpName: string,
  ) {}
  private fresh(authenticatedAt: Date) {
    invariant(
      Date.now() - authenticatedAt.getTime() < 300000,
      "fresh_identity_required",
      "Continue with Pantopus again before changing passkeys.",
    );
  }
  private async enrollmentAllowed(client: PoolClient, actor: Actor) {
    const profile = await client.query(
      "SELECT * FROM creator.creator_profile WHERE account_id=$1 AND verification='verified' FOR UPDATE",
      [actor.accountId],
    );
    const creator = profile.rows[0];
    invariant(
      creator,
      "verified_creator_required",
      "External creator proof must be approved before registering a signing passkey.",
    );
    const proof = await client.query(
      "SELECT id FROM creator.creator_proof WHERE creator_id=$1 AND account_id=$2 AND state='approved' AND ($3::timestamptz IS NULL OR submitted_at>$3) LIMIT 1",
      [creator.id, actor.accountId, creator.recovery_started_at],
    );
    invariant(
      proof.rowCount,
      "fresh_proof_required",
      "Fresh external creator proof is required for credential recovery.",
    );
    return creator;
  }
  async begin(actor: Actor, authenticatedAt: Date) {
    this.fresh(authenticatedAt);
    return identityTransaction(this.pool, actor.accountId, async (client) => {
      const creator = await this.enrollmentAllowed(client, actor);
      if (creator.recovery_started_at)
        invariant(
          authenticatedAt > new Date(creator.recovery_started_at),
          "recovery_identity_required",
          "Re-verify your Pantopus identity after starting recovery.",
        );
      const credentials = await client.query<{
        id: string;
        transports: AuthenticatorTransportFuture[];
      }>(
        "SELECT id,transports FROM creator.passkey_credential WHERE account_id=$1 AND revoked_at IS NULL LIMIT 100",
        [actor.accountId],
      );
      invariant(
        (credentials.rowCount ?? 0) < 100,
        "passkey_limit",
        "Revoke an unused passkey before registering another.",
      );
      const options = await generateRegistrationOptions({
        rpName: this.rpName,
        rpID: this.rpId,
        userName: creator.handle,
        userID: new Uint8Array(
          Buffer.from(actor.accountId.replaceAll("-", ""), "hex"),
        ),
        timeout: 300000,
        attestationType: "none",
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "required",
        },
        excludeCredentials: credentials.rows.map((row) => ({
          id: row.id,
          transports: row.transports ?? [],
        })),
      });
      const challenge = await client.query<{ id: string }>(
        "INSERT INTO creator.passkey_registration(account_id,challenge,expires_at) VALUES($1,$2,now()+interval '5 minutes') RETURNING id",
        [actor.accountId, options.challenge],
      );
      return { challengeId: challenge.rows[0]!.id, options };
    });
  }
  async register(actor: Actor, authenticatedAt: Date, input: unknown) {
    this.fresh(authenticatedAt);
    const body = PasskeyRegistrationSchema.parse(input);
    return identityTransaction(this.pool, actor.accountId, async (client) => {
      const creator = await this.enrollmentAllowed(client, actor);
      if (creator.recovery_started_at)
        invariant(
          authenticatedAt > new Date(creator.recovery_started_at),
          "recovery_identity_required",
          "Re-verify your Pantopus identity after starting recovery.",
        );
      const result = await client.query<{ challenge: string }>(
        "SELECT challenge FROM creator.passkey_registration WHERE id=$1 AND account_id=$2 AND expires_at>now() AND used_at IS NULL FOR UPDATE",
        [body.challengeId, actor.accountId],
      );
      invariant(
        result.rows[0],
        "registration_expired",
        "This passkey request expired. Try again.",
      );
      let checked;
      try {
        checked = await verifyRegistrationResponse({
          response: body.credential as unknown as RegistrationResponseJSON,
          expectedChallenge: result.rows[0].challenge,
          expectedOrigin: this.origins,
          expectedRPID: this.rpId,
          requireUserVerification: true,
        });
      } catch {
        throw new DomainError(
          "registration_invalid",
          "The passkey could not be verified. Try again.",
          400,
        );
      }
      invariant(
        checked.verified && checked.registrationInfo?.userVerified,
        "registration_invalid",
        "User verification is required to register a signing passkey.",
      );
      const credential = checked.registrationInfo.credential;
      await client.query(
        "INSERT INTO creator.passkey_credential(id,account_id,public_key,counter,transports) VALUES($1,$2,$3,$4,$5)",
        [
          credential.id,
          actor.accountId,
          Buffer.from(credential.publicKey),
          credential.counter,
          credential.transports ?? [],
        ],
      );
      await client.query(
        "UPDATE creator.passkey_registration SET used_at=now() WHERE id=$1",
        [body.challengeId],
      );
      await client.query(
        "UPDATE creator.creator_profile SET recovery_required=false,recovery_started_at=NULL,version=version+1 WHERE account_id=$1",
        [actor.accountId],
      );
      return { done: true as const };
    });
  }
  async list(actor: Actor) {
    return identityTransaction(this.pool, actor.accountId, async (client) => {
      const credentials = await client.query(
        'SELECT id,created_at AS "createdAt",revoked_at IS NOT NULL AS revoked FROM creator.passkey_credential WHERE account_id=$1 ORDER BY created_at DESC LIMIT 100',
        [actor.accountId],
      );
      const profile = await client.query(
        "SELECT recovery_required FROM creator.creator_profile WHERE account_id=$1",
        [actor.accountId],
      );
      return {
        credentials: credentials.rows,
        recoveryRequired: profile.rows[0]?.recovery_required ?? false,
      };
    });
  }
  async cancel(actor: Actor, challengeId: string) {
    return identityTransaction(this.pool, actor.accountId, async (client) => {
      await client.query(
        "UPDATE creator.passkey_registration SET used_at=now() WHERE id=$1 AND account_id=$2 AND used_at IS NULL",
        [challengeId, actor.accountId],
      );
      return { done: true as const };
    });
  }
  /** Self-revocation is always available; replacement still requires fresh identity and proof. */
  async revoke(actor: Actor, credentialId: string) {
    return identityTransaction(this.pool, actor.accountId, async (client) => {
      await client.query(
        "UPDATE creator.passkey_credential SET revoked_at=now() WHERE id=$1 AND account_id=$2",
        [credentialId, actor.accountId],
      );
      await client.query(
        "UPDATE creator.signed_verification SET key_revoked=true WHERE id IN(SELECT id FROM creator.signed_act WHERE credential_id=$1 AND account_id=$2)",
        [credentialId, actor.accountId],
      );
      return { done: true as const };
    });
  }
  async recover(actor: Actor) {
    return identityTransaction(this.pool, actor.accountId, async (client) => {
      const result = await client.query(
        "UPDATE creator.creator_profile SET recovery_required=true,recovery_started_at=now(),verification='pending',version=version+1 WHERE account_id=$1 RETURNING id,version",
        [actor.accountId],
      );
      invariant(
        result.rows[0],
        "creator_required",
        "A creator profile is required for signing-key recovery.",
      );
      await client.query(
        "UPDATE creator.passkey_credential SET revoked_at=coalesce(revoked_at,now()) WHERE account_id=$1",
        [actor.accountId],
      );
      await client.query(
        "UPDATE creator.signed_verification SET key_revoked=true,creator_revoked=true WHERE account_id=$1",
        [actor.accountId],
      );
      await client.query(
        "UPDATE creator.signed_challenge SET used_at=coalesce(used_at,now()) WHERE account_id=$1",
        [actor.accountId],
      );
      await client.query(
        "INSERT INTO creator.identity_event(account_id,kind,aggregate_id,version) VALUES($1,'creator_recovery_started',$2,$3)",
        [actor.accountId, result.rows[0].id, result.rows[0].version],
      );
      return { done: true as const };
    });
  }
}
