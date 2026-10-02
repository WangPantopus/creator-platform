import pg from "pg";
import type { PoolClient } from "pg";
import { DomainError } from "../../core/errors.js";
import {
  isConfiguredBackendRuntime,
  type BackendRuntime,
} from "../../integration.js";
import { registeredMigration } from "../../db/reviewed-migration.js";
import { threadScopeActor, type ThreadScope } from "../access/scope.js";
import type { ReplyFeedbackAuthority } from "../conversation/lineage.js";
import { requestAuthority } from "../identity/request-authority.js";
import {
  assertDevelopmentFeedbackCatalog,
  developmentFeedbackSource,
  developmentFeedbackVersion,
  feedbackUnavailable,
} from "./development-feedback-catalog.js";

export const developmentFeedbackPolicy = Object.freeze({
  version: "w8-development-reply-feedback-20261002-v1",
  notice:
    "In this labelled development environment, sending Helpful or Not helpful saves your choice and the exact reply version for reply quality review for up to 7 days, ending no later than November 1, 2026 at 00:00 UTC. It saves no prompt, transcript or private reply text and permits no marketing, model training or provider use. You can withdraw your choice. After Helpful, you may be offered an optional account introduction once during this development period. Save, Skip or feedback withdrawal keeps only an account-level suppression marker until November 1 so the offer is not repeated; withdrawal or expiry removes the reply and acknowledgement links. The marker is then deleted. This policy does not govern your saved profile introduction.",
});
export const developmentIntroOfferRetention = Object.freeze({
  policyVersion: developmentFeedbackPolicy.version,
  offerExpiresAt: "2026-11-01T00:00:00.000Z",
});
const startsAt = Date.parse("2026-10-02T00:00:00.000Z");
const endsAt = Date.parse(developmentIntroOfferRetention.offerExpiresAt);

export type DevelopmentFeedback = Readonly<{
  replyFeedbackAuthority: ReplyFeedbackAuthority;
  introOfferPolicy: (
    scope: ThreadScope,
    client: PoolClient,
    consent: Readonly<{ policyVersion: string; expiresAt: string }>,
  ) => Promise<void>;
  introOfferRetention: typeof developmentIntroOfferRetention;
  /** Actual physical expiry only, outside interactive request authority. */
  purgeExpired: (
    signal: AbortSignal,
  ) => Promise<Readonly<{ feedbackDeleted: number; eventsDeleted: number }>>;
  close: () => Promise<void>;
}>;

function configured(runtime: BackendRuntime) {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.TRUST_LOCAL_DEVELOPMENT === "true" &&
    process.env.TRUST_DEVELOPMENT_FEEDBACK_POLICY === "true" &&
    runtime.identity?.sessions.mode === "development" &&
    isConfiguredBackendRuntime(runtime) &&
    runtime.database.pool === runtime.pool &&
    runtime.access.isForPool(runtime.pool) &&
    runtime.conversation.isFor(runtime.database, runtime.access) &&
    runtime.database.threadScopeInTransactionAvailable &&
    typeof runtime.assertRestoredInTransaction === "function" &&
    typeof runtime.assertScopeAllowedInTransaction === "function"
  );
}

/** Call only inside the genuine configured host's registerFeatures callback.
 * Its pre-graph trust callback cannot issue this authority. A retained scope,
 * cloned host, fabricated Actor or manually installed held proposal refuses.
 * W1 remains responsible for the actual helpful reply and offer row locks;
 * this callback validates policy, not an inferred per-reply consent. */
