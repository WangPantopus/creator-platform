import { z } from "zod";
import type { Actor } from "../identity/adapter.js";
import { invariant } from "../../core/errors.js";
import { contentHash } from "../../core/canonical.js";
import type { CommerceService } from "./service.js";

const TierCommand = z
  .strictObject({
    name: z.string().trim().min(1).max(100),
    capabilities: z.array(z.enum(["ai_message", "note", "request"])).max(3),
    aiAllowance: z.number().int().min(0).max(2147483647),
    state: z.enum(["draft", "active", "paused"]),
    version: z.number().int().nonnegative(),
    idempotencyKey: z.string().min(8).max(128),
    catalogKey: z.string().min(1).max(100).nullable(),
  })
  .refine((v) => new Set(v.capabilities).size === v.capabilities.length)
  .refine((v) =>
    v.capabilities.includes("ai_message")
      ? v.aiAllowance > 0
      : v.aiAllowance === 0,
  )
  .refine((v) => v.state !== "active" || v.capabilities.length > 0);

/** Business-approved products, verified with each store before publication.
 * The client chooses a key; it never supplies prices or entitlement metadata. */
export interface TierCatalog {
  choices(
    creatorId: string,
  ): Promise<readonly { key: string; label: string }[]>;
  verify(
    creatorId: string,
    key: string,
  ): Promise<{
    web?: {
      priceReference: string;
      amount: number;
      currency: string;
      interval: "month";
    };
    apple?: { productId: string };
    google?: { productId: string; basePlanId: string };
  }>;
}
const Catalog = z.strictObject({
  web: z
    .strictObject({
      priceReference: z.string().regex(/^price_[A-Za-z0-9]+$/u),
      amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      currency: z.string().regex(/^[A-Z]{3}$/u),
      interval: z.literal("month"),
    })
    .optional(),
  apple: z.strictObject({ productId: z.string().min(1).max(200) }).optional(),
  google: z
    .strictObject({
      productId: z.string().min(1).max(200),
      basePlanId: z.string().min(1).max(200),
    })
    .optional(),
});

