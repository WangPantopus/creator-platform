import type { Pool, PoolClient } from "pg";
import { ContentHeldClient } from "../content/held-client-cleanup.js";
import { DomainError, invariant } from "../../core/errors.js";
import type { PrivacyHook } from "./contracts.js";
import {
  privacyTaskAuthority,
  restoredPrivacyTaskAuthorityInTransaction,
} from "./privacy-authority.js";

type Job = Parameters<PrivacyHook["run"]>[0];
/** Export account records through existing W1 RLS; credentials and upstream
 * tokens never enter an artifact. Fan erasure redacts in place; creator
 * erasure awaits the reviewed signature-retention policy. */
export function identityPrivacyHook(
  runtime: Pool,
  coordinator: Pool,
  assertRestoredInTransaction?: (client: PoolClient) => Promise<void>,
): PrivacyHook {
  const verify = privacyTaskAuthority(coordinator);
  /** Retained payment and request records (D-08) reference the fan profile id,
   * so the row stays as an anchor without its handle or intro. Identity erases
   * last: other domains locate data through it, and the person keeps watching
   * the job's progress (the tombstone already denies everything else) until
   * every session is revoked here, as the job completes. Identity holds
   * nothing per relationship for a fan. */
  async function erase(input: Job) {
    const creatorAccount = async (client: Pool | PoolClient) =>
      (
        await client.query(
          "SELECT 1 FROM creator.creator_profile WHERE account_id=$1 LIMIT 1",
          [input.accountId],
        )
      ).rowCount !== 0;
    const creatorRefused = () =>
      new DomainError(
        "identity_retention_unconfigured",
        "Creator account erasure requires the reviewed signature-retention policy.",
        503,
      );
    // A creator is refused at once rather than waiting behind other domains.
    if (await creatorAccount(runtime)) throw creatorRefused();
    if (input.scope === "account") {
      const open = await coordinator.query<{ open: string }>(
        "SELECT count(*) AS open FROM creator_trust.privacy_task WHERE job_id=$1 AND domain<>'identity' AND state<>'complete'",
        [input.jobId],
      );
      if (Number(open.rows[0]?.open) !== 0)
        throw new DomainError(
          "identity_erasure_waiting",
          "Identity erasure runs after every other domain completes.",
          503,
        );
    }
    const client = await runtime.connect();
    const held = new ContentHeldClient(client, input.signal, runtime);
    let failure: unknown;
    try {
      input.signal!.throwIfAborted();
      await held.begin();
      await restoredPrivacyTaskAuthorityInTransaction(
        client,
        input,
        assertRestoredInTransaction,
      );
      await client.query("SELECT set_config('app.account_id',$1,true)", [
        input.accountId,
      ]);
      if (await creatorAccount(client)) throw creatorRefused();
      const counts: Record<string, number> = {};
      if (input.scope === "account") {
        const statements = [
          [
            "redactedProfiles",
            "UPDATE creator.fan_profile SET handle='deleted-'||substr(md5(gen_random_uuid()::text),1,16),intro='',version=version+1 WHERE account_id=$1 AND handle NOT LIKE 'deleted-%'",
          ],
          [
            "revokedSessions",
            "UPDATE creator.identity_session SET revoked_at=coalesce(revoked_at,now()),upstream_cipher='' WHERE account_id=$1 AND (revoked_at IS NULL OR upstream_cipher<>'')",
          ],
          [
            "revokedMemberships",
            "UPDATE creator.team_membership SET revoked_at=now() WHERE account_id=$1 AND revoked_at IS NULL",
          ],
          [
            "revokedInvitations",
            "UPDATE creator.team_invitation SET revoked_at=now() WHERE account_id=$1 AND accepted_at IS NULL AND revoked_at IS NULL",
          ],
        ] as const;
        for (const [name, sql] of statements) {
          await restoredPrivacyTaskAuthorityInTransaction(
            client,
            input,
            assertRestoredInTransaction,
          );
          counts[name] = (await client.query(sql, [input.accountId])).rowCount!;
        }
      }
      await restoredPrivacyTaskAuthorityInTransaction(
        client,
        input,
        assertRestoredInTransaction,
      );
      input.signal!.throwIfAborted();
      await held.commit();
      input.signal!.throwIfAborted();
      return {
        receipt: {
          domain: "identity",
          jobId: input.jobId,
          complete: true,
          scope: input.scope,
          ...counts,
        },
        retained:
          input.scope === "account"
            ? [
                {
                  category: "pseudonymous_fan_record",
                  until: null,
                  reason:
                    "A fan record without its handle or intro stays only as the anchor for payment and request records that must be kept; final retention review is pending.",
                },
              ]
            : [],
      };
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      await held.settle(failure);
    }
  }
  return {
    domain: "identity",
    async run(input) {
      input.signal?.throwIfAborted();
      await verify(input);
      if (input.kind === "delete") return erase(input);
      invariant(
        input.scope === "account",
        "identity_scope_adapter_required",
        "Relationship requests require a reviewed mapping of scoped identity proofs.",
      );
      const client = await runtime.connect();
      // Settlement only; original W8 task, ownership and restoration checks
      // below remain the sole authority. Keep the source held until rollback
      // or physical close settles, including cancellation during a query.
      const held = new ContentHeldClient(client, input.signal, runtime);
      let failure: unknown;
      try {
        input.signal!.throwIfAborted();
        await held.begin();
        await restoredPrivacyTaskAuthorityInTransaction(
          client,
          input,
          assertRestoredInTransaction,
        );
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
          // One fixed cursor gives all ten account projections the same MVCC
          // snapshot. Separate held task/restore bookends remain current under
          // READ COMMITTED; a retained repeatable-read snapshot is not authority.
          const projection = sources
            .map(([name, sql]) => {
              data[name] = [];
              return `SELECT '${name}'::text AS source,to_jsonb(item) AS row FROM (${sql} LIMIT 1001) item`;
            })
            .join(" UNION ALL ");
          await client.query(
            `DECLARE w8_identity_export NO SCROLL CURSOR FOR ${projection}`,
            [input.accountId],
          );
          for (;;) {
            await restoredPrivacyTaskAuthorityInTransaction(
              client,
              input,
              assertRestoredInTransaction,
            );
            const page = await client.query<{ source: string; row: unknown }>(
              "FETCH FORWARD 16 FROM w8_identity_export",
            );
            input.signal!.throwIfAborted();
            if (page.rows.length === 0) break;
            for (const item of page.rows) {
              const rows = data[item.source];
              invariant(
                rows,
                "identity_export_source_changed",
                "The fixed identity export source is unavailable.",
              );
              rows.push(item.row);
              invariant(
                rows.length <= 1000,
                "bounded_subjob_required",
                "This identity export requires bounded subjobs; no truncated artifact was produced.",
              );
            }
            invariant(
              Buffer.byteLength(JSON.stringify(data)) <= 3_000_000,
              "bounded_subjob_required",
              "This identity export needs a protected streaming artifact.",
            );
          }
          await client.query("CLOSE w8_identity_export");
        }
        await restoredPrivacyTaskAuthorityInTransaction(
          client,
          input,
          assertRestoredInTransaction,
        );
        input.signal!.throwIfAborted();
        await held.commit();
        input.signal!.throwIfAborted();
        return {
          receipt: {
            domain: "identity",
            jobId: input.jobId,
            complete: true,
            snapshot: "single-cursor-read-committed",
            scope: input.scope,
          },
          data,
        };
      } catch (error) {
        failure = error;
        throw error;
      } finally {
        await held.settle(failure);
      }
    },
  };
}
