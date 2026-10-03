import { lstat } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import type { PoolClient } from "pg";
import { DomainError } from "../core/errors.js";
import { ContentPublicationWorker } from "../modules/content/publication.js";
import {
  PublicationIdentityAuthority,
  type PublicationRestriction,
} from "../modules/identity/publication-scope.js";
import { createPublicationMedia } from "../modules/media/publication.js";
import { PrivateMediaStorage } from "../modules/media/storage.js";

/** Separate noninteractive process. It consumes the original stored act and
 * exact processed/credential bytes; it creates neither an Actor nor a signature.
 * Quote, packet, live and audience-count purpose projections stay unavailable
 * until their owners provide actual reviewed adapters. */
export async function startPublicationWorker(
  env: NodeJS.ProcessEnv,
  authority: {
    assertRestoredInTransaction: (client: PoolClient) => Promise<void>;
    assertAllowed: PublicationRestriction;
    assertPreparationAllowed: (client: PoolClient) => Promise<void>;
  },
) {
  if (
    !env.PUBLICATION_WORKER_DATABASE_URL ||
    typeof authority.assertRestoredInTransaction !== "function" ||
    typeof authority.assertAllowed !== "function" ||
    typeof authority.assertPreparationAllowed !== "function"
  )
    throw new DomainError(
      "publication_worker_unconfigured",
      "Configure the separate publication connection and held current authorities.",
      503,
    );
  const root = env.MEDIA_STORAGE_ROOT;
  if (!root || !path.isAbsolute(root) || root.includes("\0"))
    throw new Error(
      "Publication media requires its absolute private storage root.",
    );
  const meta = await lstat(root);
  if (!meta.isDirectory() || meta.isSymbolicLink() || (meta.mode & 0o077) !== 0)
    throw new Error("Publication media requires a private mode0700 directory.");
  const pool = new pg.Pool({
    connectionString: env.PUBLICATION_WORKER_DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
    pipeline: false,
    idleTimeoutMillis: 30000,
  });
  let stopping = false;
  const assertRestored = async (client: PoolClient) => {
    if (stopping)
      throw new DomainError(
        "publication_worker_stopping",
        "The worker is stopping.",
        503,
      );
    await authority.assertRestoredInTransaction(client);
  };
  const identity = new PublicationIdentityAuthority(pool, {
    assertDiscoveryAllowed: assertRestored,
    assertPreparationAllowed: async (client) => {
      await assertRestored(client);
      await authority.assertPreparationAllowed(client);
    },
    assertAllowed: async (client, task) => {
      await assertRestored(client);
      await authority.assertAllowed(client, task);
    },
  });
  try {
    await identity.assertRole();
    // Metadata only: the actual purpose login must be able to execute W6's
    // narrowly owned projection. This grants no scope or business-row access.
    // W8's canonical activation/custody is separately required by the operator.
    const projection = await pool.query<{ ready: boolean }>(
      `SELECT EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='creator'
       AND p.oid=to_regprocedure('creator.publication_media_snapshot(uuid,uuid,integer,uuid)')
       AND p.prosecdef AND r.rolname='creator_publication_authority'
       AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolinherit AND NOT r.rolbypassrls
       AND 'search_path=pg_catalog'=ANY(p.proconfig)
       AND has_function_privilege(current_user,p.oid,'EXECUTE')
       AND NOT pg_has_role(current_user,r.oid,'MEMBER')) AS ready`,
    );
    if (!projection.rows[0]?.ready)
      throw new DomainError(
        "publication_media_unconfigured",
        "Publication requires its activated purpose media projection.",
        503,
      );
  } catch (error) {
    await pool.end();
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      ["42501", "42883", "3F000", "42P01"].includes(String(error.code))
    )
      throw new DomainError(
        "publication_schema_unconfigured",
        "The activated purpose schema and grants are unavailable.",
        503,
      );
    throw error;
  }
  const worker = new ContentPublicationWorker({
    identity,
    media: createPublicationMedia({
      identity,
      storage: new PrivateMediaStorage(root),
    }),
  });
  let running: Promise<void> | undefined;
  const logFailure = (code: string) => {
    process.stderr.write(
      JSON.stringify({
        at: new Date().toISOString(),
        event: "publication_deferred",
        code,
      }) + "\n",
    );
  };
  const sweep = () => {
    if (stopping || running) return;
    running = worker
      .runPending(20)
      .then((result) => {
        if (result.published)
          process.stdout.write(
            JSON.stringify({
              at: new Date().toISOString(),
              event: "publication_completed",
              count: result.published,
            }) + "\n",
          );
        result.failures.forEach(logFailure);
      })
      .catch((error: unknown) =>
        logFailure(
          error instanceof DomainError ? error.code : "publication_unavailable",
        ),
      )
      .finally(() => {
        running = undefined;
      });
  };
  const timer = setInterval(sweep, 5000);
  sweep();
  return {
    async close() {
      stopping = true;
      clearInterval(timer);
      // Later discovery/issuance is refused; one actual in-flight transaction
      // may finish under its existing identity, denial and statement deadlines.
      await running;
      await pool.end();
    },
  };
}
