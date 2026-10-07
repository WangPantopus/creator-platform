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
import { PreparedUsageRetention } from "../agent/usage-retention.js";
import { DevelopmentLicenseVerifier } from "../agent/development-license.js";
import { startDevelopmentIngestion } from "../ingestion/development-lifetime.js";
import { createCommerceRuntime } from "../commerce/runtime.js";
import { readCommerceEnvironment } from "../commerce/environment.js";
import { createCommerceAudience } from "../commerce/audience.js";
import {
  attributedGenerationCostPolicy,
  ReviewedGenerationCostRule,
} from "../commerce/attributed-cost-policy.js";
import type { MediaService } from "../media/service.js";
import { ProviderPolicySchema } from "../../../../../packages/api/src/conversation/contracts.js";
import { PreparedGenerationAcceptance } from "./generation-acceptance.js";
import { prepareGenerationWorker } from "../../workers/generation-composition.js";
import { ConversationCorrections } from "./corrections.js";
import { ConversationLineage } from "./lineage.js";
import type { ReplyFeedbackAuthority } from "./lineage.js";
import {
  IdentityIntroOffers,
  type IntroOfferPolicy,
} from "../identity/intro-offers.js";
import { ConversationRecordings } from "./recordings.js";
import type { PreparedConversationPrivacyCursor } from "./privacy-export-cursor.js";
import type { GenerationAccountingPreparation } from "../trust/privacy-consumers.js";
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
  /** Original journal and expiry prepared by the installed Trust host. */
  usageAccounting?: Pick<
    import("../trust/usage-accounting-host.js").HostUsageAccounting,
    "journal" | "retention"
  >;
  /** Independently reviewed worker custody and its distinct bounded pool.
   * Pool ownership stays with the host; API acceptance does not run a worker. */
  generation?: Pick<
    Parameters<typeof prepareGenerationWorker>[0],
    "workerPool" | "custody" | "signal"
  >;
  /** W8: actual feedback notice/consent/expiry; no development substitute. */
  feedbackAuthority?: ReplyFeedbackAuthority;
  /** W8: approved minimal account-level intro-offer use and retention. */
  introOfferPolicy?: IntroOfferPolicy;
  /** W4: genuinely prepared original group fulfillment on this exact graph. */
  fulfillmentPlans?: import("../commerce/fulfillment-plans.js").CommerceFulfillmentPlans;
  /** W2: the configured license authority for this host. */
  licenseVerifier?: LicenseVerifier;
  /** W2: the reviewed thread-accounting retention for the usage journal. */
  journalPolicy?: {
    retentionPolicyVersion: string;
    assertPrivacyRegistered: () => Promise<void>;
  };
  /** W2's actual prepared expiry producer plus W8's independently reviewed
   *0233 custody. W8 fixes its real held-task authority when preparing exports. */
  privacyCursor?: Omit<
    Parameters<typeof PreparedConversationPrivacyCursor.prepare>[0],
    "pool" | "authority" | "journal" | "lineage" | "recordings"
  >;
  /** W8's reviewed registration and finite policy. The host binds its actual
   * accounting owners; W8 later fixes its own held-task/family authority. */
  privacyAccounting?: GenerationAccountingPreparation["configuration"];
  /** W6: the host's media runtime on this same database pool. */
  media?: MediaService;
  /** W6: fan reads of signed recordings ask W3 for the exact publication. */
  bindRecordingPublication?: (
    port: ConversationRecordings["currentPublication"],
  ) => void;
};

type Registry = { migrations: { version: string; path: string }[] };
const repositoryRoot = new URL("../../../../../", import.meta.url);
declare const __QELVORA_REGISTERED_MIGRATIONS__:
  | Readonly<Record<string, string>>
  | undefined;

/** Only an executable registry entry counts. The expected checksum is the
 * reviewed file's own bytes, never a value read back from the database. */
