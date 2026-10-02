import type { Pool } from "pg";
import { GrowthDatabase } from "./database.js";
import { GrowthService } from "./service.js";
import type { GrowthOwners } from "./contracts.js";
import type { DeliveryProvider } from "./notifications.js";
import {
  Retention,
  type ActivationSource,
  type ThanksPermission,
} from "./retention.js";
import { Engagement } from "./engagement.js";
import { GrowthExperiments } from "./experiments.js";
import { GrowthRelay, type GrowthEventSources } from "./relay.js";
import {
  growthPrivacyHook,
  type GrowthPrivacyScope,
  type GrowthPrivacyTaskAuthority,
} from "./lifecycle.js";
import { registerGrowth } from "./integration.js";
import type { CreatorProjectionSource } from "./creator-projection.js";
import {
  rotatingGrowthSources,
  databaseGrowthSourceCheckpoint,
  type GrowthSourceDirectory,
  type GrowthSourceCheckpoint,
} from "./sources.js";

/** Same runtime mounts in W1's canonical app and supplies W8's account-job hook. */
export async function createGrowthRuntime(input: {
  runtimePool: Pool;
  workerPool: Pool;
  secret: Buffer;
  owners: GrowthOwners;
  creatorSource?: CreatorProjectionSource;
  provider?: DeliveryProvider;
  verificationOrigin?: string;
  sources?: GrowthEventSources;
  sourceScan?: {
    directory: GrowthSourceDirectory;
    checkpoint?: GrowthSourceCheckpoint;
    namespace?: string;
    pageSize?: number;
  };
  activationSource?: ActivationSource;
  thanksPermission?: ThanksPermission;
  privacyScope?: GrowthPrivacyScope;
  privacyTaskAuthority?: GrowthPrivacyTaskAuthority;
  installURLs?: Partial<Record<"ios" | "android", string>>;
  experimentsEnabled?: boolean;
  observe?: (
    name:
      | "growth_worker_failure"
      | "growth_relay_claimed"
      | "growth_delivery_claimed",
    value: number,
  ) => void;
}) {
  if (input.sources && input.sourceScan)
    throw new Error("growth_source_configuration_conflict");
  const db = new GrowthDatabase(input.runtimePool, input.workerPool);
  await db.ready();
  const schema = await input.workerPool.query(
    "SELECT to_regclass('growth.producer_relay') IS NOT NULL AND to_regclass('growth.erasure_fence') IS NOT NULL AND to_regclass('growth.prompt_choice') IS NOT NULL AND to_regclass('growth.entry_attribution') IS NOT NULL AND EXISTS(SELECT FROM information_schema.columns WHERE table_schema='growth' AND table_name='prompt_choice' AND column_name='last_claim_id') AS current",
  );
  if (!schema.rows[0]?.current)
    throw new Error("Growth continuation migration is required.");
  const service = new GrowthService(
    db,
    input.owners,
    input.secret,
    input.provider,
    input.verificationOrigin,
    input.creatorSource,
  );
  const checkpointSchema = (
    await input.workerPool.query(
      "SELECT to_regclass('growth.source_scan_checkpoint') IS NOT NULL AND (SELECT count(*)=2 FROM information_schema.columns WHERE table_schema='growth' AND table_name='source_scan_checkpoint' AND column_name IN ('generation','expires_at')) AS ready",
    )
  ).rows[0]?.ready;
  const creatorCheckpoint =
    checkpointSchema && input.creatorSource
      ? databaseGrowthSourceCheckpoint(service, "creator-directory-v1")
      : null;
  const sourceFactory = input.sourceScan
    ? rotatingGrowthSources(
        input.sourceScan.directory,
        input.sourceScan.checkpoint ??
          databaseGrowthSourceCheckpoint(service, input.sourceScan.namespace),
        input.sourceScan.pageSize,
      )
    : input.sources;
  const retention = new Retention(service, input.thanksPermission);
  const relay = new GrowthRelay(service);
  const engagement = new Engagement(service, input.installURLs);
  const experiments = new GrowthExperiments(service, input.experimentsEnabled);
  let running: Promise<void> | null = null,
    timer: ReturnType<typeof setTimeout> | null = null,
    stopped = true;
  let sourceCount: number | null =
    typeof sourceFactory === "function" ? null : (sourceFactory?.length ?? 0);
  let sourceReadiness:
    | "unconfigured"
    | "pending"
    | "available"
    | "unavailable" = sourceFactory ? "pending" : "unconfigured";
  let creatorCursor: string | null = null;
  let creatorReadiness:
    | "unconfigured"
    | "pending"
    | "available"
    | "unavailable" = input.creatorSource ? "pending" : "unconfigured";
  async function tick() {
    if (checkpointSchema) {
      try {
        await input.workerPool.query(
          "UPDATE growth.source_scan_checkpoint SET encrypted_cursor=NULL,generation=generation+1,updated_at=now() WHERE expires_at<=clock_timestamp() AND encrypted_cursor IS NOT NULL",
        );
      } catch {
        input.observe?.("growth_worker_failure", 1);
      }
    }
    if (input.creatorSource) {
      try {
        if (creatorCheckpoint) creatorCursor = await creatorCheckpoint.load();
        const ids = await input.creatorSource.page(creatorCursor, 25);
        for (const id of ids) await service.refreshCreator(id);
        const next = ids.length === 25 ? ids[24]! : null;
        if (creatorCheckpoint)
          await creatorCheckpoint.save(next, creatorCursor);
        creatorCursor = next;
        creatorReadiness = "available";
      } catch {
        // Do not advance on failure or block already leased delivery recovery.
        creatorReadiness = "unavailable";
        input.observe?.("growth_worker_failure", 1);
      }
    }
    let sources: readonly import("./relay.js").GrowthEventSource[] = [];
    try {
      sources =
        typeof sourceFactory === "function"
          ? await sourceFactory()
          : (sourceFactory ?? []);
      if (sources.length > 100)
        throw new Error("producer_scope_batch_exceeded");
      sourceCount = sources.length;
      sourceReadiness = sourceFactory ? "available" : "unconfigured";
    } catch {
      // Enumeration failure must not prevent existing leased inbox/delivery
      // recovery. Those paths recheck current owner state independently.
      sourceCount = null;
      sourceReadiness = "unavailable";
      sources = [];
      input.observe?.("growth_worker_failure", 1);
    }
    for (const source of sources) {
      try {
        await relay.pull(source);
      } catch {
        sourceReadiness = "unavailable";
        input.observe?.("growth_worker_failure", 1);
      }
    }
    const relayed = await relay.drain();
    input.observe?.("growth_relay_claimed", relayed.claimed);
    await retention.drainActivation(input.activationSource);
    const deliveries = await service.notifications.drain();
    input.observe?.("growth_delivery_claimed", deliveries.claimed);
  }
  function schedule() {
    if (stopped) return;
    timer = setTimeout(() => {
      timer = null;
      running = tick()
        .catch(() => input.observe?.("growth_worker_failure", 1))
        .finally(() => {
          running = null;
          schedule();
        });
    }, 1000);
    timer.unref();
  }
  return {
    service,
    retention,
    relay,
    engagement,
    experiments,
    feature: registerGrowth(service, { retention, engagement, experiments }),
    privacyHook: growthPrivacyHook(
      service,
      input.privacyScope,
      input.privacyTaskAuthority,
    ),
    tick,
    start() {
      if (!stopped) return;
      stopped = false;
      schedule();
    },
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      await running;
    },
    readiness: () => ({
      persistence: "available" as const,
      creatorProjection: creatorReadiness,
      creatorPublicAI: input.creatorSource?.publicAIConfigured ?? false,
      creatorScanDurable: Boolean(creatorCheckpoint),
      producerSources: sourceCount,
      producerReadiness: sourceReadiness,
      deliveryProvider: Boolean(input.provider),
      activationSource: Boolean(input.activationSource),
      privacyOwnership: Boolean(input.privacyTaskAuthority),
      privacyStreaming: Boolean(input.privacyTaskAuthority),
      experimentsEnabled: input.experimentsEnabled ?? false,
    }),
  };
}
