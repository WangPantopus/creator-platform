import type { Pool } from "pg";
import type { Database } from "../../db/database.js";
import type { AccessService } from "../access/scope.js";
import type { PaymentProvider } from "../payments/provider.js";
import { CommerceService, type CommercePolicy } from "./service.js";
import {
  MembershipBilling,
  type MembershipBillingProvider,
} from "./billing.js";
import { ExtendedCommerce, type StoreEntitlementVerifier } from "./extended.js";
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
import type { CreatorSettlement } from "./accounting.js";
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
  generationCostPolicy?: GenerationCostPolicy;
  groupAudience?: GroupAudienceReader;
  payments?: PaymentProvider;
  billing?: MembershipBillingProvider;
  stores?: StoreEntitlementVerifier;
  tierCatalog?: TierCatalog;
  pass?: (service: CommerceService) => import("./pass.js").PassCommerce;
  moneyStatement?: MoneyStatementProvider;
  settlement?: (service: CommerceService) => CreatorSettlement;
  assertActorAllowed?: (
    actor: import("../identity/adapter.js").Actor,
  ) => Promise<void>;
}) {
  const generationAllowance = input.generationCostPolicy
    ? await CommerceGenerationAllowance.prepare(
        input.pool,
        input.generationCostPolicy,
      )
    : undefined;
  if (generationAllowance)
    input.access.configureGenerationAllowance(generationAllowance);
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
  );
  const billing = new MembershipBilling(service, input.billing);
  const tiers = new CommerceTiers(service, input.tierCatalog);
  const money = input.moneyStatement
    ? new MoneyReconciliation(service, input.moneyStatement)
    : undefined;
  const settlement = input.settlement?.(service);
  const extended = new ExtendedCommerce(
    service,
    input.stores,
    input.pass?.(service),
    billing,
    tiers,
    money,
    settlement,
  );
  return {
    service,
    billing,
    extended,
    tiers,
    money,
    settlement,
    // W3 readiness consumes this after awaiting composition. It must not
    // configure a second allowance/reservation path or infer it from keys.
    generationAllowanceAvailable: Boolean(generationAllowance),
    audiences: createCommerceAudience(input.database, input.groupAudience),
    feature: commerceFeature(service, extended),
  };
}
