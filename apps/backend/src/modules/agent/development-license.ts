/** Labeled authorities for fictional creators on an explicit loopback
 * development identity host. They exist so the canonical Studio → publish →
 * fan pipeline can be operated end to end without real people. They never
 * represent counsel-reviewed terms, a creator signature, a W8-registered
 * retention policy or permission to serve real fans. */
import type { Pool, PoolClient } from "pg";
import type { z } from "zod";
import { contentHash } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import {
  DEVELOPMENT_LICENSE_TERMS,
  developmentProofReference,
  type License,
  type LicenseRequest,
} from "../../../../../packages/api/src/agent/contracts.js";
import type { CreatorScope } from "./repository.js";
import type { LicenseVerifier, PublicAILicenseContext } from "./service.js";
import {
  PreparedGenerationAgentInputs,
  type GenerationAILicenseContext,
} from "./generation-inputs.js";

export { DEVELOPMENT_LICENSE_TERMS, developmentProofReference };
export const DEVELOPMENT_JOURNAL_RETENTION =
  "development-synthetic-unreviewed-20261001";

export type SyntheticDevelopmentHost = {
  /** process.env.NODE_ENV */
  environment: string | undefined;
  /** process.env.W2_DEVELOPMENT_SYNTHETIC_LICENSING; only "true" enables. */
  enabled: string | undefined;
  /** The configured identity adapter's mode. */
  identityMode: string | undefined;
  /** The exact web origin the host serves. */
  webOrigin: string;
};

export function assertSyntheticDevelopmentHost(host: SyntheticDevelopmentHost) {
  let origin: URL | null = null;
  try {
    origin = new URL(host.webOrigin);
  } catch {
    origin = null;
  }
  if (
    host.environment !== "development" ||
    host.enabled !== "true" ||
    host.identityMode !== "development" ||
    origin?.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(origin.hostname)
  )
    throw new Error(
      "Synthetic development authority requires NODE_ENV=development, W2_DEVELOPMENT_SYNTHETIC_LICENSING=true, development identity and a loopback HTTP origin.",
    );
}

export function isDevelopmentLicense(
  license: Pick<License, "counselVersion"> | null | undefined,
) {
  return license?.counselVersion === DEVELOPMENT_LICENSE_TERMS;
}

type CreatorAuthority = {
  account_id: string;
  verification: string;
  recovery_required: boolean;
};
function currentCreator(
  creator: CreatorAuthority | undefined,
  accountId: string,
) {
  return Boolean(
    creator &&
      creator.account_id === accountId &&
      creator.verification === "verified" &&
      !creator.recovery_required,
  );
}

