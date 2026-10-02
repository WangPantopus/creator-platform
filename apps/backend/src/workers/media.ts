import pg from "pg";
import type { PoolClient } from "pg";
import { Database } from "../db/database.js";
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
import {
  MediaWorkerDatabase,
  type MediaWorkerDenial,
  type MediaWorkerFamily,
} from "../modules/media/worker-access.js";

type Family = MediaWorkerFamily;
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
export async function startMediaWorker(
  env: NodeJS.ProcessEnv = process.env,
  denied?: MediaWorkerDenial,
) {
  const environment = readMediaWorkerEnvironment(env);
  if (!environment)
    throw new Error(
      "Media is unconfigured: set MEDIA_STORAGE_ROOT, MEDIA_TICKET_SECRET, MEDIA_TICKET_ORIGIN and MEDIA_POLICY_FILE.",
    );
  if (!env.MEDIA_WORKER_DATABASE_URL)
    throw new Error(
      "The media worker requires a dedicated MEDIA_WORKER_DATABASE_URL.",
    );
  const pool = new pg.Pool({
    connectionString: env.MEDIA_WORKER_DATABASE_URL,
    max: workerBudgets.ingestion.connections,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
  const database = new Database(pool);
  const workerDatabase = new MediaWorkerDatabase(
    pool,
    denied ??
      (async () => {
        throw new DomainError(
          "media_worker_denial_unavailable",
          "Current media ingestion denial authority is unavailable.",
          503,
        );
      }),
  );
  try {
    await workerDatabase.ready();
  } catch (error) {
    await pool.end();
    throw error;
  }
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
    (scope, work) =>
      workerDatabase.transaction({ kind: "thread", ...scope }, work),
  );
  // Restore only purpose-specific worker RLS, including after request/session,
  // profile verification, owner or thread authority has been revoked.
  const creatorTransaction = <T>(
    scope: CreatorMediaWorkerScope,
    work: (client: PoolClient) => Promise<T>,
  ) => workerDatabase.transaction({ kind: "creator", ...scope }, work);
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

  const pendingAfter = async (family: Family) =>
    workerDatabase.transaction(family, async (client) =>
      Boolean(
        (
          await client.query(
            family.kind === "thread"
              ? "SELECT 1 FROM creator.media_asset WHERE creator_id=$1 AND fan_id=$2 AND job_available_at IS NOT NULL AND (state IN('quarantined','processing','revoked') OR manifest_pending OR delete_pending) LIMIT 1"
              : "SELECT 1 FROM creator.creator_media_asset WHERE creator_id=$1 AND owner_account_id=$2 AND job_available_at IS NOT NULL AND (state IN('quarantined','processing','revoked') OR manifest_pending OR delete_pending) LIMIT 1",
            [
              family.creatorId,
              family.kind === "thread" ? family.fanId : family.ownerAccountId,
            ],
          )
        ).rowCount,
      ),
    );
  const runFamily = async (family: Family) => {
    const started = Date.now();
    let processed = 0;
    if (family.kind === "thread") {
      while (processed < JOBS_PER_TURN && (await threadWorker.process(family)))
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

  let discoveryRunning = false;
  let discoveryCursor = "";
  const discover = async () => {
    if (stopping || discoveryRunning || queued.size >= 768) return;
    discoveryRunning = true;
    try {
      const jobs = await workerDatabase.discover(discoveryCursor);
      for (const job of jobs) enqueue(job.family);
      discoveryCursor =
        jobs.length === 128 ? jobs[jobs.length - 1]!.cursor : "";
    } catch {
      log("media_discovery_failed");
    } finally {
      discoveryRunning = false;
    }
  };
  const discoveryTimer = setInterval(() => void discover(), 10_000).unref();
  let listener: pg.Client | undefined;
  let listenerRetry: NodeJS.Timeout | undefined;
  const retryListener = () => {
    if (stopping || listenerRetry) return;
    listenerRetry = setTimeout(() => {
      listenerRetry = undefined;
      void listen().catch(() => {
        log("media_listener_retry_failed");
        retryListener();
      });
    }, 2000).unref();
  };
  const listen = async (): Promise<void> => {
    const client = new pg.Client({
      connectionString: env.MEDIA_WORKER_DATABASE_URL,
      connectionTimeoutMillis: 5000,
    });
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
      if (listener === client) listener = undefined;
      void client.end().catch(() => {});
      retryListener();
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${MEDIA_JOB_CHANNEL}`);
    } catch (error) {
      await client.end().catch(() => {});
      throw error;
    }
    if (stopping) {
      await client.end().catch(() => {});
      return;
    }
    listener = client;
    log("media_worker_listening", {
      credentials: Boolean(credentials),
      concurrency: workerBudgets.ingestion.concurrency,
    });
  };
  try {
    await listen();
    await discover();
  } catch (error) {
    stopping = true;
    clearInterval(discoveryTimer);
    if (listenerRetry) clearTimeout(listenerRetry);
    await listener?.end().catch(() => {});
    await pool.end();
    throw error;
  }

  return {
    enqueue,
    async close() {
      stopping = true;
      clearInterval(discoveryTimer);
      if (listenerRetry) clearTimeout(listenerRetry);
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
