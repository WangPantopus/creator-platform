import type { Pool } from "pg";
import type { Database } from "../../db/database.js";
import type { AccessService, ThreadScope } from "../access/scope.js";
import type { PaymentProvider } from "../payments/provider.js";
import { CommerceService, type CommercePolicy } from "./service.js";
import {
  MembershipBilling,
  type MembershipBillingProvider,
} from "./billing.js";
import {
  ExtendedCommerce,
  type StoreEntitlementVerifier,
  type QualifiedReadAuthority,
} from "./extended.js";
import { commerceFeature } from "./registration.js";
import {
  CommerceGenerationAllowance,
  type GenerationCostPolicy,
} from "./generation-allowance.js";
import { CommerceTiers, type TierCatalog } from "./tiers.js";
import {
  MoneyReconciliation,
  type MoneyStatementProvider,
} from "./reconciliation.js";
import {
  PoolSettlement,
  type CreatorSettlement,
  type PoolCycleVerifier,
} from "./accounting.js";
import type { PassPoolJournal } from "./pass-pool-journal.js";
import type { PassPurchaseJournal } from "./pass-purchase-journal.js";
import type { GenerationPrivacyConfiguration } from "./generation-privacy.js";
import {
  CommerceRequestNotifications,
  type CommerceNotificationRecipientAuthority,
} from "./notifications.js";
import { invariant } from "../../core/errors.js";
import {
  createCommerceAudience,
  type GroupAudienceReader,
} from "./audience.js";

/** W1's configured-host seam consumes this graph. Providers and economics are
 * explicit injected dependencies; configuring a payment key cannot enable AI. */