export class DevelopmentLicenseVerifier implements LicenseVerifier {
  readonly synthetic = true as const;
  private constructor(private readonly pool: Pool) {}
  /** Host composition must qualify this guarded instance on its actual pool.
   * A synthetic flag or a verifier retained from another database is insufficient. */
  assertPool(pool: Pool): void {
    if (pool !== this.pool)
      throw new DomainError(
        "development_license_pool_mismatch",
        "Synthetic license authority belongs to a different database pool.",
        503,
      );
  }
  static create(pool: Pool, host: SyntheticDevelopmentHost) {
    assertSyntheticDevelopmentHost(host);
    return Object.freeze(new DevelopmentLicenseVerifier(pool));
  }
  async verify(
    scope: CreatorScope,
    request: z.infer<typeof LicenseRequest>,
  ): Promise<License> {
    invariant(
      scope.development === true,
      "license_verification_unconfigured",
      "Synthetic licenses exist only for development creators.",
    );
    invariant(
      request.counselVersion === DEVELOPMENT_LICENSE_TERMS &&
        request.proofReference === developmentProofReference(scope.creatorId),
      "license_invalid",
      "Record this creator’s labeled development license.",
    );
    invariant(
      request.permittedUses.includes("text_ai") &&
        !request.permittedUses.includes("ai_voice") &&
        !request.voiceConsentReference &&
        !request.estateOptInReference,
      "license_invalid",
      "A development license covers text answers and sponsor mentions only.",
    );
    invariant(
      currentCreator(
        await this.creator(this.pool, scope.creatorId),
        scope.accountId,
      ),
      "verification_required",
      "Creator verification is required.",
    );
    return {
      state: "active",
      permittedUses: [...new Set(request.permittedUses)].sort(),
      termEndsAt: request.termEndsAt,
      counselVersion: DEVELOPMENT_LICENSE_TERMS,
      proofReference: request.proofReference,
    };
  }
  async isCurrent(scope: CreatorScope, license: License) {
    return (
      scope.development === true &&
      this.matches(scope.creatorId, license) &&
      currentCreator(
        await this.creator(this.pool, scope.creatorId),
        scope.accountId,
      )
    );
  }
  /** Holds the stored license row on the caller's transaction. Creator profile
   * locks stay with the caller's existing owner-policy lock order. */
  async isCurrentInTransaction(
    scope: CreatorScope,
    license: License,
    client: PoolClient,
  ) {
    if (scope.development !== true || !this.matches(scope.creatorId, license))
      return false;
    const stored = (
      await client.query<{ document: License }>(
        "SELECT document FROM creator.ai_license WHERE creator_id=$1 FOR SHARE",
        [scope.creatorId],
      )
    ).rows[0]?.document;
    return Boolean(
      stored &&
        contentHash(stored) === contentHash(license) &&
        currentCreator(
          await this.creator(client, scope.creatorId),
          scope.accountId,
        ),
    );
  }
  /** W1 has locked and verified the actual creator and stored license. Its
   * exact frozen snapshot/nonce is the evidence, never an owner-scope cast. */
  async isCurrentPublicInTransaction(
    context: PublicAILicenseContext,
    client: PoolClient,
  ) {
    context.identity.assertPool(this.pool);
    await context.identity.authorizeInTransaction(
      context.scope,
      client,
      context.facts,
    );
    const stored = context.facts.license;
    return Boolean(
      stored &&
        context.scope.creatorId === context.facts.creatorId &&
        context.scope.creatorAccountId === context.facts.creatorAccountId &&
        this.matches(context.scope.creatorId, {
          ...stored,
          permittedUses: [...stored.permittedUses],
        }),
    );
  }
  async isCurrentGenerationInTransaction(
    context: GenerationAILicenseContext,
    client: PoolClient,
  ) {
    invariant(
      context.inputs instanceof PreparedGenerationAgentInputs,
      "generation_inputs_required",
      "Genuine current generation-purpose inputs are required.",
    );
    context.inputs.assertHostPool(this.pool);
    await context.inputs.authorizeInTransaction(
      context.facts,
      context.scope,
      client,
    );
    return Boolean(
      context.scope.creatorId === context.facts.creatorId &&
        context.scope.creatorAccountId === context.facts.creatorAccountId &&
        this.matches(context.scope.creatorId, {
          ...context.facts.license,
          permittedUses: [...context.facts.license.permittedUses],
        }),
    );
  }
  private matches(creatorId: string, license: License) {
    return (
      license.state === "active" &&
      license.counselVersion === DEVELOPMENT_LICENSE_TERMS &&
      license.proofReference === developmentProofReference(creatorId) &&
      Date.parse(license.termEndsAt) > Date.now() &&
      license.permittedUses.includes("text_ai") &&
      !license.permittedUses.includes("ai_voice") &&
      !license.voiceConsentReference &&
      !license.estateOptInReference
    );
  }
  private async creator(executor: Pool | PoolClient, creatorId: string) {
    return (
      await executor.query<CreatorAuthority>(
        "SELECT account_id,verification,recovery_required FROM creator.creator_profile WHERE id=$1",
        [creatorId],
      )
    ).rows[0];
  }
}

/** Development hosts hold fictional data only. This says so truthfully and
 * refuses everywhere else; it is not W8's reviewed thread-accounting policy. */
export function developmentSyntheticJournalPolicy(
  host: SyntheticDevelopmentHost,
) {
  assertSyntheticDevelopmentHost(host);
  return Object.freeze({
    retentionPolicyVersion: DEVELOPMENT_JOURNAL_RETENTION,
    assertPrivacyRegistered: async () => assertSyntheticDevelopmentHost(host),
  });
}
