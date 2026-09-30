import type { Pool } from "pg";
import { invariant } from "../../core/errors.js";
import type { PrivacyHook } from "./contracts.js";
import { privacyTaskAuthority } from "./privacy-authority.js";

/** Export account records through existing W1 RLS; credentials and upstream
 * tokens never enter an artifact. Erasure awaits the reviewed retention policy. */
export function identityPrivacyHook(
  runtime: Pool,
  coordinator: Pool,
): PrivacyHook {
  const verify = privacyTaskAuthority(coordinator);
  return {
    domain: "identity",
    async run(input) {
      await verify(input);
      invariant(
        input.kind === "export",
        "identity_retention_unconfigured",
        "Identity erasure requires the reviewed signature-retention and closed-account reauthentication policy.",
      );
      invariant(
        input.scope === "account",
        "identity_scope_adapter_required",
        "Relationship requests require a reviewed mapping of scoped identity proofs.",
      );
      const client = await runtime.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.account_id',$1,true)", [
          input.accountId,
        ]);
        const data: Record<string, unknown[]> = {};
        if (input.scope === "account") {
          const sources = [
            [
              "fan",
              "SELECT id,handle,intro,version FROM creator.fan_profile WHERE account_id=$1",
            ],
            [
              "creator",
              "SELECT id,handle,display_name,verification,version,recovery_required FROM creator.creator_profile WHERE account_id=$1",
            ],
            [
              "teamMemberships",
              "SELECT creator_id,roles,revoked_at FROM creator.team_membership WHERE account_id=$1",
            ],
            [
              "invitations",
              "SELECT id,creator_id,roles,expires_at,accepted_at,revoked_at FROM creator.team_invitation WHERE account_id=$1",
            ],
            [
              "proofs",
              "SELECT id,creator_id,platform,account_url,post_url,state,submitted_at,reviewed_at,reason FROM creator.creator_proof WHERE account_id=$1",
            ],
            [
              "passkeys",
              "SELECT id,transports,created_at,revoked_at FROM creator.passkey_credential WHERE account_id=$1",
            ],
            [
              "signedActs",
              "SELECT id,creator_id,act_type,subject_id,content_hash,verified_at FROM creator.signed_act WHERE account_id=$1",
            ],
            [
              "signedPublications",
              "SELECT signed_act_id,command,public_content,withdrawn_at FROM creator.signed_publication WHERE account_id=$1",
            ],
            [
              "events",
              "SELECT id,kind,aggregate_id,version,created_at FROM creator.identity_event WHERE account_id=$1",
            ],
            [
              "sessions",
              "SELECT id,mode,created_at,expires_at,revoked_at FROM creator.identity_session WHERE account_id=$1",
            ],
          ] as const;
          for (const [name, sql] of sources) {
            await verify(input);
            const rows = (
              await client.query(sql + " LIMIT 1001", [input.accountId])
            ).rows;
            invariant(
              rows.length <= 1000,
              "bounded_subjob_required",
              "This identity export requires bounded subjobs; no truncated artifact was produced.",
            );
            data[name] = rows;
          }
        }
        await verify(input);
        await client.query("COMMIT");
        return {
          receipt: {
            domain: "identity",
            jobId: input.jobId,
            complete: true,
            scope: input.scope,
          },
          data,
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
