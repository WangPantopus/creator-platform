import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  ContentDocument,
  type ContentBody,
} from "../../../../../packages/api/src/content.js";
import { CommerceFulfillmentPlanRef } from "../../../../../packages/api/src/commerce/fulfillment.js";
import { contentHash } from "../../core/canonical.js";
import { DomainError } from "../../core/errors.js";
import type { Database } from "../../db/database.js";
import type { AccessService } from "../access/scope.js";
import {
  CommerceFulfillmentPlans,
  type CommerceGroupRecipient,
} from "../commerce/fulfillment-plans.js";
import { ConversationService } from "../conversation/service.js";
import type { Actor } from "../identity/adapter.js";
import { requestAuthority } from "../identity/request-authority.js";
import type { ContentSourceFinalization } from "./publication-source.js";

export type ContentGroupPublicationOwners = {
  database: Database;
  access: AccessService;
  plans: CommerceFulfillmentPlans;
  conversations: ConversationService;
};
type Ref = z.infer<typeof CommerceFulfillmentPlanRef>;
type Held = {
  actor: Actor;
  request: NonNullable<ReturnType<typeof requestAuthority.getStore>>;
  pid: number;
  transaction: string;
  creatorId: string;
  contentId: string;
  version: number;
  previousVersion: number | null;
  planRef: Ref;
  state: "draft" | "published";
  savedDocumentHash: string | null;
  positive: boolean;
  recipients: readonly CommerceGroupRecipient[];
  emitted: boolean;
  finalized: boolean;
};
function unavailable(): never {
  throw new DomainError(
    "fulfillment_plan_unavailable",
    "Current fulfillment is unavailable. Your draft is kept.",
    503,
  );
}

/** Creator publication only. Actual W4/W3 instances share the same canonical
 * Database/Access/pool. Plan IDs confer no fan, Team or worker body permission.
 * W3 records delivery once; all W5 writes precede the last W4 finalizer. */
export class ContentGroupPublication {
  private readonly held = new WeakMap<PoolClient, Held>();
  constructor(
    pool: Pool,
    private readonly owners: ContentGroupPublicationOwners,
  ) {
    CommerceFulfillmentPlans.assertRuntime(
      owners.plans,
      owners.database,
      owners.access,
    );
    if (
      owners.database.pool !== pool ||
      !(owners.conversations instanceof ConversationService) ||
      !owners.conversations.isFor(owners.database, owners.access)
    )
      unavailable();
    // The composition owner calls this once. A separately configured service
    // is rejected rather than silently routing recipients to another owner.
    owners.conversations.configureFulfillmentPlans(owners.plans);
  }

  private async context(client: PoolClient, actor: Actor) {
    const request = requestAuthority.getStore();
    if (
      !actor.adultEligible ||
      request?.accountId !== actor.accountId ||
      request.actor !== actor
    )
      unavailable();
    const row = (
      await client.query<{
        pid: number;
        transaction: string;
        account: string;
        session: string;
      }>(
        `SELECT pg_backend_pid() AS pid,pg_current_xact_id()::text AS transaction,
         current_setting('app.account_id',true) AS account,
         current_setting('app.identity_session_id',true) AS session`,
      )
    ).rows[0];
    if (row?.account !== actor.accountId || row.session !== request.sessionId)
      unavailable();
    return { ...row, request };
  }

  async prepare(
    client: PoolClient,
    actor: Actor,
    tuple: {
      creatorId: string;
      contentId: string;
      version: number;
      state: string;
      planRef: unknown;
    },
  ) {
    const context = await this.context(client, actor);
    if (
      this.held.get(client)?.transaction === context.transaction ||
      !["draft", "published"].includes(tuple.state)
    )
      unavailable();
    const planRef = CommerceFulfillmentPlanRef.parse(tuple.planRef);
    const input = {
      creatorId: tuple.creatorId,
      contentId: tuple.contentId,
      planRef,
    };
    if (tuple.state === "published")
      await this.owners.plans.preparePublicationRetry(client, actor, input);
    else await this.owners.plans.preparePublication(client, actor, input);
    this.held.set(client, {
      ...context,
      actor,
      ...input,
      version: z.int().positive().parse(tuple.version),
      previousVersion: null,
      state: tuple.state as "draft" | "published",
      savedDocumentHash: null,
      positive: false,
      recipients: [],
      emitted: false,
      finalized: false,
    });
  }

