import pg from "pg";
import type { BackendRuntime } from "../../integration.js";
import type { createTrustRuntime } from "../../operations/runtime.js";
import { DomainError } from "../../core/errors.js";
import { requestAuthority } from "../identity/request-authority.js";
import { identityTransaction } from "../identity/transaction.js";
import { createAgentDomain } from "../agent/integration.js";
import { trustIdentityAuthority } from "./identity-authority.js";
import {
  scopedTrustEvidence,
  verificationEffects,
  agentPauseEffects,
} from "./domain-adapters.js";
import { createPrivacyConsumers } from "./privacy-consumers.js";
import { trustLocalRestorationInTransaction } from "./restoration.js";

/** W1 adds these to its development adapter. These are labels, never tokens,
 * membership grants, production identities or a second session issuer. */
export const developmentTrustActors = Object.freeze([
  {
    id: "10000000-0000-4000-8000-000000000004",
    label: "Development Ops supervisor",
  },
  {
    id: "10000000-0000-4000-8000-000000000005",
    label: "Development support reviewer",
  },
  {
    id: "10000000-0000-4000-8000-000000000006",
    label: "Development verification reviewer",
  },
]);

type TrustConfiguration = Omit<
  Parameters<typeof createTrustRuntime>[0],
  "actor" | "origin"
>;
type Consumers = Omit<
  Parameters<typeof createPrivacyConsumers>[0],
  "runtimePool" | "coordinatorPool"
>;

/** Canonical development-host composition. Existing database roles and synthetic
 * Ops memberships must be provisioned by the isolated database operator. */
