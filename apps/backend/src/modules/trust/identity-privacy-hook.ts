import type { Pool, PoolClient } from "pg";
import { ContentHeldClient } from "../content/held-client-cleanup.js";
import { DomainError, invariant } from "../../core/errors.js";
import type { QelvoraSignIn } from "../identity/qelvora-sign-in.js";
import type { SignInProvider } from "../identity/providers.js";
import type { PrivacyHook } from "./contracts.js";
import {
  privacyTaskAuthority,
  restoredPrivacyTaskAuthorityInTransaction,
} from "./privacy-authority.js";

type Job = Parameters<PrivacyHook["run"]>[0];
const signInUnconfigured = () =>
  new DomainError(
    "identity_sign_in_unconfigured",
    "This account signed in with Apple or Google, which this host does not compose for privacy jobs.",
    503,
  );
/** Export account records through existing W1 RLS; credentials and upstream
 * tokens never enter an artifact. Fan erasure redacts in place; creator
 * erasure awaits the reviewed signature-retention policy. A Qelvora account
 * (sign-in with Apple or Google) also needs its sign-in, to reveal its email
 * address for export and to revoke provider tokens on erasure. */
export function identityPrivacyHook(
  runtime: Pool,
  coordinator: Pool,
  assertRestoredInTransaction?: (client: PoolClient) => Promise<void>,
  signIn: () => QelvoraSignIn | undefined = () => undefined,
): PrivacyHook {
  const verify = privacyTaskAuthority(coordinator);
  /** Apple requires a deleted account's authorization to end at Apple, and a
   * refresh token deleted first could never be revoked. So every stored token
   * is revoked before the transaction that deletes it. Revoking is
   * idempotent: a failed transaction only repeats it, and an account kept
   * after all just gets a fresh consent at its next sign-in. */
  async function revokeProviderTokens(input: Job) {
    const tokens = await runtime.query<{
      provider: SignInProvider;
      provider_refresh_cipher: string;
    }>(
      "SELECT provider,provider_refresh_cipher FROM creator.account_identity WHERE account_id=$1 AND provider_refresh_cipher IS NOT NULL",
      [input.accountId],
    );
    if (tokens.rowCount === 0) return { ciphers: [], count: 0 };
    const owner = signIn();
    if (!owner) throw signInUnconfigured();
    let count = 0;
    for (const row of tokens.rows) {
      input.signal!.throwIfAborted();
      count += await owner.revokeAtProvider(
        row.provider,
        row.provider_refresh_cipher,
      );
    }
    return {
      ciphers: tokens.rows.map((row) => row.provider_refresh_cipher),
      count,
    };
  }
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
    const revoked =
      input.scope === "account"
        ? await revokeProviderTokens(input)
        : { ciphers: [], count: 0 };
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
      let signInAccount = false;
      let ageLocked = false;
      if (input.scope === "account") {
        // Holds off a sign-in until this commits. One that stored a new
        // refresh token after the revocation above makes this attempt wait,
        // and the next one revokes it.
        const identities = await client.query<{
          provider_refresh_cipher: string | null;
        }>(
          "SELECT provider_refresh_cipher FROM creator.account_identity WHERE account_id=$1 FOR UPDATE",
          [input.accountId],
        );
        if (
          identities.rows.some(
            (row) =>
              row.provider_refresh_cipher !== null &&
              !revoked.ciphers.includes(row.provider_refresh_cipher),
          )
        )
          throw new DomainError(
            "identity_erasure_waiting",
            "A sign-in stored a new provider token during erasure; the next attempt revokes it.",
            503,
          );
        counts.revokedProviderTokens = revoked.count;
        signInAccount =
          (
            await client.query("SELECT 1 FROM creator.account WHERE id=$1", [
              input.accountId,
            ])
          ).rowCount !== 0;
        ageLocked =
          (
            await client.query(
              "SELECT 1 FROM creator.age_lock l JOIN creator.account_identity i ON i.provider=l.provider AND i.subject_hmac=l.subject_hmac WHERE i.account_id=$1 LIMIT 1",
              [input.accountId],
            )
          ).rowCount !== 0;
        // D2 (the founder's working default): the account stays closed, and a
        // later sign-in with the same Apple or Google identity starts a new,
        // empty account that passes the age step again. An under-18 lock is
        // kept by provider identity, so it still refuses that account.
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
          [
            "revokedSignInGrants",
            "UPDATE creator.identity_grant SET revoked_at=now() WHERE account_id=$1 AND revoked_at IS NULL",
          ],
          [
            // With each identity go its email address and refresh token, and
            // any open age step (ON DELETE CASCADE).
            "deletedSignInIdentities",
            "DELETE FROM creator.account_identity WHERE account_id=$1",
          ],
          [
            "closedSignInAccounts",
            "UPDATE creator.account SET state='deleted',deleted_at=now() WHERE id=$1 AND state='active'",
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
                ...(signInAccount
                  ? [
                      {
                        category: "closed_sign_in_account",
                        until: null,
                        reason:
                          "The account's random id, when it was deleted, when it signed in and its age check results (never a date of birth) stay, so the account stays closed and the 18+ check can be shown; final retention review is pending.",
                      },
                    ]
                  : []),
                ...(ageLocked
                  ? [
                      {
                        category: "under_18_lock",
                        until: null,
                        reason:
                          "A sign-in identity found to be under 18 stays locked, kept only as a keyed hash, so a new account cannot pass the age check; final retention review is pending.",
                      },
                    ]
                  : []),
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
            [
              "signInAccount",
              "SELECT id,state,created_at,deleted_at FROM creator.account WHERE id=$1",
            ],
            [
              // The email cipher is opened below; the refresh token never
              // leaves, only whether one is held.
              "signInIdentities",
              "SELECT id,provider,email_cipher,provider_refresh_cipher IS NOT NULL AS provider_authorization_held,created_at,last_used_at FROM creator.account_identity WHERE account_id=$1",
            ],
            [
              "signInGrants",
              "SELECT id,authenticated_at,created_at,expires_at,revoked_at FROM creator.identity_grant WHERE account_id=$1",
            ],
            [
              "ageChecks",
              "SELECT source,result,copy_version,recorded_at FROM creator.age_signal WHERE account_id=$1",
            ],
          ] as const;
          // One fixed cursor gives all fourteen account projections the same MVCC
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
          const identities = data.signInIdentities as {
            email_cipher: string | null;
          }[];
          if (identities.some((row) => row.email_cipher) && !signIn())
            throw signInUnconfigured();
          data.signInIdentities = identities.map(
            ({ email_cipher, ...row }) => ({
              ...row,
              email: email_cipher ? signIn()!.revealEmail(email_cipher) : null,
            }),
          );
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