  async prepareSave(
    client: PoolClient,
    actor: Actor,
    input: {
      creatorId: string;
      contentId: string;
      expectedVersion: number;
      document: ContentBody;
      idempotencyKey: string;
    },
  ) {
    const document = ContentDocument.parse(input.document);
    if (!document.planRef) unavailable();
    const context = await this.context(client, actor);
    if (this.held.get(client)?.transaction === context.transaction)
      unavailable();
    const current = (
      await client.query<{ version: number; state: string }>(
        "SELECT version,state FROM creator.content_index WHERE id=$1 AND creator_id=$2",
        [input.contentId, input.creatorId],
      )
    ).rows[0];
    const version = input.expectedVersion + 1;
    if (!Number.isSafeInteger(version)) unavailable();
    const prior = (
      await client.query<{
        request_hash: string;
        content_id: string;
        creator_id: string;
        version: number;
      }>(
        `SELECT request_hash,response->>'id' AS content_id,response->>'creatorId' AS creator_id,
         (response->>'version')::integer AS version FROM creator.idempotency_key
         WHERE actor_account_id=$1 AND operation='content.save' AND key=$2`,
        [actor.accountId, input.idempotencyKey],
      )
    ).rows[0];
    if (prior) {
      if (
        prior.request_hash !==
        contentHash({
          creatorId: input.creatorId,
          id: input.contentId,
          expectedVersion: input.expectedVersion,
          document,
          idempotencyKey: input.idempotencyKey,
        })
      )
        throw new DomainError(
          "idempotency_conflict",
          "This retry key was used for different content.",
        );
      if (
        prior.content_id !== input.contentId ||
        prior.creator_id !== input.creatorId ||
        prior.version !== version ||
        current?.version !== version ||
        current.state !== "draft"
      )
        unavailable();
      // Actual committed command metadata, before any body or owner positive.
      // W4 checks every saved field, including an intentionally empty draft.
      await this.owners.plans.prepareDraftRetry(client, actor, {
        ...input,
        planRef: document.planRef,
      });
    } else
      await this.owners.plans.prepareDraft(client, actor, {
        ...input,
        planRef: document.planRef,
      });
    this.held.set(client, {
      ...context,
      actor,
      creatorId: input.creatorId,
      contentId: input.contentId,
      planRef: document.planRef,
      version,
      previousVersion: input.expectedVersion,
      state: "draft",
      savedDocumentHash: contentHash(document),
      positive: false,
      recipients: [],
      emitted: false,
      finalized: false,
    });
  }

  private async current(client: PoolClient, actor: Actor) {
    const context = await this.context(client, actor),
      held = this.held.get(client);
    if (
      !held ||
      held.finalized ||
      held.actor !== actor ||
      held.request !== context.request ||
      held.pid !== context.pid ||
      held.transaction !== context.transaction
    )
      unavailable();
    return held;
  }

  async assertPublisher(
    client: PoolClient,
    actor: Actor,
    input: {
      creatorId: string;
      contentId: string;
      version: number;
      planRef: unknown;
      state: string;
    },
  ) {
    const held = await this.current(client, actor);
    if (
      held.creatorId !== input.creatorId ||
      held.contentId !== input.contentId ||
      !(
        input.version === held.version ||
        (input.state === "draft" && input.version === held.previousVersion)
      ) ||
      (input.version === held.version &&
        contentHash(CommerceFulfillmentPlanRef.parse(input.planRef)) !==
          contentHash(held.planRef))
    )
      unavailable();
  }

  async positive(client: PoolClient, actor: Actor) {
    const held = await this.current(client, actor);
    if (held.positive) return;
    held.recipients = await this.owners.plans.preparePublicationPositive(
      client,
      actor,
    );
    held.positive = true;
  }

  async emit(client: PoolClient, actor: Actor) {
    const held = await this.current(client, actor);
    if (
      !held.positive ||
      held.state !== "draft" ||
      held.previousVersion !== null ||
      held.emitted
    )
      unavailable();
    for (const recipient of held.recipients)
      await this.owners.conversations.appendSystemLink(client, recipient);
    held.emitted = true;
  }

  async finalizeSave(client: PoolClient, actor: Actor) {
    const held = await this.current(client, actor);
    if (!held.positive || held.previousVersion === null || held.emitted)
      unavailable();
    const row = (
      await client.query<{ document: unknown; state: string; version: number }>(
        `SELECT r.document,i.state,i.version FROM creator.content_index i
         JOIN creator.content_revision r ON r.content_id=i.id AND r.version=i.version
         WHERE i.id=$1 AND i.creator_id=$2`,
        [held.contentId, held.creatorId],
      )
    ).rows[0];
    if (
      row?.state !== "draft" ||
      row.version !== held.version ||
      contentHash(ContentDocument.parse(row.document)) !==
        held.savedDocumentHash
    )
      unavailable();
    held.finalized = true;
    await this.owners.plans.finalizeDraftPublication(client, actor);
  }

  async finalize(
    client: PoolClient,
    actor: Actor,
    finalization: ContentSourceFinalization,
  ) {
    const held = await this.current(client, actor);
    if (!held.positive || held.previousVersion !== null) unavailable();
    held.finalized = true;
    if (held.state === "published") {
      if (
        finalization.stage === "signing_challenge" ||
        !finalization.publicationSignedActId ||
        held.emitted
      )
        unavailable();
      await this.owners.plans.finalizePublicationRetry(
        client,
        actor,
        finalization.publicationSignedActId,
      );
    } else if (finalization.stage === "signing_challenge")
      await this.owners.plans.finalizePublicationChallenge(
        client,
        actor,
        finalization.challengeId,
      );
    else if (finalization.stage === "review")
      await this.owners.plans.finalizePublicationReview(client, actor);
    else {
      if (!held.emitted) unavailable();
      await this.owners.plans.finalizePublication(
        client,
        actor,
        finalization.publicationSignedActId,
      );
    }
  }
}