export async function createDevelopmentTrust(
  runtime: BackendRuntime,
  options: {
    env?: NodeJS.ProcessEnv;
    consumers?: Consumers;
    agent?: ReturnType<typeof createAgentDomain>;
    settleDeparture?: Parameters<
      typeof agentPauseEffects
    >[0]["settleDeparture"];
  } = {},
): Promise<TrustConfiguration> {
  const env = options.env ?? process.env;
  if (
    env.NODE_ENV !== "development" ||
    env.TRUST_LOCAL_DEVELOPMENT !== "true" ||
    runtime.identity?.sessions.mode !== "development"
  )
    throw new Error(
      "Development trust requires explicit local configuration and canonical development sessions.",
    );
  const core = new URL(runtime.pool.options.connectionString ?? "");
  const connection = (name: string, role: string) => {
    const value = env[name];
    if (!value)
      throw new Error(`Provide ${name} for its separate non-owner role.`);
    const url = new URL(value);
    if (
      ![core.hostname, url.hostname].every((host) =>
        ["localhost", "127.0.0.1", "[::1]"].includes(host),
      ) ||
      url.hostname !== core.hostname ||
      url.port !== core.port ||
      url.pathname !== core.pathname ||
      url.username !== role ||
      core.username !== "creator_runtime"
    )
      throw new Error(
        "Development trust pools must use separate non-owner roles on the same loopback database.",
      );
    return value;
  };
  const apiConnection = connection(
    "TRUST_API_DATABASE_URL",
    "creator_trust_runtime",
  );
  const workerConnection = connection(
    "TRUST_WORKER_DATABASE_URL",
    "creator_trust_worker",
  );
  const apiPool = new pg.Pool({
    connectionString: apiConnection,
    max: 4,
    connectionTimeoutMillis: 2000,
    statement_timeout: 5000,
  });
  const workerPool = new pg.Pool({
    connectionString: workerConnection,
    max: 2,
    connectionTimeoutMillis: 2000,
    statement_timeout: 5000,
  });
  try {
    const projection = await runtime.pool.query(
      "SELECT to_regprocedure('creator_trust.runtime_thread_denial(uuid,uuid)') AS function",
    );
    if (!projection.rows[0]?.function)
      throw new Error("Development trust requires migration 0053.");
    const identity = runtime.identity;
    const identityAuthority = trustIdentityAuthority(
      runtime.pool,
      identity,
      runtime.access,
      runtime.database,
    );
    const verifySession = async (actor: {
      accountId: string;
      adultEligible: boolean;
    }) => {
      const current = requestAuthority.getStore();
      if (
        !actor.adultEligible ||
        !current ||
        current.accountId !== actor.accountId
      )
        throw new DomainError(
          "fresh_verification_required",
          "Sign in again to verify this development account.",
          401,
        );
      return identityTransaction(
        runtime.pool,
        actor.accountId,
        async (client) => {
          const session = (
            await client.query<{ created_at: Date }>(
              "SELECT created_at FROM creator.identity_session WHERE id=$1 AND account_id=$2 AND mode='development' AND revoked_at IS NULL AND expires_at>clock_timestamp()",
              [current.sessionId, actor.accountId],
            )
          ).rows[0];
          if (!session)
            throw new DomainError(
              "fresh_verification_required",
              "Sign in again to verify this development account.",
              401,
            );
          return {
            verifiedAt: session.created_at,
            reference: `development-w1-session:${current.sessionId}`,
          };
        },
      );
    };
    const agent =
      options.agent ?? createAgentDomain({ pool: runtime.pool, model: null });
    const restoreReadyInTransaction = trustLocalRestorationInTransaction(env);
    return {
      environment: "local-development",
      identityMode: "development",
      closePoolsOnStop: true,
      release: env.RELEASE_REVISION ?? "",
      apiPool,
      workerPool,
      dependencies: {
        ...identityAuthority,
        evidence: scopedTrustEvidence({
          pool: runtime.pool,
          access: runtime.access,
          database: runtime.database,
          identity: identity.profiles,
          commerce: options.consumers?.commerce,
          assertAllowed: (accountId, creatorId) =>
            runtime.assertCreatorAllowed(
              { accountId, adultEligible: true },
              creatorId,
            ),
        }),
        verifyExport: verifySession,
        verifyPrivacy: async (actor, input) => {
          if (input.proof !== "LOCAL DEVELOPMENT")
            throw new DomainError(
              "local_confirmation_required",
              "Type LOCAL DEVELOPMENT for this synthetic account.",
              401,
            );
          return verifySession(actor);
        },
      },
      privacyHooks: createPrivacyConsumers({
        runtimePool: runtime.pool,
        coordinatorPool: workerPool,
        ...options.consumers,
        assertRestoredInTransaction: async (client) => {
          if (!(await restoreReadyInTransaction(client)))
            throw new DomainError(
              "restoration_pending",
              "This environment is unavailable while recovery is verified.",
              503,
            );
        },
        agent: options.consumers?.agent ?? agent,
      }),
      effectHooks: [
        ...verificationEffects(workerPool, identity.profiles),
        ...agentPauseEffects({
          pool: workerPool,
          agent: agent.lifecycle,
          ownerScope: async (creatorId) => {
            const row = (
              await runtime.pool.query<{ account_id: string }>(
                "SELECT account_id FROM creator.creator_profile WHERE id=$1",
                [creatorId],
              )
            ).rows[0];
            if (!row)
              throw new DomainError(
                "creator_unavailable",
                "This creator is unavailable.",
                404,
              );
            return { creatorId, accountId: row.account_id, development: true };
          },
          settleDeparture:
            options.settleDeparture ??
            (async () => {
              throw new DomainError(
                "commerce_lifecycle_unconfigured",
                "Generation is denied; commitment settlement is not configured.",
                503,
              );
            }),
        }),
      ],
      probes: [
        {
          name: "identity",
          required: true,
          run: async () => ({
            state: "development",
            code: "synthetic_canonical_sessions",
          }),
        },
      ],
      restoreReady: async () => {
        if (
          env.RESTORED_TRAFFIC_DISABLED === "true" ||
          env.RESTORED_DATABASE_NAME
        )
          return false;
        const state = await apiPool.query<{ closed: boolean }>(
          "SELECT shobj_description(oid,'pg_database')='creator-platform:restored-traffic-closed' AS closed FROM pg_database WHERE datname=current_database()",
        );
        return state.rows.length === 1 && state.rows[0]?.closed !== true;
      },
      restoreReadyInTransaction,
      crisisResources: [],
    };
  } catch (error) {
    await Promise.all([apiPool.end(), workerPool.end()]);
    throw error;
  }
}
