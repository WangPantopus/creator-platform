import { Client, type Pool } from "pg";
import { DomainError, invariant } from "../../core/errors.js";
import type {
  ConversationPrivacyAuthority,
  ConversationPrivacyFamily,
} from "../conversation/privacy.js";
import {
  privacyTaskAuthority,
  restoredPrivacyTaskAuthorityInTransaction,
  type PrivacyTaskInput,
} from "./privacy-authority.js";
import type { PoolClient } from "pg";

/** Enumerate metadata, then use existing pair RLS. No interactive ThreadScope,
 * runtime grant or denial bypass is issued to a client by this worker adapter. */
export function conversationPrivacyAuthority(
  runtime: Pool,
  coordinator: Pool,
  assertRestoredInTransaction?: (client: PoolClient) => Promise<void>,
): ConversationPrivacyAuthority & {
  fenceTaskInTransaction(
    client: PoolClient,
    job: PrivacyTaskInput,
  ): Promise<void>;
} {
  const verify = privacyTaskAuthority(coordinator);
  return {
    async fenceTaskInTransaction(client, job) {
      await restoredPrivacyTaskAuthorityInTransaction(
        client,
        job,
        assertRestoredInTransaction,
      );
    },
    async families(job) {
      await verify(job);
      const client = await runtime.connect();
      const signal = job.signal!;
      let cancelling: Promise<void> | undefined;
      let cancellationFailure: unknown;
      let discardClient = false;
      let pid: number | undefined;
      const abort = () => {
        if (!pid || cancelling) return;
        // The PID comes only from this actual held client. Keep that client
        // checked out until this separate control connection has settled, so
        // cancellation cannot reach another operation or a later COMMIT.
        cancelling = (async () => {
          const control = new Client({
            ...runtime.options,
            connectionTimeoutMillis: 1500,
            statement_timeout: 1500,
          });
          try {
            await control.connect();
            const cancelled = await control.query<{ cancelled: boolean }>(
              "SELECT pg_cancel_backend($1) AS cancelled",
              [pid],
            );
            invariant(
              cancelled.rows[0]?.cancelled === true,
              "privacy_family_cancel_unavailable",
              "The actual discovery backend could not be cancelled.",
            );
          } finally {
            await control.end();
          }
        })().catch((error: unknown) => {
          cancellationFailure = error;
          discardClient = true;
        });
      };
      const settleCancellation = async () => {
        signal.removeEventListener("abort", abort);
        await cancelling;
      };
      try {
        signal.throwIfAborted();
        const observed = (await client.query("SELECT pg_backend_pid() AS pid"))
          .rows[0]?.pid;
        invariant(
          Number.isSafeInteger(observed) && observed > 0,
          "privacy_family_cancel_unavailable",
          "The actual discovery backend is required.",
        );
        pid = observed;
        signal.addEventListener("abort", abort, { once: true });
        signal.throwIfAborted();
        await client.query("BEGIN");
        // Discovery is lifecycle work too. Lock the real job/task before any
        // family reads and keep its deferred currentness check through COMMIT.
        const owned = await restoredPrivacyTaskAuthorityInTransaction(
          client,
          job,
          assertRestoredInTransaction,
        );
        await client.query("SELECT set_config('app.account_id',$1,true)", [
          job.accountId,
        ]);
        const families = (
          await client.query<ConversationPrivacyFamily>(
            `SELECT thread_id AS "threadId",creator_id AS "creatorId",fan_id AS "fanId" FROM creator.conversation_relationship
           WHERE account_id=$1 AND ($2::uuid IS NULL OR creator_id=$2) AND ($3::uuid IS NULL OR thread_id=$3) ORDER BY thread_id LIMIT 101`,
            [job.accountId, job.creatorId, job.threadId],
          )
        ).rows;
        invariant(
          families.length <= 100,
          "bounded_subjob_required",
          "Split this request into bounded conversation families.",
        );
        // Public profile IDs are already readable under W1. Content stays behind
        // each verified owned-creator pair; more than 100 candidates is gated.
        if (owned.length) {
          const fans = (
            await client.query<{ id: string }>(
              "SELECT id FROM creator.fan_profile ORDER BY id LIMIT 101",
            )
          ).rows;
          invariant(
            fans.length <= 100,
            "bounded_subjob_required",
            "Creator conversation enumeration needs a bounded lifecycle subjob.",
          );
          for (const creatorId of owned)
            for (const fan of fans) {
              await restoredPrivacyTaskAuthorityInTransaction(
                client,
                job,
                assertRestoredInTransaction,
              );
              await client.query(
                "SELECT set_config('app.creator_id',$1,true),set_config('app.fan_id',$2,true)",
                [creatorId, fan.id],
              );
              const row = (
                await client.query<ConversationPrivacyFamily>(
                  'SELECT id AS "threadId",creator_id AS "creatorId",fan_id AS "fanId" FROM creator.thread WHERE creator_id=$1 AND fan_id=$2',
                  [creatorId, fan.id],
                )
              ).rows[0];
              if (
                row &&
                !families.some((family) => family.threadId === row.threadId)
              )
                families.push(row);
              invariant(
                families.length <= 100,
                "bounded_subjob_required",
                "Split this request into bounded conversation families.",
              );
            }
        }
        await restoredPrivacyTaskAuthorityInTransaction(
          client,
          job,
          assertRestoredInTransaction,
        );
        await settleCancellation();
        if (cancellationFailure)
          throw new DomainError(
            "privacy_family_cancel_unavailable",
            "Discovery cancellation failed; this task cannot complete.",
            503,
          );
        signal.throwIfAborted();
        await client.query("COMMIT");
        signal.throwIfAborted();
        return families;
      } catch (error) {
        // Await the actual query/cancel settlement before rollback and retain
        // the original failure. A failed rollback destroys this own client.
        await settleCancellation();
        try {
          await client.query("ROLLBACK");
        } catch {
          discardClient = true;
        }
        if (cancellationFailure)
          throw new DomainError(
            "privacy_family_cancel_unavailable",
            "Discovery cancellation failed; this task cannot complete.",
            503,
          );
        throw error;
      } finally {
        await settleCancellation();
        client.release(discardClient);
      }
    },
    async assertFamily(client, job, family) {
      const owned = await restoredPrivacyTaskAuthorityInTransaction(
        client,
        job,
        assertRestoredInTransaction,
      );
      invariant(
        (!job.creatorId || job.creatorId === family.creatorId) &&
          (!job.threadId || job.threadId === family.threadId),
        "privacy_scope_mismatch",
        "This family is outside the verified request.",
      );
      await client.query(
        "SELECT set_config('app.account_id',$1,true),set_config('app.creator_id',$2,true),set_config('app.fan_id',$3,true)",
        [job.accountId, family.creatorId, family.fanId],
      );
      const row = (
        await client.query<{ account_id: string }>(
          "SELECT f.account_id FROM creator.thread t JOIN creator.fan_profile f ON f.id=t.fan_id WHERE t.id=$1 AND t.creator_id=$2 AND t.fan_id=$3 FOR SHARE OF t,f",
          [family.threadId, family.creatorId, family.fanId],
        )
      ).rows[0];
      invariant(
        row &&
          (row.account_id === job.accountId ||
            owned.includes(family.creatorId)),
        "privacy_family_unavailable",
        "This conversation does not belong to the verified request.",
      );
    },
  };
}
