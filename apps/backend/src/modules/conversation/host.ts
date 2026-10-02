import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { BackendConfig } from "../../config.js";
import type { BackendRuntime } from "../../integration.js";
import { invariant } from "../../core/errors.js";
import type { ThreadScope } from "../access/scope.js";
import { createAgentDomain } from "../agent/integration.js";
import { modelFromEnvironment } from "../agent/model.js";
import {
  GENERATION_JOURNAL_MIGRATION,
  PreparedGenerationJournal,
} from "../agent/generation-journal.js";
import type { LicenseVerifier } from "../agent/service.js";
import { DevelopmentLicenseVerifier } from "../agent/development-license.js";
import type { ApprovedSentence } from "../agent/runtime.js";
import { createCommerceRuntime } from "../commerce/runtime.js";
import { readCommerceEnvironment } from "../commerce/environment.js";
import { createCommerceAudience } from "../commerce/audience.js";
import {
  attributedGenerationCostPolicy,
  ReviewedGenerationCostRule,
} from "../commerce/attributed-cost-policy.js";
import type { MediaService } from "../media/service.js";
import { ProviderPolicySchema } from "../../../../../packages/api/src/conversation/contracts.js";
import { conversationAgentGenerator } from "./agent-generator.js";
import { ConversationCorrections } from "./corrections.js";
import { ConversationLineage } from "./lineage.js";
import { ConversationRecordings } from "./recordings.js";
import { createConversationRuntime } from "./runtime.js";
import {
  DevelopmentConversationPolicy,
  SYNTHETIC_PROVIDER_REFERENCE,
} from "./development-policy.js";

const migrations = {
  journal: GENERATION_JOURNAL_MIGRATION,
  cost: "0049_w4_generation_cost_settlement",
  lineage: "0056_w3_correction_feedback_lineage",
  feedbackConsent: "0057_w3_feedback_consent",
  correction: "0058_w3_correction_signature",
  recording: "0059_w3_recording_association",
} as const;

/** Explicit development economics from a private host file. No default rule,
 * ceiling or trial size is compiled into the product. */
const DevelopmentEconomicsSchema = z.strictObject({
  label: z.literal("development"),
  costRule: ReviewedGenerationCostRule,
  /** Earlier rules stay so late receipts settle under their original version. */
  priorCostRules: z.array(ReviewedGenerationCostRule).max(16).default([]),
  trialAllowance: z.number().int().positive().max(2147483647),
});

/** Inputs supplied by their owners. Absent inputs keep their paths off. */
export type ConversationHostProducers = {
  /** W4: genuinely prepared original group fulfillment on this exact graph. */
  fulfillmentPlans?: import("../commerce/fulfillment-plans.js").CommerceFulfillmentPlans;
  /** W2: the configured license authority for this host. */
  licenseVerifier?: LicenseVerifier;
  /** W2: the reviewed thread-accounting retention for the usage journal. */
  journalPolicy?: {
    retentionPolicyVersion: string;
    assertPrivacyRegistered: () => Promise<void>;
  };
  /** W6: the host's media runtime on this same database pool. */
  media?: MediaService;
  /** W6: fan reads of signed recordings ask W3 for the exact publication. */
  bindRecordingPublication?: (
    port: ConversationRecordings["currentPublication"],
  ) => void;
};

type Registry = { migrations: { version: string; path: string }[] };
const repositoryRoot = new URL("../../../../../", import.meta.url);

/** Only an executable registry entry counts. The expected checksum is the
 * reviewed file's own bytes, never a value read back from the database. */
async function registeredChecksum(version: string) {
  const registry = JSON.parse(
    await readFile(new URL("infra/migrations.json", repositoryRoot), "utf8"),
  ) as Registry;
  const entry = registry.migrations.find((item) => item.version === version);
  if (!entry) return undefined;
  const sql = await readFile(new URL(entry.path, repositoryRoot));
  return createHash("sha256").update(sql).digest("hex");
}

const loopback = (origin: string) =>
  ["localhost", "127.0.0.1"].includes(new URL(origin).hostname);

/** Explicit fictional creators whose Studio sources this development host
 * ingests. No private creator is enumerated; production never runs this. */
const DevelopmentIngestionSchema = z
  .string()
  .transform((value) => value.split(",").filter(Boolean))
  .pipe(
    z
      .array(
        z
          .string()
          .regex(/^[0-9a-f-]{36}:[0-9a-f-]{36}$/u)
          .transform((pair) => {
            const [creatorId, accountId] = pair.split(":") as [string, string];
            return {
              creatorId: z.uuid().parse(creatorId),
              accountId: z.uuid().parse(accountId),
            };
          }),
      )
      .max(8),
  );

/** Canonical host composition for conversations, Creator AI and commerce.
 * Without W3_FAN_GENERATION=development the conversation graph keeps the
 * previous behavior. With it, fan generation turns on only when every genuine
 * producer is present; otherwise startup names what is missing and stays off.
 * Lineage, corrections and recordings activate only with registered schema. */
