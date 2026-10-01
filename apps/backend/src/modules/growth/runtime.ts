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

/** Same runtime mounts in W1's canonical app and supplies W8's account-job hook. */
export async function createGrowthRuntime(input: {
  runtimePool: Pool;
  workerPool: Pool;
  secret: Buffer;
  owners: GrowthOwners;
  provider?: DeliveryProvider;
  sources?: GrowthEventSources;
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
  );
  const retention = new Retention(service, input.thanksPermission);
  const relay = new GrowthRelay(service);
  const engagement = new Engagement(service, input.installURLs);
  const experiments = new GrowthExperiments(service, input.experimentsEnabled);
  let running: Promise<void> | null = null,
    timer: ReturnType<typeof setTimeout> | null = null,
    stopped = true;
  let sourceCount: number | null =
    typeof input.sources === "function" ? null : (input.sources?.length ?? 0);
  let sourceReadiness:
    | "unconfigured"
    | "pending"
    | "available"
    | "unavailable" = input.sources ? "pending" : "unconfigured";
  async function tick() {
    let sources: readonly import("./relay.js").GrowthEventSource[] = [];
    try {
      sources =
        typeof input.sources === "function"
          ? await input.sources()
          : (input.sources ?? []);
      if (sources.length > 100)
        throw new Error("producer_scope_batch_exceeded");
      sourceCount = sources.length;
      sourceReadiness = input.sources ? "available" : "unconfigured";
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
      producerSources: sourceCount,
      producerReadiness: sourceReadiness,
      deliveryProvider: Boolean(input.provider),
      activationSource: Boolean(input.activationSource),
      privacyOwnership: Boolean(
        input.privacyScope || input.privacyTaskAuthority,
      ),
      privacyStreaming: Boolean(input.privacyTaskAuthority),
      experimentsEnabled: input.experimentsEnabled ?? false,
    }),
  };
}
