import type { PoolClient } from "pg";
import {
  PayoutOnboardingCommand,
  PayoutOnboardingResult,
} from "../../../../../packages/api/src/commerce/contracts.js";
import { DomainError, invariant } from "../../core/errors.js";
import type { Actor } from "../identity/adapter.js";
import type { PayoutProvider } from "./accounting.js";
import type { CommerceService } from "./service.js";

/** Canonical current account/creator restrictions held on this exact client.
 * This negative-authority consumer does not issue a role or recovery scope. */
export type PayoutOnboardingAuthority = (
  client: PoolClient,
  actor: Actor,
  creatorId: string,
) => Promise<void>;

/** Uses only the server's pre-provisioned genuine account. Creating/recovering
 * a Connect account belongs to its original W8 onboarding custody. This link
 * is ephemeral: it is never saved in command history or treated as cash/KYC. */
export class CreatorPayoutOnboarding {
  constructor(
    private readonly service: CommerceService,
    private readonly countries: readonly string[],
    private readonly provider?: Pick<PayoutProvider, "account" | "onboarding">,
    private readonly assertOwnerAllowed?: PayoutOnboardingAuthority,
  ) {}
  get configured() {
    return Boolean(
      this.provider?.onboarding &&
        this.countries.length &&
        this.assertOwnerAllowed,
    );
  }
  private async owned(
    client: PoolClient,
    actor: Actor,
    creatorId: string,
    write = false,
  ) {
    await this.assertOwnerAllowed!(client, actor, creatorId);
    const owner = await client.query(
      "SELECT id FROM creator.creator_profile WHERE id=$1 AND account_id=$2 AND verification='verified' AND NOT recovery_required FOR SHARE",
      [creatorId, actor.accountId],
    );
    if (owner.rowCount !== 1)
      throw new DomainError(
        "creator_required",
        "Use the current verified creator account to manage payouts.",
        403,
      );
    return (
      await client.query<{ provider_ref: string | null; version: number }>(
        `SELECT provider_ref,version FROM creator.commerce_payout_account WHERE creator_id=$1 FOR ${write ? "UPDATE" : "SHARE"}`,
        [creatorId],
      )
    ).rows[0];
  }
  async start(actor: Actor, creatorId: string, input: unknown) {
    const command = PayoutOnboardingCommand.parse(input);
    invariant(
      this.configured && this.provider?.onboarding,
      "payout_onboarding_unavailable",
      "Payout verification is not connected yet.",
    );
    const original = await this.service.account(actor, (client) =>
      this.owned(client, actor, creatorId),
    );
    invariant(
      original?.provider_ref,
      "payout_account_required",
      "The approved payout account must be provisioned before verification can continue.",
    );
    invariant(
      original.version === command.version,
      "payout_account_changed",
      "Your payout account changed. Refresh before continuing.",
    );

    // Provider I/O is outside database locks. Its account authority checks the
    // genuine binding; the second owner/version read fences the returned link.
    const account = await this.provider.account(original.provider_ref);
    invariant(
      account.reference === original.provider_ref &&
        this.countries.includes(account.country),
      "payout_market_unavailable",
      "Payout verification is unavailable for this configured market.",
    );
    const state =
      account.enabled && !account.detailsDue
        ? "enabled"
        : account.detailsDue
          ? "onboarding"
          : "restricted";
    const link =
      state === "enabled"
        ? null
        : await this.provider.onboarding(original.provider_ref);
    if (link) {
      const url = new URL(link.url);
      invariant(
        url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          !url.hash &&
          link.url.length <= 4096 &&
          Number.isFinite(link.expiresAt.getTime()) &&
          link.expiresAt.getTime() > Date.now(),
        "payout_link_invalid",
        "The provider verification link is unavailable or expired.",
      );
    }
    return this.service.account(actor, async (client) => {
      const current = await this.owned(client, actor, creatorId, true);
      invariant(
        current?.provider_ref === original.provider_ref &&
          current?.version === original.version,
        "payout_account_changed",
        "Your payout account changed. Refresh before continuing.",
      );
      // Acquire the write lock directly; do not upgrade a shared payout-account
      // lock held by another simultaneous link request.
      const updated = await client.query<{ version: number }>(
        "UPDATE creator.commerce_payout_account SET state=$4,details_due=$5,version=version+1 WHERE creator_id=$1 AND provider_ref=$2 AND version=$3 RETURNING version",
        [
          creatorId,
          original.provider_ref,
          original.version,
          state,
          account.detailsDue,
        ],
      );
      invariant(
        updated.rowCount === 1,
        "payout_account_changed",
        "Your payout account changed. Refresh before continuing.",
      );
      invariant(
        !link || link.expiresAt.getTime() > Date.now(),
        "payout_link_expired",
        "The provider link expired. Continue verification again.",
      );
      return PayoutOnboardingResult.parse({
        creatorId,
        state,
        detailsDue: account.detailsDue,
        version: updated.rows[0]!.version,
        url: link?.url ?? null,
        expiresAt: link?.expiresAt.toISOString() ?? null,
      });
    });
  }
}
