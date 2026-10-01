import pg from "pg";
import type { PoolClient } from "pg";
import { Database } from "../db/database.js";
import { AccessService, type ThreadScope } from "../modules/access/scope.js";
import { DomainError } from "../core/errors.js";
import { CreatorIdentityAuthority } from "../modules/identity/creator-scope.js";
import { readMediaWorkerEnvironment } from "../modules/media/environment.js";
import { MediaService } from "../modules/media/service.js";
import { CreatorMediaService } from "../modules/media/creator-service.js";
import {
  CreatorMediaWorker,
  type CreatorMediaWorkerScope,
} from "../modules/media/creator-worker.js";
import { MediaWorker } from "../modules/media/worker.js";
import { ClamdMalwareScanner } from "../modules/media/processor.js";
import { C2PAToolCredentialSigner } from "../modules/media/credentials.js";
import { MEDIA_JOB_CHANNEL, MediaJobSchema } from "../modules/media/jobs.js";
import {
  CreatorMediaTickets,
  MediaTickets,
  PrivateMediaStorage,
} from "../modules/media/storage.js";
import { workerBudgets } from "./pool.js";

type Family =
  | Readonly<{
      kind: "thread";
      creatorId: string;
      fanId: string;
      ownerAccountId: string;
    }>
  | Readonly<{ kind: "creator"; creatorId: string; ownerAccountId: string }>;
const familyKey = (family: Family) =>
  family.kind === "thread"
    ? `thread:${family.creatorId}:${family.fanId}:${family.ownerAccountId}`
    : `creator:${family.creatorId}:${family.ownerAccountId}`;
/** Jobs that fail on configuration or an external effect retry after a minute. */
const RETRY_MS = 65_000;
/** Bounded per wakeup; a long family yields to others and is re-queued. */
const JOBS_PER_TURN = 16;

/** Ingestion-pool media runtime. Never runs in the interactive API process:
 * scanning, decoding, transcoding and content credentials execute only here. */
