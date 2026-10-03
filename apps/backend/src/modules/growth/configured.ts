import { copy } from "@qelvora/copy";
import pg from "pg";
import type { IdentityRuntime } from "../identity/router.js";
import { DomainError } from "../../core/errors.js";
import { unavailableOwners, type GrowthOwners } from "./contracts.js";
import {
  canonicalCreatorOwner,
  canonicalContentFollows,
} from "./integration.js";
import {
  canonicalCreatorProjections,
  type PublicCreatorAIProjection,
} from "./creator-projection.js";
import { createGrowthRuntime } from "./runtime.js";
import type {
  GrowthPrivacyScope,
  GrowthPrivacyTaskAuthority,
} from "./lifecycle.js";
import type { DeliveryProvider } from "./notifications.js";
import type { GrowthEventSources } from "./relay.js";
import type { ActivationSource, ThanksPermission } from "./retention.js";
import {
  spendingNotificationState,
  type SpendingNotificationReader,
} from "./account-notifications.js";
import {
  canonicalCoreContentFollows,
  type CoreFollowMigration,
} from "./core-follows.js";
import {
  weeklyImpactNotificationState,
  type WeeklyImpactNoticeReader,
} from "./impact-notifications.js";
import type { CurrentPostEntryReader } from "./entry-context.js";

/** Canonical host seam. Owner callbacks are injected; absent producers never become fixtures. */
export async function configureGrowthForBackend(
  input: {
    pool: pg.Pool;
    identity: IdentityRuntime | undefined;
    owners?: Partial<GrowthOwners>;
    publicCreatorAI?: PublicCreatorAIProjection;
    privacyScope?: GrowthPrivacyScope;
    privacyTaskAuthority?: GrowthPrivacyTaskAuthority;
    assertAllowed?: Parameters<typeof canonicalCreatorOwner>[1];
    provider?: DeliveryProvider;
    sources?: GrowthEventSources;
    sourceScan?: Parameters<typeof createGrowthRuntime>[0]["sourceScan"];
    activationSource?: ActivationSource;
    thanksPermission?: ThanksPermission;
    weeklyImpactSource?: Parameters<
      typeof createGrowthRuntime
    >[0]["weeklyImpactSource"];
    /** Actual W8 receipt for the unregistered core Follow proposal; absent stays unavailable. */
    coreFollowMigration?: CoreFollowMigration;
    spendingNotices?: SpendingNotificationReader;
    weeklyImpactNotices?: WeeklyImpactNoticeReader;
    /** W5's actual current recipient/public-entry purpose, never a public DTO fallback. */
    postEntryReader?: CurrentPostEntryReader;
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
  // Idle connection loss is reported by the pool, outside the tick's promise.
  // pg removes that client; later ticks still claim and recheck real leases.
  worker.on("error", () => {
    console.warn(
      "Growth worker database connection lost; leased work requires reconnecting.",
    );
  });
  try {
    const runtime = await createGrowthRuntime({
      runtimePool: input.pool,
      workerPool: worker,
      secret: Buffer.from(env.GROWTH_ENCRYPTION_KEY!, "hex"),
      creatorSource: canonicalCreatorProjections(
        input.pool,
        input.publicCreatorAI,
      ),
      owners: {
        ...unavailableOwners,
        ...input.owners,
        notificationState: async (event, recipient, custody) =>
          event.type === "spending_reminder"
            ? spendingNotificationState(input.spendingNotices)(
                event,
                recipient,
                custody,
              )
            : event.type === "weekly_impact"
              ? weeklyImpactNotificationState(input.weeklyImpactNotices)(
                  event,
                  recipient,
                  custody,
                )
              : (
                  input.owners?.notificationState ??
                  unavailableOwners.notificationState
                )(event, recipient, custody),
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
      verificationOrigin: env.GROWTH_PUBLIC_ORIGIN,
      sources: input.sources,
      sourceScan: input.sourceScan,
      activationSource: input.activationSource,
      thanksPermission: input.thanksPermission,
      weeklyImpactSource: input.weeklyImpactSource,
      postEntryReader: input.postEntryReader,
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
    let closeInFlight: Promise<void> | undefined;
    return {
      ...runtime,
      contentFollows: canonicalContentFollows(),
      coreContentFollows: canonicalCoreContentFollows(
        input.coreFollowMigration,
      ),
      close() {
        closeInFlight ??= (async () => {
          try {
            await runtime.stop();
          } finally {
            await worker.end();
          }
        })();
        return closeInFlight;
      },
    };
  } catch (error) {
    await worker.end();
    throw error;
  }
}