export class CommerceTiers {
  constructor(
    private readonly service: CommerceService,
    private readonly catalog?: TierCatalog,
  ) {}
  async choices(actor: Actor) {
    const owned = await this.service.account(
      actor,
      async (client) =>
        (
          await client.query<{ id: string }>(
            "SELECT id FROM creator.creator_profile WHERE account_id=$1 AND verification='verified' AND NOT recovery_required",
            [actor.accountId],
          )
        ).rows,
    );
    return Promise.all(
      owned.map(async (creator) => ({
        creatorId: creator.id,
        products: (await this.catalog?.choices(creator.id)) ?? [],
      })),
    );
  }
  async save(
    actor: Actor,
    creatorId: string,
    tierId: string | undefined,
    input: unknown,
  ) {
    const body = TierCommand.parse(input);
    // Provider reads never run while holding a catalog or creator database lock.
    const existing = await this.service.account(actor, async (client) => {
      const owner = await client.query(
        "SELECT id FROM creator.creator_profile WHERE id=$1 AND account_id=$2 AND verification='verified' AND NOT recovery_required",
        [creatorId, actor.accountId],
      );
      invariant(
        owner.rowCount === 1,
        "creator_required",
        "Only the verified creator can edit membership tiers.",
      );
      return tierId
        ? (
            await client.query(
              "SELECT catalog,version FROM creator.commerce_tier WHERE id=$1 AND creator_id=$2",
              [tierId, creatorId],
            )
          ).rows[0]
        : undefined;
    });
    invariant(
      body.state !== "active" || body.catalogKey,
      "membership_catalog_unavailable",
      "Choose an approved catalog before publishing this membership.",
    );
    const preserveCatalog =
      body.state !== "active" &&
      existing?.version === body.version &&
      existing?.catalog?.key === body.catalogKey;
    invariant(
      !body.catalogKey || this.catalog || preserveCatalog,
      "membership_catalog_unavailable",
      "Membership products are not configured yet. You can save a draft without a catalog.",
    );
    const verifiedCatalog = body.catalogKey
      ? preserveCatalog
        ? existing!.catalog
        : Catalog.parse(await this.catalog!.verify(creatorId, body.catalogKey))
      : {};
    invariant(
      body.state !== "active" || Object.keys(verifiedCatalog).length > 0,
      "membership_catalog_unavailable",
      "No verified store products are available for this membership.",
    );
    invariant(
      body.state !== "active" ||
        !body.aiAllowance ||
        this.service.policy.costAllowanceIntegrated,
      "allowance_integration_unavailable",
      "AI membership access is awaiting its configured cost policy.",
    );
    return this.service.account(actor, (client) =>
      this.service.command(
        client,
        actor,
        `tier.save:${creatorId}:${tierId ?? "new"}`,
        body.idempotencyKey,
        body,
        async () => {
          if (verifiedCatalog.web?.priceReference) {
            await client.query(
              "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
              [`commerce.price:${verifiedCatalog.web.priceReference}`],
            );
            const linked = await client.query(
              "SELECT id FROM creator.commerce_tier WHERE catalog->'web'->>'priceReference'=$1 AND ($2::uuid IS NULL OR id<>$2) LIMIT 1",
              [verifiedCatalog.web.priceReference, tierId ?? null],
            );
            invariant(
              !linked.rowCount,
              "membership_product_in_use",
              "This product is already linked to a tier. Choose a distinct approved product for a new tier.",
            );
          }
          const creator = await client.query(
            "SELECT id FROM creator.creator_profile WHERE id=$1 AND account_id=$2 AND verification='verified' AND NOT recovery_required FOR SHARE",
            [creatorId, actor.accountId],
          );
          invariant(
            creator.rowCount === 1,
            "creator_required",
            "Refresh current creator access before saving.",
          );
          if (tierId)
            await client.query(
              "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
              [`commerce.tier:${tierId}`],
            );
          const prior = tierId
            ? (
                await client.query(
                  "SELECT * FROM creator.commerce_tier WHERE id=$1 AND creator_id=$2 FOR UPDATE",
                  [tierId, creatorId],
                )
              ).rows[0]
            : undefined;
          invariant(
            tierId
              ? prior && prior.version === body.version
              : body.version === 0,
            "version_conflict",
            "The tier changed. Refresh before editing it.",
          );
          const catalog = body.catalogKey
            ? { ...verifiedCatalog, key: body.catalogKey }
            : {};
          if (prior) {
            const sold = await client.query(
              "SELECT id FROM creator.commerce_membership WHERE tier_id=$1 UNION ALL SELECT id FROM creator.commerce_billing_effect WHERE request->>'tierId'=$1::text AND operation='start' LIMIT 1",
              [tierId],
            );
            invariant(
              !sold.rowCount ||
                (contentHash(prior.catalog) === contentHash(catalog) &&
                  contentHash([...prior.capabilities].sort()) ===
                    contentHash([...body.capabilities].sort()) &&
                  prior.ai_allowance === body.aiAllowance),
              "purchased_tier_immutable",
              "Keep purchased membership benefits and prices intact. Create a new tier to change them.",
            );
          }
          const result = prior
            ? await client.query(
                "UPDATE creator.commerce_tier SET name=$3,capabilities=$4,ai_allowance=$5,catalog=$6,state=$7,version=version+1 WHERE id=$1 AND creator_id=$2 RETURNING *",
                [
                  tierId,
                  creatorId,
                  body.name,
                  body.capabilities,
                  body.aiAllowance,
                  catalog,
                  body.state,
                ],
              )
            : await client.query(
                "INSERT INTO creator.commerce_tier(creator_id,name,capabilities,ai_allowance,catalog,state) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
                [
                  creatorId,
                  body.name,
                  body.capabilities,
                  body.aiAllowance,
                  catalog,
                  body.state,
                ],
              );
          return result.rows[0];
        },
      ),
    );
  }
}