export async function createDevelopmentFeedback(
  runtime: BackendRuntime,
): Promise<DevelopmentFeedback | undefined> {
  if (!configured(runtime)) return undefined;
  const migration = await registeredMigration(developmentFeedbackSource);
  if (migration?.version !== developmentFeedbackVersion) return undefined;
  let workerURL: URL;
  try {
    const core = new URL(runtime.pool.options.connectionString ?? "");
    workerURL = new URL(process.env.TRUST_WORKER_DATABASE_URL ?? "");
    if (
      !core.protocol.match(/^postgres(?:ql)?:$/u) ||
      core.username !== "creator_runtime" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(core.hostname) ||
      core.search ||
      core.hash ||
      workerURL.protocol !== core.protocol ||
      workerURL.hostname !== core.hostname ||
      workerURL.port !== core.port ||
      workerURL.pathname !== core.pathname ||
      workerURL.username !== "creator_trust_worker" ||
      workerURL.search ||
      workerURL.hash
    )
      return undefined;
  } catch {
    return undefined;
  }
  const worker = new pg.Pool({
    connectionString: workerURL.toString(),
    max: 1,
    connectionTimeoutMillis: 2000,
    statement_timeout: 2000,
    lock_timeout: 1000,
  });
  let closed = false;
  const check = () => {
    if (closed || !configured(runtime)) throw feedbackUnavailable();
  };
  const bookend = async (scope: ThreadScope, client: PoolClient) => {
    check();
    runtime.database.assertHeldThread(scope, client);
    const actor = threadScopeActor(scope);
    const request = requestAuthority.getStore();
    if (
      scope.authority !== "fan" ||
      scope.actorAccountId !== scope.fanAccountId ||
      request?.actor !== actor ||
      request.accountId !== scope.actorAccountId
    )
      throw new DomainError(
        "feedback_fan_required",
        "Only your own reply feedback is available.",
        403,
      );
    await runtime.assertRestoredInTransaction!(client);
    await runtime.assertScopeAllowedInTransaction!(
      actor,
      scope.creatorId,
      scope.threadId,
      {
        fanAccountId: scope.fanAccountId,
        creatorAccountId: scope.creatorAccountId,
      },
      client,
    );
    await assertDevelopmentFeedbackCatalog(client);
    const row = (
      await client.query<{
        current: Date;
        began: Date;
        expiry: Date;
        pid: number;
        transaction: string;
        account: string;
        creator: string;
        fan: string;
        session: string;
      }>(
        `SELECT clock_timestamp() AS current,transaction_timestamp() AS began,
      least(transaction_timestamp()+interval '7 days',$1::timestamptz) AS expiry,
      pg_backend_pid() AS pid,pg_current_xact_id()::text AS transaction,
      current_setting('app.account_id',true) AS account,current_setting('app.creator_id',true) AS creator,
      current_setting('app.fan_id',true) AS fan,current_setting('app.identity_session_id',true) AS session`,
        [developmentIntroOfferRetention.offerExpiresAt],
      )
    ).rows[0];
    if (
      !row ||
      row.account !== scope.actorAccountId ||
      row.creator !== scope.creatorId ||
      row.fan !== scope.fanId ||
      row.session !== request.sessionId
    )
      throw feedbackUnavailable();
    return row;
  };
  const inPeriod = (row: Awaited<ReturnType<typeof bookend>>) =>
    row.current.getTime() >= startsAt &&
    row.current.getTime() < endsAt &&
    row.began.getTime() >= startsAt &&
    row.began.getTime() < endsAt &&
    row.expiry.getTime() > row.current.getTime();
  const held = <T>(
    scope: ThreadScope,
    client: PoolClient,
    read: (row: Awaited<ReturnType<typeof bookend>>) => T | Promise<T>,
  ) =>
    runtime.database.withHeldThreadOperation(scope, client, async () => {
      const before = await bookend(scope, client);
      const result = await read(before);
      const after = await bookend(scope, client);
      if (
        before.pid !== after.pid ||
        before.transaction !== after.transaction ||
        before.session !== after.session ||
        inPeriod(before) !== inPeriod(after)
      )
        throw feedbackUnavailable();
      return result;
    });
  const replyFeedbackAuthority: ReplyFeedbackAuthority = Object.freeze({
    current: (scope: ThreadScope, client: PoolClient) =>
      held(scope, client, (row) =>
        inPeriod(row) ? developmentFeedbackPolicy : null,
      ),
    consent: (scope: ThreadScope, client: PoolClient, policyVersion: string) =>
      held(scope, client, (row) => {
        if (
          policyVersion !== developmentFeedbackPolicy.version ||
          !inPeriod(row)
        )
          throw new DomainError(
            "feedback_policy_changed",
            "Review the current feedback notice before sending.",
            409,
          );
        return {
          policy: developmentFeedbackPolicy,
          expiresAt: row.expiry.toISOString(),
        };
      }),
  });
  const introOfferPolicy: DevelopmentFeedback["introOfferPolicy"] = (
    scope,
    client,
    consent,
  ) =>
    held(scope, client, (row) => {
      const expiry = Date.parse(consent.expiresAt);
      if (
        consent.policyVersion !== developmentFeedbackPolicy.version ||
        !inPeriod(row) ||
        !Number.isFinite(expiry) ||
        expiry <= row.current.getTime() ||
        expiry > row.expiry.getTime()
      )
        throw new DomainError(
          "intro_offer_policy_changed",
          "This introduction offer is unavailable.",
          409,
        );
    });
  const purgeExpired: DevelopmentFeedback["purgeExpired"] = async (signal) => {
    check();
    if (requestAuthority.getStore() || signal.aborted)
      throw feedbackUnavailable();
    const client = await worker.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      await runtime.assertRestoredInTransaction!(client);
      await assertDevelopmentFeedbackCatalog(client);
      const result = (
        await client.query<{
          feedback_deleted: number;
          events_deleted: number;
        }>("SELECT * FROM creator_trust.purge_development_feedback(100)")
      ).rows[0];
      if (
        !result ||
        !Number.isInteger(result.feedback_deleted) ||
        !Number.isInteger(result.events_deleted) ||
        result.feedback_deleted < 0 ||
        result.feedback_deleted > 100 ||
        result.events_deleted < 0 ||
        result.events_deleted > 100
      )
        throw feedbackUnavailable();
      await runtime.assertRestoredInTransaction!(client);
      await assertDevelopmentFeedbackCatalog(client);
      check();
      if (requestAuthority.getStore() || signal.aborted)
        throw feedbackUnavailable();
      await client.query("COMMIT");
      return Object.freeze({
        feedbackDeleted: result.feedback_deleted,
        eventsDeleted: result.events_deleted,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
  try {
    for (const pool of [runtime.pool, worker]) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
        await runtime.assertRestoredInTransaction!(client);
        await assertDevelopmentFeedbackCatalog(client);
        await client.query("ROLLBACK");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
  } catch (error) {
    closed = true;
    await worker.end();
    if (
      error instanceof DomainError &&
      ["development_feedback_unconfigured", "restoration_pending"].includes(
        error.code,
      )
    )
      return undefined;
    throw error;
  }
  return Object.freeze({
    replyFeedbackAuthority,
    introOfferPolicy,
    introOfferRetention: developmentIntroOfferRetention,
    purgeExpired,
    close: async () => {
      closed = true;
      await worker.end();
    },
  });
}
