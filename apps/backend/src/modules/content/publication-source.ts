import type { PoolClient } from "pg";
import { z } from "zod";
import { ContentAudience } from "../../../../../packages/api/src/content.js";
import type { Actor } from "../identity/adapter.js";
import { requestAuthority } from "../identity/request-authority.js";
import { contentHash } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import type { ContentPacketRead } from "./service.js";

export type ContentSourceFinalization =
  | {
      stage: "signing_challenge";
      publicationSignedActId: null;
      challengeId: string;
    }
  | { stage: "review"; publicationSignedActId: string | null }
  | { stage: "publication"; publicationSignedActId: string };

/** W4 supplies its actual pool-bound owner controller and W1 supplies its real
 * original-acceptance/publication signer fence. A scalar consent check, viewer
 * signature fence or TypeScript shape is not an implementation of this port. */
export interface ContentPublicationSourceController {
  prepare(
    client: PoolClient,
    actor: Actor,
    input: { creatorId: string; contentId: string },
  ): Promise<void>;
  permission(
    client: PoolClient,
    actor: Actor,
    creatorId: string,
    packetId: string,
  ): Promise<boolean>;
  /** LAST: after every domain/idempotency or real challenge write. Only plain
   * metadata and COMMIT may follow; denied/busy/unavailable rolls back it all. */
  finalize(
    client: PoolClient,
    actor: Actor,
    input: ContentPacketRead & ContentSourceFinalization,
  ): Promise<boolean>;
}

type Held = {
  transaction: string;
  pid: number;
  actor: Actor;
  request: NonNullable<ReturnType<typeof requestAuthority.getStore>>;
  tuple: ContentPacketRead | null;
  hash: string | null;
  state: string | null;
  finalized: boolean;
};

/** W5's consumer binding. This retains the real request/client/xid and stored
 * tuple; it never creates an owner, fan, thread or authority for a worker. */
export class ContentPublicationSources {
  private readonly held = new WeakMap<PoolClient, Held>();
  constructor(
    private readonly controller?: ContentPublicationSourceController,
  ) {}

  private async context(client: PoolClient, actor: Actor) {
    const request = requestAuthority.getStore();
    invariant(
      actor.adultEligible && request?.accountId === actor.accountId,
      "publication_session_required",
      "Reopen publication with your current account.",
    );
    const context = (
      await client.query<{
        transaction: string;
        pid: number;
        account: string;
        session: string;
      }>(
        `SELECT pg_current_xact_id()::text AS transaction,pg_backend_pid() AS pid,
         current_setting('app.account_id',true) AS account,
         current_setting('app.identity_session_id',true) AS session`,
      )
    ).rows[0];
    invariant(
      context?.account === actor.accountId &&
        context.session === request.sessionId,
      "publication_transaction_required",
      "Use the actual current publication transaction.",
    );
    return { ...context, request };
  }

  async prepare(
    client: PoolClient,
    actor: Actor,
    creatorId: string,
    contentId: string,
  ) {
    const context = await this.context(client, actor);
    const old = this.held.get(client);
    invariant(
      !old || old.transaction !== context.transaction,
      "publication_source_order_invalid",
      "Prepare the publication source once, before its positive locks.",
    );
    const row = (
      await client.query<{
        version: number;
        packet_id: string | null;
        audience: unknown;
        state: string;
      }>(
        "SELECT version,packet_id,audience,state FROM creator.content_index WHERE creator_id=$1 AND id=$2",
        [creatorId, contentId],
      )
    ).rows[0];
    const tuple = row?.packet_id
      ? {
          creatorId: z.uuid().parse(creatorId),
          contentId: z.uuid().parse(contentId),
          packetId: z.uuid().parse(row.packet_id),
          contentVersion: z.int().positive().parse(row.version),
          audience: ContentAudience.parse(row.audience),
        }
      : null;
    const hash = tuple ? contentHash(tuple) : null;
    if (tuple) {
      if (!this.controller)
        throw new DomainError(
          "publication_source_authority_unconfigured",
          "Current publication source authority is not connected.",
          503,
        );
      await this.controller.prepare(client, actor, { creatorId, contentId });
      invariant(
        contentHash(tuple) === hash,
        "publication_source_changed",
        "The prepared publication source changed.",
      );
    }
    this.held.set(client, {
      transaction: context.transaction,
      pid: context.pid,
      request: context.request,
      actor,
      tuple,
      hash,
      state: row?.state ?? null,
      finalized: false,
    });
  }

  private async current(client: PoolClient, actor: Actor) {
    const context = await this.context(client, actor),
      held = this.held.get(client);
    invariant(
      held &&
        !held.finalized &&
        held.actor === actor &&
        held.transaction === context.transaction &&
        held.pid === context.pid &&
        held.request === context.request &&
        (!held.tuple || contentHash(held.tuple) === held.hash),
      "publication_source_transaction_changed",
      "Prepare the actual stored source before continuing this publication.",
    );
    return held;
  }

  async permission(client: PoolClient, actor: Actor, tuple: ContentPacketRead) {
    const held = await this.current(client, actor);
    invariant(
      this.controller && held.tuple && contentHash(tuple) === held.hash,
      "publication_source_changed",
      "The current publication no longer matches its prepared source.",
    );
    return this.controller.permission(
      client,
      actor,
      tuple.creatorId,
      tuple.packetId,
    );
  }

  async finalize(
    client: PoolClient,
    actor: Actor,
    finalization:
      | Exclude<ContentSourceFinalization, { stage: "publication" }>
      | { stage: "publication"; publicationSignedActId: string | null },
  ) {
    const held = await this.current(client, actor);
    if (!held.tuple) return;
    invariant(
      this.controller,
      "publication_source_authority_unconfigured",
      "Current publication source authority is not connected.",
    );
    const stage: ContentSourceFinalization =
      finalization.stage === "publication"
        ? {
            stage: "publication",
            publicationSignedActId: z
              .uuid()
              .parse(finalization.publicationSignedActId),
          }
        : finalization.stage === "signing_challenge"
          ? {
              stage: "signing_challenge",
              publicationSignedActId: null,
              challengeId: z.uuid().parse(finalization.challengeId),
            }
          : {
              stage: "review",
              publicationSignedActId:
                finalization.publicationSignedActId === null
                  ? null
                  : z.uuid().parse(finalization.publicationSignedActId),
            };
    invariant(
      stage.stage === "publication" ||
        (stage.stage === "signing_challenge" && held.state === "draft") ||
        (stage.stage === "review" &&
          ((held.state === "draft" && stage.publicationSignedActId === null) ||
            (held.state === "published" &&
              stage.publicationSignedActId !== null))),
      "publication_source_stage_changed",
      "The publication stage cannot downgrade its stored source authority.",
    );
    held.finalized = true;
    invariant(
      (await this.controller.finalize(client, actor, {
        ...held.tuple,
        ...stage,
      })) === true,
      "publication_source_unavailable",
      "Current publication source permission is unavailable.",
    );
  }
}