export async function composeConversationHost(
  runtime: BackendRuntime,
  config: BackendConfig,
  producers: ConversationHostProducers = {},
  env: NodeJS.ProcessEnv = process.env,
) {
  const base = readCommerceEnvironment(runtime.pool, env);
  const requested = env.W3_FAN_GENERATION === "development";
  if (requested)
    invariant(
      env.NODE_ENV === "development" &&
        config.identityAdapter === "development" &&
        loopback(config.allowedOrigin) &&
        base,
      "fan_generation_host_invalid",
      "Development fan generation requires NODE_ENV=development, development identity, a loopback web origin and COMMERCE_CURRENCY.",
    );
  const missing: string[] = [];
  const policy = env.W3_PROVIDER_POLICY_FILE
    ? ProviderPolicySchema.parse(
        JSON.parse(await readFile(env.W3_PROVIDER_POLICY_FILE, "utf8")),
      )
    : undefined;
  let developmentPolicy: DevelopmentConversationPolicy | undefined;
  if (
    requested &&
    producers.licenseVerifier instanceof DevelopmentLicenseVerifier
  ) {
    invariant(
      !policy?.verified,
      "synthetic_policy_unreviewed_required",
      "Synthetic development policy must remain unreviewed. It cannot represent provider approval.",
    );
    if (
      policy?.reference === SYNTHETIC_PROVIDER_REFERENCE &&
      runtime.identity?.sessions
    )
      developmentPolicy = DevelopmentConversationPolicy.prepare({
        pool: runtime.pool,
        policy,
        verifier: producers.licenseVerifier,
        sessions: runtime.identity.sessions,
        reference: env.W2_PROVIDER_POLICY_REFERENCE,
        host: {
          environment: env.NODE_ENV,
          enabled: env.W2_DEVELOPMENT_SYNTHETIC_LICENSING,
          identityMode: config.identityAdapter,
          webOrigin: config.allowedOrigin,
        },
      });
  }
  if (!policy?.verified && !developmentPolicy)
    missing.push("named provider policy");
  const economics =
    requested && env.W3_DEVELOPMENT_ECONOMICS_FILE
      ? DevelopmentEconomicsSchema.parse(
          JSON.parse(await readFile(env.W3_DEVELOPMENT_ECONOMICS_FILE, "utf8")),
        )
      : undefined;
  if (!economics) missing.push("development economics");
  const model = requested ? modelFromEnvironment(env) : null;
  if (!model) missing.push("provider model and credentials");
  else if (!model.pricingConfigured) missing.push("provider rates");
  if (!producers.licenseVerifier) missing.push("license verifier (W2)");
  if (!runtime.access.threadScopeInTransactionAvailable)
    missing.push("in-transaction denial (W8)");

  let journal: PreparedGenerationJournal | undefined;
  const journalChecksum = await registeredChecksum(migrations.journal);
  if (!journalChecksum) missing.push(`registered ${migrations.journal}`);
  else if (!producers.journalPolicy) missing.push("journal policy (W2)");
  else if (requested)
    journal = await PreparedGenerationJournal.prepare(runtime.pool, {
      migration: { version: migrations.journal, checksum: journalChecksum },
      ...producers.journalPolicy,
    });
  const costChecksum = await registeredChecksum(migrations.cost);
  if (!costChecksum) missing.push(`registered ${migrations.cost}`);

  const ready = requested && missing.length === 0;
  let bound: ReturnType<typeof conversationAgentGenerator> | undefined;
  const current = () => {
    invariant(
      bound,
      "generation_unconfigured",
      "AI messaging is not connected yet.",
    );
    return bound;
  };
  const commerce = base
    ? await createCommerceRuntime({
        ...runtime,
        ...base,
        policy: {
          ...base.policy,
          ...(ready ? { trialAllowance: economics!.trialAllowance } : {}),
        },
        ...(ready
          ? {
              generationCostPolicy: attributedGenerationCostPolicy({
                journal: journal!,
                currentVersion: economics!.costRule.version,
                approvedRules: [
                  economics!.costRule,
                  ...economics!.priorCostRules,
                ],
                migration: {
                  version: migrations.cost,
                  checksum: costChecksum!,
                },
              }),
              trialReadiness: (scope: ThreadScope, client: PoolClient) =>
                current().assertReady(scope, client),
            }
          : {}),
      })
    : undefined;

  const lineage = await ConversationLineage.prepare({
    database: runtime.database,
    migrationVersion: migrations.lineage,
    feedbackMigration: await registeredChecksum(
      migrations.feedbackConsent,
    ).then((checksum) =>
      checksum ? { version: migrations.feedbackConsent, checksum } : undefined,
    ),
  });
  const corrections = lineage
    ? await ConversationCorrections.prepare({
        database: runtime.database,
        access: runtime.access,
        migrationVersion: migrations.correction,
      })
    : undefined;
  const recordings =
    lineage && producers.media
      ? await ConversationRecordings.prepare({
          database: runtime.database,
          access: runtime.access,
          media: producers.media,
          migrationVersion: migrations.recording,
          correctionMigrationVersion: migrations.correction,
        })
      : undefined;
  if (recordings)
    producers.bindRecordingPublication?.((scope, recording, client) =>
      recordings.currentPublication(scope, recording, client),
    );

  const audience = createCommerceAudience(runtime.database);
  let agent: ReturnType<typeof createAgentDomain> | undefined;
  const generation =
    ready && commerce?.generationCostReconciliation
      ? {
          generatorFactory: (
            memory: Parameters<
              NonNullable<
                Parameters<
                  typeof createConversationRuntime
                >[0]["generatorFactory"]
              >
            >[0],
          ) => {
            agent = createAgentDomain({
              pool: runtime.pool,
              model,
              licenseVerifier: producers.licenseVerifier!,
              audience,
              usageJournal: journal!,
              conversation: {
                current: (scope) => memory.context(scope),
                assertProcessorConsent: (scope) =>
                  runtime.conversation.assertProcessorConsent(scope),
                assertDeliveryCurrent: (scope, expected) =>
                  runtime.conversation.assertSafetyCurrent(scope, expected),
              },
            });
            bound = conversationAgentGenerator(runtime.database, agent);
            return bound.generator;
          },
          assertReady: (scope: ThreadScope, client: PoolClient) => {
            invariant(
              !developmentPolicy ||
                developmentPolicy.allowsAccounts(
                  scope.actorAccountId,
                  scope.fanAccountId,
                  scope.creatorAccountId,
                ),
              "synthetic_accounts_required",
              "Use configured fictional development accounts.",
            );
            return current().assertReady(scope, client);
          },
          assertApproved: (
            scope: ThreadScope,
            client: PoolClient,
            sentence: ApprovedSentence,
          ) => {
            invariant(
              !developmentPolicy ||
                developmentPolicy.allowsAccounts(
                  scope.actorAccountId,
                  scope.fanAccountId,
                  scope.creatorAccountId,
                ),
              "synthetic_accounts_required",
              "Use configured fictional development accounts.",
            );
            return current().assertApproved(scope, client, sentence);
          },
          citation: (scope: ThreadScope, id: string) =>
            current().citation(scope, id),
          generationCostReconciliation: commerce.generationCostReconciliation,
          firstConversation: commerce.service,
        }
      : {};
  const conversation = createConversationRuntime({
    ...runtime,
    ...(policy ? { policy } : {}),
    ...(developmentPolicy ? { developmentPolicy } : {}),
    ...(env.W3_OFFLINE_ISSUER_ORIGIN
      ? {
          offlineIssuer: {
            origin: env.W3_OFFLINE_ISSUER_ORIGIN,
            environment: env.NODE_ENV,
          },
        }
      : {}),
    ...generation,
    ...(lineage ? { lineage } : {}),
    ...(corrections ? { corrections } : {}),
    ...(recordings ? { recordings } : {}),
    ...(producers.fulfillmentPlans
      ? { fulfillmentPlans: producers.fulfillmentPlans }
      : {}),
  });
  // Studio drafting, evaluation and ingestion use the same configured model.
  agent ??= createAgentDomain({
    pool: runtime.pool,
    model,
    ...(producers.licenseVerifier
      ? { licenseVerifier: producers.licenseVerifier }
      : {}),
    ...(journal ? { usageJournal: journal } : {}),
  });

  const ingestion =
    requested && model && env.W3_DEVELOPMENT_INGESTION
      ? DevelopmentIngestionSchema.parse(env.W3_DEVELOPMENT_INGESTION)
      : [];
  const controller = new AbortController();
  let ingesting = false;
  const timer = ingestion.length
    ? setInterval(() => {
        if (ingesting) return;
        ingesting = true;
        void (async () => {
          for (const owner of ingestion)
            await agent!.ingestion
              .tick({ ...owner, development: true }, controller.signal)
              .catch(() =>
                process.stderr.write(
                  "Development source processing is unavailable; inspect the saved source state.\n",
                ),
              );
        })().finally(() => {
          ingesting = false;
        });
      }, 1000)
    : undefined;
  timer?.unref();

  const available = conversation.feature.capabilities().generationAvailable;
  if (requested)
    process.stdout.write(
      available
        ? "Fan generation: available (development configuration; unreviewed policy; fictional accounts only).\n"
        : `Fan generation: unavailable; missing ${missing.join(", ") || "configured runtime"}.\n`,
    );
  return {
    commerce,
    conversation,
    agent,
    privacy: {
      ...(lineage ? { lineage } : {}),
      ...(recordings ? { recordings } : {}),
    },
    fanGeneration: { available, missing },
    close() {
      if (timer) clearInterval(timer);
      controller.abort();
      conversation.close();
    },
  };
}
