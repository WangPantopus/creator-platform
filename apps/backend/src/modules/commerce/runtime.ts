import type { Pool } from "pg";
import type { Database } from "../../db/database.js";
import type { AccessService, ThreadScope } from "../access/scope.js";
import type { PaymentProvider } from "../payments/provider.js";
import { CommerceService, type CommercePolicy } from "./service.js";
import {
  MembershipBilling,
  type MembershipBillingProvider,
} from "./billing.js";
import { ExtendedCommerce, type StoreEntitlementVerifier } from "./extended.js";
import { commerceFeature } from "./registration.js";
import { CommerceGenerationAllowance } from "./generation-allowance.js";
import { CommerceTiers, type TierCatalog } from "./tiers.js";
import {
  MoneyReconciliation,
  type MoneyStatementProvider,
} from "./reconciliation.js";
import type { CreatorSettlement } from "./accounting.js";

/** W1's configured-host seam consumes this graph. Providers and economics are
 * explicit injected dependencies; configuring a payment key cannot enable AI. */
export function createCommerceRuntime(input: {
  pool: Pool;
  database: Database;
  access: AccessService;
  policy: Omit<CommercePolicy, "costAllowanceIntegrated">;
  generationCostUnits?: (scope: ThreadScope) => number;
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
  if (input.generationCostUnits)
    input.access.configureGenerationAllowance(
      new CommerceGenerationAllowance(input.generationCostUnits),
    );
  const service = new CommerceService(
    input.pool,
    input.database,
    input.access,
    {
      ...input.policy,
      costAllowanceIntegrated: Boolean(input.generationCostUnits),
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
    feature: commerceFeature(service, extended),
  };
}