export async function startMediaWorker(env: NodeJS.ProcessEnv = process.env) {
  const environment = readMediaWorkerEnvironment(env);
  if (!environment)
    throw new Error(
      "Media is unconfigured: set MEDIA_STORAGE_ROOT, MEDIA_TICKET_SECRET, MEDIA_TICKET_ORIGIN and MEDIA_POLICY_FILE.",
    );
  if (!env.DATABASE_URL)
    throw new Error("The media worker requires a non-owner DATABASE_URL.");
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: workerBudgets.ingestion.connections,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
  const database = new Database(pool);
  await database.assertRuntimeRole();
  const access = new AccessService(pool);
  const storage = new PrivateMediaStorage(environment.storageRoot);
  // The worker reads no policy and serves nothing; deny every interactive path.
  const media = new MediaService(
    database,
    storage,
    new MediaTickets(environment.ticketSecret, environment.ticketOrigin),
    { policy: async () => null, denied: async () => true },
  );
  const creatorMedia = new CreatorMediaService(
    new CreatorIdentityAuthority(pool, {
      mode: "pantopus",
      assertAllowed: async () => {
        throw new DomainError("worker_scope", "Not an interactive scope.", 403);
      },
    }),
    database,
    storage,
    new CreatorMediaTickets(environment.ticketSecret, environment.ticketOrigin),
    {
      policy: async () => null,
      denied: async () => true,
      currentAssetRead: async () => false,
    },
  );
  const scanner = new ClamdMalwareScanner(environment.clamdSocket);
  const credentials = environment.credentials
    ? new C2PAToolCredentialSigner(environment.credentials)
    : undefined;
  const threadWorker = new MediaWorker(
    media,
    scanner,
    credentials,
    environment.ffmpeg,
    environment.ffprobe,
  );
  // Restore the uploader's scoped non-owner RLS family in every transaction and
  // recheck that the account still owns the creator profile it uploaded under.
  const creatorTransaction = async <T>(
    scope: CreatorMediaWorkerScope,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT set_config('app.creator_id',$1,true),set_config('app.account_id',$2,true),set_config('app.fan_id','',true)",
        [scope.creatorId, scope.ownerAccountId],
      );
      const owner = await client.query(
        "SELECT 1 FROM creator.creator_profile WHERE id=$1 AND account_id=$2 FOR SHARE",
        [scope.creatorId, scope.ownerAccountId],
      );
      if (owner.rowCount !== 1)
        throw new DomainError(
          "creator_unavailable",
          "The uploading creator account no longer owns this profile.",
          404,
        );
      const value = await work(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
  const creatorWorker = new CreatorMediaWorker(
    creatorMedia,
    creatorTransaction,
    scanner,
    credentials,
    environment.ffmpeg,
    environment.ffprobe,
  );

  const queued = new Map<string, Family>();
  const running = new Set<string>();
  const runningByCreator = new Map<string, number>();
  const retries = new Map<string, NodeJS.Timeout>();
  let stopping = false;
  const log = (event: string, detail: Record<string, unknown> = {}) =>
    process.stdout.write(
      `${JSON.stringify({ at: new Date().toISOString(), event, ...detail })}\n`,
    );

  const threadScope = (family: Extract<Family, { kind: "thread" }>) =>
    // Process-local scope for this queued family only, resolved from the
    // durable uploader identity. Outside a request, session checks defer to
    // the job; RLS and every lease/version fence still apply.
    access.openThread(
      { accountId: family.ownerAccountId, adultEligible: true },
      family.creatorId,
      family.fanId,
      false,
    ) as Promise<ThreadScope>;
  const pendingAfter = async (family: Family) => {
    if (family.kind === "thread") {
      const scope = await threadScope(family);
      return database.withThread(scope, async (client) =>
        Boolean(
          (
            await client.query(
              "SELECT 1 FROM creator.media_asset WHERE creator_id=$1 AND fan_id=$2 AND job_available_at IS NOT NULL AND (state IN('quarantined','processing','revoked') OR manifest_pending OR delete_pending) LIMIT 1",
              [family.creatorId, family.fanId],
            )
          ).rowCount,
        ),
      );
    }
    return creatorTransaction(family, async (client) =>
      Boolean(
        (
          await client.query(
            "SELECT 1 FROM creator.creator_media_asset WHERE creator_id=$1 AND owner_account_id=$2 AND job_available_at IS NOT NULL AND (state IN('quarantined','processing','revoked') OR manifest_pending OR delete_pending) LIMIT 1",
            [family.creatorId, family.ownerAccountId],
          )
        ).rowCount,
      ),
    );
  };
  const runFamily = async (family: Family) => {
    const started = Date.now();
    let processed = 0;
    if (family.kind === "thread") {
      const scope = await threadScope(family);
      while (processed < JOBS_PER_TURN && (await threadWorker.process(scope)))
        processed++;
    } else
      while (processed < JOBS_PER_TURN && (await creatorWorker.process(family)))
        processed++;
    log("media_family_processed", {
      family: family.kind,
      creatorId: family.creatorId,
      processed,
      elapsedMs: Date.now() - started,
    });
    return processed;
  };
  const drain = () => {
    if (stopping) return;
    for (const [key, family] of queued) {
      if (running.size >= workerBudgets.ingestion.concurrency) return;
      if (running.has(key)) continue;
      if (
        (runningByCreator.get(family.creatorId) ?? 0) >=
        workerBudgets.ingestion.perCreator
      )
        continue;
      queued.delete(key);
      running.add(key);
      runningByCreator.set(
        family.creatorId,
        (runningByCreator.get(family.creatorId) ?? 0) + 1,
      );
      void runFamily(family)
        .then(async (processed) => {
          // More work than one turn: yield, then continue this family.
          if (processed >= JOBS_PER_TURN) enqueue(family);
          else if (await pendingAfter(family)) scheduleRetry(family);
        })
        .catch((error: unknown) => {
          log("media_family_failed", {
            family: family.kind,
            creatorId: family.creatorId,
            code:
              error instanceof DomainError
                ? error.code
                : error instanceof Error && /^[a-z_]+$/u.test(error.message)
                  ? error.message
                  : "media_worker_failed",
          });
          scheduleRetry(family);
        })
        .finally(() => {
          running.delete(key);
          runningByCreator.set(
            family.creatorId,
            (runningByCreator.get(family.creatorId) ?? 1) - 1,
          );
          drain();
        });
    }
  };
  const enqueue = (family: Family) => {
    const key = familyKey(family);
    if (queued.has(key)) return;
    if (queued.size >= 1024) {
      // Dropping is safe: rows stay claimable and the next read re-announces.
      log("media_queue_full", { creatorId: family.creatorId });
      return;
    }
    queued.set(key, family);
    drain();
  };
  const scheduleRetry = (family: Family) => {
    const key = familyKey(family);
    if (stopping || retries.has(key)) return;
    retries.set(
      key,
      setTimeout(() => {
        retries.delete(key);
        enqueue(family);
      }, RETRY_MS).unref(),
    );
  };

  let listener: pg.Client | undefined;
  const listen = async (): Promise<void> => {
    const client = new pg.Client({ connectionString: env.DATABASE_URL });
    client.on("notification", (message) => {
      if (message.channel !== MEDIA_JOB_CHANNEL || !message.payload) return;
      try {
        const job = MediaJobSchema.parse(JSON.parse(message.payload));
        const family: Family =
          job.kind === "thread"
            ? {
                kind: "thread",
                creatorId: job.creatorId,
                fanId: job.fanId,
                ownerAccountId: job.ownerAccountId,
              }
            : {
                kind: "creator",
                creatorId: job.creatorId,
                ownerAccountId: job.ownerAccountId,
              };
        enqueue(family);
      } catch {
        log("media_wakeup_invalid");
      }
    });
    client.on("error", () => {
      if (stopping) return;
      log("media_listener_lost");
      listener = undefined;
      void client.end().catch(() => {});
      setTimeout(() => void listen().catch(() => {}), 2000).unref();
    });
    await client.connect();
    await client.query(`LISTEN ${MEDIA_JOB_CHANNEL}`);
    listener = client;
    log("media_worker_listening", {
      credentials: Boolean(credentials),
      concurrency: workerBudgets.ingestion.concurrency,
    });
  };
  await listen();

  return {
    enqueue,
    async close() {
      stopping = true;
      for (const timer of retries.values()) clearTimeout(timer);
      retries.clear();
      queued.clear();
      await listener?.end().catch(() => {});
      // In-flight scanner/parser processes finish or hit their own deadlines;
      // durable leases fence any work that outlives this process.
      const deadline = Date.now() + 70_000;
      while (running.size && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 250));
      await pool.end();
    },
  };
}
