import { copy } from "@qelvora/copy";
import pg from "pg";
import type { IdentityRuntime } from "../identity/router.js";
import { DomainError } from "../../core/errors.js";
import { unavailableOwners, type GrowthOwners } from "./contracts.js";
import { canonicalCreatorOwner } from "./integration.js";
import { createGrowthRuntime } from "./runtime.js";
import type {
  GrowthPrivacyScope,
  GrowthPrivacyTaskAuthority,
} from "./lifecycle.js";
import type { DeliveryProvider } from "./notifications.js";
import type { GrowthEventSource } from "./relay.js";
import type { ActivationSource, ThanksPermission } from "./retention.js";

/** Canonical host seam. Owner callbacks are injected; absent producers never become fixtures. */
export async function configureGrowthForBackend(
  input: {
    pool: pg.Pool;
    identity: IdentityRuntime | undefined;
    owners?: Partial<GrowthOwners>;
    privacyScope?: GrowthPrivacyScope;
    privacyTaskAuthority?: GrowthPrivacyTaskAuthority;
    assertAllowed?: Parameters<typeof canonicalCreatorOwner>[1];
    provider?: DeliveryProvider;
    sources?: readonly GrowthEventSource[];
    activationSource?: ActivationSource;
    thanksPermission?: ThanksPermission;
    experimentsEnabled?: boolean;
  },
  env: NodeJS.ProcessEnv = process.env,
) {
  if (env.GROWTH_ENABLED !== "true") return null;
  if (!input.identity)
    throw new Error("Growth requires canonical identity sessions.");
  if (
    !env.GROWTH_WORKER_DATABASE_URL ||
    !/^[a-f0-9]{64}$/iu.test(env.GROWTH_ENCRYPTION_KEY ?? "")
  )
    throw new Error(
      "Growth requires a distinct worker URL and a managed 32-byte key.",
    );
  const worker = new pg.Pool({
    connectionString: env.GROWTH_WORKER_DATABASE_URL,
    max: 4,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
  });
  try {
    const runtime = await createGrowthRuntime({
      runtimePool: input.pool,
      workerPool: worker,
      secret: Buffer.from(env.GROWTH_ENCRYPTION_KEY!, "hex"),
      owners: {
        ...unavailableOwners,
        ...input.owners,
        creatorFor: input.assertAllowed
          ? canonicalCreatorOwner(input.identity.profiles, input.assertAllowed)
          : async (actor) => {
              const profile = await input.identity!.profiles.view(actor);
              if (profile.creator?.verification !== "verified") return null;
              throw new DomainError(
                "growth_restrictions_unconfigured",
                copy.growthErrorGrowthRestrictionsUnconfigured,
                503,
              );
            },
        home:
          input.owners?.home ??
          (async () => {
            throw new DomainError(
              "home_owner_unconfigured",
              copy.growthErrorHomeOwnerUnconfigured,
              503,
            );
          }),
      },
      privacyScope: input.privacyScope,
      privacyTaskAuthority: input.privacyTaskAuthority,
      provider: input.provider,
      sources: input.sources,
      activationSource: input.activationSource,
      thanksPermission: input.thanksPermission,
      experimentsEnabled: input.experimentsEnabled,
      installURLs: {
        ...(env.GROWTH_IOS_INSTALL_URL
          ? { ios: env.GROWTH_IOS_INSTALL_URL }
          : {}),
        ...(env.GROWTH_ANDROID_INSTALL_URL
          ? { android: env.GROWTH_ANDROID_INSTALL_URL }
          : {}),
      },
    });
    return {
      ...runtime,
      async close() {
        await runtime.stop();
        await worker.end();
      },
    };
  } catch (error) {
    await worker.end();
    throw error;
  }
}