async function registeredChecksum(version: string) {
  // Shipping bundles carry the exact executable registry's SQL hashes from
  // their build. Source execution retains the same checked-out byte custody.
  if (typeof __QELVORA_REGISTERED_MIGRATIONS__ !== "undefined")
    return Object.hasOwn(__QELVORA_REGISTERED_MIGRATIONS__, version)
      ? __QELVORA_REGISTERED_MIGRATIONS__[version]
      : undefined;
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
  // Held source allocations are not active custody. The legacy interactive
  // generator below cannot replace the actual scoped worker/settlement graph.
  for (const version of [
    "0159_w1_generation_worker_scope",
    "0177_w8_generation_worker_denial",
    "0179_w3_generation_purpose_consumers",
    "0180_w2_generation_input_consumers",
    "0181_w2_generation_attempt_admission",
    "0183_w1_generation_terminal_scope",
    "0184_w8_generation_terminal_denial",
    "0188_w2_generation_terminal_journal",
    "0189_w4_generation_terminal_settlement",
    "0203_w3_terminal_only_finalization",
    "0215_w4_generation_safety_terminal_settlement",
    "0218_w1_generation_terminal_discovery",
    "0226_w1_generation_lifecycle",
    "0227_w1_generation_terminal_page",
    "0228_w4_generation_settlement_clock",
  ])
    if (!(await registeredChecksum(version)))
      missing.push(`registered ${version}`);
  if (requested)
    missing.push("current generation worker composition (W3/W1/W2/W4)");
  if (requested && !producers.generation)
    missing.push("reviewed generation worker custody and pool");

  let journal = producers.usageAccounting?.journal;
  if (producers.usageAccounting) {
    invariant(
      !producers.journalPolicy &&
        journal instanceof PreparedGenerationJournal &&
        producers.usageAccounting.retention instanceof PreparedUsageRetention &&
        (!producers.privacyCursor ||
          producers.privacyCursor.usageRetention ===
            producers.usageAccounting.retention),
      "usage_accounting_composition_mismatch",
      "Use one original journal and retention owner throughout the host.",
    );
    journal.assertPool(runtime.pool);
  }
  const originalUsageRetention =
    producers.usageAccounting?.retention ??
    producers.privacyCursor?.usageRetention;
  if (producers.privacyCursor)
    invariant(
      originalUsageRetention instanceof PreparedUsageRetention,
      "accounting_retention_unconfigured",
      "The original prepared accounting retention producer is required.",
    );
  const journalChecksum = await registeredChecksum(migrations.journal);
  if (!journalChecksum) missing.push(`registered ${migrations.journal}`);
  else if (!journal && !producers.journalPolicy)
    missing.push("journal policy (W2)");
  else if (
    !journal &&
    producers.journalPolicy &&
    (requested || producers.privacyCursor || producers.privacyAccounting)
  )
    // Original privacy accounting is independent of provider/generation setup.
    journal = await PreparedGenerationJournal.prepare(runtime.pool, {
      migration: { version: migrations.journal, checksum: journalChecksum },
      ...producers.journalPolicy,
      signal: producers.generation?.signal,
    });
  // The Agent lifecycle and export cursor retain the same original expiry
  // producer. A policy string or a matching URL cannot replace its custody.
  const usageRetention = journal ? originalUsageRetention : undefined;
  if (journal && usageRetention) usageRetention.assertJournal(journal);
  const costChecksum = await registeredChecksum(migrations.cost);
  if (!costChecksum) missing.push(`registered ${migrations.cost}`);

  const ready = requested && missing.length === 0;
  let acceptance: PreparedGenerationAcceptance | undefined;
  const current = () => {
    invariant(
      acceptance,
      "generation_unconfigured",
      "AI messaging is not connected yet.",
    );
    return acceptance;
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
                originalRuleMigration: {
                  version: "0189_w4_generation_terminal_settlement",
                  checksum: (await registeredChecksum(
                    "0189_w4_generation_terminal_settlement",
                  ))!,
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
    feedbackAuthority: producers.feedbackAuthority,
    feedbackMigration: await registeredChecksum(
      migrations.feedbackConsent,
    ).then((checksum) =>
      checksum ? { version: migrations.feedbackConsent, checksum } : undefined,
    ),
  });
  if (lineage && producers.feedbackAuthority && producers.introOfferPolicy)
    lineage.configureIntroOffers(
      await IdentityIntroOffers.prepare({
        database: runtime.database,
        assertOfferAllowed: producers.introOfferPolicy,
      }),
    );
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
  let accountingPreparation: GenerationAccountingPreparation | undefined;
  if (producers.privacyAccounting) {
    invariant(
      journal &&
        usageRetention &&
        commerce?.allowance &&
        lineage &&
        recordings &&
        producers.privacyCursor,
      "conversation_accounting_unavailable",
      "Accounting privacy requires the host's original journal, expiry, financial and complete export owners.",
    );
    accountingPreparation = Object.freeze({
      journal,
      usageRetention,
      allowance: commerce.allowance,
      access: runtime.access,
      configuration: Object.freeze({
        retentionPolicyVersion:
          producers.privacyAccounting.retentionPolicyVersion,
        assertPrivacyRegistered:
          producers.privacyAccounting.assertPrivacyRegistered.bind(
            producers.privacyAccounting,
          ),
      }),
    });
  }
  if (recordings)
    producers.bindRecordingPublication?.((scope, recording, client) =>
      recordings.currentPublication(scope, recording, client),
    );

  const audience = createCommerceAudience(runtime.database);
  const binding: {
    conversation?: ReturnType<typeof createConversationRuntime>;
  } = {};
  const agent = createAgentDomain({
    pool: runtime.pool,
    model,
    ...(producers.licenseVerifier
      ? { licenseVerifier: producers.licenseVerifier }
      : {}),
    ...(journal ? { usageJournal: journal } : {}),
    ...(usageRetention ? { usageRetention } : {}),
    ...(ready
      ? {
          audience,
          conversation: {
            current: (scope: ThreadScope) => {
              invariant(
                binding.conversation,
                "generation_host_unconfigured",
                "The canonical conversation host is not ready.",
              );
              return binding.conversation.memory.context(scope);
            },
            assertProcessorConsent: (scope: ThreadScope) =>
              runtime.conversation.assertProcessorConsent(scope),
            assertDeliveryCurrent: (
              scope: ThreadScope,
              expected: Parameters<
                typeof runtime.conversation.assertSafetyCurrent
              >[1],
            ) => runtime.conversation.assertSafetyCurrent(scope, expected),
          },
        }
      : {}),
  });
  const worker =
    ready && commerce?.allowance && journal && producers.generation
      ? await prepareGenerationWorker({
          ...producers.generation,
          database: runtime.database,
          access: runtime.access,
          service: agent.service,
          allowance: commerce.allowance,
          journal,
        })
      : undefined;
  if (worker)
    acceptance = PreparedGenerationAcceptance.prepare({
      worker,
      database: runtime.database,
      access: runtime.access,
      agent,
    });
  const generation =
    acceptance && commerce?.generationCostReconciliation
      ? {
          generationAcceptance: acceptance,
          assertReady: async (scope: ThreadScope) => {
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
          },
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
  binding.conversation = conversation;

  const ingestion =
    requested && model && env.W3_DEVELOPMENT_INGESTION
      ? DevelopmentIngestionSchema.parse(env.W3_DEVELOPMENT_INGESTION)
      : [];
  const ingesting = startDevelopmentIngestion(
    agent.ingestion,
    ingestion.map((owner) => ({ ...owner, development: true })),
  );
  let closing: Promise<void> | undefined;

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
    generationWorker: worker,
    privacy: {
      ...(accountingPreparation ? { accountingPreparation } : {}),
      ...(lineage ? { lineage } : {}),
      ...(recordings ? { recordings } : {}),
      ...(journal && producers.privacyCursor
        ? {
            cursorPreparation: {
              ...producers.privacyCursor,
              journal,
            },
          }
        : {}),
    },
    fanGeneration: { available, missing },
    close(): Promise<void> {
      closing ??= (async () => {
        // Stop admissions synchronously, then retain the actual ingestion
        // promise until its final job/accounting work has settled.
        const draining = ingesting.close();
        const outcomes = await Promise.allSettled([
          draining,
          Promise.resolve().then(() => conversation.close()),
        ]);
        const failures = outcomes.flatMap((outcome) =>
          outcome.status === "rejected" ? [outcome.reason] : [],
        );
        if (failures.length)
          throw new AggregateError(
            failures,
            "Conversation host shutdown failed.",
          );
      })();
      return closing;
    },
  };
}