export async function createCommerceRuntime(input: {
  pool: Pool;
  database: Database;
  access: AccessService;
  policy: Omit<CommercePolicy, "costAllowanceIntegrated">;
  /** Legacy units-only activation is rejected; retained only for a clear host error. */
  generationCostUnits?: (scope: ThreadScope) => number;
  generationCostPolicy?: GenerationCostPolicy;
  generationPrivacy?: GenerationPrivacyConfiguration;
  /** Actual prepared W3 readiness/current W2 license/source/budget authority,
   * checked on the admission transaction. No default enables a trial. */
  trialReadiness?: (
    scope: import("../access/scope.js").ThreadScope,
    client: import("pg").PoolClient,
  ) => Promise<void>;
  groupAudience?: GroupAudienceReader;
  payments?: PaymentProvider;
  billing?: MembershipBillingProvider;
  stores?: StoreEntitlementVerifier;
  qualifiedReads?: QualifiedReadAuthority;
  tierCatalog?: TierCatalog;
  pass?: (service: CommerceService) => import("./pass.js").PassCommerce;
  passPurchases?: (
    service: CommerceService,
    pass: import("./pass.js").PassCommerce,
    pool: Readonly<{ journal: PassPoolJournal; settlement: PoolSettlement }>,
  ) => Promise<PassPurchaseJournal>;
  moneyStatement?: MoneyStatementProvider;
  settlement?: (service: CommerceService) => CreatorSettlement;
  poolCycleVerifier?: PoolCycleVerifier;
  poolJournal?: (service: CommerceService) => Promise<PassPoolJournal>;
  assertActorAllowed?: (
    actor: import("../identity/adapter.js").Actor,
  ) => Promise<void>;
}) {
  invariant(
    !input.generationCostUnits,
    "weighted_allowance_policy_required",
    "Generation allowance needs its reviewed attributed policy and registered schema; units alone cannot enable it.",
  );
  const generationAllowance = input.generationCostPolicy
    ? await CommerceGenerationAllowance.prepare(
        input.pool,
        input.generationCostPolicy,
      )
    : undefined;
  if (generationAllowance)
    input.access.configureGenerationAllowance(generationAllowance);
  const generationCostReconciliation = generationAllowance?.reconciliation(
    input.access,
  );
  invariant(
    !input.generationPrivacy || generationAllowance,
    "generation_privacy_unconfigured",
    "Financial lifecycle requires the same successfully prepared cost adapter.",
  );
  const generationCostPrivacyReconciliation =
    input.generationPrivacy && generationAllowance
      ? await generationAllowance.privacyReconciliation(
          input.access,
          input.generationPrivacy,
        )
      : undefined;
  invariant(
    !input.trialReadiness ||
      (generationAllowance &&
        Number.isSafeInteger(input.policy.trialAllowance) &&
        input.policy.trialAllowance! > 0 &&
        input.policy.trialAllowance! <= 2147483647 &&
        input.access.threadScopeInTransactionAvailable),
    "trial_unconfigured",
    "Trial admission requires reviewed units, the exact prepared allowance and held current authority.",
  );
  const service = new CommerceService(
    input.pool,
    input.database,
    input.access,
    {
      ...input.policy,
      costAllowanceIntegrated: Boolean(generationAllowance),
    },
    input.payments,
    input.assertActorAllowed,
    input.trialReadiness && generationAllowance
      ? Object.freeze({
          allowance: generationAllowance,
          units: input.policy.trialAllowance!,
          assertReady: input.trialReadiness.bind(input),
        })
      : undefined,
  );
  const billing = new MembershipBilling(service, input.billing);
  const tiers = new CommerceTiers(service, input.tierCatalog);
  const money = input.moneyStatement
    ? new MoneyReconciliation(service, input.moneyStatement)
    : undefined;
  const settlement = input.settlement?.(service);
  invariant(
    Boolean(input.poolJournal) === Boolean(input.poolCycleVerifier),
    "pool_unconfigured",
    "Pool allocation and cash require the same complete prepared provider graph.",
  );
  const poolJournal = input.poolJournal
    ? await input.poolJournal(service)
    : undefined;
  invariant(
    !poolJournal || poolJournal.isForService(service),
    "pool_graph_mismatch",
    "Pool custody must belong to this exact canonical commerce graph.",
  );
  const poolSettlement = poolJournal
    ? new PoolSettlement(service, input.poolCycleVerifier, poolJournal)
    : undefined;
  const pass = input.pass?.(service);
  invariant(
    !input.passPurchases || (pass && poolJournal && poolSettlement),
    "pass_billing_unconfigured",
    "Pass purchases require the same canonical pass and prepared pool cash graph.",
  );
  const passPurchases =
    input.passPurchases && pass && poolJournal && poolSettlement
      ? await input.passPurchases(service, pass, {
          journal: poolJournal,
          settlement: poolSettlement,
        })
      : undefined;
  const extended = new ExtendedCommerce(
    service,
    input.stores,
    pass,
    billing,
    tiers,
    money,
    settlement,
    passPurchases,
    poolJournal,
    input.qualifiedReads,
  );
  return {
    ...(poolJournal && poolSettlement ? { poolJournal, poolSettlement } : {}),
    ...(generationAllowance ? { allowance: generationAllowance } : {}),
    service,
    billing,
    extended,
    tiers,
    money,
    settlement,
    passPurchases,
    // W3 readiness consumes this after awaiting composition. It must not
    // configure a second allowance/reservation path or infer it from keys.
    generationAllowanceAvailable: Boolean(generationAllowance),
    generationCostReconciliation,
    generationCostPrivacyReconciliation,
    // The host enumerates genuine current scopes. This factory cannot mint one
    // or authorize recipients; no notification source is mounted by default.
    requestNotifications: (
      scope: import("../access/scope.js").ThreadScope,
      assertRecipientAllowed: CommerceNotificationRecipientAuthority,
      assertPrivacyRegistered: () => Promise<void>,
    ) =>
      CommerceRequestNotifications.prepare({
        database: input.database,
        scope,
        assertRecipientAllowed,
        assertPrivacyRegistered,
      }),
    audiences: createCommerceAudience(input.database, input.groupAudience),
    feature: commerceFeature(service, extended),
  };
}
